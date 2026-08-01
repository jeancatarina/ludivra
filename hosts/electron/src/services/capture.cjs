const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

/**
 * Raster capture adapter. It drives the same web bundle the game ships, waits for
 * the quiescence the page declares and writes the frame plus the measured UI
 * snapshot. It knows no game rule and never decides when a frame is meaningful:
 * the page does, through `window.ludivraUi.ready`.
 */
function readCaptureOptions(environment) {
  const bundle = environment.LUDIVRA_CAPTURE_BUNDLE;
  const output = environment.LUDIVRA_CAPTURE_OUTPUT;
  if (typeof bundle !== "string" || bundle.length === 0) throw new Error("CAPTURE_BUNDLE_UNDECLARED");
  if (typeof output !== "string" || output.length === 0) throw new Error("CAPTURE_OUTPUT_UNDECLARED");
  const integer = (value, fallback) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("CAPTURE_PROFILE_UNDECLARED");
    return parsed;
  };
  const positiveNumber = (value, fallback) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("CAPTURE_PROFILE_UNDECLARED");
    return parsed;
  };
  return {
    bundle: path.resolve(bundle),
    output: path.resolve(output),
    ticks: integer(environment.LUDIVRA_CAPTURE_TICKS, 0),
    width: integer(environment.LUDIVRA_CAPTURE_WIDTH, 1280),
    height: integer(environment.LUDIVRA_CAPTURE_HEIGHT, 800),
    textScale: positiveNumber(environment.LUDIVRA_CAPTURE_TEXT_SCALE, 1),
    deviceScale: positiveNumber(environment.LUDIVRA_CAPTURE_DEVICE_SCALE, undefined),
    timeoutMs: integer(environment.LUDIVRA_CAPTURE_TIMEOUT_MS, 20_000)
  };
}

function captureWebPreferences(options) {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: false,
    // Electron owns the output scale in offscreen mode. A Chromium command-line
    // switch leaves macOS tied to the primary display and cannot prove the matrix.
    offscreen: options.deviceScale === undefined ? true : { deviceScaleFactor: options.deviceScale },
    preload: path.join(__dirname, "..", "preload.cjs")
  };
}

async function waitForQuiescence(webContents, deadline) {
  for (;;) {
    const ready = await webContents.executeJavaScript("window.ludivraUi?.ready === true").catch(() => false);
    if (ready === true) return;
    if (Date.now() > deadline) throw new Error("CAPTURE_NOT_QUIESCENT");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Pixel quiescence. A hidden window does not necessarily repaint after its first
 * paint, so a single `capturePage` can return the pre-boot frame while the DOM is
 * already complete. Two consecutive identical frames prove the raster settled.
 */
async function captureStableFrame(webContents, deadline) {
  let previous = null;
  for (;;) {
    webContents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const image = await webContents.capturePage();
    const png = image.toPNG();
    const size = image.getSize();
    if (size.width === 0 || size.height === 0) throw new Error("CAPTURE_RASTER_UNAVAILABLE");
    if (previous !== null && previous.equals(png)) return { png, size };
    previous = png;
    if (Date.now() > deadline) throw new Error("CAPTURE_FRAME_NOT_STABLE");
  }
}

/**
 * Every wait carries a deadline. A page whose module graph never finishes would
 * otherwise leave this process alive with no frame and no diagnostic.
 */
function withDeadline(promise, deadline, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), Math.max(0, deadline - Date.now()));
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function runCapture({ BrowserWindow, logger, environment }) {
  const options = readCaptureOptions(environment);
  const window = new BrowserWindow({
    width: options.width,
    height: options.height,
    useContentSize: true,
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: "#080711",
    webPreferences: captureWebPreferences(options)
  });
  window.removeMenu();
  const rendererMessages = [];
  window.webContents.on("console-message", (details) => {
    if (details.level === "error" || details.level === "warning") {
      rendererMessages.push(details.message);
      logger.warn("capture.renderer-console", { message: details.message });
    }
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    rendererMessages.push(`render-process-gone ${details.reason}`);
  });
  const deadline = Date.now() + options.timeoutMs;
  const describe = (error) =>
    rendererMessages.length === 0 ? error.message : `${error.message} | renderer: ${rendererMessages.join(" || ")}`;
  try {
    const loaded = new Promise((resolve, reject) => {
      window.webContents.once("did-finish-load", resolve);
      window.webContents.once("did-fail-load", (_event, code, description) => {
        reject(new Error(`CAPTURE_BUNDLE_LOAD_FAILED: ${code} ${description}`));
      });
    });
    const search = new URLSearchParams({
      "ludivra-capture": String(options.ticks),
      "ludivra-text-scale": String(options.textScale)
    }).toString();
    void window.loadFile(options.bundle, { search });
    await withDeadline(loaded, deadline, "CAPTURE_BUNDLE_LOAD_TIMEOUT");
    await waitForQuiescence(window.webContents, deadline);

    const inspection = JSON.parse(await window.webContents.executeJavaScript(
      "JSON.stringify({ deviceScale: window.devicePixelRatio, tick: window.ludivraUi.tick, stateHash: window.ludivraUi.stateHash," +
      " viewModel: window.ludivraUi.viewModel(), snapshot: window.ludivraUi.snapshot()," +
      " projection: window.ludivraUi.projection(), diagnostics: window.ludivraUi.diagnostics() })"
    ));
    const { png, size } = await captureStableFrame(window.webContents, deadline);
    const deviceScale = Number(inspection.deviceScale);
    if (!Number.isFinite(deviceScale) || deviceScale <= 0) throw new Error("CAPTURE_DEVICE_SCALE_UNAVAILABLE");
    const capturePixelScale = Number((size.width / options.width).toFixed(3));

    await mkdir(options.output, { recursive: true });
    await Promise.all([
      writeFile(path.join(options.output, "capture.png"), png),
      writeFile(
        path.join(options.output, "rendered-ui-snapshot.json"),
        `${JSON.stringify(inspection.snapshot, null, 2)}\n`,
        "utf8"
      ),
      writeFile(
        path.join(options.output, "ui-view-model.json"),
        `${JSON.stringify(inspection.viewModel, null, 2)}\n`,
        "utf8"
      ),
      writeFile(
        path.join(options.output, "projection-trace.json"),
        `${JSON.stringify(inspection.projection, null, 2)}\n`,
        "utf8"
      ),
      writeFile(
        path.join(options.output, "host-diagnostics.json"),
        `${JSON.stringify(inspection.diagnostics, null, 2)}\n`,
        "utf8"
      ),
      writeFile(
        path.join(options.output, "capture.json"),
        `${JSON.stringify({
          backend: "electron-offscreen",
          renderer: inspection.snapshot.renderer,
          requestedViewport: { width: options.width, height: options.height },
          imageSize: size,
          requestedDeviceScale: options.deviceScale ?? null,
          deviceScale,
          capturePixelScale,
          ticks: options.ticks,
          tick: inspection.tick,
          stateHash: inspection.stateHash,
          locale: inspection.snapshot.locale,
          requestedTextScale: options.textScale,
          textScale: inspection.snapshot.textScale,
          quiescence: "ludivraUi.ready + two identical consecutive frames",
          projectorOperations: inspection.projection.operations,
          projectedVisuals: inspection.projection.visuals.length,
          hostDiagnostics: inspection.diagnostics.length
        }, null, 2)}\n`,
        "utf8"
      )
    ]);
    logger.info("capture.completed", {
      output: options.output,
      tick: inspection.tick,
      hostDiagnostics: inspection.diagnostics.length
    });
    return { status: "ok" };
  } catch (error) {
    throw new Error(describe(error));
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

module.exports = { captureWebPreferences, readCaptureOptions, runCapture };
