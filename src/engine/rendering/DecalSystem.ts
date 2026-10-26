import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

/**
 * ============================================================================
 * SYSTEM DEKALÓW (DECAL SYSTEM)
 * ============================================================================
 * Używa Polygon Offset do eliminacji Z-Fighting.
 */

export class DecalSystem {
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public createDecal(
    mesh: THREE.Mesh,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3,
    texture: THREE.Texture
  ): void {
    const geometry = new DecalGeometry(mesh, position, rotation, scale);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const decal = new THREE.Mesh(geometry, material);
    this.scene.add(decal);
  }
}
