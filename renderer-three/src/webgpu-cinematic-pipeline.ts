import type { PerspectiveCamera, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";

export interface WebGpuCinematicPipeline {
  render(): void;
  resize(width: number, height: number, pixelRatio: number): void;
  destroy(): void;
}

/**
 * Keeps the desktop-high effect chain in Three's WebGPU/TSL implementation.
 * The pass and bloom nodes follow the renderer drawing buffer every frame, so
 * resize only needs to remain part of the common pipeline lifecycle.
 */
export async function createWebGpuCinematicPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera
): Promise<WebGpuCinematicPipeline> {
  const [{ RenderPipeline }, { pass }, { bloom }] = await Promise.all([
    import("three/webgpu"),
    import("three/tsl"),
    import("three/addons/tsl/display/BloomNode.js")
  ]);
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode("output");
  const bloomPass = bloom(sceneColor, 0.46, 0.58, 0.74).setResolutionScale(0.5);
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = sceneColor.add(bloomPass);

  return {
    render() {
      pipeline.render();
    },
    resize() {
      // PassNode and BloomNode read the WebGPU drawing-buffer dimensions
      // before each frame, after the renderer receives its new canvas size.
    },
    destroy() {
      scenePass.dispose();
      pipeline.dispose();
    }
  };
}
