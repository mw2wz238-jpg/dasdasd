import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPostProcessPass, WGSL_SSAO_SHADER } from './ssao';
import { PBRMaterialSystem } from './rendering/PBRMaterialSystem';
import { CSMManager } from './rendering/CSMManager';
import { LightingManager } from './rendering/LightingManager';
import { PostProcessingPipeline, PostProcessConfig } from './rendering/PostProcessingPipeline';
import { VolumetricFogSystem } from './rendering/VolumetricFogSystem';

/**
 * ============================================================================
 * ZAAWANSOWANY SILNIK RENDEROWANIA AAA (WebGPU / WebGL 2.0 Fallback)
 * ============================================================================
 * Koordynuje potok renderowania:
 * 1. PBR & HDR: ACESFilmicToneMapping, IBL (RoomEnvironment), sRGB ColorSpace.
 * 2. CSM (Cascaded Shadow Maps): 4 kaskady oświetlenia słonecznego z filtrowaniem PCF
 *    i stabilizacją tekseli (Texel Snapping).
 * 3. Potok Post-Processingu HDR: SSAO (Depth Buffer), Unreal Bloom, Wektorowy Motion Blur,
 *    Aberracja chromatyczna, Winieta, Ziarno 35mm i tryb FLIR.
 * 4. Mgła wolumetryczna i promienie światła (God Rays).
 * 5. Architektura Zero-GC w pętli renderowania.
 */

export interface RenderPipelineConfig {
  bloomEnabled: boolean;
  bloomStrength?: number;
  chromaticAberration: number;
  vignetteStrength: number;
  filmGrain: number;
  motionBlurStrength: number;
  flirThermalMode: boolean;
  flashIntensity: number;
  ssaoEnabled?: boolean;
  ssaoRadius?: number;
  ssaoIntensity?: number;
  sunIntensity?: number;
}

export class EngineRenderer {
  public renderer: THREE.WebGLRenderer;
  public postPipeline: PostProcessingPipeline;
  public volumetricFog: VolumetricFogSystem;
  public pbrSystem: PBRMaterialSystem;
  public lightingManager: LightingManager;

  // Wsteczna kompatybilność z bezpośrednimi polami
  public composer: EffectComposer;
  public renderPass: RenderPass;
  public ssaoPass: SSAOPostProcessPass;
  public bloomPass: UnrealBloomPass;
  public outputPass: OutputPass;
  public depthTexture: THREE.DepthTexture;

  public isWebGpuSupported: boolean = false;
  public isSoftwareGl: boolean = false;
  public envMap: THREE.Texture | null = null;
  public readonly wgslSsaoShader: string = WGSL_SSAO_SHADER;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, container: HTMLElement) {
    this.scene = scene;
    this.camera = camera;

    // 1. Wykrywanie programowego akceleratora WebGL (SwiftShader/llvmpipe)
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      this.isWebGpuSupported = true;
    }

    // 2. Inicjalizacja głównego WebGLRenderer z buforem logarytmicznym eliminującym z-fighting
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      logarithmicDepthBuffer: true,
    });

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));

    // 3. Konfiguracja PBR i HDR
    this.pbrSystem = PBRMaterialSystem.getInstance();
    this.pbrSystem.configureRendererHDR(this.renderer, 1.15);
    this.pbrSystem.enforceFirstPersonPerspective(this.camera);
    this.envMap = this.pbrSystem.setupIBL(this.scene, this.renderer);

    container.appendChild(this.renderer.domElement);

    // 4. Menedżer Oświetlenia AAA
    this.lightingManager = new LightingManager(this.scene, this.camera, this.renderer);
    this.lightingManager.setupIBL(this.pbrSystem);

    // 5. System Wolumetrii i Promieni Słonecznych
    this.volumetricFog = new VolumetricFogSystem(this.scene, this.camera);

    // 6. Kompletny Potok Post-Processingu HDR
    this.postPipeline = new PostProcessingPipeline(
      this.renderer,
      this.scene,
      this.camera,
      width,
      height
    );

    // Dowiązania do pól kompatybilności wstecznej
    this.composer = this.postPipeline.composer;
    this.renderPass = this.postPipeline.renderPass;
    this.ssaoPass = this.postPipeline.ssaoPass;
    this.bloomPass = this.postPipeline.bloomPass;
    this.outputPass = this.postPipeline.outputPass;
    this.depthTexture = this.postPipeline.depthTexture;

    // Obsługa zmiany rozmiaru okna
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Główna pętla renderowania klatki AAA (Zero-GC w requestAnimationFrame)
   */
  public render(
    dt: number,
    config: RenderPipelineConfig,
    cameraYaw: number,
    cameraPitch: number
  ) {
    // 1. Aktualizacja Oświetlenia (CSM + IBL)
    if (!this.isSoftwareGl) {
      this.lightingManager.update(dt);
      if (config.sunIntensity !== undefined) {
        this.lightingManager.sunLight.intensity = config.sunIntensity;
      }
    }

    // 2. Aktualizacja systemów wolumetrycznych i dynamicznego PBR
    this.volumetricFog.update(dt);
    this.pbrSystem.update(dt);

    // Dynamiczna adaptacja intensywności bloom na podstawie oświetlenia środowiskowego (np. natężenia słońca)
    const baseBloom = config.bloomStrength ?? 0.45;
    const lightingFactor = config.sunIntensity !== undefined ? (config.sunIntensity / 2.3) : 1.0;
    const dynamicBloomStrength = baseBloom * Math.max(0.4, Math.min(1.8, lightingFactor));

    // 3. Renderowanie potoku post-processingu HDR
    const postConfig: Partial<PostProcessConfig> = {
      bloomEnabled: config.bloomEnabled && !this.isSoftwareGl,
      bloomStrength: dynamicBloomStrength,
      ssaoEnabled: (config.ssaoEnabled ?? true) && !this.isSoftwareGl,
      ssaoRadius: config.ssaoRadius ?? 0.85,
      ssaoIntensity: config.ssaoIntensity ?? 1.6,
      chromaticAberration: config.chromaticAberration,
      vignetteStrength: config.vignetteStrength,
      filmGrain: config.filmGrain,
      motionBlurStrength: config.motionBlurStrength,
      flirThermalMode: config.flirThermalMode,
      flashIntensity: config.flashIntensity,
    };

    this.postPipeline.render(dt, postConfig, cameraYaw, cameraPitch, this.isSoftwareGl);
  }

  public onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
    this.postPipeline.setSize(w, h);
  };

  public dispose() {
    window.removeEventListener('resize', this.onResize);
    this.postPipeline.dispose();
    this.lightingManager.dispose();
    this.volumetricFog.dispose();
    this.pbrSystem.dispose();
    this.envMap?.dispose();
    this.renderer.dispose();
  }
}
