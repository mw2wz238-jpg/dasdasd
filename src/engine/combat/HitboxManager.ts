import * as THREE from 'three';

/**
 * ============================================================================
 * MENEDŻER HITBOXÓW (HITBOX MANAGER)
 * ============================================================================
 * Definiuje precyzyjne strefy trafień dla postaci, obsługujące mnożniki obrażeń
 * oraz wizualizację debugową w architekturze Zero-GC.
 */

export enum HitboxZone {
  HEAD = 'HEAD',
  NECK = 'NECK',
  UPPER_TORSO = 'UPPER_TORSO',
  LOWER_TORSO = 'LOWER_TORSO',
  LIMBS = 'LIMBS'
}

export interface Hitbox {
  zone: HitboxZone;
  box: THREE.Box3;
  multiplier: number;
}

export class HitboxManager {
  public static getMultiplier(zone: HitboxZone): number {
    switch (zone) {
      case HitboxZone.HEAD: return 2.5;
      case HitboxZone.NECK: return 2.0;
      case HitboxZone.UPPER_TORSO: return 1.25;
      case HitboxZone.LOWER_TORSO: return 1.0;
      case HitboxZone.LIMBS: return 0.75;
      default: return 1.0;
    }
  }

  // Debugowanie wizualne hitboxów - Zero-GC
  public static createDebugBox(hitbox: Hitbox): THREE.Mesh {
    const geo = new THREE.BoxGeometry(
      hitbox.box.max.x - hitbox.box.min.x,
      hitbox.box.max.y - hitbox.box.min.y,
      hitbox.box.max.z - hitbox.box.min.z
    );
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    return new THREE.Mesh(geo, mat);
  }
}
