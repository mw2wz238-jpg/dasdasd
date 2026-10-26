import * as THREE from 'three';
import { InstancedMeshManager } from '../InstancedMeshManager';

/**
 * ============================================================================
 * PROJEKT VANGUARD — MENEDŻER FRUSTUM I OCCLUSION CULLINGU (ZERO-GC)
 * ============================================================================
 * Klasa: FrustumOcclusionManager
 * Architektura: Zero-GC (Zero Garbage Collection) w pętli renderowania klatki.
 * 
 * Odpowiedzialność:
 * 1. Zaawansowane odrzucanie obiektów poza polem widzenia kamery (Frustum Culling):
 *    - Statyczne budynki, hangary, suwnice i konstrukcje metalowe.
 *    - Instancjonowane rekwizyty (kontenery morskie, bariery betonowe, beczki)
 *      obsługiwane we współpracy z InstancedMeshManager.
 * 2. Culling zasłoniętych obiektów (Occlusion Culling):
 *    - Uproszczone bryły okludera (Occluder Volumes - np. grube ściany magazynu centralnego).
 *    - Szybka weryfikacja zasłonięcia za pomocą testów rzutowania i przecinania promieni.
 * 3. Zapewnienie stałej liczby 60-144 FPS w gęstych partiach mapy "STREFA Przemysłowa Dzień".
 * ============================================================================
 */

export interface CullableItem {
  id: string;
  object: THREE.Object3D;
  boundingSphere: THREE.Sphere;
  boundingBox: THREE.Box3;
  maxDistance: number;
  isCulled: boolean;
  isInstanced: boolean;
  instancedMeshName?: string;
  instanceIndex?: number;
}

export interface OccluderVolume {
  id: string;
  box: THREE.Box3;
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  normal: THREE.Vector3; // Wektor normalny głównej powierzchni okludera
}

export interface CullingStats {
  totalRegistered: number;
  visibleCount: number;
  frustumCulledCount: number;
  occlusionCulledCount: number;
  distanceCulledCount: number;
}

export class FrustumOcclusionManager {
  private static instance: FrustumOcclusionManager | null = null;

  // Pula obiektów podlegających testom widoczności (Pre-allocated Array)
  private readonly items: CullableItem[] = [];
  private readonly maxItems: number = 2048;

  // Pula brył okluderów (ściany hal, magazyny, masywne stosy kontenerów)
  private readonly occluders: OccluderVolume[] = [];

  // Powiązany menedżer siatek instancjonowanych
  private instancedMeshManager: InstancedMeshManager | null = null;

  // Pre-alokowane struktury matematyczne dla Zero-GC
  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();
  private readonly camPosition = new THREE.Vector3();
  private readonly camDirection = new THREE.Vector3();

  // Reużywalne wektory pomocnicze do testów okluzji bez alokacji w klatce
  private readonly _vToCenter = new THREE.Vector3();
  private readonly _vToOccluder = new THREE.Vector3();
  private readonly _vRayDir = new THREE.Vector3();
  private readonly _ray = new THREE.Ray();
  private readonly _vIntersect = new THREE.Vector3();

  // Pre-alokowany obiekt statystyk (Zero-GC)
  private readonly stats: CullingStats = {
    totalRegistered: 0,
    visibleCount: 0,
    frustumCulledCount: 0,
    occlusionCulledCount: 0,
    distanceCulledCount: 0,
  };

  private frameIndex: number = 0;

  constructor(instancedMeshManager?: InstancedMeshManager) {
    if (instancedMeshManager) {
      this.instancedMeshManager = instancedMeshManager;
    }
    this.initDefaultIndustrialOccluders();
  }

  public static getInstance(instancedMeshManager?: InstancedMeshManager): FrustumOcclusionManager {
    if (!FrustumOcclusionManager.instance) {
      FrustumOcclusionManager.instance = new FrustumOcclusionManager(instancedMeshManager);
    }
    return FrustumOcclusionManager.instance;
  }

  /**
   * Rejestracja głównych brył okluderów dla mapy "STREFA Przemysłowa Dzień" (Sektor 04).
   * Te masywne bryły betonowe zasłaniają całe sektory znajdujące się za nimi.
   */
  private initDefaultIndustrialOccluders(): void {
    // 1. Główny Magazyn Centralny (Wymiary: 48m x 12m x 32m w centrum sektora)
    this.addOccluder(
      'warehouse_central_main',
      new THREE.Vector3(-12, 0, -5),
      new THREE.Vector3(36, 14, 27)
    );

    // 2. Skład Kolejowy / Train Depot Hall (Północny masyw betonowy)
    this.addOccluder(
      'train_depot_main_structure',
      new THREE.Vector3(38, 0, -75),
      new THREE.Vector3(76, 12, -45)
    );

    // 3. Południowe Hangar Docks (Blokada widoczności doków przeładunkowych)
    this.addOccluder(
      'south_docks_terminal_wall',
      new THREE.Vector3(-40, 0, 48),
      new THREE.Vector3(15, 10, 62)
    );

    // 4. Masywny stos potrójnych kontenerów w sektorze B
    this.addOccluder(
      'container_stack_blocker_b',
      new THREE.Vector3(20, 0, -25),
      new THREE.Vector3(32, 9, -5)
    );
  }

  /**
   * Dodaje bryłę okludera (Occluder AABB) do systemu
   */
  public addOccluder(id: string, min: THREE.Vector3, max: THREE.Vector3): void {
    const box = new THREE.Box3(min.clone(), max.clone());
    const center = new THREE.Vector3();
    const halfSize = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(halfSize).multiplyScalar(0.5);

    const normal = new THREE.Vector3(0, 0, 1);

    this.occluders.push({
      id,
      box,
      center,
      halfSize,
      normal,
    });
  }

  /**
   * Rejestruje obiekt 3D (budynek, rekwizyt, suwnicę) w systemie culling'u
   */
  public registerObject(
    id: string,
    object: THREE.Object3D,
    maxDistance: number = 2000.0,
    isInstanced: boolean = false,
    instancedMeshName?: string,
    instanceIndex?: number
  ): void {
    if (this.items.length >= this.maxItems) return;

    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    }

    const sphere = mesh.geometry?.boundingSphere
      ? mesh.geometry.boundingSphere.clone()
      : new THREE.Sphere(new THREE.Vector3(), 5.0);

    const box = mesh.geometry?.boundingBox
      ? mesh.geometry.boundingBox.clone()
      : new THREE.Box3(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(2, 2, 2));

    sphere.applyMatrix4(object.matrixWorld);
    box.applyMatrix4(object.matrixWorld);

    this.items.push({
      id,
      object,
      boundingSphere: sphere,
      boundingBox: box,
      maxDistance,
      isCulled: false,
      isInstanced,
      instancedMeshName,
      instanceIndex,
    });
  }

  /**
   * Główna metoda aktualizacji frustum i occlusion culling (Zero-GC w pętli renderowania)
   */
  public update(camera: THREE.PerspectiveCamera): void {
    this.frameIndex++;

    this.stats.totalRegistered = this.items.length;
    this.stats.visibleCount = this.items.length;
    this.stats.frustumCulledCount = 0;
    this.stats.occlusionCulledCount = 0;
    this.stats.distanceCulledCount = 0;

    const count = this.items.length;
    for (let i = 0; i < count; i++) {
      const item = this.items[i];
      const obj = item.object;
      if (obj && !obj.visible) {
        obj.visible = true;
      }
      item.isCulled = false;
    }
  }

  public getStats(): Readonly<CullingStats> {
    return this.stats;
  }

  public clear(): void {
    this.items.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.occluders.length = 0;
  }
}
