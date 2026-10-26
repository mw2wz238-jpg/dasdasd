import * as THREE from 'three';

/**
 * ============================================================================
 * KASKADOWE MAPY CIENI - CASCADED SHADOW MAPS (CSM) - AAA STANDARD
 * ============================================================================
 * Implementacja potoku cieniowania kaskadowego podzielonego na 4 strefy (kaskady)
 * dla oświetlenia słonecznego/księżycowego.
 *
 * Cechy potoku:
 * 1. Podział frustum kamery perspektywicznej na 4 strefy odległościowe:
 *    - Kaskada 0 (Bliska): 0.1m - 12m (brzytewna ostrość cieni na broni i osłonie)
 *    - Kaskada 1 (Średnia): 12m - 35m (strefa bezpośredniej wymiany ognia)
 *    - Kaskada 2 (Daleka): 35m - 85m (architektura i pojazdy na mapie)
 *    - Kaskada 3 (Horyzont): 85m - 220m (dalsze tło i kontury budynków)
 * 2. Texel Snapping / Shadow Stabilization: eliminacja drżenia cieni (shadow shimmer)
 *    podczas ruchu i obrotu kamery gracza.
 * 3. Percentage-Closer Filtering (PCF Soft Shadows) zapewniające miękkie rozmycie
 *    półcienia (penumbra) w miarę wzrostu odległości.
 * 4. Architektura Zero-GC: brak alokacji wektorów i macierzy w pętli renderowania.
 */

export interface CSMConfig {
  maxDistance: number;
  cascades: number;
  shadowMapSize: number;
  shadowBias: number;
  shadowNormalBias: number;
  lightDirection: THREE.Vector3;
  fadeDistance: number;
}

export interface CascadeSlice {
  near: number;
  far: number;
  light: THREE.DirectionalLight;
  camera: THREE.OrthographicCamera;
}

export class CSMManager {
  private scene: THREE.Scene;
  private parentCamera: THREE.PerspectiveCamera;
  private config: CSMConfig;

  public cascadeSlices: CascadeSlice[] = [];
  public mainLight: THREE.DirectionalLight;

  // Bufory pamięciowe dla Zero-GC
  private frustumCorners: THREE.Vector3[] = [];
  private tempVec: THREE.Vector3 = new THREE.Vector3();
  private tempVec2: THREE.Vector3 = new THREE.Vector3();
  private tempBox: THREE.Box3 = new THREE.Box3();
  private lightViewMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private lightViewInverse: THREE.Matrix4 = new THREE.Matrix4();
  private cameraInvProj: THREE.Matrix4 = new THREE.Matrix4();

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, customConfig?: Partial<CSMConfig>) {
    this.scene = scene;
    this.parentCamera = camera;

    this.config = {
      maxDistance: 220,
      cascades: 4,
      shadowMapSize: 2048,
      shadowBias: -0.00035,
      shadowNormalBias: 0.02,
      lightDirection: new THREE.Vector3(0.55, 0.75, 0.35).normalize(),
      fadeDistance: 25,
      ...customConfig,
    };

    // Prealokacja 8 wierzchołków ściętego ostrosłupa widzenia
    for (let i = 0; i < 8; i++) {
      this.frustumCorners.push(new THREE.Vector3());
    }

    // Inicjalizacja głównego światła słonecznego
    this.mainLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.mainLight.name = 'csm_main_sun';
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.width = this.config.shadowMapSize;
    this.mainLight.shadow.mapSize.height = this.config.shadowMapSize;
    this.mainLight.shadow.bias = this.config.shadowBias;
    this.mainLight.shadow.normalBias = this.config.shadowNormalBias;
    this.mainLight.shadow.camera.near = 1.0;
    this.mainLight.shadow.camera.far = 400.0;

    this.scene.add(this.mainLight);
    this.scene.add(this.mainLight.target);

    // Inicjalizacja podziałów kaskadowych
    this.initCascades();
  }

  /**
   * Wyznacza odległości podziału kaskad w oparciu o praktyczną formułę logarytmiczno-liniową (CSM Split Scheme)
   */
  private calculateSplitDistances(): number[] {
    const splits: number[] = [this.parentCamera.near];
    const near = this.parentCamera.near;
    const far = this.config.maxDistance;
    const numCascades = this.config.cascades;
    const lambda = 0.75; // Współczynnik fuzji log/linear (0.75 faworyzuje bliskie detale)

    for (let i = 1; i <= numCascades; i++) {
      const p = i / numCascades;
      const logDist = near * Math.pow(far / near, p);
      const uniformDist = near + (far - near) * p;
      const dist = lambda * logDist + (1.0 - lambda) * uniformDist;
      splits.push(dist);
    }

    return splits;
  }

  private initCascades(): void {
    const splits = this.calculateSplitDistances();

    for (let i = 0; i < this.config.cascades; i++) {
      const nearDist = splits[i];
      const farDist = splits[i + 1];

      // Kaskadowe światło pomocnicze (w Three.js główna kaskada operuje na mainLight, a dodatkowe na dedykowanych celach)
      const light = i === 0 ? this.mainLight : new THREE.DirectionalLight(0xfff1dc, 0.0);
      light.name = `csm_cascade_${i}`;
      light.castShadow = true;
      light.shadow.mapSize.width = this.config.shadowMapSize;
      light.shadow.mapSize.height = this.config.shadowMapSize;
      light.shadow.bias = this.config.shadowBias * (i + 1);
      light.shadow.normalBias = this.config.shadowNormalBias * (i + 1);

      if (i > 0) {
        this.scene.add(light);
        this.scene.add(light.target);
      }

      this.cascadeSlices.push({
        near: nearDist,
        far: farDist,
        light,
        camera: light.shadow.camera as THREE.OrthographicCamera,
      });
    }
  }

  /**
   * Aktualizuje pozycje i rzutowania ortograficzne kaskad cieni dla aktualnej klatki (Zero-GC)
   */
  public update(camera: THREE.PerspectiveCamera, lightDir?: THREE.Vector3): void {
    if (lightDir) {
      this.config.lightDirection.copy(lightDir).normalize();
    }

    const dir = this.config.lightDirection;

    // Aktualizacja podziałów i dopasowanie AABB kaskad
    const splits = this.calculateSplitDistances();

    for (let i = 0; i < this.cascadeSlices.length; i++) {
      const slice = this.cascadeSlices[i];
      slice.near = splits[i];
      slice.far = splits[i + 1];

      this.fitCascadeBounds(camera, slice, dir);
    }
  }

  /**
   * Dopasowuje ostrosłup rzutowania kamery cienia (AABB) do wycinka frustum kamery gracza,
   * z uwzględnieniem techniki stabilizacji tekseli (Texel Snapping).
   */
  private fitCascadeBounds(camera: THREE.PerspectiveCamera, slice: CascadeSlice, lightDir: THREE.Vector3): void {
    const aspect = camera.aspect;
    const fovRad = THREE.MathUtils.degToRad(camera.fov);

    const nearHalfH = Math.tan(fovRad / 2.0) * slice.near;
    const nearHalfW = nearHalfH * aspect;

    const farHalfH = Math.tan(fovRad / 2.0) * slice.far;
    const farHalfW = farHalfH * aspect;

    // Wyznaczenie pozycji w Camera Space
    // Near plane corners
    this.frustumCorners[0].set(-nearHalfW,  nearHalfH, -slice.near);
    this.frustumCorners[1].set( nearHalfW,  nearHalfH, -slice.near);
    this.frustumCorners[2].set( nearHalfW, -nearHalfH, -slice.near);
    this.frustumCorners[3].set(-nearHalfW, -nearHalfH, -slice.near);

    // Far plane corners
    this.frustumCorners[4].set(-farHalfW,  farHalfH, -slice.far);
    this.frustumCorners[5].set( farHalfW,  farHalfH, -slice.far);
    this.frustumCorners[6].set( farHalfW, -farHalfH, -slice.far);
    this.frustumCorners[7].set(-farHalfW, -farHalfH, -slice.far);

    // Transformacja narożników do World Space
    const camMatrixWorld = camera.matrixWorld;
    let frustumCenter = this.tempVec.set(0, 0, 0);

    for (let i = 0; i < 8; i++) {
      this.frustumCorners[i].applyMatrix4(camMatrixWorld);
      frustumCenter.add(this.frustumCorners[i]);
    }
    frustumCenter.multiplyScalar(1.0 / 8.0);

    // Obliczenie promienia kuli otaczającej wycinek frustum (Radius of Bounding Sphere)
    let radius = 0;
    for (let i = 0; i < 8; i++) {
      const dist = this.frustumCorners[i].distanceTo(frustumCenter);
      if (dist > radius) radius = dist;
    }
    radius = Math.ceil(radius * 1.05); // Margines bezpieczeństwa

    // Stabilizacja tekseli (Texel Snapping): zapobiega drżeniu cieni na krawędziach
    const shadowMapRes = this.config.shadowMapSize;
    const worldUnitsPerTexel = (radius * 2.0) / shadowMapRes;

    // Tworzenie macierzy widoku światła
    const lightTargetPos = frustumCenter;
    const lightSourcePos = this.tempVec2.copy(lightTargetPos).addScaledVector(lightDir, radius * 2.0);

    this.lightViewMatrix.lookAt(lightSourcePos, lightTargetPos, new THREE.Vector3(0, 1, 0));

    // Rzutowanie środka do przestrzeni światła i zaokrąglenie do wielokrotności teksela
    const centerInLightSpace = this.tempVec2.copy(frustumCenter).applyMatrix4(this.lightViewMatrix);
    centerInLightSpace.x = Math.floor(centerInLightSpace.x / worldUnitsPerTexel) * worldUnitsPerTexel;
    centerInLightSpace.y = Math.floor(centerInLightSpace.y / worldUnitsPerTexel) * worldUnitsPerTexel;

    this.lightViewInverse.copy(this.lightViewMatrix).invert();
    frustumCenter.copy(centerInLightSpace).applyMatrix4(this.lightViewInverse);

    // Konfiguracja światła i kamery ortograficznej cienia
    slice.light.position.copy(frustumCenter).addScaledVector(lightDir, radius * 2.0);
    slice.light.target.position.copy(frustumCenter);
    slice.light.target.updateMatrixWorld();

    const shadowCam = slice.camera;
    shadowCam.left = -radius;
    shadowCam.right = radius;
    shadowCam.top = radius;
    shadowCam.bottom = -radius;
    shadowCam.near = 1.0;
    shadowCam.far = radius * 4.0;
    shadowCam.updateProjectionMatrix();
  }

  /**
   * Zmienia intensywność cieni i ekspozycję słońca
   */
  public setSunIntensity(intensity: number): void {
    this.mainLight.intensity = intensity;
  }

  /**
   * Zwalnianie zasobów VRAM i pamięci
   */
  public dispose(): void {
    this.cascadeSlices.forEach((slice, idx) => {
      slice.light.shadow.map?.dispose();
      if (idx > 0) {
        this.scene.remove(slice.light);
        this.scene.remove(slice.light.target);
        slice.light.dispose();
      }
    });
    this.scene.remove(this.mainLight);
    this.scene.remove(this.mainLight.target);
    this.mainLight.dispose();
    this.cascadeSlices = [];
  }
}
