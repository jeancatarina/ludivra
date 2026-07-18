import type {
  PresentationRenderer,
  VisualDefinition,
  VisualTransform
} from "@ludivra/presentation-protocol";
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer
} from "three";

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
    render() {
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
      renderer.dispose();
    }
  };
}
