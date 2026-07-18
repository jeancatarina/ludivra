import type {
  PresentationRenderer,
  ParticleBurst,
  VisualDefinition,
  VisualTransform
} from "@ludivra/presentation-protocol";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  SphereGeometry,
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

function geometry(definition: VisualDefinition): BoxGeometry | RingGeometry | SphereGeometry {
  switch (definition.shape) {
    case "box":
      return new BoxGeometry(1, 1, 1);
    case "ring":
      return new RingGeometry(0.7, 1, 48);
    case "sphere":
      return new SphereGeometry(1, 48, 32);
  }
}

export function createThreeRenderer(canvas: HTMLCanvasElement): PresentationRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 7);
  const light = new DirectionalLight(0xffffff, 4);
  light.position.set(3, 4, 6);
  scene.add(light);
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
      const material = new MeshStandardMaterial({
        color: definition.color,
        emissive: new Color(definition.color).multiplyScalar(0.16),
        metalness: 0.25,
        roughness: 0.28,
        ...(definition.shape === "ring" ? { side: DoubleSide } : {})
      });
      const mesh = new Mesh(geometry(definition), material);
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
