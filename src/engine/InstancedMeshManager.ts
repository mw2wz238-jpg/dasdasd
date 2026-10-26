import * as THREE from 'three';

/**
 * ============================================================================
 * MENEDŻER OBIEKTÓW INSTANCJONOWANYCH (INSTANCED MESH MANAGER)
 * ============================================================================
 * Optymalizuje rendering powtarzalnych obiektów (kontenery, palety, beczki)
 * poprzez redukcję Draw Calls za pomocą Three.js InstancedMesh.
 */

export class InstancedMeshManager {
  private scene: THREE.Scene;
  private instances: Map<string, THREE.InstancedMesh> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public createInstancedMesh(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.instances.set(name, mesh);
    return mesh;
  }

  public updateInstanceMatrix(name: string, index: number, matrix: THREE.Matrix4): void {
    const mesh = this.instances.get(name);
    if (mesh) {
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.instances.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      // Materiale są zarządzane przez MaterialSystem, tutaj tylko mesh
    });
    this.instances.clear();
  }
}
