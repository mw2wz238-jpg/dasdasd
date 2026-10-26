import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPostProcessPass } from '../ssao';

/**
 * ============================================================================
 * KOMPLETNY POTOK POST-PROCESSINGU HDR (AAA GRAPHICS PIPELINE)
 * ============================================================================
 */

export interface PostProcessConfig {
  bloomEnabled: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  ssaoEnabled: boolean;
  ssaoRadius: number;
  ssaoIntensity: number;
  chromaticAberration: number;
  vignetteStrength: number;
  filmGrain: number;
  motionBlurStrength: number;
  flirThermalMode: boolean;
  flashIntensity: number;
}

export const DEFAULT_POST_PROCESS_CONFIG: PostProcessConfig = {
  bloomEnabled: true,
  bloomStrength: 0.28,
  bloomRadius: 0.45,
  bloomThreshold: 0.88,
  ssaoEnabled: true,
  ssaoRadius: 0.85,
  ssaoIntensity: 1.6,
  chromaticAberration: 0.002,
  vignetteStrength: 0.35,
  filmGrain: 0.08,
  motionBlurStrength: 0.85,
  flirThermalMode: false,
  flashIntensity: 0.0,
};

export class PostProcessingPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  public composer: EffectComposer;
  public renderPass: RenderPass;
  public ssaoPass: SSAOPostProcessPass;
  public bloomPass: UnrealBloomPass;
  public outputPass: OutputPass;
  public depthTexture: THREE.DepthTexture;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.depthTexture = new THREE.DepthTexture(width, height);
    this.depthTexture.type = THREE.UnsignedIntType;

    // Użycie HalfFloatType dla wysokiej precyzji HDR
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace,
      depthBuffer: true,
      depthTexture: this.depthTexture,
    });

    this.composer = new EffectComposer(this.renderer, renderTarget);
    
    // RenderPass
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // SSAO
    this.ssaoPass = new SSAOPostProcessPass(this.camera, width, height, this.depthTexture);
    this.composer.addPass(this.ssaoPass);

    // Unreal Bloom (Karis filtering included in standard UnrealBloomPass implementation)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      DEFAULT_POST_PROCESS_CONFIG.bloomStrength,
      DEFAULT_POST_PROCESS_CONFIG.bloomRadius,
      DEFAULT_POST_PROCESS_CONFIG.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);

    // Output
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  public render(
    dt: number,
    config: Partial<PostProcessConfig>,
    cameraYaw: number,
    cameraPitch: number,
    isSoftwareGl: boolean = false
  ): void {
    const finalConfig = { ...DEFAULT_POST_PROCESS_CONFIG, ...config };

    this.ssaoPass.enabled = finalConfig.ssaoEnabled;
    this.ssaoPass.radius = finalConfig.ssaoRadius;
    this.ssaoPass.intensity = finalConfig.ssaoIntensity;

    this.bloomPass.enabled = finalConfig.bloomEnabled;
    this.bloomPass.strength = finalConfig.bloomStrength;
    this.bloomPass.radius = finalConfig.bloomRadius;
    this.bloomPass.threshold = finalConfig.bloomThreshold;

    this.composer.render(dt);
  }

  public setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.depthTexture.image.width = width;
    this.depthTexture.image.height = height;
    this.depthTexture.needsUpdate = true;
    this.ssaoPass.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  public dispose(): void {
    this.depthTexture.dispose();
    this.ssaoPass.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }
}
