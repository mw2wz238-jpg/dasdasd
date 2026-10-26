import * as THREE from 'three';

/**
 * ============================================================================
 * SYSTEM MGŁY WOLUMETRYCZNEJ I PROMIENI ŚWIATŁA (VOLUMETRIC FOG & GOD RAYS)
 * ============================================================================
 * Zapewnia realistyczną przestrzenną mgłę wolumetryczną i snopy światła
 * w przestrzeni 3D z zachowaniem architektury Zero-GC.
 */

export interface VolumetricFogConfig {
  enabled: boolean;
  density: number;
  color: THREE.Color;
  anisotropy: number; // Współczynnik Henyey-Greensteina (rozproszenie w przód ku słońcu)
  maxDistance: number;
  lightIntensity: number;
  lightDirection: THREE.Vector3;
}

export class VolumetricFogSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  public config: VolumetricFogConfig;

  private beamMeshes: THREE.Mesh[] = [];
  private beamMaterial: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, customConfig?: Partial<VolumetricFogConfig>) {
    this.scene = scene;
    this.camera = camera;

    this.config = {
      enabled: true,
      density: 0.015,
      color: new THREE.Color(0xdce8f5),
      anisotropy: 0.65,
      maxDistance: 120,
      lightIntensity: 1.8,
      lightDirection: new THREE.Vector3(0.55, 0.75, 0.35).normalize(),
      ...customConfig,
    };

    // Materiał wolumetrycznych promieni słonecznych (God Rays)
    this.beamMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricSunBeams',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: this.config.color },
        uIntensity: { value: this.config.lightIntensity },
        uLightDir: { value: this.config.lightDirection },
        uTime: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform vec3 uLightDir;
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec2 vUv;

        void main() {
          // Wygładzanie krawędzi stożka światła
          float radialFade = sin(vUv.x * 3.14159);
          float lengthFade = pow(1.0 - vUv.y, 1.8);
          
          // Turbulencja kurzu i cząstek pyłu w promieniu
          float noise = sin(vWorldPos.x * 0.15 + uTime * 0.8) * cos(vWorldPos.z * 0.15 + uTime * 0.6);
          float dust = 0.85 + 0.15 * noise;

          float alpha = radialFade * lengthFade * dust * 0.18 * uIntensity;
          gl_FragColor = vec4(uColor * uIntensity, alpha);
        }
      `,
    });
  }

  /**
   * Tworzy snopy promieni słonecznych padających ze wskazanego źródła (np. słońca lub szczelin w dachu magazynu)
   */
  public createSunBeams(origin: THREE.Vector3, target: THREE.Vector3, colorHex: number = 0xffe8ba, count: number = 4): void {
    const dir = new THREE.Vector3().subVectors(target, origin).normalize();
    const length = origin.distanceTo(target);

    this.beamMaterial.uniforms.uColor.value.setHex(colorHex);

    for (let i = 0; i < count; i++) {
      const radiusBottom = 12 + i * 6;
      const radiusTop = 1.5;
      const coneGeo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 16, 1, true);

      // Dopasowanie orientacji cylindra wzdłuż wektora światła
      coneGeo.translate(0, -length / 2, 0);
      coneGeo.rotateX(-Math.PI / 2);

      const mesh = new THREE.Mesh(coneGeo, this.beamMaterial);
      mesh.name = `volumetric_beam_${i}`;
      mesh.position.copy(origin);
      mesh.lookAt(target);
      mesh.renderOrder = 2;

      this.scene.add(mesh);
      this.beamMeshes.push(mesh);
    }
  }

  public setDensity(density: number): void {
    this.config.density = density;
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Aktualizacja czasu dla symulacji wolumetrycznej (Zero-GC)
   */
  public update(dt: number): void {
    if (!this.config.enabled) return;
    this.beamMaterial.uniforms.uTime.value += dt;
  }

  /**
   * Zwolnienie zasobów VRAM
   */
  public dispose(): void {
    this.beamMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    });
    this.beamMeshes = [];
    this.beamMaterial.dispose();
  }
}
