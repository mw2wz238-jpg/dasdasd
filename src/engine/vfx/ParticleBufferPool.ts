import * as THREE from 'three';

/**
 * ============================================================================
 * PROJEKT VANGUARD — BUFOROWANA PULA CZĄSTECZEK ZERO-GC (PARTICLE BUFFER POOL)
 * ============================================================================
 * Klasa: ParticleBufferPool
 * Architektura: 100% Zero-GC w pętli renderowania (Float32Array Backing Buffer).
 * 
 * Odpowiedzialność:
 * 1. Pojedynczy Draw Call dla tysięcy cząsteczek przy użyciu InstancedBufferGeometry.
 * 2. Pre-alokowane bufory atrybutów GPU:
 *    - Pozycja (x, y, z)
 *    - Skala i orientacja bilbordu
 *    - Kolor RGBA (wraz z płynnym zanikaniem alfa)
 *    - Czas życia (life, maxLife)
 * 3. Automatyczny recykling i wskaźnik kołowy (Ring Buffer) eliminujący
 *    jakąkolwiek aktywność Garbage Collectora podczas intensywnej wymiany ognia.
 * ============================================================================
 */

export interface ParticleSpawnParams {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  startAlpha?: number;
  size: number;
  life: number;
  gravity?: number;
  drag?: number;
  rotationSpeed?: number;
}

export class ParticleBufferPool {
  private readonly maxParticles: number = 4096;
  private activeCount: number = 0;
  private ringIndex: number = 0;

  // Siatka instancjonowana Three.js
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  // Atrybuty instancji przekazywane bezpośrednio do GPU
  private readonly aPosition: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aScale: THREE.InstancedBufferAttribute;
  private readonly aRotation: THREE.InstancedBufferAttribute;

  // Ciągłe tablice właściwości w pamięci TypedArray (Zero-GC)
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly colors: Float32Array;
  private readonly scales: Float32Array;
  private readonly rotations: Float32Array;
  private readonly lifeData: Float32Array; // [life, maxLife, rotSpeed, gravity]
  private readonly dragData: Float32Array;

  // Tekstura cząsteczki proceduralnej
  private particleTexture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene) {
    const N = this.maxParticles;

    // Alokacja buforów pamięci
    this.positions = new Float32Array(N * 3);
    this.velocities = new Float32Array(N * 3);
    this.colors = new Float32Array(N * 4);
    this.scales = new Float32Array(N * 2);
    this.rotations = new Float32Array(N);
    this.lifeData = new Float32Array(N * 4);
    this.dragData = new Float32Array(N);

    // Domyślna inicjalizacja (skala 0 = niewidoczna)
    for (let i = 0; i < N; i++) {
      this.scales[i * 2 + 0] = 0.0;
      this.scales[i * 2 + 1] = 0.0;
      this.colors[i * 4 + 3] = 0.0; // Alpha 0
    }

    // Geometria bilbordu (Quad 1x1)
    const baseGeo = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = baseGeo.index;
    this.geometry.attributes.position = baseGeo.attributes.position;
    this.geometry.attributes.uv = baseGeo.attributes.uv;

    // Utworzenie atrybutów instancji
    this.aPosition = new THREE.InstancedBufferAttribute(this.positions, 3);
    this.aPosition.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('instancePosition', this.aPosition);

    this.aColor = new THREE.InstancedBufferAttribute(this.colors, 4);
    this.aColor.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('instanceColor', this.aColor);

    this.aScale = new THREE.InstancedBufferAttribute(this.scales, 2);
    this.aScale.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('instanceScale', this.aScale);

    this.aRotation = new THREE.InstancedBufferAttribute(this.rotations, 1);
    this.aRotation.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('instanceRotation', this.aRotation);

    // Proceduralna miękka tekstura cząsteczek
    this.particleTexture = this.createSoftSparkTexture();

    // Dedykowany shader bilbordowy z zachowaniem orientacji ku kamerze
    this.material = new THREE.ShaderMaterial({
      name: 'Vanguard_InstancedParticleShader',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMap: { value: this.particleTexture },
      },
      vertexShader: /* glsl */ `
        attribute vec3 instancePosition;
        attribute vec4 instanceColor;
        attribute vec2 instanceScale;
        attribute float instanceRotation;

        varying vec2 vUv;
        varying vec4 vColor;

        void main() {
          vUv = uv;
          vColor = instanceColor;

          // Orientacja bilbordu do kamery
          vec2 centered = position.xy - vec2(0.5);
          float c = cos(instanceRotation);
          float s = sin(instanceRotation);
          vec2 rotated = vec2(centered.x * c - centered.y * s, centered.x * s + centered.y * c);

          vec4 mvPosition = modelViewMatrix * vec4(instancePosition, 1.0);
          mvPosition.xy += rotated * instanceScale;

          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec4 vColor;

        void main() {
          vec4 texColor = texture2D(uMap, vUv);
          gl_FragColor = texColor * vColor;
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    this.mesh.name = 'Vanguard_ParticleBufferPool';
    scene.add(this.mesh);
  }

  /**
   * Generuje miękką radialną teksturę iskrzącą bez artefaktów krawędziowych
   */
  private createSoftSparkTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 240, 200, 0.9)');
    grad.addColorStop(0.5, 'rgba(255, 180, 80, 0.45)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Spawnuje nową cząsteczkę z precyzyjnymi parametrami fizycznymi (Zero-GC)
   */
  public spawn(params: ParticleSpawnParams): void {
    const idx = this.ringIndex;
    this.ringIndex = (this.ringIndex + 1) % this.maxParticles;

    const p3 = idx * 3;
    const p4 = idx * 4;
    const p2 = idx * 2;

    // Pozycja początkowa
    this.positions[p3 + 0] = params.x;
    this.positions[p3 + 1] = params.y;
    this.positions[p3 + 2] = params.z;

    // Prędkość początkowa
    this.velocities[p3 + 0] = params.vx;
    this.velocities[p3 + 1] = params.vy;
    this.velocities[p3 + 2] = params.vz;

    // Kolor bazowy
    this.colors[p4 + 0] = params.r;
    this.colors[p4 + 1] = params.g;
    this.colors[p4 + 2] = params.b;
    this.colors[p4 + 3] = params.startAlpha ?? 1.0;

    // Skala
    this.scales[p2 + 0] = params.size;
    this.scales[p2 + 1] = params.size;

    // Rotacja
    this.rotations[idx] = Math.random() * Math.PI * 2;

    // Życie i dynamika
    this.lifeData[p4 + 0] = params.life; // bieżące życie
    this.lifeData[p4 + 1] = params.life; // max życie
    this.lifeData[p4 + 2] = params.rotationSpeed ?? (Math.random() - 0.5) * 8.0;
    this.lifeData[p4 + 3] = params.gravity ?? 9.81;

    this.dragData[idx] = params.drag ?? 1.8;
  }

  /**
   * Płaska pętla aktualizacji fizyki i życia cząsteczek (Zero-GC, 0 alokacji)
   */
  public update(dt: number): void {
    const N = this.maxParticles;
    let anyActive = false;

    for (let i = 0; i < N; i++) {
      const p4 = i * 4;
      const life = this.lifeData[p4 + 0];

      if (life <= 0) {
        // Cząsteczka nieaktywna
        if (this.scales[i * 2 + 0] > 0) {
          this.scales[i * 2 + 0] = 0;
          this.scales[i * 2 + 1] = 0;
          this.colors[p4 + 3] = 0;
        }
        continue;
      }

      anyActive = true;
      const maxLife = this.lifeData[p4 + 1];
      const newLife = life - dt;
      this.lifeData[p4 + 0] = newLife;

      if (newLife <= 0) {
        // Zgaśnięcie
        this.scales[i * 2 + 0] = 0;
        this.scales[i * 2 + 1] = 0;
        this.colors[p4 + 3] = 0;
        continue;
      }

      const p3 = i * 3;
      const p2 = i * 2;
      const rotSpeed = this.lifeData[p4 + 2];
      const gravity = this.lifeData[p4 + 3];
      const drag = this.dragData[i];

      // Grawitacja i opór powietrza (Euler integration)
      this.velocities[p3 + 1] -= gravity * dt;
      const damping = Math.max(0, 1.0 - drag * dt);
      this.velocities[p3 + 0] *= damping;
      this.velocities[p3 + 1] *= damping;
      this.velocities[p3 + 2] *= damping;

      // Aktualizacja pozycji
      this.positions[p3 + 0] += this.velocities[p3 + 0] * dt;
      this.positions[p3 + 1] += this.velocities[p3 + 1] * dt;
      this.positions[p3 + 2] += this.velocities[p3 + 2] * dt;

      // Obrót bilbordu
      this.rotations[i] += rotSpeed * dt;

      // Współczynnik wygaszania (Fade Out)
      const t = newLife / maxLife;
      this.colors[p4 + 3] = Math.min(1.0, t * 1.8); // Łagodne zanikanie
    }

    if (anyActive) {
      this.aPosition.needsUpdate = true;
      this.aColor.needsUpdate = true;
      this.aScale.needsUpdate = true;
      this.aRotation.needsUpdate = true;
    }
  }

  public setBlending(blending: THREE.Blending): void {
    this.material.blending = blending;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.particleTexture.dispose();
  }
}
