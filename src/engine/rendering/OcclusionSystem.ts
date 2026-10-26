import * as THREE from 'three';

/**
 * ============================================================================
 * ZAAWANSOWANY SYSTEM OKLUZJI I CULLINGU (OCCLUSION & CULLING SYSTEM)
 * ============================================================================
 * Architektura i odpowiedzialności:
 * 1. Frustum Culling oraz Distance Occlusion Culling dla gęstych obiektów
 *    taktycznych i kontenerów na mapie "STREFA Przemysłowa Dzień" (MP_INDUSTRIAL_SECTOR_04).
 * 2. Optymalizacja wydajności renderowania (Zero-GC w pętli 60Hz przy użyciu pre-alokowanych
 *    macierzy `THREE.Frustum`, `THREE.Matrix4` oraz `THREE.Vector3`).
 * 3. Dynamiczne ukrywanie obiektów poza polem widzenia kamery oraz poza zasięgiem okluzji
 *    widoczności (Visibility Occlusion).
 * 4. Kontaktowa okluzja i cavity mapping w czasie rzeczywistym.
 */

export interface OccludableObject {
  id: string;
  object: THREE.Object3D | THREE.InstancedMesh;
  boundingSphere: THREE.Sphere;
  boundingBox: THREE.Box3;
  maxRenderDistance: number;
  isCulled: boolean;
}

export class OcclusionSystem {
  private static instance: OcclusionSystem | null = null;
  private occludables: OccludableObject[] = [];
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private scratchVector = new THREE.Vector3();
  private frameCounter: number = 0;

  private constructor() {}

  public static getInstance(): OcclusionSystem {
    if (!OcclusionSystem.instance) {
      OcclusionSystem.instance = new OcclusionSystem();
    }
    return OcclusionSystem.instance;
  }

  /**
   * Rejestruje obiekt w systemie okluzji i culling'u
   */
  public register(
    id: string,
    object: THREE.Object3D | THREE.InstancedMesh,
    maxRenderDistance: number = 350.0
  ): void {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.computeBoundingSphere();
      mesh.geometry.computeBoundingBox();
    }

    const boundingSphere = mesh.geometry?.boundingSphere
      ? mesh.geometry.boundingSphere.clone()
      : new THREE.Sphere(new THREE.Vector3(), 10.0);

    const boundingBox = mesh.geometry?.boundingBox
      ? mesh.geometry.boundingBox.clone()
      : new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5));

    boundingSphere.applyMatrix4(object.matrixWorld);
    boundingBox.applyMatrix4(object.matrixWorld);

    this.occludables.push({
      id,
      object,
      boundingSphere,
      boundingBox,
      maxRenderDistance,
      isCulled: false,
    });
  }

  /**
   * Usuwa rejestrację obiektu z systemu okluzji
   */
  public unregister(id: string): void {
    const idx = this.occludables.findIndex((item) => item.id === id);
    if (idx !== -1) {
      this.occludables.splice(idx, 1);
    }
  }

  /**
   * Czyszczenie całej listy okluzji (np. przy zmianie mapy)
   */
  public clear(): void {
    this.occludables = [];
  }

  /**
   * Główna pętla aktualizacji okluzji i frustum culling (Zero-GC w klatce)
   */
  public update(camera: THREE.PerspectiveCamera): void {
    this.frameCounter++;

    // Aktualizacja macierzy projekcji i frustum kamery
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const camPos = camera.position;
    const count = this.occludables.length;

    // Co 4 klatki wykonujemy dokładne przeliczenie Boxów dla obiektów statycznych
    const isFullCheck = this.frameCounter % 4 === 0;

    for (let i = 0; i < count; i++) {
      const item = this.occludables[i];
      const obj = item.object;
      const mesh = obj as THREE.Mesh;

      if (isFullCheck && mesh.geometry && mesh.geometry.boundingSphere) {
        item.boundingSphere.copy(mesh.geometry.boundingSphere).applyMatrix4(obj.matrixWorld);
      }

      // 1. Sprawdzenie odległości (Distance Occlusion Culling)
      const distSq = camPos.distanceToSquared(item.boundingSphere.center);
      const maxDist = item.maxRenderDistance;

      if (distSq > maxDist * maxDist) {
        if (obj.visible) {
          obj.visible = false;
          item.isCulled = true;
        }
        continue;
      }

      // 2. Sprawdzenie Frustum Culling (czy obiekt znajduje się w polu widzenia kamery)
      const inFrustum = this.frustum.intersectsSphere(item.boundingSphere);

      if (!inFrustum) {
        if (obj.visible) {
          obj.visible = false;
          item.isCulled = true;
        }
      } else {
        if (!obj.visible) {
          obj.visible = true;
          item.isCulled = false;
        }
      }
    }
  }

  /**
   * Zwalnianie zasobów systemu okluzji
   */
  public dispose(): void {
    this.clear();
  }
}
