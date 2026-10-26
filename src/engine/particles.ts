import * as THREE from 'three';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  size: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class ParticleSystem {
  private maxParticles = 2500;
  private particles: Particle[] = [];
  private points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;

  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;

  // Active smoke clouds that block Line of Sight (LOS)
  public activeSmokePuffs: { x: number; y: number; z: number; radius: number; life: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);

    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);

    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('color', this.colorAttr);
    this.geo.setAttribute('size', this.sizeAttr);

    // Procedural soft circle sprite
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const spriteTex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      map: spriteTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'particle_system';
    scene.add(this.points);
  }

  public spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    size: number,
    life: number,
    gravity: number = 9.8
  ) {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift(); // Remove oldest
    }
    this.particles.push({
      x, y, z,
      vx, vy, vz,
      r, g, b,
      size,
      life,
      maxLife: life,
      gravity,
    });
  }

  public spawnSparks(pos: THREE.Vector3, normal: THREE.Vector3, count: number = 14) {
    for (let i = 0; i < count; i++) {
      const spread = 4.5;
      const vx = normal.x * 2.5 + (Math.random() - 0.5) * spread;
      const vy = normal.y * 2.5 + Math.random() * spread;
      const vz = normal.z * 2.5 + (Math.random() - 0.5) * spread;
      this.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 1.0, 0.75, 0.2, 0.12, 0.35 + Math.random() * 0.2, 12);
    }
  }

  public spawnImpactParticles(pos: THREE.Vector3, normal: THREE.Vector3, materialType: string = 'concrete') {
    if (materialType === 'metal' || materialType === 'container') {
      // Iskrzenie metalu i odpryski stalowe
      const sparkCount = materialType === 'container' ? 18 : 14;
      for (let i = 0; i < sparkCount; i++) {
        const spread = 5.2;
        const vx = normal.x * 3.2 + (Math.random() - 0.5) * spread;
        const vy = normal.y * 3.2 + Math.random() * spread;
        const vz = normal.z * 3.2 + (Math.random() - 0.5) * spread;
        this.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 1.0, 0.85 + Math.random() * 0.15, 0.25, 0.14, 0.3 + Math.random() * 0.25, 14);
      }
    } else if (materialType === 'wood') {
      // Odłamki drewna i wióry
      for (let i = 0; i < 16; i++) {
        const spread = 3.5;
        const vx = normal.x * 2.2 + (Math.random() - 0.5) * spread;
        const vy = normal.y * 2.2 + Math.random() * spread;
        const vz = normal.z * 2.2 + (Math.random() - 0.5) * spread;
        this.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 0.65, 0.45, 0.22, 0.18, 0.4 + Math.random() * 0.3, 10);
      }
    } else if (materialType === 'glass') {
      // Błyszczące odłamki szkła
      for (let i = 0; i < 20; i++) {
        const spread = 4.0;
        const vx = normal.x * 3.0 + (Math.random() - 0.5) * spread;
        const vy = normal.y * 3.0 + Math.random() * spread;
        const vz = normal.z * 3.0 + (Math.random() - 0.5) * spread;
        this.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 0.8, 0.95, 1.0, 0.15, 0.4 + Math.random() * 0.3, 8);
      }
    } else if (materialType === 'asphalt') {
      // Ciemny pył asfaltowy i żwir
      for (let i = 0; i < 16; i++) {
        const spread = 3.0;
        const vx = normal.x * 1.8 + (Math.random() - 0.5) * spread;
        const vy = normal.y * 1.8 + Math.random() * spread;
        const vz = normal.z * 1.8 + (Math.random() - 0.5) * spread;
        this.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 0.2, 0.2, 0.22, 0.24, 0.4 + Math.random() * 0.2, 7);
      }
    } else {
      // Pył betonowy i odłamki kamienne (concrete)
      for (let i = 0; i < 16; i++) {
        const spread = 3.2;
        const vx = normal.x * 2.0 + (Math.random() - 0.5) * spread;
        const vy = normal.y * 2.0 + Math.random() * spread;
        const vz = normal.z * 2.0 + (Math.random() - 0.5) * spread;
        const shade = 0.55 + Math.random() * 0.25;
        this.spawn(pos.x, pos.y, pos.z, vx, vy, vz, shade, shade, shade, 0.22, 0.45 + Math.random() * 0.3, 8);
      }
    }
  }

  public spawnBlood(pos: THREE.Vector3, dir: THREE.Vector3, count: number = 22) {
    for (let i = 0; i < count; i++) {
      const spread = 2.0;
      const vx = -dir.x * 1.5 + (Math.random() - 0.5) * spread;
      const vy = -dir.y * 1.5 + Math.random() * 2.5;
      const vz = -dir.z * 1.5 + (Math.random() - 0.5) * spread;
      this.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 0.65, 0.05, 0.05, 0.16 + Math.random() * 0.1, 0.6 + Math.random() * 0.4, 15);
    }
  }

  public spawnExplosion(pos: THREE.Vector3) {
    // Fireball center
    for (let i = 0; i < 75; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 4 + Math.random() * 9;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.abs(Math.cos(phi)) * speed * 1.2;
      const vz = Math.sin(phi) * Math.sin(theta) * speed;
      this.spawn(pos.x, pos.y + 0.2, pos.z, vx, vy, vz, 1.0, 0.45 + Math.random() * 0.3, 0.05, 0.65 + Math.random() * 0.5, 0.8 + Math.random() * 0.5, 6);
    }
    // Heavy black smoke rising
    for (let i = 0; i < 40; i++) {
      const vx = (Math.random() - 0.5) * 3;
      const vy = 2.5 + Math.random() * 4;
      const vz = (Math.random() - 0.5) * 3;
      this.spawn(pos.x, pos.y + 0.5, pos.z, vx, vy, vz, 0.15, 0.15, 0.15, 0.8 + Math.random() * 0.6, 1.8 + Math.random() * 1.2, -1.2);
    }
  }

  public spawnSmokeGrenade(pos: THREE.Vector3, durationSec: number = 18) {
    // Register authoritative LOS smoke cloud
    this.activeSmokePuffs.push({
      x: pos.x,
      y: pos.y + 1.2,
      z: pos.z,
      radius: 6.5,
      life: durationSec,
    });

    // Spawn 160 thick white/gray smoke particles expanding horizontally
    for (let i = 0; i < 160; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 5.5;
      const px = pos.x + Math.cos(angle) * dist;
      const pz = pos.z + Math.sin(angle) * dist;
      const py = pos.y + 0.2 + Math.random() * 2.8;

      const vx = (Math.random() - 0.5) * 0.8;
      const vy = 0.2 + Math.random() * 0.4;
      const vz = (Math.random() - 0.5) * 0.8;

      const shade = 0.75 + Math.random() * 0.2;
      this.spawn(px, py, pz, vx, vy, vz, shade, shade, shade, 1.8 + Math.random() * 1.2, durationSec, -0.05);
    }
  }

  public update(dt: number) {
    // Update active smoke LOS blockers
    for (let i = this.activeSmokePuffs.length - 1; i >= 0; i--) {
      this.activeSmokePuffs[i].life -= dt;
      if (this.activeSmokePuffs[i].life <= 0) {
        this.activeSmokePuffs.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= p.gravity * dt;

      // Bounce or sit on floor
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy = -p.vy * 0.25;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }

    // Pack into buffer
    const count = this.particles.length;
    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;

      const alphaRatio = p.life / p.maxLife;
      this.colors[i * 3] = p.r * alphaRatio;
      this.colors[i * 3 + 1] = p.g * alphaRatio;
      this.colors[i * 3 + 2] = p.b * alphaRatio;

      this.sizes[i] = p.size * (0.5 + 0.5 * alphaRatio);
    }

    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.geo.setDrawRange(0, count);
  }

  public isLineBlockedBySmoke(p1: THREE.Vector3, p2: THREE.Vector3): boolean {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 0.001) return false;
    dir.normalize();

    for (const smoke of this.activeSmokePuffs) {
      // Test segment distance to smoke sphere center
      const sCenter = new THREE.Vector3(smoke.x, smoke.y, smoke.z);
      const v = new THREE.Vector3().subVectors(sCenter, p1);
      const proj = v.dot(dir);
      if (proj > 0 && proj < len) {
        const closest = new THREE.Vector3().copy(p1).addScaledVector(dir, proj);
        const dist = closest.distanceTo(sCenter);
        if (dist < smoke.radius) {
          return true; // Blocked by smoke!
        }
      }
    }
    return false;
  }

  public flashbangBurst(pos: THREE.Vector3) {
    // Ultra intense white/cyan blinding particle burst
    for (let i = 0; i < 90; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 6.0 + Math.random() * 12.0;

      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.cos(phi) * speed + 1.5;
      const vz = Math.sin(phi) * Math.sin(theta) * speed;

      this.spawn(
        pos.x, pos.y, pos.z,
        vx, vy, vz,
        1.0, 1.0, 1.0,
        0.5 + Math.random() * 0.4,
        0.4 + Math.random() * 0.3,
        1.0
      );
    }
  }

  public wallbangImpact(pos: THREE.Vector3, normal: THREE.Vector3, matType: string) {
    // Wood splinters or metal sparks on bullet exit/entry
    const count = matType === 'wood' ? 24 : 32;
    const isWood = matType === 'wood';

    for (let i = 0; i < count; i++) {
      const spread = 2.5;
      const vx = normal.x * (3.0 + Math.random() * 4.0) + (Math.random() - 0.5) * spread;
      const vy = normal.y * (3.0 + Math.random() * 4.0) + Math.random() * 3.5;
      const vz = normal.z * (3.0 + Math.random() * 4.0) + (Math.random() - 0.5) * spread;

      const r = isWood ? 0.72 : 1.0;
      const g = isWood ? 0.52 : 0.75 + Math.random() * 0.25;
      const b = isWood ? 0.28 : 0.2;

      this.spawn(
        pos.x, pos.y, pos.z,
        vx, vy, vz,
        r, g, b,
        isWood ? 0.16 : 0.09,
        0.35 + Math.random() * 0.3,
        12.0
      );
    }
  }

  public claymoreExplosion(pos: THREE.Vector3, forwardDir: THREE.Vector3) {
    // Focused directional shrapnel blast forward in a 60 degree cone
    for (let i = 0; i < 110; i++) {
      const spreadX = (Math.random() - 0.5) * 0.7;
      const spreadY = (Math.random() - 0.2) * 0.5;
      const spreadZ = (Math.random() - 0.5) * 0.7;
      const dir = new THREE.Vector3(forwardDir.x + spreadX, forwardDir.y + spreadY, forwardDir.z + spreadZ).normalize();
      const speed = 14.0 + Math.random() * 20.0;

      this.spawn(
        pos.x, pos.y + 0.25, pos.z,
        dir.x * speed,
        dir.y * speed + 2.0,
        dir.z * speed,
        1.0,
        0.65 + Math.random() * 0.35,
        0.1,
        0.28 + Math.random() * 0.2,
        0.55 + Math.random() * 0.35,
        14.0
      );
    }
  }
}
