import { Vector2, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const cinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 0.92 },
    contrast: { value: 1.06 },
    vignetteStrength: { value: 0.48 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float vignetteStrength;
    varying vec2 vUv;

    void main() {
      vec4 sampled = texture2D(tDiffuse, vUv);
      float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 graded = mix(vec3(luminance), sampled.rgb, saturation);
      graded = (graded - 0.5) * contrast + 0.5;
      float edge = smoothstep(0.22, 0.78, distance(vUv, vec2(0.5)));
      graded *= 1.0 - edge * vignetteStrength;
      gl_FragColor = vec4(graded, sampled.a);
    }
  `
} as const;

export interface CinematicPipeline {
  render(): void;
  resize(width: number, height: number, pixelRatio: number): void;
  destroy(): void;
}

export function createCinematicPipeline(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera
): CinematicPipeline {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.46, 0.58, 0.74);
  const gradePass = new ShaderPass(cinematicShader);
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);
  composer.addPass(outputPass);

  return {
    render() {
      composer.render();
    },
    resize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
    destroy() {
      bloomPass.dispose();
      gradePass.dispose();
      outputPass.dispose();
      composer.dispose();
    }
  };
}
