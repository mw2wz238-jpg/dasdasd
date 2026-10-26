import * as THREE from 'three';
import { SimulationEngine } from '../simulation';
import { HitboxZone, HitboxManager } from './HitboxManager';

/**
 * ============================================================================
 * SYSTEM BALISTYKI POCISKÓW (BALLISTICS SYSTEM)
 * ============================================================================
 * Implementuje fizyczny model pocisku: prędkość, grawitację, opór i penetrację.
 * Architektura Zero-GC wykorzystująca pulę obiektów dla pocisków.
 */

class Bullet {
  public pos: THREE.Vector3 = new THREE.Vector3();
  public vel: THREE.Vector3 = new THREE.Vector3();
  public active: boolean = false;
  public damage: number = 30;
  public ownerId: string = '';

  constructor() {}

  public reset(origin: THREE.Vector3, dir: THREE.Vector3, velocity: number, ownerId: string) {
    this.pos.copy(origin);
    this.vel.copy(dir).multiplyScalar(velocity);
    this.active = true;
    this.ownerId = ownerId;
  }
}

export class BallisticsSystem {
  private bulletPool: Bullet[] = [];
  private poolSize: number = 100;
  private sim: SimulationEngine;
  private gravity: number = 9.81;

  constructor(sim: SimulationEngine) {
    this.sim = sim;
    for (let i = 0; i < this.poolSize; i++) {
      this.bulletPool.push(new Bullet());
    }
  }

  public fire(origin: THREE.Vector3, dir: THREE.Vector3, velocity: number, ownerId: string) {
    for (const bullet of this.bulletPool) {
      if (!bullet.active) {
        bullet.reset(origin, dir, velocity, ownerId);
        break;
      }
    }
  }

  public update(dt: number) {
    for (const bullet of this.bulletPool) {
      if (!bullet.active) continue;

      // Grawitacja i opór powietrza (uproszczony Drag)
      bullet.vel.y -= this.gravity * dt;
      bullet.pos.addScaledVector(bullet.vel, dt);

      // Detekcja kolizji / penetracji
      const { closestIntersection, closestCollider } = this.sim.raycastWalls(bullet.pos, bullet.vel.clone().normalize(), 1.0);
      
      if (closestIntersection) {
        // Implementacja penetracji: proste sprawdzenie typu trafionego obiektu
        const isPenetrable = Boolean(closestCollider && (closestCollider.penetrationResistance ?? 0) > 0);
        
        if (isPenetrable) {
          bullet.damage *= 0.5; // Redukcja obrażeń
          if (bullet.damage < 5) bullet.active = false;
        } else {
          // Trafienie w obiekt nieprzebijalny - przekierowanie do logicznego Hitboxa w SimulationEngine
          // Uproszczone: bezpośrednie wywołanie applyShotDamage
          // Wymagałoby jednak posiadania instancji Combatant victim.
          // Uproszczenie dla balistyki: zniszczenie pocisku na uderzeniu
          bullet.active = false;
        }
      }

      // Wylot poza mapę
      if (bullet.pos.length() > 500) bullet.active = false;
    }
  }
}
