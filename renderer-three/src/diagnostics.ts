export type RendererDiagnosticCode =
  | "RENDER_INITIALIZATION_FAILED"
  | "RENDER_OPERATION_FAILED"
  | "RENDER_PARTICLE_CREATE_FAILED"
  | "RENDER_FRAME_FAILED"
  | "RENDER_RESIZE_FAILED"
  | "RENDER_DISPOSAL_FAILED"
  | "RENDER_VISUAL_DUPLICATE"
  | "RENDER_VISUAL_NOT_FOUND"
  | "RENDER_VISUAL_MATERIAL_UNSUPPORTED"
  | "SHADER_COMPILE_FAILED";

export type RendererDiagnosticReporter = (code: RendererDiagnosticCode, message: string, source: string) => void;

/** Error crossing the renderer boundary with a stable, host-readable code. */
export class RendererFailure extends Error {
  readonly code: RendererDiagnosticCode;
  readonly source: string;

  constructor(code: RendererDiagnosticCode, message: string, source: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RendererFailure";
    this.code = code;
    this.source = source;
  }
}

export function rendererFailure(
  code: RendererDiagnosticCode,
  source: string,
  error: unknown
): RendererFailure {
  if (error instanceof RendererFailure) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new RendererFailure(code, message, source, error);
}

function shaderLog(log: string | null): string | null {
  const trimmed = log?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

/** Records the actual WebGL compiler diagnostic supplied by Three.js. */
export function reportShaderFailure(
  report: RendererDiagnosticReporter | undefined,
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): void {
  if (report === undefined) return;
  const vertex = shaderLog(gl.getShaderInfoLog(vertexShader));
  const fragment = shaderLog(gl.getShaderInfoLog(fragmentShader));
  const link = shaderLog(gl.getProgramInfoLog(program));
  const detail = [
    vertex === null ? null : `vertex: ${vertex}`,
    fragment === null ? null : `fragment: ${fragment}`,
    link === null ? null : `program: ${link}`
  ].filter((value): value is string => value !== null);
  report(
    "SHADER_COMPILE_FAILED",
    detail.length === 0
      ? "WebGL reported a shader compilation or link failure without a compiler log"
      : detail.join(" | "),
    "renderer-three:shader"
  );
}
