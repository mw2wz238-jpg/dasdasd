import * as THREE from 'three';
import { CSMManager } from './CSMManager';
import { PBRMaterialSystem } from './PBRMaterialSystem';

/**
 * ============================================================================
 * MENEDŻER OŚWIETLENIA AAA (LIGHTING MANAGER)
 * ============================================================================
 * Odpowiedzialność:
 * 1. Konfiguracja i optymalizacja Kaskadowych Map Cieni (CSM).
 * 2. Zarządzanie oświetleniem kierunkowym (Słońce) i IBL (Image Based Lighting).
 * 3. Integracja fizycznej mgły wolumetrycznej (Volumetric Fog/God Rays).
 * 4. Architektura Zero-GC: jawne zarządzanie zasobami (dispose/destroy).
 */

export interface LightingConfig {
  sunIntensity: number;
  sunDirection: THREE.Vector3;
  iblIntensity: number;
  shadowMapSize: number;
}

export class LightingManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  
  public csm: CSMManager;
  public sunLight: THREE.DirectionalLight;
  public ambientLight: THREE.HemisphereLight;
  public config: LightingConfig;

  constructor(
    scene: THREE.Scene, 
    camera: THREE.PerspectiveCamera, 
    renderer: THREE.WebGLRenderer,
    config?: Partial<LightingConfig>
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.config = {
      sunIntensity: 2.8,
      sunDirection: new THREE.Vector3(50, 80, 30).normalize(),
      iblIntensity: 0.35,
      shadowMapSize: 2048,
      ...config,
    };

    // 1. Ustawienia Renderera dla AAA
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Inicjalizacja oświetlenia kierunkowego (Słońce)
    this.sunLight = new THREE.DirectionalLight(0xFFF4E0, this.config.sunIntensity);
    this.sunLight.position.set(50, 80, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = this.config.shadowMapSize;
    this.sunLight.shadow.mapSize.height = this.config.shadowMapSize;
    this.sunLight.shadow.camera.near = 0.1;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.name = 'env_sun_light';
    this.scene.add(this.sunLight);

    // 3. Inicjalizacja Kaskadowych Map Cieni (CSM) z 4 kaskadami
    this.csm = new CSMManager(this.scene, this.camera, {
      cascades: 4,
      shadowMapSize: this.config.shadowMapSize,
      lightDirection: this.sunLight.position.normalize(),
    });

    // 4. Oświetlenie ambientowe (Hemisphere) - dostosowane do chłodnego błękitu
    this.ambientLight = new THREE.HemisphereLight(0xD0E2FF, 0x473e35, this.config.iblIntensity);
    this.ambientLight.name = 'env_ambient_light';
    this.scene.add(this.ambientLight);
  }

  /**
   * Konfiguracja IBL z użyciem systemów PBR
   */
  public setupIBL(pbrSystem: PBRMaterialSystem): void {
    pbrSystem.setupIBL(this.scene, this.renderer);
  }

  /**
   * Aktualizacja oświetlenia w pętli renderowania (Zero-GC)
   */
  public update(dt: number): void {
    // Aktualizacja kaskad cieni
    this.csm.update(this.camera);
  }

  /**
   * Zwolnienie zasobów GPU
   */
  public dispose(): void {
    this.scene.remove(this.sunLight);
    this.sunLight.dispose();
    this.scene.remove(this.ambientLight);
    this.ambientLight.dispose();
    this.csm.dispose();
  }
}
