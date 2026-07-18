import type {
  CameraView,
  PresentationRenderer,
  ParticleBurst,
  VisualDefinition,
  VisualTransform
} from "@ludivra/presentation-protocol";
import {
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
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer
} from "three";

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

export function createThreeRenderer(canvas: HTMLCanvasElement): PresentationRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 6.4, 9.5);
  camera.lookAt(0, -0.4, -1.3);
  scene.fog = new FogExp2(0x05090e, 0.035);
  scene.add(new AmbientLight(0x6ba3b3, 1.2));
  const light = new DirectionalLight(0xffffff, 4);
  light.position.set(3, 4, 6);
  scene.add(light);
  const reactorLight = new PointLight(0x58e0c2, 28, 18, 2);
  reactorLight.position.set(0, 2.2, -1.4);
  scene.add(reactorLight);
  const rimLight = new PointLight(0xd35cff, 18, 16, 2);
  rimLight.position.set(-5, 1.5, -5);
  scene.add(rimLight);
  const visuals = new Map<string, Mesh>();
  const bursts: ActiveBurst[] = [];
  let previousRenderTime = performance.now();

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
      if (visuals.has(definition.id)) {
        throw new Error(`visual already exists: ${definition.id}`);
      }
      const mesh = new Mesh(geometry(definition), material(definition));
      mesh.userData.surface = definition.surface ?? "metal";
      if (definition.scale !== undefined) {
        mesh.scale.set(...definition.scale);
      }
      visuals.set(definition.id, mesh);
      scene.add(mesh);
    },
    setTransform(id: string, transform: VisualTransform) {
      const visual = visuals.get(id);
      if (visual === undefined) {
        throw new Error(`visual does not exist: ${id}`);
      }
      visual.position.set(...transform.position);
      visual.rotation.set(...transform.rotation);
      if (transform.scale !== undefined) {
        visual.scale.set(...transform.scale);
      }
    },
    setColor(id, color) {
      const visual = visuals.get(id);
      if (visual === undefined || !(visual.material instanceof MeshStandardMaterial)) {
        throw new Error(`visual does not exist: ${id}`);
      }
      visual.material.color.setHex(color);
      const emissiveScale = visual.userData.surface === "emissive" ? 0.85 : 0.12;
      visual.material.emissive.setHex(color).multiplyScalar(emissiveScale);
    },
    setVisible(id, visible) {
      const visual = visuals.get(id);
      if (visual === undefined) {
        throw new Error(`visual does not exist: ${id}`);
      }
      visual.visible = visible;
    },
    setCamera(view: CameraView) {
      camera.position.set(...view.position);
      camera.lookAt(...view.target);
      if (view.fieldOfView !== undefined) {
        camera.fov = Math.max(20, Math.min(90, view.fieldOfView));
        camera.updateProjectionMatrix();
      }
    },
    spawnParticles(definition) {
      const burst = createParticleBurst(definition);
      bursts.push(burst);
      scene.add(burst.points);
    },
    render() {
      updateParticles();
      renderer.render(scene, camera);
    },
    resize(width, height, pixelRatio) {
      renderer.setPixelRatio(Math.min(pixelRatio, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    destroy() {
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
      renderer.dispose();
    }
  };
}
