import type {
  CameraView,
  PresentationRenderer,
  ParticleBurst,
  SceneAtmosphere,
  VisualDefinition,
  VisualTransform
} from "@ludivra/presentation-protocol";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PointLight,
  Points,
  PointsMaterial,
  PerspectiveCamera,
  PCFShadowMap,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
  SRGBColorSpace
} from "three";
import type { WebGPURenderer } from "three/webgpu";
import { createCinematicPipeline } from "./cinematic-pipeline.js";
import { createGpuTimingSampler, type GpuTimingMetrics } from "./gpu-timing.js";
import {
  RendererFailure,
  rendererFailure,
  reportShaderFailure,
  type RendererDiagnosticCode,
  type RendererDiagnosticReporter
} from "./diagnostics.js";
import {
  selectRendererProfile,
  type RendererBackendAvailability,
  type RendererProfileRequest,
  type RendererProfileSelection
} from "./profiles.js";

export { RendererFailure, type RendererDiagnosticCode, type RendererDiagnosticReporter } from "./diagnostics.js";
export {
  createGpuTimingSampler,
  DESKTOP_HIGH_GPU_P95_BUDGET_MS,
  type GpuTimingMetrics,
  type GpuTimingStatus
} from "./gpu-timing.js";
export {
  selectRendererProfile,
  type RendererBackendAvailability,
  type RendererFeature,
  type RendererMethod,
  type RendererProfile,
  type RendererProfileRequest,
  type RendererProfileSelection
} from "./profiles.js";

export interface ThreeRendererOptions {
  reportDiagnostic?: RendererDiagnosticReporter;
  profile?: RendererProfileRequest;
  backends?: RendererBackendAvailability;
  onProfileSelected?: (selection: RendererProfileSelection) => void;
  onGpuTiming?: (metrics: GpuTimingMetrics) => void;
}

interface ActiveBurst {
  points: Points<BufferGeometry, PointsMaterial>;
  velocities: Float32Array;
  ageSeconds: number;
  lifetimeSeconds: number;
}

function seededRandom(seed: bigint): () => number {
  let state = Number(seed & 0xffff_ffffn) || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function createParticleBurst(definition: ParticleBurst): ActiveBurst {
  const count = Math.max(1, Math.min(5000, Math.round(definition.count)));
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const random = seededRandom(definition.seed);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions.set(definition.position, offset);
    const azimuth = random() * Math.PI * 2;
    const vertical = random() * 2 - 1;
    const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const speed = definition.speed * (0.55 + random() * 0.45);
    velocities[offset] = Math.cos(azimuth) * radial * speed;
    velocities[offset + 1] = vertical * speed;
    velocities[offset + 2] = Math.sin(azimuth) * radial * speed;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: definition.color,
    size: definition.size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false
  });
  const points = new Points(geometry, material);
  points.renderOrder = 100;
  points.userData.gravity = definition.gravity;
  return {
    points,
    velocities,
    ageSeconds: 0,
    lifetimeSeconds: Math.max(definition.lifetimeMs / 1000, 0.016)
  };
}

type SupportedGeometry =
  | BoxGeometry
  | ConeGeometry
  | CylinderGeometry
  | OctahedronGeometry
  | RingGeometry
  | SphereGeometry
  | TorusGeometry;

function geometry(definition: VisualDefinition): SupportedGeometry {
  switch (definition.shape) {
    case "box":
      return new BoxGeometry(1, 1, 1);
    case "cone":
      return new ConeGeometry(0.65, 1.2, 6);
    case "cylinder":
      return new CylinderGeometry(0.72, 0.8, 1, 32);
    case "octahedron":
      return new OctahedronGeometry(0.8, 0);
    case "ring":
      return new RingGeometry(0.7, 1, 48);
    case "sphere":
      return new SphereGeometry(1, 48, 32);
    case "torus":
      return new TorusGeometry(0.72, 0.18, 16, 48);
  }
}

function material(definition: VisualDefinition): MeshStandardMaterial {
  const surface = definition.surface ?? "metal";
  const opacity = Math.max(0, Math.min(1, definition.opacity ?? 1));
  const emissiveStrength = surface === "emissive" ? 0.85 : surface === "glass" ? 0.3 : 0.12;
  return new MeshStandardMaterial({
    color: definition.color,
    emissive: new Color(definition.color).multiplyScalar(emissiveStrength),
    metalness: surface === "metal" ? 0.82 : surface === "glass" ? 0.15 : 0.3,
    roughness: surface === "matte" ? 0.78 : surface === "glass" ? 0.08 : 0.24,
    transparent: opacity < 1 || surface === "glass",
    opacity: surface === "glass" ? Math.min(opacity, 0.48) : opacity,
    depthWrite: surface !== "glass",
    ...(definition.shape === "ring" ? { side: DoubleSide } : {})
  });
}

function rendererOperation<T>(code: RendererDiagnosticCode, source: string, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw rendererFailure(code, source, error);
  }
}

interface WebGpuAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

interface WebGpuAdapter {
  features: { has(feature: string): boolean };
  info?: WebGpuAdapterInfo;
  requestAdapterInfo?: () => Promise<WebGpuAdapterInfo>;
  requestDevice(descriptor?: { requiredFeatures?: string[] }): Promise<object>;
}

interface WebGpuApi {
  requestAdapter(options: { powerPreference: "high-performance"; featureLevel: "compatibility" }): Promise<WebGpuAdapter | null>;
}

interface WebGpuDeviceSetup {
  device: object;
  adapter: string;
  timestampsAvailable: boolean;
  timestampRequestFailed: boolean;
}

function webGpuApi(): WebGpuApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as unknown as { gpu?: WebGpuApi }).gpu ?? null;
}

async function adapterLabel(adapter: WebGpuAdapter): Promise<string> {
  let info = adapter.info;
  if (info === undefined && adapter.requestAdapterInfo !== undefined) {
    try {
      info = await adapter.requestAdapterInfo();
    } catch {
      // Adapter metadata can be withheld by browser privacy policy; rendering
      // itself remains valid and the generic label stays observable.
    }
  }
  const details = [info?.description, info?.vendor, info?.architecture, info?.device]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return details.length === 0 ? "WebGPU adapter (metadata unavailable)" : `WebGPU ${Array.from(new Set(details)).join(" · ")}`;
}

async function acquireWebGpuDevice(): Promise<WebGpuDeviceSetup> {
  const gpu = webGpuApi();
  if (gpu === null) throw new Error("WebGPU is unavailable in this host");
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance", featureLevel: "compatibility" });
  if (adapter === null) throw new Error("WebGPU adapter request returned null");
  const timestampRequested = adapter.features.has("timestamp-query");
  if (!timestampRequested) {
    return {
      device: await adapter.requestDevice(),
      adapter: await adapterLabel(adapter),
      timestampsAvailable: false,
      timestampRequestFailed: false
    };
  }
  try {
    return {
      device: await adapter.requestDevice({ requiredFeatures: ["timestamp-query"] }),
      adapter: await adapterLabel(adapter),
      timestampsAvailable: true,
      timestampRequestFailed: false
    };
  } catch {
    return {
      device: await adapter.requestDevice(),
      adapter: await adapterLabel(adapter),
      timestampsAvailable: false,
      timestampRequestFailed: true
    };
  }
}

export async function createThreeRenderer(
  canvas: HTMLCanvasElement,
  options: ThreeRendererOptions = {}
): Promise<PresentationRenderer> {
  let selection = options.profile === undefined
    ? undefined
    : selectRendererProfile(options.profile, options.backends ?? { webgl2: true, webgpu: false, adapter: null });
  let renderer: WebGLRenderer | WebGPURenderer;
  let gpuTiming = createGpuTimingSampler(false);
  let gpuTimestampTelemetryEnabled = false;
  if (selection?.effectiveMethod === "webgpu") {
    try {
      const { WebGPURenderer: WebGpuRenderer } = await import("three/webgpu");
      const webgpuDevice = await acquireWebGpuDevice();
      const webgpu = new WebGpuRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        device: webgpuDevice.device,
        trackTimestamp: webgpuDevice.timestampsAvailable
      });
      await webgpu.init();
      if (!webgpuDevice.timestampsAvailable && selection.requiredFeatures.includes("gpu-timestamps")) {
        webgpu.dispose();
        throw new RendererFailure(
          "RENDER_FEATURE_REQUIRED_UNAVAILABLE",
          "desktop-high requires GPU timestamps but the selected WebGPU device did not enable timestamp-query",
          "renderer-three:webgpu"
        );
      }
      renderer = webgpu;
      gpuTiming = createGpuTimingSampler(webgpuDevice.timestampsAvailable);
      gpuTimestampTelemetryEnabled = webgpuDevice.timestampsAvailable;
      if (!webgpuDevice.timestampsAvailable) {
        const detail = webgpuDevice.timestampRequestFailed
          ? "timestamp-query was advertised but device creation rejected it"
          : "the adapter does not expose timestamp-query";
        options.reportDiagnostic?.("RENDER_GPU_TIMESTAMPS_UNAVAILABLE", detail, "renderer-three:webgpu");
      }
      if (selection !== undefined) selection = { ...selection, adapter: webgpuDevice.adapter };
    } catch (error) {
      if (error instanceof RendererFailure && error.code === "RENDER_FEATURE_REQUIRED_UNAVAILABLE") throw error;
      if (options.profile === undefined) throw rendererFailure("RENDER_INITIALIZATION_FAILED", "renderer-three:webgpu", error);
      selection = selectRendererProfile(options.profile, {
        ...(options.backends ?? { webgl2: true, webgpu: false, adapter: null }),
        webgpu: false
      });
      if (selection.effectiveMethod !== "webgl2") throw rendererFailure("RENDER_INITIALIZATION_FAILED", "renderer-three:webgpu", error);
      const detail = error instanceof Error ? error.message : String(error);
      selection = {
        ...selection,
        adapter: "Three.js WebGL2",
        fallbackReason: `WebGPU initialization failed (${detail}); ${selection.fallbackReason ?? "no declared fallback"}`
      };
      renderer = rendererOperation("RENDER_INITIALIZATION_FAILED", "renderer-three:initialization", () => new WebGLRenderer({
        canvas, antialias: true, alpha: true, powerPreference: "high-performance"
      }));
    }
  } else {
    renderer = rendererOperation("RENDER_INITIALIZATION_FAILED", "renderer-three:initialization", () => new WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: "high-performance"
    }));
  }
  if (renderer instanceof WebGLRenderer) {
    const defaultShaderError = renderer.debug.onShaderError;
    renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      reportShaderFailure(options.reportDiagnostic, gl, program, vertexShader, fragmentShader);
      defaultShaderError?.(gl, program, vertexShader, fragmentShader);
    };
  }
  if (selection?.fallbackReason !== undefined) {
    options.reportDiagnostic?.("RENDER_METHOD_FALLBACK", selection.fallbackReason, "renderer-three:profile");
  }
  options.onProfileSelected?.(selection ?? {
    requestedProfile: "web-compatible",
    effectiveProfile: "web-compatible",
    requestedMethod: "webgl2",
    effectiveMethod: "webgl2",
    adapter: null,
    requiredFeatures: [],
    optionalFeatures: [],
    unavailableOptionalFeatures: []
  });
  options.onGpuTiming?.(gpuTiming.snapshot());
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 6.4, 9.5);
  camera.lookAt(0, -0.4, -1.3);
  scene.fog = new FogExp2(0x05090e, 0.035);
  const ambientLight = new AmbientLight(0x6ba3b3, 1.2);
  scene.add(ambientLight);
  const keyLight = new DirectionalLight(0xffffff, 4);
  keyLight.position.set(3, 4, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -12;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 32;
  scene.add(keyLight);
  const reactorLight = new PointLight(0x58e0c2, 28, 18, 2);
  reactorLight.position.set(0, 2.2, -1.4);
  scene.add(reactorLight);
  const rimLight = new PointLight(0xd35cff, 18, 16, 2);
  rimLight.position.set(-5, 1.5, -5);
  scene.add(rimLight);
  const visuals = new Map<string, Mesh>();
  const bursts: ActiveBurst[] = [];
  const cinematicPipeline = renderer instanceof WebGLRenderer
    ? rendererOperation(
      "RENDER_INITIALIZATION_FAILED",
      "renderer-three:cinematic-pipeline",
      () => createCinematicPipeline(renderer, scene, camera)
    )
    : null;
  let previousRenderTime = performance.now();
  let gpuTimestampResolve: Promise<void> | null = null;

  function collectGpuTiming(): void {
    if (renderer instanceof WebGLRenderer || !gpuTimestampTelemetryEnabled || gpuTimestampResolve !== null) return;
    const pending = renderer.resolveTimestampsAsync("render")
      .then((milliseconds) => {
        if (milliseconds !== undefined) options.onGpuTiming?.(gpuTiming.record(milliseconds));
      })
      .catch((error: unknown) => {
        gpuTimestampTelemetryEnabled = false;
        gpuTiming = createGpuTimingSampler(false);
        const detail = error instanceof Error ? error.message : String(error);
        options.reportDiagnostic?.("RENDER_GPU_TIMESTAMPS_UNAVAILABLE", detail, "renderer-three:webgpu");
        options.onGpuTiming?.(gpuTiming.snapshot());
      });
    gpuTimestampResolve = pending;
    void pending.finally(() => {
      if (gpuTimestampResolve === pending) gpuTimestampResolve = null;
    });
  }

  function updateParticles(): void {
    const time = performance.now();
    const delta = Math.min((time - previousRenderTime) / 1000, 0.05);
    previousRenderTime = time;
    for (let burstIndex = bursts.length - 1; burstIndex >= 0; burstIndex -= 1) {
      const burst = bursts[burstIndex];
      if (burst === undefined) continue;
      burst.ageSeconds += delta;
      const positions = burst.points.geometry.getAttribute("position") as BufferAttribute;
      const gravity = Number(burst.points.userData.gravity);
      for (let index = 0; index < positions.count; index += 1) {
        const offset = index * 3;
        burst.velocities[offset + 1] = (burst.velocities[offset + 1] ?? 0) - gravity * delta;
        positions.setXYZ(
          index,
          positions.getX(index) + (burst.velocities[offset] ?? 0) * delta,
          positions.getY(index) + (burst.velocities[offset + 1] ?? 0) * delta,
          positions.getZ(index) + (burst.velocities[offset + 2] ?? 0) * delta
        );
      }
      positions.needsUpdate = true;
      burst.points.material.opacity = Math.max(0, 1 - burst.ageSeconds / burst.lifetimeSeconds);
      if (burst.ageSeconds >= burst.lifetimeSeconds) {
        scene.remove(burst.points);
        burst.points.geometry.dispose();
        burst.points.material.dispose();
        bursts.splice(burstIndex, 1);
      }
    }
  }

  return {
    createVisual(definition) {
      rendererOperation("RENDER_OPERATION_FAILED", "renderer-three:create-visual", () => {
        if (visuals.has(definition.id)) {
          throw new RendererFailure(
            "RENDER_VISUAL_DUPLICATE",
            `visual already exists: ${definition.id}`,
            "renderer-three:create-visual"
          );
        }
        const mesh = new Mesh(geometry(definition), material(definition));
        mesh.userData.surface = definition.surface ?? "metal";
        mesh.castShadow = definition.surface !== "glass";
        mesh.receiveShadow = definition.surface !== "emissive";
        if (definition.scale !== undefined) {
          mesh.scale.set(...definition.scale);
        }
        visuals.set(definition.id, mesh);
        scene.add(mesh);
      });
    },
    setTransform(id: string, transform: VisualTransform) {
      rendererOperation("RENDER_OPERATION_FAILED", "renderer-three:set-transform", () => {
        const visual = visuals.get(id);
        if (visual === undefined) {
          throw new RendererFailure("RENDER_VISUAL_NOT_FOUND", `visual does not exist: ${id}`, "renderer-three:set-transform");
        }
        visual.position.set(...transform.position);
        visual.rotation.set(...transform.rotation);
        if (transform.scale !== undefined) {
          visual.scale.set(...transform.scale);
        }
      });
    },
    setColor(id, color) {
      rendererOperation("RENDER_OPERATION_FAILED", "renderer-three:set-color", () => {
        const visual = visuals.get(id);
        if (visual === undefined) {
          throw new RendererFailure("RENDER_VISUAL_NOT_FOUND", `visual does not exist: ${id}`, "renderer-three:set-color");
        }
        if (!(visual.material instanceof MeshStandardMaterial)) {
          throw new RendererFailure(
            "RENDER_VISUAL_MATERIAL_UNSUPPORTED",
            `visual material is not supported: ${id}`,
            "renderer-three:set-color"
          );
        }
        visual.material.color.setHex(color);
        const emissiveScale = visual.userData.surface === "emissive" ? 0.85 : 0.12;
        visual.material.emissive.setHex(color).multiplyScalar(emissiveScale);
      });
    },
    setVisible(id, visible) {
      rendererOperation("RENDER_OPERATION_FAILED", "renderer-three:set-visible", () => {
        const visual = visuals.get(id);
        if (visual === undefined) {
          throw new RendererFailure("RENDER_VISUAL_NOT_FOUND", `visual does not exist: ${id}`, "renderer-three:set-visible");
        }
        visual.visible = visible;
      });
    },
    setCamera(view: CameraView) {
      rendererOperation("RENDER_OPERATION_FAILED", "renderer-three:set-camera", () => {
        camera.position.set(...view.position);
        camera.lookAt(...view.target);
        if (view.fieldOfView !== undefined) {
          camera.fov = Math.max(20, Math.min(90, view.fieldOfView));
          camera.updateProjectionMatrix();
        }
      });
    },
    setAtmosphere(atmosphere: SceneAtmosphere) {
      rendererOperation("RENDER_OPERATION_FAILED", "renderer-three:set-atmosphere", () => {
        scene.fog = new FogExp2(
          atmosphere.fogColor,
          Math.max(0, Math.min(0.25, atmosphere.fogDensity))
        );
        ambientLight.color.setHex(atmosphere.ambientColor);
        ambientLight.intensity = Math.max(0, atmosphere.ambientIntensity);
        keyLight.color.setHex(atmosphere.keyColor);
        keyLight.intensity = Math.max(0, atmosphere.keyIntensity);
        reactorLight.color.setHex(atmosphere.fillColor);
        reactorLight.intensity = Math.max(0, atmosphere.fillIntensity);
        rimLight.color.setHex(atmosphere.fillColor);
        rimLight.intensity = Math.max(0, atmosphere.fillIntensity * 0.55);
      });
    },
    spawnParticles(definition) {
      rendererOperation("RENDER_PARTICLE_CREATE_FAILED", "renderer-three:spawn-particles", () => {
        const burst = createParticleBurst(definition);
        bursts.push(burst);
        scene.add(burst.points);
      });
    },
    render() {
      rendererOperation("RENDER_FRAME_FAILED", "renderer-three:frame", () => {
        updateParticles();
        if (cinematicPipeline === null) {
          renderer.render(scene, camera);
          collectGpuTiming();
        } else cinematicPipeline.render();
      });
    },
    resize(width, height, pixelRatio) {
      rendererOperation("RENDER_RESIZE_FAILED", "renderer-three:resize", () => {
        const cappedPixelRatio = Math.min(pixelRatio, 2);
        if (cinematicPipeline === null) {
          renderer.setPixelRatio(cappedPixelRatio);
          renderer.setSize(width, height, false);
        } else cinematicPipeline.resize(width, height, cappedPixelRatio);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
      });
    },
    destroy() {
      rendererOperation("RENDER_DISPOSAL_FAILED", "renderer-three:destroy", () => {
        for (const visual of visuals.values()) {
          visual.geometry.dispose();
          if (visual.material instanceof MeshStandardMaterial) {
            visual.material.dispose();
          }
        }
        visuals.clear();
        for (const burst of bursts) {
          scene.remove(burst.points);
          burst.points.geometry.dispose();
          burst.points.material.dispose();
        }
        bursts.length = 0;
        cinematicPipeline?.destroy();
        renderer.dispose();
      });
    }
  };
}
