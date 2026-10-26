import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * ============================================================================
 * ZAAWANSOWANY SYSTEM MATERIAŁÓW PBR I HDR (FAZA 1 - AAA GRAPHICS ENGINE)
 * ============================================================================
 * Architektura i odpowiedzialności:
 * 1. Fabryka fizycznie poprawnych materiałów MeshStandardMaterial i MeshPhysicalMaterial.
 * 2. Pełny zestaw 5 proceduralnych map PBR: Albedo (sRGB), Normal Map (Linear Sobel Filter 3x3),
 *    Roughness Map, Metalness Map oraz Ambient Occlusion (AO).
 * 3. Potok HDR z ACESFilmicToneMapping, dynamiczną ekspozycją i Image-Based Lighting (IBL).
 * 4. Dynamiczny Shader Mokrych Powierzchni i Kałuż (Wetness & Puddle Shader GLSL/WGSL)
 *    wstrzykiwany przez hook onBeforeCompile do węzłów shadera Three.js / WebGPU.
 * 5. Pamięć Zero-GC z pełnym cache'owaniem tekstur oraz materiałów (zwalnianie VRAM w .dispose()).
 */

export interface PBRTextureSet {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  metalness: THREE.CanvasTexture;
  ao: THREE.CanvasTexture;
  height?: THREE.CanvasTexture;
  detail?: THREE.CanvasTexture;
}

export type PBRMaterialPreset =
  | 'asphalt_wet'
  | 'asphalt_dry'
  | 'concrete_bunker'
  | 'concrete_weathered'
  | 'concrete_road_slabs'
  | 'shipping_container_blue'
  | 'shipping_container_red'
  | 'shipping_container_military'
  | 'metal_grate_industrial'
  | 'catwalk_steel_mesh'
  | 'steel_armor_plate'
  | 'train_steel_heavy'
  | 'rust_corroded_iron'
  | 'crane_rust_orange'
  | 'scout_wreck_scorched'
  | 'oil_drum_hazard'
  | 'tarkov_brick'
  | 'wood_crate_tactical'
  | 'permafrost_snow'
  | 'night_docks_wet_planks'
  | 'weapon_parkerized_steel'
  | 'weapon_fde_polymer'
  | 'weapon_gold_camo'
  | 'glass_tactical';

export class PBRMaterialSystem {
  private static instance: PBRMaterialSystem | null = null;
  private materialCache = new Map<string, THREE.Material>();
  private textureCache = new Map<string, PBRTextureSet>();

  // Globalne uniformy pętli renderowania (animacja czasu i symulacji deszczu)
  public globalTimeUniform = { value: 0.0 };
  public globalWetnessUniform = { value: 0.85 }; // 0.0 = suchy, 1.0 = ulewa / kałuże

  private envMap: THREE.Texture | null = null;

  private constructor() {}

  public static getInstance(): PBRMaterialSystem {
    if (!PBRMaterialSystem.instance) {
      PBRMaterialSystem.instance = new PBRMaterialSystem();
    }
    return PBRMaterialSystem.instance;
  }

  /**
   * Konfiguruje potok renderera WebGL/WebGPU dla standardu HDR i ACES Filmic Tone Mapping
   */
  public configureRendererHDR(renderer: THREE.WebGLRenderer, exposure: number = 1.15): void {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  /**
   * Wymusza czystą perspektywę pierwszej osoby (FPP - First Person Perspective)
   */
  public enforceFirstPersonPerspective(camera: THREE.PerspectiveCamera): void {
    camera.near = 0.04;
    camera.far = 800.0;
    camera.fov = 75.0;
    camera.updateProjectionMatrix();
  }

  /**
   * Generuje i stosuje środowiskową mapę odbić IBL (Image Based Lighting)
   */
  public setupIBL(scene: THREE.Scene, renderer: THREE.WebGLRenderer): THREE.Texture {
    if (this.envMap) {
      scene.environment = this.envMap;
      return this.envMap;
    }

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.envMap = envTexture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    return envTexture;
  }

  /**
   * Pobiera lub tworzy zcache'owany materiał PBR o zadanym profilu
   */
  public get(preset: PBRMaterialPreset): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
    const cached = this.materialCache.get(preset);
    if (cached) return cached as THREE.MeshStandardMaterial;

    const material = this.createMaterialByPreset(preset);
    this.materialCache.set(preset, material);
    return material;
  }

  /**
   * Aktualizuje uniform czasu w klatce (Zero-GC w requestAnimationFrame)
   */
  public update(dt: number): void {
    this.globalTimeUniform.value += dt;
  }

  /**
   * Ustawia poziom globalnej wilgotności w świecie (0.0 = sucho, 1.0 = pełne kałuże)
   */
  public setGlobalWetness(wetness: number): void {
    this.globalWetnessUniform.value = Math.max(0.0, Math.min(1.0, wetness));
  }

  // ==========================================================================
  // GENERATOR DEDYKOWANYCH MAP PBR (ALBEDO, NORMAL, ROUGHNESS, METALNESS, AO)
  // ==========================================================================

  private generatePBRTextures(preset: PBRMaterialPreset, width: number = 512, height: number = 512): PBRTextureSet {
    const cached = this.textureCache.get(preset);
    if (cached) return cached;

    // 1. Albedo Canvas (sRGB)
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = width;
    albedoCanvas.height = height;
    const aCtx = albedoCanvas.getContext('2d', { willReadFrequently: true })!;

    // 2. Height/Bump Canvas (używana do splotu operatorem Sobela 3x3)
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = width;
    heightCanvas.height = height;
    const hCtx = heightCanvas.getContext('2d', { willReadFrequently: true })!;

    // 3. Roughness Canvas
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = width;
    roughCanvas.height = height;
    const rCtx = roughCanvas.getContext('2d', { willReadFrequently: true })!;

    // 4. Metalness Canvas
    const metalCanvas = document.createElement('canvas');
    metalCanvas.width = width;
    metalCanvas.height = height;
    const mCtx = metalCanvas.getContext('2d', { willReadFrequently: true })!;

    // 5. Ambient Occlusion Canvas
    const aoCanvas = document.createElement('canvas');
    aoCanvas.width = width;
    aoCanvas.height = height;
    const aoCtx = aoCanvas.getContext('2d', { willReadFrequently: true })!;

    // Rysowanie poszczególnych warstw proceduralnych dla presetu
    this.drawPresetLayers(preset, width, height, aCtx, hCtx, rCtx, mCtx, aoCtx);

    // Wygenerowanie mapy normalnych za pomocą filtrowania Sobela z mapy wysokości
    const normalCanvas = this.generateNormalMapFromHeight(heightCanvas, width, height, 2.8);

    // Utworzenie tekstur Three.js z odpowiednią przestrzenią barw
    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    albedoTex.colorSpace = THREE.SRGBColorSpace;
    albedoTex.wrapS = THREE.RepeatWrapping;
    albedoTex.wrapT = THREE.RepeatWrapping;

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.colorSpace = THREE.NoColorSpace; // Liniowa przestrzeń dla wektorów normalnych
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;

    const roughTex = new THREE.CanvasTexture(roughCanvas);
    roughTex.wrapS = THREE.RepeatWrapping;
    roughTex.wrapT = THREE.RepeatWrapping;

    const metalTex = new THREE.CanvasTexture(metalCanvas);
    metalTex.wrapS = THREE.RepeatWrapping;
    metalTex.wrapT = THREE.RepeatWrapping;

    const aoTex = new THREE.CanvasTexture(aoCanvas);
    aoTex.wrapS = THREE.RepeatWrapping;
    aoTex.wrapT = THREE.RepeatWrapping;

    const heightTex = new THREE.CanvasTexture(heightCanvas);
    heightTex.wrapS = THREE.RepeatWrapping;
    heightTex.wrapT = THREE.RepeatWrapping;

    // Proceduralna mikro-tekstura detali (Detail Map) eliminująca rozmycie przy zbliżeniach
    const detailCanvas = document.createElement('canvas');
    detailCanvas.width = 256;
    detailCanvas.height = 256;
    const dCtx = detailCanvas.getContext('2d', { willReadFrequently: true })!;
    const dImg = dCtx.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const idx = i * 4;
      const noiseVal = Math.round(128 + (Math.random() - 0.5) * 55);
      dImg.data[idx + 0] = noiseVal;
      dImg.data[idx + 1] = noiseVal;
      dImg.data[idx + 2] = noiseVal;
      dImg.data[idx + 3] = 255;
    }
    dCtx.putImageData(dImg, 0, 0);

    const detailTex = new THREE.CanvasTexture(detailCanvas);
    detailTex.wrapS = THREE.RepeatWrapping;
    detailTex.wrapT = THREE.RepeatWrapping;
    detailTex.repeat.set(8, 8); // Wysoka częstotliwość mikro-detali

    const textureSet: PBRTextureSet = {
      albedo: albedoTex,
      normal: normalTex,
      roughness: roughTex,
      metalness: metalTex,
      ao: aoTex,
      height: heightTex,
      detail: detailTex,
    };

    this.textureCache.set(preset, textureSet);
    return textureSet;
  }

  /**
   * Generuje mapę normalnych przestrzeni stycznej (Tangent-Space Normal Map)
   * przy użyciu dyskretnego operatora Sobela 3x3 w przestrzeni dwuwymiarowej.
   */
  private generateNormalMapFromHeight(
    heightCanvas: HTMLCanvasElement,
    width: number,
    height: number,
    strength: number = 2.5
  ): HTMLCanvasElement {
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = width;
    normalCanvas.height = height;
    const nCtx = normalCanvas.getContext('2d', { willReadFrequently: true })!;

    const hData = heightCanvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const nImg = nCtx.createImageData(width, height);
    const nData = nImg.data;

    const getHeight = (x: number, y: number): number => {
      const px = (x + width) % width;
      const py = (y + height) % height;
      return hData[(py * width + px) * 4] / 255.0;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Gradienty Sobela w osiach X i Y
        const tl = getHeight(x - 1, y - 1);
        const l  = getHeight(x - 1, y);
        const bl = getHeight(x - 1, y + 1);
        const tr = getHeight(x + 1, y - 1);
        const r  = getHeight(x + 1, y);
        const br = getHeight(x + 1, y + 1);
        const t  = getHeight(x, y - 1);
        const b  = getHeight(x, y + 1);

        const dX = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
        const dY = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);

        // Wektor normalnej stycznej (Tangent Space Normal)
        const nx = -dX * strength;
        const ny = -dY * strength;
        const nz = 1.0;

        const len = Math.hypot(nx, ny, nz) || 1.0;
        const normX = nx / len;
        const normY = ny / len;
        const normZ = nz / len;

        const idx = (y * width + x) * 4;
        nData[idx + 0] = Math.round((normX * 0.5 + 0.5) * 255); // Kanał R (wektor X)
        nData[idx + 1] = Math.round((normY * 0.5 + 0.5) * 255); // Kanał G (wektor Y)
        nData[idx + 2] = Math.round((normZ * 0.5 + 0.5) * 255); // Kanał B (wektor Z)
        nData[idx + 3] = 255;
      }
    }

    nCtx.putImageData(nImg, 0, 0);
    return normalCanvas;
  }

  /**
   * Generuje warstwy albedo, wysokości, roughness, metalness i AO dla każdego presetu.
   */
  private drawPresetLayers(
    preset: PBRMaterialPreset,
    width: number,
    height: number,
    aCtx: CanvasRenderingContext2D,
    hCtx: CanvasRenderingContext2D,
    rCtx: CanvasRenderingContext2D,
    mCtx: CanvasRenderingContext2D,
    aoCtx: CanvasRenderingContext2D
  ): void {
    const totalPixels = width * height;

    if (preset === 'asphalt_wet' || preset === 'asphalt_dry') {
      const aImg = aCtx.createImageData(width, height);
      const hImg = hCtx.createImageData(width, height);
      const rImg = rCtx.createImageData(width, height);
      const isWet = preset === 'asphalt_wet';

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const noise = (Math.random() - 0.5) * 22;
        const baseColor = isWet ? 30 : 45;
        const c = Math.max(10, Math.min(255, baseColor + noise));

        aImg.data[idx + 0] = c;
        aImg.data[idx + 1] = c + 1;
        aImg.data[idx + 2] = c + 3;
        aImg.data[idx + 3] = 255;

        // Mikropory kruszywa
        hImg.data[idx + 0] = Math.round(128 + noise * 2.8);
        hImg.data[idx + 1] = hImg.data[idx + 0];
        hImg.data[idx + 2] = hImg.data[idx + 0];
        hImg.data[idx + 3] = 255;

        // Roughness: suchy = 210, mokry = 70 z kałużami
        const roughVal = isWet ? Math.round(65 + Math.random() * 25) : 210;
        rImg.data[idx + 0] = roughVal;
        rImg.data[idx + 1] = roughVal;
        rImg.data[idx + 2] = roughVal;
        rImg.data[idx + 3] = 255;
      }
      aCtx.putImageData(aImg, 0, 0);
      hCtx.putImageData(hImg, 0, 0);
      rCtx.putImageData(rImg, 0, 0);

      mCtx.fillStyle = '#000000';
      mCtx.fillRect(0, 0, width, height);

      aoCtx.fillStyle = '#dcdcdc';
      aoCtx.fillRect(0, 0, width, height);

      // Mikropęknięcia asfaltu
      aCtx.strokeStyle = 'rgba(12, 14, 18, 0.5)';
      aCtx.lineWidth = 1.2;
      for (let c = 0; c < 3; c++) {
        aCtx.beginPath();
        let cx = Math.random() * width;
        let cy = Math.random() * height;
        aCtx.moveTo(cx, cy);
        for (let seg = 0; seg < 4; seg++) {
          cx += (Math.random() - 0.5) * 40;
          cy += (Math.random() - 0.5) * 40;
          aCtx.lineTo(cx, cy);
        }
        aCtx.stroke();
      }

      // Kałuże dla mokrego asfaltu
      if (isWet) {
        for (let k = 0; k < 5; k++) {
          const rx = Math.random() * width;
          const ry = Math.random() * height;
          const rad = 35 + Math.random() * 50;

          const puddleGrad = aCtx.createRadialGradient(rx, ry, rad * 0.2, rx, ry, rad);
          puddleGrad.addColorStop(0, 'rgba(8, 10, 14, 0.7)');
          puddleGrad.addColorStop(0.8, 'rgba(15, 18, 22, 0.4)');
          puddleGrad.addColorStop(1, 'rgba(30, 30, 34, 0.0)');
          aCtx.fillStyle = puddleGrad;
          aCtx.beginPath();
          aCtx.arc(rx, ry, rad, 0, Math.PI * 2);
          aCtx.fill();

          const roughGrad = rCtx.createRadialGradient(rx, ry, rad * 0.2, rx, ry, rad);
          roughGrad.addColorStop(0, 'rgba(10, 10, 10, 0.98)'); // Zwierciadło wody
          roughGrad.addColorStop(0.8, 'rgba(30, 30, 30, 0.7)');
          roughGrad.addColorStop(1, 'rgba(160, 160, 160, 0.0)');
          rCtx.fillStyle = roughGrad;
          rCtx.beginPath();
          rCtx.arc(rx, ry, rad, 0, Math.PI * 2);
          rCtx.fill();
        }
      }
    } else if (preset === 'concrete_bunker' || preset === 'concrete_weathered' || preset === 'concrete_road_slabs') {
      const aImg = aCtx.createImageData(width, height);
      const hImg = hCtx.createImageData(width, height);
      const rImg = rCtx.createImageData(width, height);

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const noise = (Math.random() - 0.5) * 28;
        const val = Math.max(30, Math.min(230, 110 + noise));

        aImg.data[idx + 0] = val;
        aImg.data[idx + 1] = val + 1;
        aImg.data[idx + 2] = val + 3;
        aImg.data[idx + 3] = 255;

        hImg.data[idx + 0] = Math.round(128 + noise * 2.0);
        hImg.data[idx + 1] = hImg.data[idx + 0];
        hImg.data[idx + 2] = hImg.data[idx + 0];
        hImg.data[idx + 3] = 255;

        rImg.data[idx + 0] = 215; // Porowaty, matowy beton
        rImg.data[idx + 1] = 215;
        rImg.data[idx + 2] = 215;
        rImg.data[idx + 3] = 255;
      }
      aCtx.putImageData(aImg, 0, 0);
      hCtx.putImageData(hImg, 0, 0);
      rCtx.putImageData(rImg, 0, 0);

      mCtx.fillStyle = '#000000';
      mCtx.fillRect(0, 0, width, height);

      aoCtx.fillStyle = '#ffffff';
      aoCtx.fillRect(0, 0, width, height);

      if (preset === 'concrete_road_slabs') {
        // Prefabrykowane płyty drogowe z wyrazistymi szczelinami dylatacyjnymi
        hCtx.fillStyle = '#101010';
        aoCtx.fillStyle = '#303030';
        aCtx.fillStyle = '#202020';

        for (let x = 0; x < width; x += 128) {
          hCtx.fillRect(x, 0, 4, height);
          aoCtx.fillRect(x - 2, 0, 8, height);
          aCtx.fillRect(x, 0, 3, height);
        }
        for (let y = 0; y < height; y += 128) {
          hCtx.fillRect(0, y, width, 4);
          aoCtx.fillRect(0, y - 2, width, 8);
          aCtx.fillRect(0, y, width, 3);
        }
      } else {
        // Pasy szalunkowe betonu ze śladami kotew
        for (let y = 0; y < height; y += 128) {
          hCtx.fillStyle = '#202020';
          hCtx.fillRect(0, y, width, 4);
          aoCtx.fillStyle = '#808080';
          aoCtx.fillRect(0, y - 2, width, 8);
        }
      }
    } else if (preset === 'train_steel_heavy' || preset === 'rust_corroded_iron') {
      // Ciężka walcowana stal wagonowa / skorroodowane żelazo
      aCtx.fillStyle = preset === 'train_steel_heavy' ? '#3d444d' : '#5a2d18';
      aCtx.fillRect(0, 0, width, height);

      hCtx.fillStyle = '#808080';
      hCtx.fillRect(0, 0, width, height);

      rCtx.fillStyle = preset === 'train_steel_heavy' ? '#555555' : '#d8d8d8';
      rCtx.fillRect(0, 0, width, height);

      mCtx.fillStyle = preset === 'train_steel_heavy' ? '#f0f0f0' : '#707070';
      mCtx.fillRect(0, 0, width, height);

      aoCtx.fillStyle = '#ffffff';
      aoCtx.fillRect(0, 0, width, height);

      // Wżery korozyjne
      for (let i = 0; i < 35; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        const rad = 5 + Math.random() * 18;

        const rustGrad = aCtx.createRadialGradient(rx, ry, 0, rx, ry, rad);
        rustGrad.addColorStop(0, '#6e2b10');
        rustGrad.addColorStop(0.7, '#91421c');
        rustGrad.addColorStop(1, 'rgba(145, 66, 28, 0)');
        aCtx.fillStyle = rustGrad;
        aCtx.beginPath();
        aCtx.arc(rx, ry, rad, 0, Math.PI * 2);
        aCtx.fill();

        hCtx.fillStyle = '#303030';
        hCtx.beginPath();
        hCtx.arc(rx, ry, rad * 0.7, 0, Math.PI * 2);
        hCtx.fill();
      }
    } else if (preset === 'catwalk_steel_mesh' || preset === 'metal_grate_industrial') {
      // Stalowa siatka i krata pomostowa kładek +3.5m z alfą prześwitującą
      aCtx.fillStyle = '#4a5058';
      aCtx.fillRect(0, 0, width, height);

      hCtx.fillStyle = '#808080';
      hCtx.fillRect(0, 0, width, height);

      rCtx.fillStyle = '#454545';
      rCtx.fillRect(0, 0, width, height);

      mCtx.fillStyle = '#f5f5f5'; // Metal 0.96
      mCtx.fillRect(0, 0, width, height);

      aoCtx.fillStyle = '#ffffff';
      aoCtx.fillRect(0, 0, width, height);

      // Oczka siatki pomostowej
      const meshGrid = 16;
      aCtx.fillStyle = '#1a1c20';
      hCtx.fillStyle = '#202020';
      aoCtx.fillStyle = '#303030';

      for (let x = 4; x < width; x += meshGrid) {
        for (let y = 4; y < height; y += meshGrid) {
          aCtx.fillRect(x, y, 8, 8);
          hCtx.fillRect(x, y, 8, 8);
          aoCtx.fillRect(x - 1, y - 1, 10, 10);
        }
      }
    } else if (preset === 'crane_rust_orange') {
      // Pomarańczowy lakier suwnicy portowej z uszkodzeniami krawędzi
      aCtx.fillStyle = '#d96b27';
      aCtx.fillRect(0, 0, width, height);

      hCtx.fillStyle = '#808080';
      hCtx.fillRect(0, 0, width, height);

      rCtx.fillStyle = '#888888';
      rCtx.fillRect(0, 0, width, height);

      mCtx.fillStyle = '#303030'; // Lakier dielektryczny, odkryty metal PBR
      mCtx.fillRect(0, 0, width, height);

      aoCtx.fillStyle = '#ffffff';
      aoCtx.fillRect(0, 0, width, height);

      // Odpryski lakieru do gołej stali
      for (let i = 0; i < 24; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        const rad = 4 + Math.random() * 15;

        aCtx.fillStyle = '#3a3f45';
        aCtx.beginPath();
        aCtx.arc(rx, ry, rad, 0, Math.PI * 2);
        aCtx.fill();

        mCtx.fillStyle = '#ffffff'; // Odkryty czysty metal
        mCtx.beginPath();
        mCtx.arc(rx, ry, rad, 0, Math.PI * 2);
        mCtx.fill();

        rCtx.fillStyle = '#202020'; // Połysk szlifowanej stali
        rCtx.beginPath();
        rCtx.arc(rx, ry, rad, 0, Math.PI * 2);
        rCtx.fill();
      }
    } else if (preset === 'scout_wreck_scorched') {
      // Spalony pancerz wozu zwiadowczego (sadza, spalone blachy)
      aCtx.fillStyle = '#1c1f24';
      aCtx.fillRect(0, 0, width, height);

      hCtx.fillStyle = '#808080';
      hCtx.fillRect(0, 0, width, height);

      rCtx.fillStyle = '#e0e0e0'; // Bardzo matowa sadza
      rCtx.fillRect(0, 0, width, height);

      mCtx.fillStyle = '#505050';
      mCtx.fillRect(0, 0, width, height);

      aoCtx.fillStyle = '#808080';
      aoCtx.fillRect(0, 0, width, height);

      // Ślady pożaru i pęcherze spalonej farby
      for (let i = 0; i < 40; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        const rad = 10 + Math.random() * 30;

        const sootGrad = aCtx.createRadialGradient(rx, ry, 0, rx, ry, rad);
        sootGrad.addColorStop(0, '#0c0d0e');
        sootGrad.addColorStop(0.7, '#24282e');
        sootGrad.addColorStop(1, 'rgba(36, 40, 46, 0)');
        aCtx.fillStyle = sootGrad;
        aCtx.beginPath();
        aCtx.arc(rx, ry, rad, 0, Math.PI * 2);
        aCtx.fill();
      }
    } else if (
      preset === 'shipping_container_blue' ||
      preset === 'shipping_container_red' ||
      preset === 'shipping_container_military'
    ) {
      const baseHex =
        preset === 'shipping_container_blue'
          ? '#224263'
          : preset === 'shipping_container_red'
          ? '#7e2424'
          : '#3f4e36';

      aCtx.fillStyle = baseHex;
      aCtx.fillRect(0, 0, width, height);

      hCtx.fillStyle = '#808080';
      hCtx.fillRect(0, 0, width, height);

      rCtx.fillStyle = '#909090';
      rCtx.fillRect(0, 0, width, height);

      mCtx.fillStyle = '#151515';
      mCtx.fillRect(0, 0, width, height);

      aoCtx.fillStyle = '#ffffff';
      aoCtx.fillRect(0, 0, width, height);

      // Profil fali trapezowej kontenera
      const corrugationWidth = 32;
      for (let x = 0; x < width; x += corrugationWidth) {
        aCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        aCtx.fillRect(x, 0, corrugationWidth * 0.45, height);

        hCtx.fillStyle = '#353535';
        hCtx.fillRect(x, 0, corrugationWidth * 0.45, height);

        aoCtx.fillStyle = '#757575';
        aoCtx.fillRect(x, 0, corrugationWidth * 0.45, height);
      }
    } else {
      // Domyślny metal/stal
      aCtx.fillStyle = '#525a63';
      aCtx.fillRect(0, 0, width, height);

      hCtx.fillStyle = '#808080';
      hCtx.fillRect(0, 0, width, height);

      rCtx.fillStyle = '#707070';
      rCtx.fillRect(0, 0, width, height);

      mCtx.fillStyle = '#d0d0d0';
      mCtx.fillRect(0, 0, width, height);

      aoCtx.fillStyle = '#ffffff';
      aoCtx.fillRect(0, 0, width, height);
    }
  }

  // ==========================================================================
  // TWORZENIE MATERIAŁU Z DYNAMICZNYM SHADEREM KAŁUŻ (WETNESS & PUDDLE SHADER)
  // ==========================================================================

  private createMaterialByPreset(preset: PBRMaterialPreset): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
    const tex = this.generatePBRTextures(preset);

    if (preset === 'glass_tactical') {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x88c2f5),
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.92,
        ior: 1.52,
        transparent: true,
        opacity: 0.85,
        reflectivity: 0.65,
      });
    }

    const isContainer = preset.startsWith('shipping_container_');
    const isMetalMesh = preset === 'catwalk_steel_mesh' || preset === 'metal_grate_industrial';
    const isArmor = preset === 'steel_armor_plate' || preset === 'train_steel_heavy';
    const isAsphalt = preset.startsWith('asphalt_');

    // Utworzenie fizycznego materiału opartego na standardach PBR
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex.albedo,
      normalMap: tex.normal,
      normalScale: new THREE.Vector2(isContainer ? 1.6 : 1.0, isContainer ? 1.6 : 1.0),
      roughnessMap: tex.roughness,
      roughness: isAsphalt ? 0.38 : isArmor ? 0.25 : 0.65,
      metalnessMap: tex.metalness,
      metalness: isArmor || isMetalMesh ? 0.95 : 0.1,
      aoMap: tex.ao,
      aoMapIntensity: 1.15,
      clearcoat: isAsphalt ? 0.35 : 0.0, // Przezroczysty lakier wodny dla asfalty
      clearcoatRoughness: 0.05,
      transparent: isMetalMesh,
      opacity: isMetalMesh ? 0.92 : 1.0,
      envMapIntensity: 1.35,
    });

    // Wstrzyknięcie shadera wilgoci i kałuż
    this.injectWetnessShader(mat);

    return mat;
  }

  /**
   * Wstrzykuje dynamiczny system mokrej powierzchni i kałuż do potoku Three.js
   * za pomocą hooka onBeforeCompile (Zero-GC, kompilowane raz na GPU).
   * Oblicza nagromadzenie kałuż w zagłębieniach powierzchni na podstawie pozycji w świecie (worldPos)
   * oraz wektora normalnego (worldNormal), dynamicznie modyfikując roughness i odbicia IBL.
   */
  private injectWetnessShader(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uGlobalTime = this.globalTimeUniform;
      shader.uniforms.uGlobalWetness = this.globalWetnessUniform;

      // 1. Rozszerzenie Vertex Shaders do przekazywania pozycji w świecie i normalnej
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        #include <common>
        varying vec3 vCustomWorldPosition;
        varying vec3 vCustomWorldNormal;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `
        #include <worldpos_vertex>
        vCustomWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vCustomWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        `
      );

      // 2. Deklaracje w Fragment Shader dla funkcji zagłębień i fal kropel deszczu
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform float uGlobalTime;
        uniform float uGlobalWetness;

        varying vec3 vCustomWorldPosition;
        varying vec3 vCustomWorldNormal;

        // Analityczna funkcja fal kropel deszczu na lustrze kałuży
        vec2 rainRipples(vec2 uv, float time) {
          vec2 p = uv * 32.0;
          vec2 i = floor(p);
          vec2 f = fract(p);
          float n = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
          float t = fract(time * 2.2 + n);
          float dist = length(f - 0.5);
          float wave = sin(dist * 26.0 - t * 12.0) * exp(-dist * 4.2) * (1.0 - t);
          return vec2(wave * 0.08);
        }

        // Symulacja zbierania się kałuż w zagłębieniach terenu / posadzki
        float calculatePuddleDepression(vec3 worldPos, vec3 worldNormal, float wetness) {
          // Kałuże gromadzą się wyłącznie na płaskich poziomach terenu (worldNormal.y > 0.75)
          float upFacing = smoothstep(0.70, 0.92, worldNormal.y);

          // Mikrotopografia terenu generowana wielostopniowym szumem dwuwymiarowym
          vec2 p = worldPos.xz * 0.12;
          float noise1 = sin(p.x * 1.7 + cos(p.y * 1.9)) * cos(p.y * 1.3 + sin(p.x * 1.1));

          vec2 p2 = worldPos.xz * 0.48;
          float noise2 = sin(p2.x * 2.8 + 1.2) * cos(p2.y * 2.5 - 0.7) * 0.4;

          float totalDepression = clamp((noise1 + noise2) * 0.5 + 0.5, 0.0, 1.0);

          // Kałuże formują się w dyskretnych, głębokich nieckach z ostra krawędzią wody
          float puddleThreshold = mix(0.72, 0.48, wetness);
          float puddleFactor = smoothstep(puddleThreshold, puddleThreshold + 0.08, totalDepression);

          return puddleFactor * upFacing * wetness;
        }

        // System Okluzji Wnęk i Mikro-Detali (Cavity Occlusion & Micro-Detail Blending)
        float calculateCavityOcclusion(vec3 worldPos) {
          float cavity = sin(worldPos.x * 4.2) * cos(worldPos.z * 4.2) * 0.18 + 0.82;
          return clamp(cavity, 0.45, 1.0);
        }
        `
      );

      // 3. Modyfikacja mapy chropowatości (Roughness) dla luster wody i okluzji wnęk
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        #include <roughnessmap_fragment>
        float roughnessPuddle = calculatePuddleDepression(vCustomWorldPosition, vCustomWorldNormal, uGlobalWetness);

        // Suchy asfalt zachowuje chropowatość, kałuża w zagłębieniu staje się lustrem wody
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.7, uGlobalWetness);
        roughnessFactor = mix(roughnessFactor, 0.015, roughnessPuddle);
        `
      );

      // 4. Modyfikacja wektorów normalnych z uwzględnieniem deszczowych fal na kałużach
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
        #include <normal_fragment_maps>
        float ripplePuddle = calculatePuddleDepression(vCustomWorldPosition, vCustomWorldNormal, uGlobalWetness);
        if (ripplePuddle > 0.05) {
          vec2 ripples = rainRipples(vCustomWorldPosition.xz, uGlobalTime);
          normal = normalize(normal + vec3(ripples.x, 0.0, ripples.y) * ripplePuddle * 1.2);
        }
        `
      );

      // 5. Przyciemnienie barwy Albedo oraz modulacja okluzji wnęk i detali
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float colorPuddle = calculatePuddleDepression(vCustomWorldPosition, vCustomWorldNormal, uGlobalWetness);
        float absorbDarkening = mix(1.0, 0.48, colorPuddle * 0.85 + uGlobalWetness * 0.15);
        float cavity = calculateCavityOcclusion(vCustomWorldPosition);
        diffuseColor.rgb *= absorbDarkening * cavity;
        `
      );
    };
  }

  /**
   * Zwolnienie zasobów pamięci VRAM (Zero-GC)
   */
  public dispose(): void {
    this.materialCache.forEach((mat) => mat.dispose());
    this.materialCache.clear();

    this.textureCache.forEach((set) => {
      set.albedo.dispose();
      set.normal.dispose();
      set.roughness.dispose();
      set.metalness.dispose();
      set.ao.dispose();
      set.height?.dispose();
      set.detail?.dispose();
    });
    this.textureCache.clear();

    this.envMap?.dispose();
    this.envMap = null;
  }
}
