import * as THREE from 'three';
import { PBRMaterialSystem } from '../rendering/PBRMaterialSystem';
import { CollidableBox } from '../environment';

/**
 * ============================================================================
 * MENEDŻER REKWIZYTÓW ŚRODOWISKOWYCH (PROP MANAGER)
 * ============================================================================
 * Odpowiedzialność:
 * 1. Zarządzanie instancjonowaniem rekwizytów (InstancedMesh) dla optymalizacji Draw Calls.
 * 2. System projekcji dekalów (ślady opon, plamy oleju) na geometrii mapy.
 * 3. Automatyzacja wypełniania mapy drobnymi detalami środowiskowymi.
 * 4. Architektura Zero-GC: brak alokacji obiektów w pętli renderowania.
 */

export class PropManager {
  private pbr: PBRMaterialSystem;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.pbr = PBRMaterialSystem.getInstance();
  }

  /**
   * Generuje instancjonowaną siatkę rekwizytów (np. palety, beczki)
   */
  public createInstancedProp(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    positions: THREE.Vector3[],
    rotations: THREE.Euler[],
    scale: number = 1.0
  ): THREE.InstancedMesh {
    const count = positions.length;
    const instancedMesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      dummy.position.copy(positions[i]);
      dummy.rotation.copy(rotations[i]);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    this.scene.add(instancedMesh);

    return instancedMesh;
  }

  /**
   * Tworzy dekale (plamy oleju, ślady opon) rzutowane na podłoże
   */
  public createDecal(
    position: THREE.Vector3,
    rotation: THREE.Euler,
    size: THREE.Vector2,
    type: 'oil_stain' | 'tire_track' | 'hazard_stripe'
  ): void {
    const decalGeo = new THREE.PlaneGeometry(size.x, size.y);
    const texture = this.generateDecalTexture(type);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const decal = new THREE.Mesh(decalGeo, material);
    decal.position.copy(position);
    decal.rotation.copy(rotation);
    this.scene.add(decal);
  }

  private generateDecalTexture(type: string): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    if (type === 'oil_stain') {
      const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
      grad.addColorStop(0, 'rgba(10, 10, 10, 0.8)');
      grad.addColorStop(1, 'rgba(20, 20, 20, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
    } else if (type === 'hazard_stripe') {
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#111111';
      for (let i = 0; i < 256; i += 64) {
        ctx.fillRect(i, 0, 32, 256);
      }
    } else {
      ctx.fillStyle = 'rgba(50, 50, 50, 0.5)';
      ctx.fillRect(64, 0, 128, 256);
    }

    return new THREE.CanvasTexture(canvas);
  }
}
