import type {
  CameraView,
  ParticleBurst,
  PresentationRenderer,
  SceneAtmosphere,
  VisualDefinition,
  VisualTransform
} from "./index.js";

export interface ProjectedVisual {
  id: string;
  shape: string;
  surface: string;
  color: number;
  visible: boolean;
  transform: VisualTransform | null;
}

export interface ProjectionOperationCounts {
  createVisual: number;
  setTransform: number;
  setColor: number;
  setVisible: number;
  setCamera: number;
  setAtmosphere: number;
  spawnParticles: number;
  render: number;
}

export interface ProjectionTrace {
  /** Logical tick the trace belongs to, as reported by the caller. */
  tick: string;
  visuals: ProjectedVisual[];
  operations: ProjectionOperationCounts;
  camera: CameraView | null;
  atmosphere: SceneAtmosphere | null;
  particleBursts: number;
}

export interface RecordingRenderer {
  renderer: PresentationRenderer;
  /** Projector output for the frames since the last `beginFrame`. */
  trace(tick: string): ProjectionTrace;
  beginFrame(): void;
}

function emptyCounts(): ProjectionOperationCounts {
  return {
    createVisual: 0,
    setTransform: 0,
    setColor: 0,
    setVisible: 0,
    setCamera: 0,
    setAtmosphere: 0,
    spawnParticles: 0,
    render: 0
  };
}

/**
 * Wraps a renderer to record what the projector actually asked for. This is the
 * missing link between logical state and pixels: without it a wrong frame cannot
 * be attributed to the projector, the renderer or the state.
 *
 * It records intent, never renderer internals, so it stays valid for any backend.
 */
export function createRecordingRenderer(inner: PresentationRenderer): RecordingRenderer {
  const visuals = new Map<string, ProjectedVisual>();
  let operations = emptyCounts();
  let camera: CameraView | null = null;
  let atmosphere: SceneAtmosphere | null = null;
  let particleBursts = 0;

  const renderer: PresentationRenderer = {
    createVisual(definition: VisualDefinition) {
      operations.createVisual += 1;
      visuals.set(definition.id, {
        id: definition.id,
        shape: definition.shape,
        surface: definition.surface ?? "matte",
        color: definition.color,
        visible: true,
        transform: null
      });
      inner.createVisual(definition);
    },
    setTransform(id: string, transform: VisualTransform) {
      operations.setTransform += 1;
      const visual = visuals.get(id);
      if (visual !== undefined) visual.transform = transform;
      inner.setTransform(id, transform);
    },
    setColor(id: string, color: number) {
      operations.setColor += 1;
      const visual = visuals.get(id);
      if (visual !== undefined) visual.color = color;
      inner.setColor(id, color);
    },
    setVisible(id: string, visible: boolean) {
      operations.setVisible += 1;
      const visual = visuals.get(id);
      if (visual !== undefined) visual.visible = visible;
      inner.setVisible(id, visible);
    },
    setCamera(view: CameraView) {
      operations.setCamera += 1;
      camera = view;
      inner.setCamera(view);
    },
    setAtmosphere(next: SceneAtmosphere) {
      operations.setAtmosphere += 1;
      atmosphere = next;
      inner.setAtmosphere(next);
    },
    spawnParticles(burst: ParticleBurst) {
      operations.spawnParticles += 1;
      particleBursts += 1;
      inner.spawnParticles(burst);
    },
    render() {
      operations.render += 1;
      inner.render();
    },
    resize(width: number, height: number, pixelRatio: number) {
      inner.resize(width, height, pixelRatio);
    },
    destroy() {
      visuals.clear();
      inner.destroy();
    }
  };

  return {
    renderer,
    beginFrame() {
      operations = emptyCounts();
      particleBursts = 0;
    },
    trace(tick: string): ProjectionTrace {
      return {
        tick,
        visuals: [...visuals.values()].sort((left, right) => left.id.localeCompare(right.id)),
        operations: { ...operations },
        camera,
        atmosphere,
        particleBursts
      };
    }
  };
}
