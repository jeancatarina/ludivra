export interface HostDiagnostic {
  code: string;
  message: string;
  /** Logical tick when the failure was observed, when a runtime already exists. */
  tick: string | null;
  source: string;
}

export interface HostDiagnosticsCollector {
  report(code: string, message: string, source: string): void;
  list(): HostDiagnostic[];
  dispose(): void;
}

const maximumRecorded = 200;

/**
 * Collects host-level failures — script errors, rejected promises, missing assets,
 * shader and audio problems — so a defect visible in the pixels has a recorded
 * cause in the same run. Nothing here is swallowed: the list is evidence, and the
 * capture pipeline turns it into diagnostics.
 */
export function createHostDiagnostics(tick: () => string | null): HostDiagnosticsCollector {
  const recorded: HostDiagnostic[] = [];
  const record = (code: string, message: string, source: string): void => {
    if (recorded.length >= maximumRecorded) return;
    recorded.push({ code, message: message.slice(0, 500), tick: tick(), source });
  };

  const onError = (event: ErrorEvent): void => {
    record("HOST_SCRIPT_ERROR", event.message, event.filename || "window");
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    record(
      "HOST_PROMISE_REJECTED",
      reason instanceof Error ? reason.message : String(reason),
      "unhandledrejection"
    );
  };
  const onResourceError = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLImageElement) record("HOST_ASSET_MISSING", target.src, "img");
    else if (target instanceof HTMLAudioElement) record("HOST_ASSET_MISSING", target.src, "audio");
    else if (target instanceof HTMLLinkElement) record("HOST_ASSET_MISSING", target.href, "link");
  };
  const onContextLost = (event: Event): void => {
    record("HOST_WEBGL_CONTEXT_LOST", event.type, "canvas");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  // Resource failures do not bubble, so the capture phase is required.
  window.addEventListener("error", onResourceError, true);
  window.addEventListener("webglcontextlost", onContextLost, true);

  return {
    report: record,
    list: () => [...recorded],
    dispose() {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onResourceError, true);
      window.removeEventListener("webglcontextlost", onContextLost, true);
    }
  };
}
