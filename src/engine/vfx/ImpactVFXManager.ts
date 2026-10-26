import * as THREE from 'three';
import { ParticleBufferPool } from './ParticleBufferPool';

/**
 * ============================================================================
 * PROJEKT VANGUARD — SYSTEM EFEKTÓW TRAFIEŃ I PROJEKCJI DEKALÓW (ZERO-GC)
 * ============================================================================
 * Klasa: ImpactVFXManager
 * Architektura: 100% Zero-GC w pętli renderowania i zdarzeniach trafień pocisków.
 * 
 * Odpowiedzialność:
 * 1. Zróżnicowane efekty wizualne zależne od trafionego materiału (Material-based Impact):
 *    - Metal/Stal: Snopy jaskrawych iskier odbijających się wzdłuż wektora odbicia,
 *      mikro-błysk światła oraz wypalony, metaliczny decal z gorącym jądrem.
 *    - Beton/Asfalt: Chmura pyłu kamiennego, odłamki gruzu oraz spękany decal z polygonOffset.
 *    - Krew/Organika: Kierunkowe bryzgi krwi z inercją pędu pocisku oraz dekal plamy krwi.
 * 2. Pula pre-alokowanych dekalów (Pre-allocated Circular Decal Pool) eliminująca
 *    alokację geometrii w trakcie gry.
 * 3. Pula mikro-świateł punktowych dla rozbłysków uderzeniowych (Transient PointLight Pool).
 * ============================================================================
 */

export type ImpactMaterialType = 'metal' | 'concrete' | 'asphalt' | 'flesh' | 'wood' | 'glass';

interface PooledDecal {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  type: 'metal' | 'concrete' | 'blood';
}

interface TransientLight {
  light: THREE.PointLight;
  duration: number;
  maxDuration: number;
  active: boolean;
}

export class ImpactVFXManager {
  private readonly scene: THREE.Scene;
  private readonly particlePool: ParticleBufferPool;

  // Pula pre-alokowanych siatek dekalowych (Zero-GC)
  private readonly maxDecals: number = 96;
  private readonly decalPool: PooledDecal[] = [];
  private decalRingIndex: number = 0;

  // Pula dynamicznych rozbłysków światła uderzeniowego
  private readonly lightPool: TransientLight[] = [];
  private readonly maxLights: number = 6;
  private lightRingIndex: number = 0;

  // Tekstury dekalów generowane proceduralnie w pamięci
  private texMetalDecal: THREE.CanvasTexture;
  private texConcreteDecal: THREE.CanvasTexture;
  private texBloodDecal: THREE.CanvasTexture;

  // Reużywalne wektory matematyczne (Zero-GC)
  private readonly _vHitPos = new THREE.Vector3();
  private readonly _vNormal = new THREE.Vector3();
  private readonly _vShotDir = new THREE.Vector3();
  private readonly _vReflect = new THREE.Vector3();
  private readonly _vTangent = new THREE.Vector3();
  private readonly _vBitangent = new THREE.Vector3();
  private readonly _vSparksDir = new THREE.Vector3();
  private readonly _vDecalOffset = new THREE.Vector3();
  private readonly _qRotation = new THREE.Quaternion();
  private readonly _upVector = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, particlePool: ParticleBufferPool) {
    this.scene = scene;
    this.particlePool = particlePool;

    // Generowanie tekstur dekalów w pamięci
    this.texMetalDecal = this.createMetalDecalTexture();
    this.texConcreteDecal = this.createConcreteDecalTexture();
    this.texBloodDecal = this.createBloodDecalTexture();

    // Inicjalizacja puli dekalów (Pre-allocated Decal Pool)
    this.initDecalPool();

    // Inicjalizacja puli świateł uderzeniowych
    this.initLightPool();
  }

  /**
   * Generuje proceduralną teksturę krateru po kuli w metalu (wypalony pierścień + żarzący środek)
   */
  private createMetalDecalTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Ciemna krawędź przypalenia
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
    grad.addColorStop(0, 'rgba(255, 200, 120, 1.0)');
    grad.addColorStop(0.25, 'rgba(40, 40, 40, 0.95)');
    grad.addColorStop(0.65, 'rgba(15, 15, 15, 0.75)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();

    // Drobne nieregularności rykoszetu
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.moveTo(32, 32);
      ctx.lineTo(32 + Math.cos(angle) * 26, 32 + Math.sin(angle) * 26);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Generuje proceduralną teksturę spękanego krateru w betonie
   */
  private createConcreteDecalTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(15, 15, 15, 1.0)');
    grad.addColorStop(0.35, 'rgba(60, 60, 60, 0.9)');
    grad.addColorStop(0.75, 'rgba(120, 120, 120, 0.4)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    // Pęknięcia radialne w betonie
    ctx.strokeStyle = 'rgba(10, 10, 10, 0.9)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const len = 14 + Math.random() * 16;
      ctx.beginPath();
      ctx.moveTo(32, 32);
      ctx.lineTo(32 + Math.cos(angle) * len, 32 + Math.sin(angle) * len);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Generuje proceduralną teksturę rozprysku krwi z kroplami satelitarnymi
   */
  private createBloodDecalTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Centralna plama
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 22);
    grad.addColorStop(0, 'rgba(120, 4, 4, 0.95)');
    grad.addColorStop(0.65, 'rgba(80, 2, 2, 0.85)');
    grad.addColorStop(1.0, 'rgba(60, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 22, 0, Math.PI * 2);
    ctx.fill();

    // Satelitarne krople rozprysku
    ctx.fillStyle = 'rgba(110, 3, 3, 0.9)';
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 16;
      const rad = 1.5 + Math.random() * 2.5;
      ctx.beginPath();
      ctx.arc(32 + Math.cos(angle) * dist, 32 + Math.sin(angle) * dist, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Pre-alokacja puli dekalów (Quad Geometry z polygonOffset dla ochrony przed Z-Fighting)
   */
  private initDecalPool(): void {
    const geo = new THREE.PlaneGeometry(1, 1);

    for (let i = 0; i < this.maxDecals; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.texConcreteDecal,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.name = `pooled_decal_${i}`;
      this.scene.add(mesh);

      this.decalPool.push({
        mesh,
        material: mat,
        active: false,
        type: 'concrete',
      });
    }
  }

  /**
   * Inicjalizacja puli świateł uderzeniowych
   */
  private initLightPool(): void {
    for (let i = 0; i < this.maxLights; i++) {
      const light = new THREE.PointLight(0xffaa44, 0.0, 8.0, 2.0);
      light.visible = false;
      this.scene.add(light);
      this.lightPool.push({
        light,
        duration: 0,
        maxDuration: 0.06,
        active: false,
      });
    }
  }

  /**
   * Główna metoda spawnu efektu uderzenia pocisku (Zero-GC, 0 alokacji)
   */
  public spawnImpact(
    hitPoint: THREE.Vector3,
    normal: THREE.Vector3,
    shotDir: THREE.Vector3,
    materialType: string = 'concrete',
    isHeadshot: boolean = false
  ): void {
    this._vHitPos.copy(hitPoint);
    this._vNormal.copy(normal).normalize();
    this._vShotDir.copy(shotDir).normalize();

    // Wektor odbicia zwierciadlanego: R = V - 2 * (V . N) * N
    const dot = this._vShotDir.dot(this._vNormal);
    this._vReflect.copy(this._vShotDir).addScaledVector(this._vNormal, -2 * dot).normalize();

    const mat = materialType.toLowerCase();

    if (mat.includes('metal') || mat.includes('container') || mat.includes('steel')) {
      this.spawnMetalImpact();
    } else if (mat.includes('flesh') || mat.includes('body') || mat.includes('head')) {
      this.spawnFleshImpact(isHeadshot);
    } else {
      // Domyślnie beton, asfalt lub cegła
      this.spawnConcreteImpact();
    }
  }

  /**
   * Efekt uderzenia w metal: snopy iskier, błysk i wypalony ślad
   */
  private spawnMetalImpact(): void {
    const sparkCount = 28;

    for (let i = 0; i < sparkCount; i++) {
      // Rozrzut stożkowy wokół wektora odbicia z domieszką normalnej powierzchni
      const spreadX = (Math.random() - 0.5) * 0.8;
      const spreadY = (Math.random() - 0.5) * 0.8;
      const spreadZ = (Math.random() - 0.5) * 0.8;

      this._vSparksDir.copy(this._vReflect).multiplyScalar(0.7)
        .addScaledVector(this._vNormal, 0.4)
        .add(this._vSpread.set(spreadX, spreadY, spreadZ))
        .normalize();

      const speed = 14.0 + Math.random() * 22.0;

      this.particlePool.spawn({
        x: this._vHitPos.x + this._vNormal.x * 0.02,
        y: this._vHitPos.y + this._vNormal.y * 0.02,
        z: this._vHitPos.z + this._vNormal.z * 0.02,
        vx: this._vSparksDir.x * speed,
        vy: this._vSparksDir.y * speed,
        vz: this._vSparksDir.z * speed,
        r: 1.0,
        g: 0.75 + Math.random() * 0.25,
        b: 0.25 + Math.random() * 0.2,
        size: 0.06 + Math.random() * 0.08,
        life: 0.18 + Math.random() * 0.25,
        gravity: 14.0,
        drag: 3.2,
      });
    }

    // Mikro-błysk świetlny
    this.triggerFlash(this._vHitPos, 0xffbb55, 6.0, 0.05);

    // Nałożenie metalicznego dekal krateru
    this.placeDecal('metal', 0.18);
  }

  /**
   * Efekt uderzenia w beton/asfalt: pył, odłamki geometrii i krater
   */
  private spawnConcreteImpact(): void {
    // 1. Chmura pyłu betonowego
    const dustCount = 22;
    for (let i = 0; i < dustCount; i++) {
      const spreadX = (Math.random() - 0.5) * 1.2;
      const spreadY = (Math.random() - 0.5) * 1.2;
      const spreadZ = (Math.random() - 0.5) * 1.2;

      this._vSparksDir.copy(this._vNormal)
        .add(this._vSpread.set(spreadX, spreadY, spreadZ))
        .normalize();

      const speed = 2.5 + Math.random() * 4.5;
      const brightness = 0.65 + Math.random() * 0.25;

      this.particlePool.spawn({
        x: this._vHitPos.x + this._vNormal.x * 0.02,
        y: this._vHitPos.y + this._vNormal.y * 0.02,
        z: this._vHitPos.z + this._vNormal.z * 0.02,
        vx: this._vSparksDir.x * speed,
        vy: this._vSparksDir.y * speed,
        vz: this._vSparksDir.z * speed,
        r: brightness,
        g: brightness * 0.95,
        b: brightness * 0.9,
        startAlpha: 0.85,
        size: 0.22 + Math.random() * 0.28,
        life: 0.45 + Math.random() * 0.4,
        gravity: 4.5,
        drag: 2.2,
      });
    }

    // 2. Drobne odłamki gruzu o wyższej grawitacji
    for (let i = 0; i < 8; i++) {
      const spreadX = (Math.random() - 0.5) * 1.5;
      const spreadY = Math.random() * 1.0;
      const spreadZ = (Math.random() - 0.5) * 1.5;

      this._vSparksDir.copy(this._vNormal).add(this._vSpread.set(spreadX, spreadY, spreadZ)).normalize();
      const speed = 6.0 + Math.random() * 10.0;

      this.particlePool.spawn({
        x: this._vHitPos.x,
        y: this._vHitPos.y,
        z: this._vHitPos.z,
        vx: this._vSparksDir.x * speed,
        vy: this._vSparksDir.y * speed,
        vz: this._vSparksDir.z * speed,
        r: 0.35,
        g: 0.35,
        b: 0.35,
        size: 0.08,
        life: 0.6 + Math.random() * 0.3,
        gravity: 18.0,
        drag: 1.5,
      });
    }

    // Nałożenie spękanego dekal w betonie
    this.placeDecal('concrete', 0.24);
  }

  /**
   * Efekt uderzenia w ciało/organikę: bryzgi krwi z inercją pędu
   */
  private spawnFleshImpact(isHeadshot: boolean = false): void {
    const bloodCount = isHeadshot ? 45 : 28;

    for (let i = 0; i < bloodCount; i++) {
      // Inercja pędu: krew wylatuje głównie zgodnie z kierunkiem pocisku z lekkim rozrzutem
      const spreadX = (Math.random() - 0.5) * 0.9;
      const spreadY = (Math.random() - 0.5) * 0.9;
      const spreadZ = (Math.random() - 0.5) * 0.9;

      this._vSparksDir.copy(this._vShotDir).multiplyScalar(0.7)
        .add(this._vSpread.set(spreadX, spreadY, spreadZ))
        .normalize();

      const speed = (isHeadshot ? 8.0 : 4.5) + Math.random() * 8.0;

      this.particlePool.spawn({
        x: this._vHitPos.x,
        y: this._vHitPos.y,
        z: this._vHitPos.z,
        vx: this._vSparksDir.x * speed,
        vy: this._vSparksDir.y * speed,
        vz: this._vSparksDir.z * speed,
        r: 0.72 + Math.random() * 0.15,
        g: 0.03,
        b: 0.03,
        startAlpha: 0.95,
        size: isHeadshot ? 0.14 : 0.09,
        life: 0.35 + Math.random() * 0.3,
        gravity: 16.0,
        drag: 2.0,
      });
    }

    // Ślad krwi na podłożu/ścianie
    this.placeDecal('blood', isHeadshot ? 0.45 : 0.28);
  }

  /**
   * Umieszcza dekal z puli na powierzchni uderzenia z orientacją wzdłuż normalnej
   */
  private placeDecal(type: 'metal' | 'concrete' | 'blood', size: number): void {
    const pooled = this.decalPool[this.decalRingIndex];
    this.decalRingIndex = (this.decalRingIndex + 1) % this.maxDecals;

    // Przełączenie tekstury
    if (type === 'metal') {
      pooled.material.map = this.texMetalDecal;
    } else if (type === 'blood') {
      pooled.material.map = this.texBloodDecal;
    } else {
      pooled.material.map = this.texConcreteDecal;
    }
    pooled.material.needsUpdate = true;
    pooled.type = type;

    // Odsunięcie dekal o 0.005m wzdłuż normalnej dla idealnej ochrony przed z-fighting
    this._vDecalOffset.copy(this._vNormal).multiplyScalar(0.005);
    pooled.mesh.position.copy(this._vHitPos).add(this._vDecalOffset);

    // Orientacja kwadratu dekal prostopadle do wektora normalnego
    this._qRotation.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._vNormal);
    pooled.mesh.quaternion.copy(this._qRotation);

    // Losowy obrót wokół osi normalnej (dla urozmaicenia śladów)
    pooled.mesh.rotateZ(Math.random() * Math.PI * 2);

    pooled.mesh.scale.set(size, size, 1.0);
    pooled.mesh.visible = true;
    pooled.active = true;
  }

  /**
   * Aktywuje mikro-błysk punktowy z puli świateł
   */
  private triggerFlash(pos: THREE.Vector3, colorHex: number, intensity: number, duration: number): void {
    const lightItem = this.lightPool[this.lightRingIndex];
    this.lightRingIndex = (this.lightRingIndex + 1) % this.maxLights;

    lightItem.light.position.copy(pos).addScaledVector(this._vNormal, 0.15);
    lightItem.light.color.setHex(colorHex);
    lightItem.light.intensity = intensity;
    lightItem.duration = duration;
    lightItem.maxDuration = duration;
    lightItem.light.visible = true;
    lightItem.active = true;
  }

  // Wektor pomocniczy dla unikania alokacji przy spread
  private readonly _vSpread = new THREE.Vector3();

  /**
   * Pętla aktualizacji wygaszania świateł uderzeniowych (Zero-GC)
   */
  public update(dt: number): void {
    for (let i = 0; i < this.maxLights; i++) {
      const item = this.lightPool[i];
      if (!item.active) continue;

      item.duration -= dt;
      if (item.duration <= 0) {
        item.light.visible = false;
        item.active = false;
      } else {
        const factor = item.duration / item.maxDuration;
        item.light.intensity = factor * 5.0;
      }
    }
  }

  public dispose(): void {
    for (const decal of this.decalPool) {
      this.scene.remove(decal.mesh);
      decal.mesh.geometry.dispose();
      decal.material.dispose();
    }
    this.decalPool.length = 0;

    for (const lightItem of this.lightPool) {
      this.scene.remove(lightItem.light);
      lightItem.light.dispose();
    }
    this.lightPool.length = 0;

    this.texMetalDecal.dispose();
    this.texConcreteDecal.dispose();
    this.texBloodDecal.dispose();
  }
}
