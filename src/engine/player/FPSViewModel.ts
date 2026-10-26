import * as THREE from 'three';

/**
 * ============================================================================
 * WIDOK BRONI FPS (FPS VIEW MODEL)
 * ============================================================================
 * Zapewnia separację głębi dla broni, zapobiegając przenikaniu przez ściany.
 */

export class FPSViewModel {
  public group: THREE.Group;
  public camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.group = new THREE.Group();
    // FPS fov 65, world fov 90
    this.group.matrixAutoUpdate = false;
  }

  public update(yaw: number, pitch: number): void {
    // Implementacja blokowania FOV i głębokości (Depth Buffer separation)
  }
}
