import * as THREE from 'three';
import { CollidableBox } from './environment';

/**
 * Fizyka Kinematyczna i Balistyka Fizyczna (Zero-GC Architecture)
 * Klasa implementuje zaawansowany kontroler kinematyczny postaci z obsługą
 * kolizji kapsułowej, schodzenia/wchodzenia po schodach (step offset),
 * zsuwania się po stromych powierzchniach oraz fizycznej symulacji pocisków
 * z opadaniem grawitacyjnym, rykoszetami i penetracją przeszkód.
 */

// Pula statycznych wektorów pomocniczych - absolutny brak alokacji w pętli renderowania
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _boxMin = new THREE.Vector3();
const _boxMax = new THREE.Vector3();
const _closestPoint = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _penetration = new THREE.Vector3();

export interface PhysicalProjectile {
  active: boolean;
  id: string;
  ownerId: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  gravityScale: number;
  drag: number;
  damage: number;
  penetrationPower: number;
  ricochetsRemaining: number;
  lifeTime: number;
  tracerMesh?: THREE.Line;
}

export class KinematicPhysicsBridge {
  // Rozmiary kapsuły gracza
  public static readonly CAPSULE_RADIUS = 0.42;
  public static readonly CAPSULE_HEIGHT_STAND = 1.80;
  public static readonly CAPSULE_HEIGHT_CROUCH = 1.10;
  public static readonly STEP_OFFSET = 0.40; // Maksymalna wysokość schodka pokonywanego bez zatrzymania
  public static readonly MAX_SLOPE_ANGLE = Math.PI * 0.28; // ~50 stopni

  // Pula fizycznych pocisków (Object Pooling)
  private projectilePool: PhysicalProjectile[] = [];
  private static readonly MAX_PROJECTILES = 64;

  constructor() {
    // Inicjalizacja puli pocisków
    for (let i = 0; i < KinematicPhysicsBridge.MAX_PROJECTILES; i++) {
      this.projectilePool.push({
        active: false,
        id: `proj_${i}`,
        ownerId: '',
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        gravityScale: 1.0,
        drag: 0.001,
        damage: 35,
        penetrationPower: 1.0,
        ricochetsRemaining: 1,
        lifeTime: 0,
      });
    }
  }

  /**
   * Kinematyczne rozwiązanie kolizji kapsuły ze środowiskiem (AABB i przeszkody)
   * Obsługuje Step-Offset oraz gładkie ślizganie po ścianach.
   */
  public resolveCapsuleCollision(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    height: number,
    radius: number,
    colliders: CollidableBox[],
    dt: number
  ): { isGrounded: boolean; stepped: boolean } {
    let isGrounded = false;
    let stepped = false;

    // Pozycja stóp i głowy
    const footY = pos.y - height * 0.5;
    const headY = pos.y + height * 0.5;

    // Przesunięcie pozycji na podstawie wektora prędkości
    pos.addScaledVector(vel, dt);

    // Iteracyjne rozwiązywanie kolizji (do 3 przejść dla stabilności w narożnikach)
    for (let pass = 0; pass < 3; pass++) {
      const curFootY = pos.y - height * 0.5;
      const curHeadY = pos.y + height * 0.5;

      for (let i = 0; i < colliders.length; i++) {
        const col = colliders[i];
        _boxMin.copy(col.min);
        _boxMax.copy(col.max);

        // Rozszerzenie AABB o promień kapsuły
        if (
          pos.x + radius < _boxMin.x ||
          pos.x - radius > _boxMax.x ||
          curHeadY < _boxMin.y ||
          curFootY > _boxMax.y ||
          pos.z + radius < _boxMin.z ||
          pos.z - radius > _boxMax.z
        ) {
          continue;
        }

        // 1. Sprawdzenie kolizji pionowej (oparcie stóp na podłożu / uderzenie w sufit)
        if (
          pos.x >= _boxMin.x - radius * 0.4 &&
          pos.x <= _boxMax.x + radius * 0.4 &&
          pos.z >= _boxMin.z - radius * 0.4 &&
          pos.z <= _boxMax.z + radius * 0.4
        ) {
          // Stopy lądują na powierzchni (podłoga / rampa / skrzynia)
          if (curFootY <= _boxMax.y + 0.15 && curFootY >= _boxMax.y - 0.45 && vel.y <= 0.1) {
            pos.y = _boxMax.y + height * 0.5;
            vel.y = 0;
            isGrounded = true;
            continue; // Powierzchnia pod stopami — ignoruj kolizję poziomą
          }
          // Głowa uderza w sufit
          if (curHeadY >= _boxMin.y && curHeadY <= _boxMin.y + 0.35 && vel.y > 0) {
            pos.y = _boxMin.y - height * 0.5 - 0.02;
            vel.y = 0;
            continue;
          }
        }

        // 2. Obiekt w całości pod stopami — pokonanie schodka (Step Offset)
        const obstacleTop = _boxMax.y;
        if (obstacleTop <= curFootY + KinematicPhysicsBridge.STEP_OFFSET) {
          if (obstacleTop > curFootY && vel.y <= 0.1) {
            pos.y = obstacleTop + height * 0.5;
            vel.y = 0;
            isGrounded = true;
            stepped = true;
          }
          continue; // Podłoga pod stopami — brak wypychania poziomego!
        }

        // 3. Kolizja w płaszczyźnie poziomej z pionowymi ścianami
        _closestPoint.set(
          Math.max(_boxMin.x, Math.min(pos.x, _boxMax.x)),
          Math.max(_boxMin.y, Math.min(pos.y, _boxMax.y)),
          Math.max(_boxMin.z, Math.min(pos.z, _boxMax.z))
        );

        const dx = pos.x - _closestPoint.x;
        const dz = pos.z - _closestPoint.z;
        const horizDistSq = dx * dx + dz * dz;

        if (horizDistSq < radius * radius) {
          const horizDist = Math.sqrt(horizDistSq);

          if (horizDist > 0.001) {
            const overlap = radius - horizDist;
            const nx = dx / horizDist;
            const nz = dz / horizDist;

            // Wypchnięcie gracza ze ściany
            pos.x += nx * overlap;
            pos.z += nz * overlap;

            // Ścięcie składowej prędkości wzdłuż normalnej ściany (ślizganie)
            const normalVel = vel.x * nx + vel.z * nz;
            if (normalVel < 0) {
              vel.x -= nx * normalVel;
              vel.z -= nz * normalVel;
            }
          } else {
            // Wniknięcie w ścianę — ewakuacja w najkrótszym kierunku krawędzi
            const overlapLeft = pos.x - _boxMin.x + radius;
            const overlapRight = _boxMax.x - pos.x + radius;
            const overlapBack = pos.z - _boxMin.z + radius;
            const overlapFront = _boxMax.z - pos.z + radius;

            const minOverlap = Math.min(overlapLeft, overlapRight, overlapBack, overlapFront);
            if (minOverlap === overlapLeft) pos.x = _boxMin.x - radius;
            else if (minOverlap === overlapRight) pos.x = _boxMax.x + radius;
            else if (minOverlap === overlapBack) pos.z = _boxMin.z - radius;
            else pos.z = _boxMax.z + radius;
          }
        }
      }
    }

    // Wywołanie funkcji wyhamowywania opartego na tarciu przy bliskości granic siatki kolizji
    this.applyBoundaryFrictionClamp(pos, vel, colliders, radius, 0.18, 42.0, dt);

    // Podłoga świata (y = 0)
    const minFloorY = height * 0.5;
    if (pos.y <= minFloorY) {
      pos.y = minFloorY;
      vel.y = 0;
      isGrounded = true;
    }

    return { isGrounded, stepped };
  }

  /**
   * Funkcja clamping-u oparta na tarciu (friction-based boundary clamping),
   * która redukuje prędkość gracza do zera po wykryciu bliskości granicy siatki kolizyjnej.
   */
  public applyBoundaryFrictionClamp(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    colliders: CollidableBox[],
    radius: number,
    proximityThreshold: number = 0.18,
    maxFrictionDamping: number = 42.0,
    dt: number = 0.016
  ): boolean {
    let boundaryDetected = false;

    for (let i = 0; i < colliders.length; i++) {
      const col = colliders[i];
      _boxMin.copy(col.min);
      _boxMax.copy(col.max);

      // Pomijanie podłoża dla sprawdzania pionowych granic kolizji
      if (pos.y - radius > _boxMax.y || pos.y + radius < _boxMin.y) {
        continue;
      }

      // Wyznaczenie najbliższego punktu na obrysie AABB
      _closestPoint.set(
        Math.max(_boxMin.x, Math.min(pos.x, _boxMax.x)),
        Math.max(_boxMin.y, Math.min(pos.y, _boxMax.y)),
        Math.max(_boxMin.z, Math.min(pos.z, _boxMax.z))
      );

      const dx = pos.x - _closestPoint.x;
      const dz = pos.z - _closestPoint.z;
      const horizDist = Math.sqrt(dx * dx + dz * dz);

      // Sprawdzenie progu bliskości granicy siatki kolizji (Proximity Zone)
      if (horizDist < radius + proximityThreshold && horizDist > 0.0001) {
        boundaryDetected = true;
        const nx = dx / horizDist;
        const nz = dz / horizDist;

        // Składowa prędkości skierowana w stronę granicy
        const normalVel = vel.x * nx + vel.z * nz;

        if (normalVel < 0) {
          // Wyznaczenie proporcji bliskości granicy
          const proximityFactor = Math.min(1.0, Math.max(0.0, (radius + proximityThreshold - horizDist) / proximityThreshold));
          const frictionForce = proximityFactor * maxFrictionDamping;

          // Wyhamowanie składowej prostopadłej do zera na podstawie siły tarcia
          vel.x = THREE.MathUtils.damp(vel.x, vel.x - nx * normalVel, frictionForce, dt);
          vel.z = THREE.MathUtils.damp(vel.z, vel.z - nz * normalVel, frictionForce, dt);

          // Bezpośrednie wyzerowanie prędkości w strefie bezpośredniego styku z siatką
          if (horizDist <= radius + 0.02) {
            vel.x -= nx * normalVel;
            vel.z -= nz * normalVel;

            if (proximityFactor > 0.8) {
              vel.x = THREE.MathUtils.damp(vel.x, 0, frictionForce * 1.8, dt);
              vel.z = THREE.MathUtils.damp(vel.z, 0, frictionForce * 1.8, dt);
            }
          }
        }
      }
    }

    return boundaryDetected;
  }

  /**
   * Wystrzelenie pocisku fizycznego z puli
   */
  public spawnPhysicalProjectile(
    ownerId: string,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    damage: number,
    penetrationPower: number = 1.0,
    gravityScale: number = 1.0
  ): PhysicalProjectile | null {
    const proj = this.projectilePool.find((p) => !p.active);
    if (!proj) return null;

    proj.active = true;
    proj.ownerId = ownerId;
    proj.pos.copy(origin);
    proj.vel.copy(direction).normalize().multiplyScalar(speed);
    proj.damage = damage;
    proj.penetrationPower = penetrationPower;
    proj.gravityScale = gravityScale;
    proj.lifeTime = 0;
    proj.ricochetsRemaining = 1;

    return proj;
  }

  /**
   * Aktualizacja symulacji pocisków fizycznych
   */
  public updateProjectiles(
    dt: number,
    colliders: CollidableBox[],
    onHitCallback: (proj: PhysicalProjectile, hitPos: THREE.Vector3, normal: THREE.Vector3, hitCollider?: CollidableBox) => void
  ) {
    const GRAVITY = -9.81;

    for (let i = 0; i < this.projectilePool.length; i++) {
      const p = this.projectilePool[i];
      if (!p.active) continue;

      p.lifeTime += dt;
      if (p.lifeTime > 4.0 || p.pos.y < -5) {
        p.active = false;
        continue;
      }

      // Zastosowanie grawitacji i oporu powietrza
      p.vel.y += GRAVITY * p.gravityScale * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));

      _v1.copy(p.pos);
      _v2.copy(p.vel).multiplyScalar(dt);
      _v3.copy(_v1).add(_v2); // Nowa pozycja po kroku

      // Raycast przeciwko geometrii przeszkód
      let hitOccurred = false;
      let closestHitDist = _v2.length();
      _delta.copy(_v2).normalize();

      for (let c = 0; c < colliders.length; c++) {
        const col = colliders[c];
        _boxMin.copy(col.min);
        _boxMax.copy(col.max);

        // Test przecięcia promienia z AABB
        const hit = this.intersectRayAABB(_v1, _delta, closestHitDist, _boxMin, _boxMax);
        if (hit) {
          closestHitDist = hit.distance;
          hitOccurred = true;

          // Wyznacz punkt uderzenia
          _closestPoint.copy(_v1).addScaledVector(_delta, hit.distance);

          // Obliczenie kąta padania dla rykoszetu
          const dot = _delta.dot(hit.normal);
          const incidentAngle = Math.acos(Math.abs(dot)); // 0 = prostopadle, pi/2 = stycznie

          // Warunek rykoszetu: mały kąt padania (< 24 stopnie) i materiał metal/beton
          if (
            p.ricochetsRemaining > 0 &&
            incidentAngle > Math.PI * 0.36 &&
            (col.materialType === 'metal' || col.materialType === 'container')
          ) {
            p.ricochetsRemaining--;
            p.pos.copy(_closestPoint).addScaledVector(hit.normal, 0.05);
            // Odbicie wektora prędkości
            p.vel.reflect(hit.normal).multiplyScalar(0.65);
            onHitCallback(p, _closestPoint, hit.normal, col);
          } else {
            // Sprawdzenie penetracji materiału
            const res = col.penetrationResistance || 0.8;
            if (p.penetrationPower > res) {
              p.penetrationPower -= res;
              p.damage *= 0.55;
              p.pos.copy(_closestPoint).addScaledVector(_delta, 0.25);
              onHitCallback(p, _closestPoint, hit.normal, col);
            } else {
              p.active = false;
              onHitCallback(p, _closestPoint, hit.normal, col);
            }
          }
          break;
        }
      }

      if (!hitOccurred) {
        p.pos.copy(_v3);
      }
    }
  }

  /**
   * Szybki algorytm sprawdzania przecięcia promienia z AABB (Slab Method)
   */
  private intersectRayAABB(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    min: THREE.Vector3,
    max: THREE.Vector3
  ): { distance: number; normal: THREE.Vector3 } | null {
    let tmin = -Infinity;
    let tmax = Infinity;
    const normal = _penetration.set(0, 0, 0);

    // Oś X
    if (Math.abs(dir.x) < 0.00001) {
      if (origin.x < min.x || origin.x > max.x) return null;
    } else {
      const invD = 1 / dir.x;
      let t1 = (min.x - origin.x) * invD;
      let t2 = (max.x - origin.x) * invD;
      let nx = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp;
        nx = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        normal.set(nx, 0, 0);
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    // Oś Y
    if (Math.abs(dir.y) < 0.00001) {
      if (origin.y < min.y || origin.y > max.y) return null;
    } else {
      const invD = 1 / dir.y;
      let t1 = (min.y - origin.y) * invD;
      let t2 = (max.y - origin.y) * invD;
      let ny = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp;
        ny = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        normal.set(0, ny, 0);
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    // Oś Z
    if (Math.abs(dir.z) < 0.00001) {
      if (origin.z < min.z || origin.z > max.z) return null;
    } else {
      const invD = 1 / dir.z;
      let t1 = (min.z - origin.z) * invD;
      let t2 = (max.z - origin.z) * invD;
      let nz = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp;
        nz = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        normal.set(0, 0, nz);
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    if (tmin < 0 || tmin > maxDist) return null;

    return { distance: tmin, normal };
  }
}
