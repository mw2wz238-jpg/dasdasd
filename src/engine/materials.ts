import * as THREE from 'three';
import { PBRMaterialSystem } from './rendering/PBRMaterialSystem';

/**
 * Biblioteka Zaawansowanych Materiałów PBR & Shading Engine (AAA Standard)
 * Obsługuje:
 * 1. Proceduralne generowanie map Albedo (sRGB), Normal Maps (Linear), Roughness i Metalness.
 * 2. Dynamiczne mokre powierzchnie (Wetness Shaders) z kałużami i falami deszczowymi
 *    wstrzykiwane przez onBeforeCompile do MeshStandardMaterial / MeshPhysicalMaterial.
 * 3. Cache'owanie materiałów dla zerowej alokacji pamięci w pętli renderowania.
 */

class MaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  public globalTimeUniform = { value: 0 };

  // Generator map proceduralnych wykorzystujący bezpośrednie buforowanie ImageData
  private createNoiseTexture(
    width: number,
    height: number,
    type: 'concrete' | 'rust' | 'camo_desert' | 'camo_arctic' | 'asphalt' | 'metal_plate' | 'wood_plank'
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const totalPixels = width * height;

    if (type === 'concrete') {
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const noise = (Math.random() - 0.5) * 32;
        const base = Math.min(255, Math.max(0, 84 + noise));
        data[idx] = base;
        data[idx + 1] = base;
        data[idx + 2] = base + 4;
        data[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    } else if (type === 'asphalt') {
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const noise = (Math.random() - 0.5) * 26;
        const base = Math.min(255, Math.max(0, 38 + noise));
        data[idx] = base;
        data[idx + 1] = base + 2;
        data[idx + 2] = base + 6;
        data[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);

      // Plamy oleju i wilgoci na asfalcie
      ctx.fillStyle = 'rgba(12, 16, 22, 0.5)';
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height, 20 + Math.random() * 40, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'rust') {
      ctx.fillStyle = '#2b445c'; // Kontener niebieski
      ctx.fillRect(0, 0, width, height);

      // Przetłoczenia falistej blachy kontenera
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      for (let x = 0; x < width; x += 16) {
        ctx.fillRect(x, 0, 8, height);
      }

      // Ogniska rdzy i utlenienia stali
      for (let i = 0; i < 32; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        const rRad = 6 + Math.random() * 18;
        const grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rRad);
        grad.addColorStop(0, '#753214');
        grad.addColorStop(0.65, '#9e4a20');
        grad.addColorStop(1, 'rgba(158, 74, 32, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(rx, ry, rRad, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'metal_plate') {
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const noise = (Math.random() - 0.5) * 18;
        const base = Math.min(255, Math.max(0, 110 + noise));
        data[idx] = base;
        data[idx + 1] = base + 2;
        data[idx + 2] = base + 5;
        data[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);

      // Siatka nitów przemysłowych
      ctx.fillStyle = 'rgba(25, 28, 34, 0.7)';
      for (let x = 8; x < width; x += 32) {
        for (let y = 8; y < height; y += 32) {
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (type === 'wood_plank') {
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(0, 0, width, height);

      // Deski i słoje drewna
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      for (let y = 0; y < height; y += 24) {
        ctx.fillRect(0, y, width, 2);
      }
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = 'rgba(38, 22, 10, 0.12)';
        ctx.fillRect(0, Math.random() * height, width, 1 + Math.random() * 3);
      }
    } else if (type === 'camo_desert') {
      ctx.fillStyle = '#c5ac7e';
      ctx.fillRect(0, 0, width, height);
      const colors = ['#94794e', '#615237', '#ddd0b8'];
      for (let i = 0; i < 35; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.ellipse(Math.random() * width, Math.random() * height, 15 + Math.random() * 30, 10 + Math.random() * 20, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'camo_arctic') {
      ctx.fillStyle = '#dde2e8';
      ctx.fillRect(0, 0, width, height);
      const colors = ['#8fa0b0', '#4e5a66', '#ffffff'];
      for (let i = 0; i < 35; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.ellipse(Math.random() * width, Math.random() * height, 15 + Math.random() * 25, 10 + Math.random() * 20, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Generowanie mapy normalnych (Normal Map) metodą Sobela
  private createProceduralNormalMap(width: number, height: number, bumpScale: number = 2.0): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // Generowanie mapy wysokości
    const heights = new Float32Array(width * height);
    for (let i = 0; i < heights.length; i++) {
      heights[i] = Math.random();
    }

    // Filtr Sobela dla gradientów dX i dY
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const xPrev = (x - 1 + width) % width;
        const xNext = (x + 1) % width;
        const yPrev = (y - 1 + height) % height;
        const yNext = (y + 1) % height;

        const dX = (heights[y * width + xNext] - heights[y * width + xPrev]) * bumpScale;
        const dY = (heights[yNext * width + x] - heights[yPrev * width + x]) * bumpScale;
        const dZ = 1.0;

        // Normalizacja wektora normalnego
        const len = Math.sqrt(dX * dX + dY * dY + dZ * dZ);
        const nx = -dX / len;
        const ny = -dY / len;
        const nz = dZ / len;

        const idx = (y * width + x) * 4;
        data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const normalTex = new THREE.CanvasTexture(canvas);
    normalTex.colorSpace = THREE.NoColorSpace; // Mapy normalnych muszą być w przestrzeni liniowej
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;
    return normalTex;
  }

  // Wstrzykiwanie Wetness Shaders (kałuże i falowanie deszczowe) do standardowego potoku PBR
  private injectWetnessShader(material: THREE.MeshStandardMaterial, puddleRoughness: number = 0.08) {
    material.customProgramCacheKey = () => `wetness_shader_${puddleRoughness}`;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.globalTimeUniform;
      shader.uniforms.uPuddleRoughness = { value: puddleRoughness };

      // Bezpieczne wstrzyknięcie deklaracji uniformów po sekcji <common>,
      // aby nie naruszać dyrektywy #version 300 es w WebGL 2.0
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform float uTime;
        uniform float uPuddleRoughness;
        `
      );

      // Wstrzyknięcie modyfikacji szorstkości w oparciu o kałuże z pełną ochroną #if defined( USE_UV )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        #include <roughnessmap_fragment>
        #if defined( USE_UV )
        // Dynamiczne kałuże na mokrej nawierzchni
        vec2 wetUv = vUv * 16.0;
        float puddleFactor = smoothstep(0.35, 0.65, sin(wetUv.x * 0.8) * cos(wetUv.y * 0.8) + 0.15);
        float ripples = sin(wetUv.x * 8.0 + uTime * 3.5) * cos(wetUv.y * 8.0 + uTime * 3.5) * 0.04;
        roughnessFactor = mix(roughnessFactor, max(0.02, uPuddleRoughness + ripples), puddleFactor);
        #else
        // Fallback dla meshy bez bezpośrednich koordynatów UV
        vec2 pseudoUv = gl_FragCoord.xy * 0.005;
        float puddleFactor = smoothstep(0.35, 0.65, sin(pseudoUv.x * 12.0) * cos(pseudoUv.y * 12.0) + 0.15);
        roughnessFactor = mix(roughnessFactor, uPuddleRoughness, puddleFactor);
        #endif
        `
      );
    };
  }

  public updateTime(dt: number) {
    this.globalTimeUniform.value += dt;
    PBRMaterialSystem.getInstance().update(dt);
  }

  public get(name: string): THREE.Material {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // Wykorzystanie fabryki PBRMaterialSystem dla najwyższej wierności AAA
    const pbr = PBRMaterialSystem.getInstance();

    const pbrMapping: Record<string, any> = {
      'asphalt_wet': 'asphalt_wet',
      'asphalt_dry': 'asphalt_dry',
      'night_docks_wet': 'night_docks_wet_planks',
      'snow_ground': 'permafrost_snow',
      'concrete_floor': 'concrete_bunker',
      'concrete_bunker': 'concrete_bunker',
      'concrete_weathered': 'concrete_weathered',
      'concrete_road_slabs': 'concrete_road_slabs',
      'container_rust': 'shipping_container_red',
      'container_orange': 'shipping_container_blue',
      'container_green': 'shipping_container_military',
      'shipping_container_blue': 'shipping_container_blue',
      'shipping_container_red': 'shipping_container_red',
      'shipping_container_military': 'shipping_container_military',
      'steel_armor_plate': 'steel_armor_plate',
      'metal_panel': 'steel_armor_plate',
      'steel_girder': 'steel_armor_plate',
      'wood_crate': 'wood_crate_tactical',
      'wood_crate_tactical': 'wood_crate_tactical',
      'weapon_matte_black': 'weapon_parkerized_steel',
      'weapon_metal_blued': 'weapon_parkerized_steel',
      'weapon_camo_desert': 'weapon_fde_polymer',
      'weapon_camo_arctic': 'weapon_fde_polymer',
      'weapon_gold_elite': 'weapon_gold_camo',
      'optic_glass': 'glass_tactical',
      'train_steel_heavy': 'train_steel_heavy',
      'rust_corroded_iron': 'rust_corroded_iron',
      'metal_grate_industrial': 'metal_grate_industrial',
      'catwalk_steel_mesh': 'catwalk_steel_mesh',
      'crane_rust_orange': 'crane_rust_orange',
      'scout_wreck_scorched': 'scout_wreck_scorched',
      'oil_drum_hazard': 'oil_drum_hazard',
      'tarkov_brick': 'tarkov_brick',
    };

    if (pbrMapping[name]) {
      const mat = pbr.get(pbrMapping[name]);
      this.cache.set(name, mat);
      return mat;
    }

    let mat: THREE.Material;

    switch (name) {
      case 'asphalt_wet': {
        const tex = this.createNoiseTexture(512, 512, 'asphalt');
        tex.repeat.set(16, 16);
        const norm = this.createProceduralNormalMap(256, 256, 1.8);
        norm.repeat.set(16, 16);

        const stdMat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: norm,
          normalScale: new THREE.Vector2(0.85, 0.85),
          roughness: 0.35,
          metalness: 0.18,
        });
        this.injectWetnessShader(stdMat, 0.06);
        mat = stdMat;
        break;
      }

      case 'night_docks_wet': {
        const tex = this.createNoiseTexture(512, 512, 'asphalt');
        tex.repeat.set(20, 20);
        const norm = this.createProceduralNormalMap(256, 256, 2.2);
        norm.repeat.set(20, 20);

        const stdMat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: norm,
          normalScale: new THREE.Vector2(1.1, 1.1),
          roughness: 0.22,
          metalness: 0.28,
        });
        this.injectWetnessShader(stdMat, 0.04);
        mat = stdMat;
        break;
      }

      case 'snow_ground': {
        const norm = this.createProceduralNormalMap(256, 256, 1.4);
        norm.repeat.set(24, 24);
        mat = new THREE.MeshStandardMaterial({
          color: 0xe8eef5,
          normalMap: norm,
          normalScale: new THREE.Vector2(0.5, 0.5),
          roughness: 0.85,
          metalness: 0.05,
        });
        break;
      }

      case 'concrete_floor': {
        const tex = this.createNoiseTexture(512, 512, 'concrete');
        tex.repeat.set(12, 12);
        const norm = this.createProceduralNormalMap(256, 256, 2.0);
        norm.repeat.set(12, 12);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: norm,
          normalScale: new THREE.Vector2(0.75, 0.75),
          roughness: 0.65,
          metalness: 0.1,
        });
        break;
      }

      case 'container_rust': {
        const tex = this.createNoiseTexture(256, 256, 'rust');
        tex.repeat.set(4, 2);
        const norm = this.createProceduralNormalMap(256, 256, 2.5);
        norm.repeat.set(4, 2);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: norm,
          normalScale: new THREE.Vector2(1.2, 1.2),
          roughness: 0.55,
          metalness: 0.75,
        });
        break;
      }

      case 'container_orange': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xba451c,
          roughness: 0.45,
          metalness: 0.65,
        });
        break;
      }

      case 'container_green': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x1f5438,
          roughness: 0.45,
          metalness: 0.65,
        });
        break;
      }

      case 'steel_girder': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xd9821e,
          roughness: 0.38,
          metalness: 0.88,
        });
        break;
      }

      case 'metal_panel': {
        const tex = this.createNoiseTexture(256, 256, 'metal_plate');
        tex.repeat.set(4, 4);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.32,
          metalness: 0.92,
        });
        break;
      }

      case 'wood_crate': {
        const tex = this.createNoiseTexture(256, 256, 'wood_plank');
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.78,
          metalness: 0.05,
        });
        break;
      }

      case 'weapon_matte_black': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x16181b,
          roughness: 0.32,
          metalness: 0.75,
        });
        break;
      }

      case 'weapon_metal_blued': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x22262e,
          roughness: 0.20,
          metalness: 0.95,
        });
        break;
      }

      case 'weapon_camo_desert': {
        const tex = this.createNoiseTexture(256, 256, 'camo_desert');
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.4,
          metalness: 0.3,
        });
        break;
      }

      case 'weapon_camo_arctic': {
        const tex = this.createNoiseTexture(256, 256, 'camo_arctic');
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.4,
          metalness: 0.3,
        });
        break;
      }

      case 'weapon_gold_elite': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          roughness: 0.16,
          metalness: 0.98,
        });
        break;
      }

      case 'optic_glass': {
        mat = new THREE.MeshPhysicalMaterial({
          color: 0x88ccff,
          transparent: true,
          opacity: 0.45,
          roughness: 0.04,
          metalness: 0.1,
          transmission: 0.85,
          thickness: 0.02,
          ior: 1.52,
        });
        break;
      }

      case 'reticle_red': {
        mat = new THREE.MeshBasicMaterial({
          color: 0xff1122,
          toneMapped: false,
        });
        break;
      }

      case 'reticle_green': {
        mat = new THREE.MeshBasicMaterial({
          color: 0x00ff66,
          toneMapped: false,
        });
        break;
      }

      case 'operative_blue': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x1b2b40,
          roughness: 0.72,
          metalness: 0.12,
        });
        break;
      }

      case 'operative_red': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x481616,
          roughness: 0.72,
          metalness: 0.12,
        });
        break;
      }

      case 'tactical_vest': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x111316,
          roughness: 0.58,
          metalness: 0.32,
        });
        break;
      }

      case 'operative_skin': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xd29d78,
          roughness: 0.6,
          metalness: 0.0,
        });
        break;
      }

      case 'operative_glove': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x16181b,
          roughness: 0.5,
          metalness: 0.2,
        });
        break;
      }

      case 'bullet_decal': {
        mat = new THREE.MeshBasicMaterial({
          color: 0x0a0c0e,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        break;
      }

      default: {
        mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
      }
    }

    this.cache.set(name, mat);
    return mat;
  }
}

export const Materials = new MaterialLibrary();
