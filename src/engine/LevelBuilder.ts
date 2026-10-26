import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BombSite } from '../types/game';
import { CollidableBox } from './environment';
import { PBRMaterialSystem } from './rendering/PBRMaterialSystem';
import { PropManager } from './world/PropManager';

/**
 * ============================================================================
 * GENERATOR MAPY AAA: STREFA PRZEMYSŁOWA SEKTOR 04 (LevelBuilder.ts)
 * MAP ID: MP_INDUSTRIAL_SECTOR_04
 * Blueprint: VANGUARD: OPERATION 02 // INDUSTRIAL // NORTH QUARRY // SECTOR 04
 * ============================================================================
 * Kompleksowa, trójwymiarowa realizacja rysunku technicznego CAD z najwyższą
 * gęstością obiektów taktycznych, osłon CQB oraz pełną architekturą Zero-GC:
 *
 * 1. PÓŁNOCNY SEKTOR (Train Depot & Spawn B):
 *    - 4 równoległe szlaki torowiska z rozjazdami, bramkami sygnałowymi i bocznicami.
 *    - Składy wagonów towarowych (Boxcars, Flatbeds z rurami stalowymi, Tankers).
 *    - Północno-wschodni Spawn B z rampą przeładunkową, stacjami transformatorowymi i murami oporowymi.
 *
 * 2. ZACHODNI SEKTOR (Shipping Yard):
 *    - Gęsty układ 5 klastrów kontenerów morskich 20ft i 40ft (CQB Chokepoints).
 *    - Trzypiętrowe stosy kontenerów, przyczepy agregatów prądotwórczych, bębny kablowe.
 *    - Architektura Zero-GC przy użyciu InstancedMesh.
 *    - Wózki widłowe, palety Euro, skrzynie z amunicją, stosy opon i beczki chemiczne.
 *
 * 3. CENTRALNY HOTSPOT & WRAKI POJAZDÓW:
 *    - Cel misji A: zniszczony wóz zwiadowczy (Armored Scout Vehicle Wreck) na skrzyżowaniu linii ognia.
 *    - Północny wrak ciężarówki zaopatrzeniowej, mobilny generator i wieże oświetleniowe.
 *    - Płyty betonowe, barykady z worków z piaskiem i barier Jersey wypełniające otwartą przestrzeń.
 *
 * 4. WSCHODNI SEKTOR (Warehouse Main & Office Block):
 *    - Potężna hala magazynowa z filarami nośnymi, regałami wysokiego składowania, świetlikami i 3 bramami.
 *    - Dwukondygnacyjny budynek biurowy z oknami strzeleckimi i klatką schodową.
 *
 * 5. POŁUDNIOWY SEKTOR & DOKI (East Docks & Catwalks +3.5m):
 *    - Dwie suwnice bramowe (Crane 01 i Crane 02) z oświetleniem roboczym.
 *    - System metalowych kładek podwyższonych o +3.5m z rurociągami przemysłowymi.
 *    - Południowy Spawn Zone A z umocnieniami i skrzyniami sprzętowymi.
 *
 * 6. Integracja silnika fizycznego Rapier3D (WASM) oraz kompatybilności z KinematicPhysicsBridge.
 */

export interface LevelBuildResult {
  colliders: CollidableBox[];
  spawnPointsVanguard: THREE.Vector3[];
  spawnPointsSyndicate: THREE.Vector3[];
  bombSiteA: BombSite;
  bombSiteB: BombSite;
  dirLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  rapierWorld: RAPIER.World | null;
}

export class LevelBuilder {
  private static rapierInitialized: boolean = false;
  private pbr: PBRMaterialSystem;
  private propManager: PropManager | null = null;
  private colliders: CollidableBox[] = [];
  private rapierWorld: RAPIER.World | null = null;

  constructor() {
    this.pbr = PBRMaterialSystem.getInstance();
  }

  /**
   * Asynchroniczna inicjalizacja WebAssembly dla silnika fizycznego Rapier3D
   */
  public static async initRapierWasm(): Promise<void> {
    if (!LevelBuilder.rapierInitialized) {
      try {
        await RAPIER.init();
        LevelBuilder.rapierInitialized = true;
      } catch {
        LevelBuilder.rapierInitialized = false;
      }
    }
  }

  /**
   * Główna metoda budująca kompletną mapę Sektora 04 na podstawie blueprintu
   */
  public buildIndustrialSector04(scene: THREE.Scene): LevelBuildResult {
    this.propManager = new PropManager(scene);
    this.colliders = [];

    // 1. Inicjalizacja świata fizycznego Rapier3D (grawitacja -9.81 m/s^2)
    if (LevelBuilder.rapierInitialized) {
      try {
        const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
        this.rapierWorld = new RAPIER.World(gravity);
      } catch {
        this.rapierWorld = null;
      }
    }

    // 2. Konfiguracja atmosfery i oświetlenia HDR / CSM (Daytime Sunlight)
    scene.background = new THREE.Color(0x425870);
    scene.fog = new THREE.FogExp2(0x425870, 0.0068);

    const hemiLight = new THREE.HemisphereLight(0x9bc2e6, 0x473e35, 0.85);
    hemiLight.name = 'env_hemi';
    scene.add(hemiLight);

    // Główne światło słoneczne zbieżne z CSM (Cascaded Shadow Maps)
    const dirLight = new THREE.DirectionalLight(0xfff3db, 2.3);
    dirLight.position.set(70, 115, 55);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 5;
    dirLight.shadow.camera.far = 400;
    dirLight.shadow.camera.left = -110;
    dirLight.shadow.camera.right = 110;
    dirLight.shadow.camera.top = 110;
    dirLight.shadow.camera.bottom = -110;
    dirLight.shadow.bias = -0.00035;
    dirLight.shadow.normalBias = 0.02;
    dirLight.name = 'env_dirLight';
    scene.add(dirLight);

    // 3. Płyta podłoża (Asfalt taktyczny z kałużami i podkładem betonowym)
    const groundGeo = new THREE.PlaneGeometry(260, 260, 32, 32);
    const groundMat = this.pbr.get('asphalt_wet');
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.materialType = 'asphalt';
    scene.add(ground);

    // Rejestracja podłoża w silniku fizycznym z tagiem materiałowym 'asphalt'
    this.addStaticCollider(0, -0.5, 0, 260, 1.0, 260, false, 'asphalt', 0.0, ground);

    // 4. Budowa poszczególnych stref z blueprintu CAD
    this.buildTrainDepotSector(scene);
    this.buildShippingYardSector(scene);
    this.buildWarehouseAndOfficeSector(scene);
    this.buildCentralHotspotSector(scene);
    this.buildDocksAndCatwalksSector(scene);
    this.createPerimeterWalls(scene);

    // 5. Zdefiniowanie stref celów taktycznych i odradzania (Spawns & Objectives)
    // Cel A: Centralny wrak zwiadowcy
    const bombSiteA: BombSite = {
      id: 'A',
      position: { x: 4.5, y: 0, z: 22.0 },
      radius: 8.5,
    };
    // Cel B: Rampa załadunkowa Train Depot
    const bombSiteB: BombSite = {
      id: 'B',
      position: { x: 28.0, y: 0, z: -68.0 },
      radius: 8.5,
    };

    this.createObjectiveVisual(scene, 'A', new THREE.Vector3(bombSiteA.position.x, 0, bombSiteA.position.z), bombSiteA.radius);
    this.createObjectiveVisual(scene, 'B', new THREE.Vector3(bombSiteB.position.x, 0, bombSiteB.position.z), bombSiteB.radius);

    // Punkty odradzania z blueprintu:
    // Spawn Zone A (Południe / Doki / Atakujący)
    const spawnPointsVanguard = [
      new THREE.Vector3(-35, 1.75, 68),
      new THREE.Vector3(-22, 1.75, 72),
      new THREE.Vector3(-10, 1.75, 70),
      new THREE.Vector3(5, 1.75, 72),
      new THREE.Vector3(20, 1.75, 68),
    ];

    // Spawn Zone B (Północny Wschód / Train Depot / Obrońcy)
    const spawnPointsSyndicate = [
      new THREE.Vector3(45, 1.75, -78),
      new THREE.Vector3(54, 1.75, -82),
      new THREE.Vector3(62, 1.75, -76),
      new THREE.Vector3(70, 1.75, -80),
      new THREE.Vector3(58, 1.75, -70),
    ];

    return {
      colliders: this.colliders,
      spawnPointsVanguard,
      spawnPointsSyndicate,
      bombSiteA,
      bombSiteB,
      dirLight,
      hemiLight,
      rapierWorld: this.rapierWorld,
    };
  }

  // ==========================================================================
  // SEKTOR 1: PÓŁNOCNY SEKTOR (TRAIN DEPOT & SPAWN B)
  // ==========================================================================

  private buildTrainDepotSector(scene: THREE.Scene) {
    const parentGroup = new THREE.Group();
    parentGroup.name = 'env_train_depot';

    // 1.1. Podsypka kolejowa (Ballast gravel bed)
    const ballastGeo = new THREE.BoxGeometry(175, 0.35, 36);
    const ballastMat = this.pbr.get('concrete_weathered');
    const ballast = new THREE.Mesh(ballastGeo, ballastMat);
    ballast.position.set(-5, 0.17, -76);
    ballast.receiveShadow = true;
    parentGroup.add(ballast);

    // 1.2. 4 Równoległe tory kolejowe (Tracks 1, 2, 3, 4) z podkładami i szynami
    const trackZPositions = [-66, -72, -78, -84];
    trackZPositions.forEach((tz) => {
      this.createRailwayTrack(parentGroup, -90, 65, tz);
    });

    // Łuk torowiska zakręcający w kierunku zachodniej krawędzi mapy
    this.createCurvedRailwayTrack(parentGroup, -90, -74, 16, Math.PI * 0.5);

    // Wskaźniki rozjazdów kolejowych i bramki sygnałowe
    this.createRailSwitchStand(parentGroup, -55, 0, -64);
    this.createRailSwitchStand(parentGroup, 5, 0, -70);
    this.createRailSignalGantry(parentGroup, -20, 0, -75);
    this.createRailSignalGantry(parentGroup, 30, 0, -75);

    // 1.3. Rozbudowana flota wagonów towarowych (Boxcars, Tankers, Flatbeds)
    const trainCars = [
      { x: 12, z: -66, rot: 0, type: 'boxcar', col: 'container_blue', name: 'CR500' },
      { x: -14, z: -66, rot: 0, type: 'boxcar', col: 'container_red', name: 'SB60' },
      { x: -38, z: -66, rot: 0, type: 'flatbed', col: 'steel_armor', name: 'CR410' },
      { x: 38, z: -72, rot: 0, type: 'boxcar', col: 'container_military', name: 'CAS00' },
      { x: 10, z: -72, rot: 0, type: 'tanker', col: 'steel_armor', name: 'CR00' },
      { x: -16, z: -72, rot: 0, type: 'boxcar', col: 'container_blue', name: 'SB00' },
      { x: -42, z: -72, rot: 0, type: 'flatbed', col: 'container_red', name: '0030' },
      { x: 32, z: -78, rot: 0, type: 'boxcar', col: 'container_military', name: 'CAOCED' },
      { x: -5, z: -78, rot: 0, type: 'boxcar', col: 'container_blue', name: '0580' },
      { x: -62, z: -78, rot: 0, type: 'tanker', col: 'steel_armor', name: 'TN04' },
      { x: -75, z: -84, rot: 0, type: 'boxcar', col: 'container_red', name: 'BX90' },

      // Wagony blokujące zachodnią bocznicę
      { x: -84, z: -35, rot: Math.PI / 2, type: 'boxcar', col: 'container_red', name: 'WEST_CAR_1' },
      { x: -84, z: -8, rot: Math.PI / 2, type: 'boxcar', col: 'container_military', name: 'WEST_CAR_2' },
      { x: -84, z: 20, rot: Math.PI / 2, type: 'boxcar', col: 'container_blue', name: 'WEST_CAR_3' },
    ];

    trainCars.forEach((tc) => {
      this.createDetailedTrainCar(parentGroup, tc.x, tc.z, tc.rot, tc.type, tc.col);
    });

    // 1.4. Rampa przeładunkowa i strefa Spawn B (Północny Wschód)
    const platformGeo = new THREE.BoxGeometry(38, 1.4, 24);
    const platformMat = this.pbr.get('concrete_bunker');
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(58, 0.7, -76);
    platform.receiveShadow = true;
    platform.castShadow = true;
    platform.userData.materialType = 'concrete';
    parentGroup.add(platform);
    this.addStaticCollider(58, 0.7, -76, 38, 1.4, 24, true, 'concrete', 0.0, platform);

    // Schody metalowe na rampę
    this.createStaircase(parentGroup, 38, 0, -76, 4, 1.4, 0);

    // Mury oporowe z barierami betonowymi wokół Spawn B
    this.createJerseyBarrierLine(parentGroup, 40, -64, 76, -64, 5);

    // Stacja transformatorowa i rozdzielnie prądu przy Spawn B
    this.createElectricalBox(parentGroup, 44, 1.4, -84, 0);
    this.createElectricalBox(parentGroup, 48, 1.4, -84, 0);
    this.createTacticalCrateStack(parentGroup, 66, 1.4, -72, 4);
    this.createHazardBarrelCluster(parentGroup, 52, 1.4, -68);

    // Maszty oświetleniowe wzdłuż bocznic
    this.createFloodlightTower(parentGroup, -45, 0, -88, 14, Math.PI * 0.25);
    this.createFloodlightTower(parentGroup, 15, 0, -88, 14, Math.PI * 0.25);
    this.createFloodlightTower(parentGroup, 72, 0, -88, 14, Math.PI * 0.25);
    
    if (this.propManager) {
      this.propManager.createDecal(new THREE.Vector3(0, 0.05, -70), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector2(6, 6), 'tire_track');
      this.propManager.createDecal(new THREE.Vector3(40, 0.05, -75), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector2(3, 3), 'hazard_stripe');
    }

    scene.add(parentGroup);
  }

  // ==========================================================================
  // SEKTOR 2: ZACHODNI SEKTOR (SHIPPING YARD - SKŁAD KONTENERÓW)
  // ==========================================================================

  private buildShippingYardSector(scene: THREE.Scene) {
    const parentGroup = new THREE.Group();
    parentGroup.name = 'env_shipping_yard';

    // Rysunek techniczny definiuje 5 wyraźnych klastrów kontenerów 20ft i 40ft:
    // Klaster N1 (Północ): X: -60 do -24, Z: -42 do -30
    // Klaster N2 (Środkowo-Północny): X: -60 do -24, Z: -26 do -14
    // Klaster C (Środkowy): X: -60 do -24, Z: -10 do +4
    // Klaster S1 (Południowy): X: -60 do -24, Z: +8 do +22
    // Klaster S2 (Skrajnie Południowy): X: -60 do -24, Z: +26 do +38

    const containerMatBlue = this.pbr.get('shipping_container_blue');
    const containerMatRed = this.pbr.get('shipping_container_red');
    const containerMatMil = this.pbr.get('shipping_container_military');

    const containerGeo20ft = new THREE.BoxGeometry(6.2, 2.7, 2.45);
    const containerGeo40ft = new THREE.BoxGeometry(12.4, 2.7, 2.45);

    // Zwiększona gęstość kontenerów (rozbudowane układki 2- i 3-poziomowe)
    const containerLayout: Array<{
      x: number;
      z: number;
      is40ft: boolean;
      rot: number;
      level: number;
      mat: THREE.Material;
    }> = [
      // KLASTER N1 (Północny labirynt)
      { x: -54, z: -38, is40ft: true, rot: 0, level: 0, mat: containerMatBlue },
      { x: -54, z: -38, is40ft: true, rot: 0, level: 1, mat: containerMatRed },
      { x: -54, z: -38, is40ft: true, rot: 0, level: 2, mat: containerMatMil },
      { x: -38, z: -38, is40ft: true, rot: 0, level: 0, mat: containerMatMil },
      { x: -38, z: -38, is40ft: true, rot: 0, level: 1, mat: containerMatBlue },
      { x: -50, z: -33, is40ft: false, rot: 0, level: 0, mat: containerMatRed },
      { x: -42, z: -33, is40ft: false, rot: 0, level: 0, mat: containerMatBlue },
      { x: -34, z: -33, is40ft: true, rot: 0, level: 0, mat: containerMatMil },
      { x: -34, z: -33, is40ft: true, rot: 0, level: 1, mat: containerMatBlue },

      // KLASTER N2 (Korytarz CQB)
      { x: -56, z: -22, is40ft: true, rot: 0, level: 0, mat: containerMatMil },
      { x: -56, z: -22, is40ft: true, rot: 0, level: 1, mat: containerMatMil },
      { x: -40, z: -22, is40ft: false, rot: 0, level: 0, mat: containerMatBlue },
      { x: -32, z: -22, is40ft: false, rot: 0, level: 0, mat: containerMatRed },
      { x: -32, z: -22, is40ft: false, rot: 0, level: 1, mat: containerMatBlue },
      { x: -48, z: -17, is40ft: true, rot: 0, level: 0, mat: containerMatRed },
      { x: -34, z: -17, is40ft: true, rot: 0, level: 0, mat: containerMatBlue },
      { x: -34, z: -17, is40ft: true, rot: 0, level: 1, mat: containerMatMil },
      { x: -22, z: -17, is40ft: false, rot: Math.PI / 2, level: 0, mat: containerMatRed },

      // KLASTER C (Środek - główny punkt starć CQB)
      { x: -56, z: -4, is40ft: true, rot: 0, level: 0, mat: containerMatBlue },
      { x: -56, z: -4, is40ft: true, rot: 0, level: 1, mat: containerMatRed },
      { x: -56, z: -4, is40ft: true, rot: 0, level: 2, mat: containerMatMil },
      { x: -38, z: -4, is40ft: true, rot: 0, level: 0, mat: containerMatMil },
      { x: -38, z: -4, is40ft: true, rot: 0, level: 1, mat: containerMatBlue },
      { x: -50, z: 1, is40ft: false, rot: 0, level: 0, mat: containerMatMil },
      { x: -42, z: 1, is40ft: false, rot: 0, level: 0, mat: containerMatRed },
      { x: -34, z: 1, is40ft: true, rot: 0, level: 0, mat: containerMatBlue },
      { x: -34, z: 1, is40ft: true, rot: 0, level: 1, mat: containerMatBlue },
      { x: -22, z: 1, is40ft: false, rot: Math.PI / 2, level: 0, mat: containerMatMil },

      // KLASTER S1 (Południowy łącznik)
      { x: -56, z: 14, is40ft: true, rot: 0, level: 0, mat: containerMatRed },
      { x: -56, z: 14, is40ft: true, rot: 0, level: 1, mat: containerMatMil },
      { x: -40, z: 14, is40ft: false, rot: 0, level: 0, mat: containerMatBlue },
      { x: -32, z: 14, is40ft: false, rot: 0, level: 0, mat: containerMatMil },
      { x: -48, z: 19, is40ft: true, rot: 0, level: 0, mat: containerMatBlue },
      { x: -34, z: 19, is40ft: true, rot: 0, level: 0, mat: containerMatRed },
      { x: -34, z: 19, is40ft: true, rot: 0, level: 1, mat: containerMatRed },
      { x: -22, z: 19, is40ft: false, rot: Math.PI / 2, level: 0, mat: containerMatBlue },

      // KLASTER S2 (Przed suwnicami portowymi)
      { x: -54, z: 32, is40ft: true, rot: 0, level: 0, mat: containerMatMil },
      { x: -54, z: 32, is40ft: true, rot: 0, level: 1, mat: containerMatBlue },
      { x: -54, z: 32, is40ft: true, rot: 0, level: 2, mat: containerMatRed },
      { x: -38, z: 32, is40ft: true, rot: 0, level: 0, mat: containerMatRed },
      { x: -38, z: 32, is40ft: true, rot: 0, level: 1, mat: containerMatMil },
      { x: -46, z: 37, is40ft: false, rot: 0, level: 0, mat: containerMatBlue },
      { x: -36, z: 37, is40ft: true, rot: 0, level: 0, mat: containerMatMil },
    ];

    // Grupowanie kontenerów dla InstancedMesh według kombinacji [is40ft, material]
    type ContainerGroupKey = '40ft_blue' | '40ft_red' | '40ft_mil' | '20ft_blue' | '20ft_red' | '20ft_mil';
    const instanceMap: Record<ContainerGroupKey, Array<{ x: number; y: number; z: number; rot: number; is40ft: boolean }>> = {
      '40ft_blue': [],
      '40ft_red': [],
      '40ft_mil': [],
      '20ft_blue': [],
      '20ft_red': [],
      '20ft_mil': [],
    };

    containerLayout.forEach((c) => {
      const y = c.level === 0 ? 1.35 : c.level === 1 ? 4.05 : 6.75;
      let key: ContainerGroupKey;
      if (c.is40ft) {
        key = c.mat === containerMatBlue ? '40ft_blue' : c.mat === containerMatRed ? '40ft_red' : '40ft_mil';
      } else {
        key = c.mat === containerMatBlue ? '20ft_blue' : c.mat === containerMatRed ? '20ft_red' : '20ft_mil';
      }
      instanceMap[key].push({ x: c.x, y, z: c.z, rot: c.rot, is40ft: c.is40ft });
    });

    const dummy = new THREE.Object3D();
    const groupConfigs: Array<{ key: ContainerGroupKey; geo: THREE.BufferGeometry; mat: THREE.Material }> = [
      { key: '40ft_blue', geo: containerGeo40ft, mat: containerMatBlue },
      { key: '40ft_red', geo: containerGeo40ft, mat: containerMatRed },
      { key: '40ft_mil', geo: containerGeo40ft, mat: containerMatMil },
      { key: '20ft_blue', geo: containerGeo20ft, mat: containerMatBlue },
      { key: '20ft_red', geo: containerGeo20ft, mat: containerMatRed },
      { key: '20ft_mil', geo: containerGeo20ft, mat: containerMatMil },
    ];

    groupConfigs.forEach(({ key, geo, mat }) => {
      const items = instanceMap[key];
      if (items.length === 0) return;

      const instancedMesh = new THREE.InstancedMesh(geo, mat, items.length);
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;
      instancedMesh.name = `instanced_containers_${key}`;

      items.forEach((item, index) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(0, item.rot, 0);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(index, dummy.matrix);

        const width = item.is40ft ? 12.4 : 6.2;
        this.addStaticCollider(item.x, item.y, item.z, width, 2.7, 2.45, true, 'container', 0.55, instancedMesh);
      });

      instancedMesh.instanceMatrix.needsUpdate = true;
      parentGroup.add(instancedMesh);
    });

    // 2.2. Sprzęt cięzki: Wózki widłowe oraz mobilne generatory
    this.createIndustrialForklift(parentGroup, -24, 0, -28, Math.PI * 0.25);
    this.createIndustrialForklift(parentGroup, -26, 0, 8, -Math.PI * 0.15);
    this.createIndustrialForklift(parentGroup, -44, 0, 26, Math.PI * 0.8);
    this.createGeneratorTrailer(parentGroup, -64, 0, -10, 0);

    // 2.3. Rekwizyty taktyczne w strefie kontenerowej (gęsta osłona CQB)
    if (this.propManager) {
      const palletGeo = new THREE.BoxGeometry(1.2, 0.15, 0.8);
      const palletMat = this.pbr.get('wood_crate_tactical');
      const positions = [
        new THREE.Vector3(-45, 0, -25),
        new THREE.Vector3(-48, 0, 5),
        new THREE.Vector3(-25, 0, 30),
      ];
      const rotations = [new THREE.Euler(0, 0, 0), new THREE.Euler(0, Math.PI / 4, 0), new THREE.Euler(0, 0, 0)];
      this.propManager.createInstancedProp(palletGeo, palletMat, positions, rotations, 1.0);
      
      this.propManager.createDecal(new THREE.Vector3(-40, 0.05, -10), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector2(4, 4), 'oil_stain');
    }

    this.createTacticalCrateStack(parentGroup, -42, 0, -9, 3);
    this.createTacticalCrateStack(parentGroup, -22, 0, -2, 4);
    this.createTacticalCrateStack(parentGroup, -48, 0, 8, 3);
    this.createTacticalCrateStack(parentGroup, -28, 0, 28, 4);

    this.createHazardBarrelCluster(parentGroup, -28, 0, -18);
    this.createHazardBarrelCluster(parentGroup, -38, 0, 24);
    this.createHazardBarrelCluster(parentGroup, -60, 0, -28);
    this.createHazardBarrelCluster(parentGroup, -62, 0, 15);

    this.createTireStackCluster(parentGroup, -32, 0, -32);
    this.createTireStackCluster(parentGroup, -44, 0, -2);
    this.createTireStackCluster(parentGroup, -26, 0, 22);

    this.createCableReelStack(parentGroup, -62, 0, -38);
    this.createCableReelStack(parentGroup, -60, 0, 32);

    this.createPalletStack(parentGroup, -36, 0, -26, 6);
    this.createPalletStack(parentGroup, -28, 0, 12, 8);

    // Wieże oświetleniowe składowiska kontenerów
    this.createFloodlightTower(parentGroup, -68, 0, -42, 16, Math.PI * 0.35);
    this.createFloodlightTower(parentGroup, -68, 0, 38, 16, Math.PI * 0.65);

    scene.add(parentGroup);
  }

  // ==========================================================================
  // SEKTOR 3: CENTRALNY HOTSPOT & WRAKI POJAZDÓW (VEHICLE WRECKS)
  // ==========================================================================

  private buildCentralHotspotSector(scene: THREE.Scene) {
    const parentGroup = new THREE.Group();
    parentGroup.name = 'env_central_hotspot';

    // 3.1. GŁÓWNY CEL MISJI A: WRAK POJAZDU ZWIADOWCY (Armored Scout Vehicle Wreck)
    // Znajduje się dokładnie na skrzyżowaniu linii ognia: X: 4.5, Z: 22.0
    this.createDestroyedScoutVehicle(parentGroup, 4.5, 0, 22.0, -Math.PI * 0.22);
    this.addStaticCollider(4.5, 1.4, 22.0, 7.8, 2.8, 3.8, true, 'metal', 0.0);

    // Betonowe bariery Jersey i worki z piaskiem osłaniające wrak
    this.createJerseyBarrierLine(parentGroup, -1, 17, 3, 27, 3);
    this.createJerseyBarrierLine(parentGroup, 8, 16, 14, 20, 3);
    this.createSandbagFortification(parentGroup, 9, 0, 26, Math.PI * 0.6);
    this.createSandbagFortification(parentGroup, -2, 0, 28, -Math.PI * 0.3);

    // 3.2. PÓŁNOCNY WRAK CIĘŻARÓWKI WOJSKOWEJ ("VEHICLE WRECK SITE")
    // Położony przed północnymi wrotami magazynu: X: 14.0, Z: -45.0
    this.createDestroyedMilitaryTruck(parentGroup, 14.0, 0, -45.0, Math.PI * 0.12);
    this.addStaticCollider(14.0, 1.6, -45.0, 8.5, 3.2, 3.2, true, 'metal', 0.0);

    // 3.3. Centralne skrzyżowanie linii strzału (Sightline Paths & Open Ground Fillers)
    // Płyty betonowe, bariery Jersey, skrzynie i bębny kablowe likwidujące puste przestrzenie
    const slabGeo = new THREE.BoxGeometry(4.2, 0.4, 8.4);
    const slabMat = this.pbr.get('concrete_road_slabs');

    const slab1 = new THREE.Mesh(slabGeo, slabMat);
    slab1.position.set(-6, 0.2, 10);
    slab1.rotation.y = 0.35;
    slab1.receiveShadow = true;
    slab1.userData.materialType = 'concrete';
    parentGroup.add(slab1);
    this.addStaticCollider(-6, 0.2, 10, 4.2, 0.4, 8.4, false, 'concrete', 0.0, slab1);

    const slab2 = new THREE.Mesh(slabGeo, slabMat);
    slab2.position.set(12, 0.2, -15);
    slab2.rotation.y = -0.25;
    slab2.receiveShadow = true;
    slab2.userData.materialType = 'concrete';
    parentGroup.add(slab2);
    this.addStaticCollider(12, 0.2, -15, 4.2, 0.4, 8.4, false, 'concrete', 0.0, slab2);

    // Bunkier z worków z piaskiem w centrum
    this.createSandbagFortification(parentGroup, -8, 0, -25, Math.PI * 0.2);
    this.createSandbagFortification(parentGroup, 0, 0, -35, Math.PI * 0.5);

    // Bariery Jersey tworzące zygzakowate osłony CQB
    this.createJerseyBarrierLine(parentGroup, -12, -32, -4, -38, 4);
    this.createJerseyBarrierLine(parentGroup, 4, -50, 12, -56, 4);
    this.createJerseyBarrierLine(parentGroup, -15, 2, -5, -4, 4);

    // Rekwizyty przemysłowe w centralnej strefie
    this.createCableReelStack(parentGroup, -10, 0, -18);
    this.createTacticalCrateStack(parentGroup, -4, 0, -12, 4);
    this.createHazardBarrelCluster(parentGroup, 6, 0, -28);
    this.createTireStackCluster(parentGroup, 8, 0, 4);

    // Maszt oświetleniowy centrum mapy
    this.createFloodlightTower(parentGroup, -12, 0, -5, 18, Math.PI * 0.15);

    scene.add(parentGroup);
  }

  // ==========================================================================
  // SEKTOR 4: WSCHODNI SEKTOR (WAREHOUSE MAIN & OFFICE BLOCK)
  // ==========================================================================

  private buildWarehouseAndOfficeSector(scene: THREE.Scene) {
    const parentGroup = new THREE.Group();
    parentGroup.name = 'env_warehouse_office';

    // 4.1. GŁÓWNA HALA MAGAZYNOWA (WAREHOUSE MAIN)
    const wWidth = 48;
    const wDepth = 62;
    const wHeight = 10;
    const wx = 24;
    const wz = -12;

    const wallMat = this.pbr.get('concrete_bunker');
    const floorMat = this.pbr.get('concrete_weathered');

    // Podłoga wewnętrzna magazynu
    const wFloorGeo = new THREE.BoxGeometry(wWidth, 0.2, wDepth);
    const wFloor = new THREE.Mesh(wFloorGeo, floorMat);
    wFloor.position.set(wx, 0.1, wz);
    wFloor.receiveShadow = true;
    parentGroup.add(wFloor);

    // Ściana Wschodnia (East Wall - granica z Office Block)
    const eastWallGeo = new THREE.BoxGeometry(0.8, wHeight, wDepth);
    const eastWall = new THREE.Mesh(eastWallGeo, wallMat);
    eastWall.position.set(wx + wWidth * 0.5, wHeight * 0.5, wz);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    eastWall.userData.materialType = 'concrete';
    parentGroup.add(eastWall);
    this.addStaticCollider(wx + wWidth * 0.5, wHeight * 0.5, wz, 0.8, wHeight, wDepth, true, 'concrete', 0.0, eastWall);

    // Ściana Zachodnia (West Wall) z 2 potężnymi bramami załadunkowymi (Gate W1 i Gate W2)
    this.createWallSegment(parentGroup, wx - wWidth * 0.5, wHeight * 0.5, wz - 18, 0.8, wHeight, 26);
    this.createWallSegment(parentGroup, wx - wWidth * 0.5, wHeight * 0.5, wz + 2, 0.8, wHeight, 14);
    this.createWallSegment(parentGroup, wx - wWidth * 0.5, wHeight * 0.5, wz + 22, 0.8, wHeight, 18);
    this.createWallSegment(parentGroup, wx - wWidth * 0.5, 7.5, wz - 7, 0.8, 5, 8);
    this.createWallSegment(parentGroup, wx - wWidth * 0.5, 7.5, wz + 11, 0.8, 5, 8);

    // Ściana Północna (North Wall - z Train Depot) z bramą centralną
    this.createWallSegment(parentGroup, wx - 14, wHeight * 0.5, wz - wDepth * 0.5, 20, wHeight, 0.8);
    this.createWallSegment(parentGroup, wx + 14, wHeight * 0.5, wz - wDepth * 0.5, 20, wHeight, 0.8);
    this.createWallSegment(parentGroup, wx, 7.5, wz - wDepth * 0.5, 8, 5, 0.8);

    // Ściana Południowa (South Wall - z kładkami) z drzwiami i wrotami
    this.createWallSegment(parentGroup, wx - 14, wHeight * 0.5, wz + wDepth * 0.5, 20, wHeight, 0.8);
    this.createWallSegment(parentGroup, wx + 14, wHeight * 0.5, wz + wDepth * 0.5, 20, wHeight, 0.8);
    this.createWallSegment(parentGroup, wx, 7.5, wz + wDepth * 0.5, 8, 5, 0.8);

    // Stalowe filary wewnętrzne (I-Beams) hali magazynowej
    const pillarCoords = [
      { x: wx - 12, z: wz - 18 },
      { x: wx - 12, z: wz },
      { x: wx - 12, z: wz + 18 },
      { x: wx + 12, z: wz - 18 },
      { x: wx + 12, z: wz },
      { x: wx + 12, z: wz + 18 },
    ];
    pillarCoords.forEach((p) => {
      this.createSteelIBeamPillar(parentGroup, p.x, 0, p.z, wHeight);
    });

    // Wnętrze magazynu: Rozbudowane aleje regałów wysokiego składowania i zaopatrzenia
    this.createIndustrialStorageRacks(parentGroup, wx - 4, 0, wz - 18, 16, 5.5);
    this.createIndustrialStorageRacks(parentGroup, wx - 4, 0, wz - 2, 16, 5.5);
    this.createIndustrialStorageRacks(parentGroup, wx - 4, 0, wz + 14, 16, 5.5);

    this.createIndustrialStorageRacks(parentGroup, wx + 12, 0, wz - 18, 16, 5.5);
    this.createIndustrialStorageRacks(parentGroup, wx + 12, 0, wz - 2, 16, 5.5);
    this.createIndustrialStorageRacks(parentGroup, wx + 12, 0, wz + 14, 16, 5.5);

    // Wózek widłowy i stacja ładowania wewnątrz magazynu
    this.createIndustrialForklift(parentGroup, wx + 4, 0, wz - 8, Math.PI * 0.7);
    this.createPalletStack(parentGroup, wx - 14, 0, wz - 10, 8);
    this.createPalletStack(parentGroup, wx + 18, 0, wz + 8, 10);
    this.createHazardBarrelCluster(parentGroup, wx - 16, 0, wz + 20);

    // Dach dwuspadowy ze świetlikami przemysłowymi (Skylights)
    this.createWarehouseRoofWithSkylights(parentGroup, wx, wHeight, wz, wWidth, wDepth);

    // 4.2. BLOK BIUROWY (OFFICE BLOCK)
    const ox = 58;
    const oz = -14;
    const oWidth = 20;
    const oDepth = 34;
    const oHeight = 7.5;

    const officeMat = this.pbr.get('tarkov_brick');
    const oFloorMat = this.pbr.get('concrete_weathered');

    // Mury zewnętrzne budynku biurowego
    this.createWallSegmentWithWindows(parentGroup, ox + oWidth * 0.5, oz, oDepth, oHeight, Math.PI * 0.5, officeMat);
    this.createWallSegment(parentGroup, ox, oHeight * 0.5, oz - oDepth * 0.5, oWidth, oHeight, 0.6, officeMat);
    this.createWallSegment(parentGroup, ox, oHeight * 0.5, oz + oDepth * 0.5, oWidth, oHeight, 0.6, officeMat);

    // Strop piętra (+3.8m)
    const oCeilingGeo = new THREE.BoxGeometry(oWidth, 0.35, oDepth);
    const oCeiling = new THREE.Mesh(oCeilingGeo, oFloorMat);
    oCeiling.position.set(ox, 3.8, oz);
    oCeiling.receiveShadow = true;
    oCeiling.userData.materialType = 'concrete';
    parentGroup.add(oCeiling);
    this.addStaticCollider(ox, 3.8, oz, oWidth, 0.35, oDepth, true, 'concrete', 0.0, oCeiling);

    // Schody wewnętrzne prowadzące na piętro biurowca
    this.createStaircase(parentGroup, ox - 4, 0, oz - 10, 3.8, 3.8, Math.PI);

    // Wyposażenie zewnątrz budynku biurowego (Agregaty klimatyzacji, skrzynie)
    this.createElectricalBox(parentGroup, ox + 8, 0, oz + oDepth * 0.5 + 1.2, 0);
    this.createElectricalBox(parentGroup, ox + 4, 0, oz + oDepth * 0.5 + 1.2, 0);

    scene.add(parentGroup);
  }

  // ==========================================================================
  // SEKTOR 5: POŁUDNIOWY SEKTOR & DOKI (CRANE 01/02 & CATWALKS +3.5m)
  // ==========================================================================

  private buildDocksAndCatwalksSector(scene: THREE.Scene) {
    const parentGroup = new THREE.Group();
    parentGroup.name = 'env_docks_catwalks';

    // 5.1. DWIE SUWNICE BRAMOWE / PORTOWE (CRANE 01 & CRANE 02)
    this.createGantryCrane(parentGroup, -8, 0, 32, 22);
    this.createGantryCrane(parentGroup, 12, 0, 32, 22);

    // 5.2. METALOWE KŁADKI PODWYŻSZONE (+3.5m METAL CATWALKS)
    const catwalkMat = this.pbr.get('metal_grate_industrial');
    const railingMat = this.pbr.get('steel_armor_plate');

    // Segment Kładki A (Północ-Południe od wyjścia z magazynu): X: 22, Z: 20 do 42
    this.createCatwalkSegment(parentGroup, 22, 3.5, 31, 3.2, 22, catwalkMat, railingMat);
    // Segment Kładki B (Wschód-Zachód łącznik): X: 8 do 22, Z: 22
    this.createCatwalkSegment(parentGroup, 15, 3.5, 22, 14, 3.2, catwalkMat, railingMat);
    // Segment Kładki C (Południowy taras widokowy nad dokami): X: 22 do 42, Z: 42
    this.createCatwalkSegment(parentGroup, 32, 3.5, 42, 20, 3.2, catwalkMat, railingMat);
    // Segment Kładki D (Zachodni łącznik nad dokami): X: -8 do 8, Z: 42
    this.createCatwalkSegment(parentGroup, 0, 3.5, 42, 16, 3.2, catwalkMat, railingMat);

    // Schody prowadzące z poziomu 0.0m na kładkę +3.5m
    this.createStaircase(parentGroup, 22, 0, 48, 4.0, 3.5, Math.PI);
    this.createStaircase(parentGroup, 6, 0, 22, 4.0, 3.5, -Math.PI * 0.5);
    this.createStaircase(parentGroup, -8, 0, 42, 4.0, 3.5, Math.PI * 0.5);

    // Słupy wsporcze kładki z rurociągami
    const pillarPositions = [
      { x: 22, z: 22 },
      { x: 22, z: 32 },
      { x: 22, z: 42 },
      { x: 10, z: 22 },
      { x: 32, z: 42 },
      { x: 42, z: 42 },
      { x: -8, z: 42 },
      { x: 0, z: 42 },
    ];
    pillarPositions.forEach((pos) => {
      this.createSupportPillar(parentGroup, pos.x, 0, pos.z, 3.5);
    });

    // 5.3. BUDYNEK TEKSTYLNY (TEXTILE PLANT)
    const plantGeo = new THREE.BoxGeometry(28, 6.5, 18);
    const plantMat = this.pbr.get('concrete_bunker');
    const plantMesh = new THREE.Mesh(plantGeo, plantMat);
    plantMesh.position.set(35, 3.25, 58);
    plantMesh.castShadow = true;
    plantMesh.receiveShadow = true;
    plantMesh.userData.materialType = 'concrete';
    parentGroup.add(plantMesh);
    this.addStaticCollider(35, 3.25, 58, 28, 6.5, 18, true, 'concrete', 0.0, plantMesh);

    // 5.4. POŁUDNIOWA STREFA ODRADZANIA (SPAWN ZONE A)
    this.createJerseyBarrierLine(parentGroup, -42, 62, -8, 62, 5);
    this.createJerseyBarrierLine(parentGroup, 10, 62, 28, 62, 4);

    this.createTacticalCrateStack(parentGroup, -28, 0, 65, 3);
    this.createTacticalCrateStack(parentGroup, 0, 0, 68, 4);
    this.createTacticalCrateStack(parentGroup, 18, 0, 66, 3);

    this.createHazardBarrelCluster(parentGroup, -15, 0, 64);
    this.createTireStackCluster(parentGroup, 12, 0, 65);

    this.createFloodlightTower(parentGroup, -35, 0, 75, 16, -Math.PI * 0.25);
    this.createFloodlightTower(parentGroup, 25, 0, 75, 16, -Math.PI * 0.25);

    scene.add(parentGroup);
  }

  // ==========================================================================
  // PROCEDURALNE DETALE ARCHITEKTONICZNE (ZERO-GC & PBR)
  // ==========================================================================

  private createRailwayTrack(group: THREE.Group, startX: number, endX: number, z: number) {
    const length = endX - startX;
    const centerX = (startX + endX) * 0.5;

    const sleeperMat = this.pbr.get('wood_crate_tactical');
    const railMat = this.pbr.get('steel_armor_plate');

    // Podkłady drewniane (Sleeper ties) rozmieszczone co 1.2m
    const sleeperGeo = new THREE.BoxGeometry(0.35, 0.22, 2.6);
    const sleeperCount = Math.floor(length / 1.2);

    for (let i = 0; i < sleeperCount; i++) {
      const sx = startX + i * 1.2;
      const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
      sleeper.position.set(sx, 0.3, z);
      sleeper.receiveShadow = true;
      group.add(sleeper);
    }

    // Szyny stalowe (Lewa i Prawa)
    const railGeo = new THREE.BoxGeometry(length, 0.18, 0.09);
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(centerX, 0.45, z - 0.75);
    leftRail.castShadow = true;
    leftRail.receiveShadow = true;
    group.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(centerX, 0.45, z + 0.75);
    rightRail.castShadow = true;
    rightRail.receiveShadow = true;
    group.add(rightRail);
  }

  private createCurvedRailwayTrack(group: THREE.Group, cx: number, cz: number, radius: number, arcAngle: number) {
    const steps = 18;
    const sleeperGeo = new THREE.BoxGeometry(0.35, 0.22, 2.6);
    const sleeperMat = this.pbr.get('wood_crate_tactical');

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * arcAngle;
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;

      const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
      sleeper.position.set(x, 0.3, z);
      sleeper.rotation.y = -angle;
      sleeper.receiveShadow = true;
      group.add(sleeper);
    }
  }

  private createRailSwitchStand(group: THREE.Group, x: number, y: number, z: number) {
    const swGroup = new THREE.Group();
    swGroup.position.set(x, y, z);

    const steelMat = this.pbr.get('steel_armor_plate');
    const redMat = this.pbr.get('shipping_container_red');

    const baseGeo = new THREE.BoxGeometry(0.6, 0.8, 0.6);
    const base = new THREE.Mesh(baseGeo, steelMat);
    base.position.set(0, 0.4, 0);
    swGroup.add(base);

    const leverGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8);
    const lever = new THREE.Mesh(leverGeo, redMat);
    lever.position.set(0, 1.1, 0);
    lever.rotation.z = 0.35;
    swGroup.add(lever);

    group.add(swGroup);
    this.addStaticCollider(x, y + 0.7, z, 0.8, 1.4, 0.8, true, 'metal', 0.0, swGroup);
  }

  private createRailSignalGantry(group: THREE.Group, x: number, y: number, z: number) {
    const gGroup = new THREE.Group();
    gGroup.position.set(x, y, z);

    const steelMat = this.pbr.get('steel_armor_plate');
    const lightMat = this.pbr.get('crane_rust_orange');

    // Post pionowy
    const postGeo = new THREE.CylinderGeometry(0.25, 0.25, 7.5, 8);
    const post = new THREE.Mesh(postGeo, steelMat);
    post.position.set(0, 3.75, 0);
    post.castShadow = true;
    gGroup.add(post);

    // Wzmocnienie poziome
    const armGeo = new THREE.BoxGeometry(6.0, 0.3, 0.3);
    const arm = new THREE.Mesh(armGeo, steelMat);
    arm.position.set(3.0, 7.0, 0);
    gGroup.add(arm);

    // Kaseton sygnalizatora
    const boxGeo = new THREE.BoxGeometry(0.5, 1.2, 0.5);
    const box1 = new THREE.Mesh(boxGeo, lightMat);
    box1.position.set(1.5, 6.4, 0);
    gGroup.add(box1);

    const box2 = new THREE.Mesh(boxGeo, lightMat);
    box2.position.set(4.5, 6.4, 0);
    gGroup.add(box2);

    group.add(gGroup);
    this.addStaticCollider(x, y + 3.75, z, 0.6, 7.5, 0.6, true, 'metal', 0.0, gGroup);
  }

  private createDetailedTrainCar(
    group: THREE.Group,
    x: number,
    z: number,
    rot: number,
    type: string,
    col: string
  ) {
    const carGroup = new THREE.Group();
    carGroup.position.set(x, 0, z);
    carGroup.rotation.y = rot;

    const bodyMat = this.pbr.get(
      col === 'container_blue'
        ? 'shipping_container_blue'
        : col === 'container_red'
        ? 'shipping_container_red'
        : col === 'container_military'
        ? 'shipping_container_military'
        : 'train_steel_heavy'
    );
    const frameMat = this.pbr.get('train_steel_heavy');

    // Podwozie stalowe wagonu z kołami
    const frameGeo = new THREE.BoxGeometry(14.0, 0.45, 3.1);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0.9, 0);
    frame.castShadow = true;
    frame.receiveShadow = true;
    carGroup.add(frame);

    // Wózki 2-osiowe i koła kolejowe
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 12);
    const wheelMat = this.pbr.get('steel_armor_plate');
    [-4.8, -3.4, 3.4, 4.8].forEach((wx) => {
      [-1.15, 1.15].forEach((wz) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.x = Math.PI * 0.5;
        wheel.position.set(wx, 0.5, wz);
        wheel.castShadow = true;
        carGroup.add(wheel);
      });
    });

    if (type === 'boxcar') {
      const boxGeo = new THREE.BoxGeometry(13.6, 3.2, 3.0);
      const boxMesh = new THREE.Mesh(boxGeo, bodyMat);
      boxMesh.position.set(0, 2.7, 0);
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;
      carGroup.add(boxMesh);
      this.addStaticCollider(x, 2.4, z, 14.0, 3.8, 3.1, true, 'container', 0.2, carGroup);
    } else if (type === 'tanker') {
      const tankGeo = new THREE.CylinderGeometry(1.4, 1.4, 12.8, 16);
      const tankMesh = new THREE.Mesh(tankGeo, bodyMat);
      tankMesh.rotation.z = Math.PI * 0.5;
      tankMesh.position.set(0, 2.6, 0);
      tankMesh.castShadow = true;
      tankMesh.receiveShadow = true;
      carGroup.add(tankMesh);
      this.addStaticCollider(x, 2.4, z, 14.0, 3.6, 3.1, true, 'metal', 0.15, carGroup);
    } else {
      // Platforma płaska z ładunkiem skrzyń lub rur
      this.createTacticalCrateStack(carGroup, 0, 1.15, 0, 4);
      this.addStaticCollider(x, 1.5, z, 14.0, 2.0, 3.1, true, 'metal', 0.3, carGroup);
    }

    group.add(carGroup);
  }

  private createIndustrialForklift(group: THREE.Group, x: number, y: number, z: number, rot: number) {
    const flGroup = new THREE.Group();
    flGroup.position.set(x, y, z);
    flGroup.rotation.y = rot;

    const yellowMat = this.pbr.get('shipping_container_military');
    const steelMat = this.pbr.get('steel_armor_plate');

    const bodyGeo = new THREE.BoxGeometry(2.4, 1.2, 1.5);
    const body = new THREE.Mesh(bodyGeo, yellowMat);
    body.position.set(-0.3, 0.8, 0);
    body.castShadow = true;
    flGroup.add(body);

    const cageGeo = new THREE.BoxGeometry(1.4, 1.4, 1.3);
    const cage = new THREE.Mesh(cageGeo, steelMat);
    cage.position.set(-0.2, 2.0, 0);
    cage.castShadow = true;
    flGroup.add(cage);

    const mastGeo = new THREE.BoxGeometry(0.2, 2.6, 1.2);
    const mast = new THREE.Mesh(mastGeo, steelMat);
    mast.position.set(1.1, 1.4, 0);
    mast.castShadow = true;
    flGroup.add(mast);

    const forkGeo = new THREE.BoxGeometry(1.4, 0.08, 0.16);
    const forkL = new THREE.Mesh(forkGeo, steelMat);
    forkL.position.set(1.8, 0.25, -0.35);
    flGroup.add(forkL);
    const forkR = new THREE.Mesh(forkGeo, steelMat);
    forkR.position.set(1.8, 0.25, 0.35);
    flGroup.add(forkR);

    group.add(flGroup);
    this.addStaticCollider(x, 1.4, z, 3.2, 2.6, 1.8, true, 'metal', 0.0, flGroup);
  }

  private createGeneratorTrailer(group: THREE.Group, x: number, y: number, z: number, rot: number) {
    const gGroup = new THREE.Group();
    gGroup.position.set(x, y, z);
    gGroup.rotation.y = rot;

    const yellowMat = this.pbr.get('crane_rust_orange');
    const steelMat = this.pbr.get('steel_armor_plate');

    const bodyGeo = new THREE.BoxGeometry(4.2, 2.2, 2.2);
    const body = new THREE.Mesh(bodyGeo, yellowMat);
    body.position.set(0, 1.6, 0);
    body.castShadow = true;
    gGroup.add(body);

    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12);
    [-1.2, 1.2].forEach((wx) => {
      [-1.25, 1.25].forEach((wz) => {
        const wheel = new THREE.Mesh(wheelGeo, steelMat);
        wheel.rotation.x = Math.PI * 0.5;
        wheel.position.set(wx, 0.45, wz);
        gGroup.add(wheel);
      });
    });

    group.add(gGroup);
    this.addStaticCollider(x, 1.6, z, 4.4, 2.5, 2.5, true, 'metal', 0.0, gGroup);
  }

  private createDestroyedScoutVehicle(group: THREE.Group, x: number, y: number, z: number, rot: number) {
    const vGroup = new THREE.Group();
    vGroup.position.set(x, y, z);
    vGroup.rotation.y = rot;

    const armorMat = this.pbr.get('scout_wreck_scorched');
    const blackMat = this.pbr.get('asphalt_wet');

    const hullGeo = new THREE.BoxGeometry(7.2, 1.6, 3.4);
    const hull = new THREE.Mesh(hullGeo, armorMat);
    hull.position.set(0, 1.2, 0);
    hull.rotation.z = 0.06;
    hull.castShadow = true;
    hull.receiveShadow = true;
    vGroup.add(hull);

    const turretGeo = new THREE.CylinderGeometry(1.1, 1.3, 0.9, 8);
    const turret = new THREE.Mesh(turretGeo, armorMat);
    turret.position.set(-0.4, 2.3, 0.1);
    turret.rotation.y = 0.45;
    turret.castShadow = true;
    vGroup.add(turret);

    const barrelGeo = new THREE.CylinderGeometry(0.08, 0.1, 2.8, 8);
    const barrel = new THREE.Mesh(barrelGeo, blackMat);
    barrel.rotation.z = Math.PI * 0.5;
    barrel.rotation.y = 0.45;
    barrel.position.set(1.4, 2.3, 0.8);
    barrel.castShadow = true;
    vGroup.add(barrel);

    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12);
    [-2.2, -0.7, 0.8, 2.3].forEach((wx, i) => {
      if (i === 1) return;
      const wheelL = new THREE.Mesh(wheelGeo, blackMat);
      wheelL.rotation.x = Math.PI * 0.5;
      wheelL.position.set(wx, 0.55, -1.8);
      wheelL.castShadow = true;
      vGroup.add(wheelL);

      const wheelR = new THREE.Mesh(wheelGeo, blackMat);
      wheelR.rotation.x = Math.PI * 0.5;
      wheelR.position.set(wx, 0.55, 1.8);
      wheelR.castShadow = true;
      vGroup.add(wheelR);
    });

    group.add(vGroup);
    this.addStaticCollider(x, 1.4, z, 7.8, 2.8, 3.8, true, 'metal', 0.0, vGroup);
  }

  private createDestroyedMilitaryTruck(group: THREE.Group, x: number, y: number, z: number, rot: number) {
    const tGroup = new THREE.Group();
    tGroup.position.set(x, y, z);
    tGroup.rotation.y = rot;

    const truckMat = this.pbr.get('shipping_container_military');
    const steelMat = this.pbr.get('steel_armor_plate');

    const hoodGeo = new THREE.BoxGeometry(2.4, 1.4, 2.4);
    const hood = new THREE.Mesh(hoodGeo, truckMat);
    hood.position.set(2.4, 1.2, 0);
    hood.castShadow = true;
    tGroup.add(hood);

    const cabGeo = new THREE.BoxGeometry(2.2, 2.0, 2.4);
    const cab = new THREE.Mesh(cabGeo, truckMat);
    cab.position.set(0.4, 1.7, 0);
    cab.castShadow = true;
    tGroup.add(cab);

    const bedGeo = new THREE.BoxGeometry(4.4, 2.2, 2.6);
    const bed = new THREE.Mesh(bedGeo, steelMat);
    bed.position.set(-2.8, 1.7, 0);
    bed.castShadow = true;
    tGroup.add(bed);

    group.add(tGroup);
    this.addStaticCollider(x, 1.6, z, 8.5, 3.2, 3.2, true, 'metal', 0.0, tGroup);
  }

  private createGantryCrane(group: THREE.Group, x: number, y: number, z: number, height: number) {
    const craneGroup = new THREE.Group();
    craneGroup.position.set(x, y, z);

    const steelMat = this.pbr.get('crane_rust_orange');
    const darkSteel = this.pbr.get('steel_armor_plate');

    const legGeo = new THREE.BoxGeometry(0.8, height, 0.8);
    [-8, 8].forEach((lx) => {
      const legA = new THREE.Mesh(legGeo, steelMat);
      legA.position.set(lx, height * 0.5, -4.5);
      legA.rotation.x = 0.08;
      legA.castShadow = true;
      craneGroup.add(legA);

      const legB = new THREE.Mesh(legGeo, steelMat);
      legB.position.set(lx, height * 0.5, 4.5);
      legB.rotation.x = -0.08;
      legB.castShadow = true;
      craneGroup.add(legB);
    });

    const beamGeo = new THREE.BoxGeometry(24.0, 1.8, 2.2);
    const beam = new THREE.Mesh(beamGeo, steelMat);
    beam.position.set(0, height, 0);
    beam.castShadow = true;
    craneGroup.add(beam);

    const trolleyGeo = new THREE.BoxGeometry(2.4, 1.2, 2.4);
    const trolley = new THREE.Mesh(trolleyGeo, darkSteel);
    trolley.position.set(2.0, height - 1.2, 0);
    craneGroup.add(trolley);

    group.add(craneGroup);
    this.addStaticCollider(x - 8, height * 0.5, z, 1.8, height, 10.0, true, 'metal', 0.0, craneGroup);
    this.addStaticCollider(x + 8, height * 0.5, z, 1.8, height, 10.0, true, 'metal', 0.0, craneGroup);
  }

  private createCatwalkSegment(
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    width: number,
    length: number,
    mat: THREE.Material,
    railingMat: THREE.Material
  ) {
    const segment = new THREE.Group();
    segment.position.set(x, y, z);

    const deckGeo = new THREE.BoxGeometry(width, 0.15, length);
    const deck = new THREE.Mesh(deckGeo, mat);
    deck.receiveShadow = true;
    segment.add(deck);

    const railHeight = 1.1;
    const sideRailGeoZ = new THREE.BoxGeometry(0.08, railHeight, length);

    const railLeft = new THREE.Mesh(sideRailGeoZ, railingMat);
    railLeft.position.set(-width * 0.5, railHeight * 0.5, 0);
    segment.add(railLeft);

    const railRight = new THREE.Mesh(sideRailGeoZ, railingMat);
    railRight.position.set(width * 0.5, railHeight * 0.5, 0);
    segment.add(railRight);

    group.add(segment);
    this.addStaticCollider(x, y, z, width, 0.2, length, true, 'metal', 0.45, segment);
  }

  private createStaircase(
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    length: number,
    height: number,
    rot: number
  ) {
    const stairGroup = new THREE.Group();
    stairGroup.position.set(x, y, z);
    stairGroup.rotation.y = rot;

    const stepCount = 14;
    const stepHeight = height / stepCount;
    const stepDepth = length / stepCount;
    const stepWidth = 2.4;

    const stepMat = this.pbr.get('metal_grate_industrial');
    const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);

    for (let i = 0; i < stepCount; i++) {
      const stepMesh = new THREE.Mesh(stepGeo, stepMat);
      const sy = i * stepHeight + stepHeight * 0.5;
      const sz = i * stepDepth - length * 0.5;
      stepMesh.position.set(0, sy, sz);
      stepMesh.receiveShadow = true;
      stairGroup.add(stepMesh);

      this.addStaticCollider(
        x + Math.sin(rot) * sz,
        y + sy,
        z + Math.cos(rot) * sz,
        stepWidth,
        stepHeight,
        stepDepth,
        false,
        'metal',
        0.0
      );
    }

    group.add(stairGroup);
  }

  private createSupportPillar(group: THREE.Group, x: number, y: number, z: number, height: number) {
    const pillarGeo = new THREE.BoxGeometry(0.45, height, 0.45);
    const pillarMat = this.pbr.get('steel_armor_plate');
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(x, y + height * 0.5, z);
    pillar.castShadow = true;
    group.add(pillar);
    this.addStaticCollider(x, y + height * 0.5, z, 0.5, height, 0.5, true, 'metal', 0.0, pillar);
  }

  private createSteelIBeamPillar(group: THREE.Group, x: number, y: number, z: number, height: number) {
    const iBeamGeo = new THREE.BoxGeometry(0.75, height, 0.75);
    const mat = this.pbr.get('steel_armor_plate');
    const mesh = new THREE.Mesh(iBeamGeo, mat);
    mesh.position.set(x, y + height * 0.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    this.addStaticCollider(x, y + height * 0.5, z, 0.8, height, 0.8, true, 'metal', 0.0, mesh);
  }

  private createWallSegment(
    group: THREE.Group | THREE.Scene,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    customMat?: THREE.Material,
    materialType: 'concrete' | 'wood' | 'metal' | 'container' | 'glass' | 'asphalt' = 'concrete'
  ) {
    const mat = customMat || this.pbr.get('concrete_bunker');
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    this.addStaticCollider(x, y, z, w, h, d, true, materialType, 0.0, mesh);
  }

  private createWallSegmentWithWindows(
    group: THREE.Group,
    x: number,
    z: number,
    length: number,
    height: number,
    rot: number,
    mat: THREE.Material
  ) {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(x, 0, z);
    wallGroup.rotation.y = rot;

    const lowerGeo = new THREE.BoxGeometry(length, 1.4, 0.6);
    const lower = new THREE.Mesh(lowerGeo, mat);
    lower.position.set(0, 0.7, 0);
    wallGroup.add(lower);

    const pillarCount = 6;
    const span = length / pillarCount;
    for (let i = 0; i < pillarCount; i++) {
      const px = -length * 0.5 + i * span + span * 0.5;
      const pilGeo = new THREE.BoxGeometry(0.6, 2.2, 0.6);
      const pil = new THREE.Mesh(pilGeo, mat);
      pil.position.set(px, 2.5, 0);
      wallGroup.add(pil);
    }

    const upperGeo = new THREE.BoxGeometry(length, height - 3.6, 0.6);
    const upper = new THREE.Mesh(upperGeo, mat);
    upper.position.set(0, 3.6 + (height - 3.6) * 0.5, 0);
    wallGroup.add(upper);

    group.add(wallGroup);
    this.addStaticCollider(x, height * 0.5, z, length, height, 0.6, true, 'concrete', 0.0, wallGroup);
  }

  private createWarehouseRoofWithSkylights(
    group: THREE.Group,
    x: number,
    baseY: number,
    z: number,
    w: number,
    d: number
  ) {
    const roofGroup = new THREE.Group();
    roofGroup.position.set(x, baseY, z);

    const roofMat = this.pbr.get('steel_armor_plate');
    const glassMat = this.pbr.get('glass_tactical');

    const halfW = w * 0.5;
    const slopeLen = Math.hypot(halfW, 3.0);
    const slopeAngle = Math.atan2(3.0, halfW);

    const leftSlope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.3, d), roofMat);
    leftSlope.position.set(-halfW * 0.5, 1.5, 0);
    leftSlope.rotation.z = slopeAngle;
    roofGroup.add(leftSlope);

    const rightSlope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.3, d), roofMat);
    rightSlope.position.set(halfW * 0.5, 1.5, 0);
    rightSlope.rotation.z = -slopeAngle;
    roofGroup.add(rightSlope);

    const skylightGeo = new THREE.BoxGeometry(3.5, 0.1, d * 0.6);
    const skylight = new THREE.Mesh(skylightGeo, glassMat);
    skylight.userData.materialType = 'glass';
    skylight.position.set(0, 3.0, 0);
    roofGroup.add(skylight);

    group.add(roofGroup);
    this.addStaticCollider(x, baseY + 1.5, z, w, 3.0, d, true, 'metal', 0.0, roofGroup);
  }

  private createIndustrialStorageRacks(
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    length: number,
    height: number
  ) {
    const rackGroup = new THREE.Group();
    rackGroup.position.set(x, y, z);

    const rackMat = this.pbr.get('shipping_container_red');
    const beamGeo = new THREE.BoxGeometry(length, 0.15, 1.4);

    [1.6, 3.2, 4.8].forEach((ry) => {
      const beam = new THREE.Mesh(beamGeo, rackMat);
      beam.position.set(0, ry, 0);
      beam.castShadow = true;
      beam.receiveShadow = true;
      rackGroup.add(beam);

      this.createTacticalCrateStack(rackGroup, -4, ry + 0.1, 0, 2);
      this.createTacticalCrateStack(rackGroup, 4, ry + 0.1, 0, 2);
    });

    group.add(rackGroup);
    this.addStaticCollider(x, height * 0.5, z, length, height, 1.6, true, 'metal', 0.25, rackGroup);
  }

  private createJerseyBarrierLine(
    group: THREE.Group,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    count: number
  ) {
    const barrierMat = this.pbr.get('concrete_weathered');
    const barrierGeo = new THREE.BoxGeometry(2.8, 1.05, 0.7);

    const dx = (endX - startX) / (count - 1 || 1);
    const dz = (endZ - startZ) / (count - 1 || 1);
    const angle = Math.atan2(dx, dz);

    for (let i = 0; i < count; i++) {
      const bx = startX + i * dx;
      const bz = startZ + i * dz;

      const barrier = new THREE.Mesh(barrierGeo, barrierMat);
      barrier.position.set(bx, 0.525, bz);
      barrier.rotation.y = angle;
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      group.add(barrier);

      this.addStaticCollider(bx, 0.525, bz, 2.8, 1.05, 0.7, true, 'concrete', 0.0, barrier);
    }
  }

  private createSandbagFortification(group: THREE.Group, x: number, y: number, z: number, rot: number) {
    const bunkerGroup = new THREE.Group();
    bunkerGroup.position.set(x, y, z);
    bunkerGroup.rotation.y = rot;

    const bagMat = this.pbr.get('wood_crate_tactical');
    const bagGeo = new THREE.BoxGeometry(0.85, 0.28, 0.45);

    for (let layer = 0; layer < 4; layer++) {
      const ly = layer * 0.28 + 0.14;
      for (let i = -3; i <= 3; i++) {
        const bag = new THREE.Mesh(bagGeo, bagMat);
        bag.position.set(i * 0.82, ly, 0);
        bag.castShadow = true;
        bunkerGroup.add(bag);
      }
    }

    group.add(bunkerGroup);
    this.addStaticCollider(x, y + 0.6, z, 5.8, 1.2, 0.6, true, 'concrete', 0.0, bunkerGroup);
  }

  private createTacticalCrateStack(group: THREE.Group, x: number, y: number, z: number, count: number) {
    const crateMat = this.pbr.get('wood_crate_tactical');
    const crateGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);

    for (let i = 0; i < count; i++) {
      const crate = new THREE.Mesh(crateGeo, crateMat);
      const cy = y + (i % 2) * 1.2 + 0.6;
      const cx = x + (i > 1 ? (i - 1) * 1.25 : 0);
      crate.position.set(cx, cy, z);
      crate.castShadow = true;
      crate.receiveShadow = true;
      group.add(crate);

      this.addStaticCollider(cx, cy, z, 1.2, 1.2, 1.2, true, 'wood', 0.35, crate);
    }
  }

  private createHazardBarrelCluster(group: THREE.Group, x: number, y: number, z: number) {
    const barrelMat = this.pbr.get('shipping_container_red');
    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.15, 12);

    const offsets = [
      { dx: 0, dz: 0 },
      { dx: 0.85, dz: 0.1 },
      { dx: 0.4, dz: 0.75 },
    ];

    offsets.forEach((o) => {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(x + o.dx, y + 0.575, z + o.dz);
      barrel.castShadow = true;
      group.add(barrel);
      this.addStaticCollider(x + o.dx, y + 0.575, z + o.dz, 0.85, 1.15, 0.85, true, 'metal', 0.4, barrel);
    });
  }

  private createTireStackCluster(group: THREE.Group, x: number, y: number, z: number) {
    const tireMat = this.pbr.get('asphalt_wet');
    const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12);

    const offsets = [
      { dx: 0, dz: 0, count: 4 },
      { dx: 0.9, dz: 0.2, count: 3 },
      { dx: 0.4, dz: 0.8, count: 3 },
    ];

    const tireGroup = new THREE.Group();
    tireGroup.position.set(x, y, z);

    offsets.forEach((o) => {
      for (let i = 0; i < o.count; i++) {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.position.set(o.dx, i * 0.3 + 0.15, o.dz);
        tire.castShadow = true;
        tireGroup.add(tire);
      }
      this.addStaticCollider(x + o.dx, y + (o.count * 0.3) * 0.5, z + o.dz, 1.0, o.count * 0.3, 1.0, true, 'wood', 0.1, tireGroup);
    });
    group.add(tireGroup);
  }

  private createCableReelStack(group: THREE.Group, x: number, y: number, z: number) {
    const reelMat = this.pbr.get('wood_crate_tactical');
    const metalMat = this.pbr.get('steel_armor_plate');

    const reelGroup = new THREE.Group();
    reelGroup.position.set(x, y, z);

    const reelGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.1, 14);
    const reel = new THREE.Mesh(reelGeo, reelMat);
    reel.position.set(0, 0.55, 0);
    reel.castShadow = true;
    reelGroup.add(reel);

    const coreGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.12, 12);
    const core = new THREE.Mesh(coreGeo, metalMat);
    core.position.set(0, 0.55, 0);
    reelGroup.add(core);

    group.add(reelGroup);
    this.addStaticCollider(x, y + 0.55, z, 1.7, 1.1, 1.7, true, 'wood', 0.2, reelGroup);
  }

  private createPalletStack(group: THREE.Group, x: number, y: number, z: number, count: number) {
    const palletMat = this.pbr.get('wood_crate_tactical');
    const palletGeo = new THREE.BoxGeometry(1.6, 0.18, 1.2);
    const palletGroup = new THREE.Group();
    palletGroup.position.set(x, y, z);

    for (let i = 0; i < count; i++) {
      const pallet = new THREE.Mesh(palletGeo, palletMat);
      pallet.position.set(0, i * 0.18 + 0.09, 0);
      pallet.castShadow = true;
      pallet.receiveShadow = true;
      palletGroup.add(pallet);
    }
    group.add(palletGroup);
    this.addStaticCollider(x, y + (count * 0.18) * 0.5, z, 1.6, count * 0.18, 1.2, true, 'wood', 0.1, palletGroup);
  }

  private createElectricalBox(group: THREE.Group, x: number, y: number, z: number, rot: number) {
    const eGroup = new THREE.Group();
    eGroup.position.set(x, y, z);
    eGroup.rotation.y = rot;

    const boxMat = this.pbr.get('steel_armor_plate');
    const boxGeo = new THREE.BoxGeometry(1.2, 2.0, 0.8);
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(0, 1.0, 0);
    box.castShadow = true;
    eGroup.add(box);

    group.add(eGroup);
    this.addStaticCollider(x, y + 1.0, z, 1.2, 2.0, 0.8, true, 'metal', 0.0, eGroup);
  }

  private createFloodlightTower(group: THREE.Group, x: number, y: number, z: number, height: number, rot: number) {
    const tGroup = new THREE.Group();
    tGroup.position.set(x, y, z);
    tGroup.rotation.y = rot;

    const steelMat = this.pbr.get('steel_armor_plate');
    const lightMat = this.pbr.get('glass_tactical');

    const poleGeo = new THREE.CylinderGeometry(0.2, 0.35, height, 8);
    const pole = new THREE.Mesh(poleGeo, steelMat);
    pole.position.set(0, height * 0.5, 0);
    pole.castShadow = true;
    tGroup.add(pole);

    const headGeo = new THREE.BoxGeometry(1.8, 0.9, 0.6);
    const head = new THREE.Mesh(headGeo, steelMat);
    head.position.set(0, height, 0);
    tGroup.add(head);

    const lensGeo = new THREE.BoxGeometry(1.6, 0.7, 0.1);
    const lens = new THREE.Mesh(lensGeo, lightMat);
    lens.position.set(0, height, 0.3);
    tGroup.add(lens);

    group.add(tGroup);
    this.addStaticCollider(x, y + height * 0.5, z, 0.7, height, 0.7, true, 'metal', 0.0, tGroup);
  }

  private createPerimeterWalls(scene: THREE.Scene) {
    const wallMat = this.pbr.get('concrete_bunker');
    const bound = 105;
    const height = 9.0;

    // Graniczne mury zamykające arenę bojową
    this.createWallSegment(scene, 0, height * 0.5, -bound, bound * 2, height, 1.2, wallMat);
    this.createWallSegment(scene, 0, height * 0.5, bound, bound * 2, height, 1.2, wallMat);
    this.createWallSegment(scene, -bound, height * 0.5, 0, 1.2, height, bound * 2, wallMat);
    this.createWallSegment(scene, bound, height * 0.5, 0, 1.2, height, bound * 2, wallMat);
  }

  private createObjectiveVisual(scene: THREE.Scene, siteId: 'A' | 'B', pos: THREE.Vector3, radius: number) {
    const ringGeo = new THREE.RingGeometry(radius - 0.25, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: siteId === 'A' ? 0xf59e0b : 0x06b6d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.05, pos.z);
    ring.name = `env_objective_ring_${siteId}`;
    scene.add(ring);
  }

  /**
   * Dodaje collider z tagowaniem materiału zarówno do mostka kinematycznego (CollidableBox) jak i silnika Rapier3D
   */
  private addStaticCollider(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    isCover: boolean = true,
    materialType: 'concrete' | 'wood' | 'metal' | 'container' | 'glass' | 'asphalt' = 'concrete',
    penetrationResistance: number = 0.0,
    mesh?: THREE.Object3D
  ) {
    // Tagowanie materiału na obiekcie 3D dla bezpośredniego odczytu w raycast
    if (mesh) {
      mesh.userData.materialType = materialType;
      mesh.userData.penetrationResistance = penetrationResistance;
      mesh.traverse((child) => {
        child.userData.materialType = materialType;
        child.userData.penetrationResistance = penetrationResistance;
      });
    }

    // 1. Zapis w tablicy mostka kinematycznego gracza (Zero-GC)
    const min = new THREE.Vector3(x - w * 0.5, y - h * 0.5, z - d * 0.5);
    const max = new THREE.Vector3(x + w * 0.5, y + h * 0.5, z + d * 0.5);

    this.colliders.push({
      min,
      max,
      mesh,
      isCover,
      materialType,
      penetrationResistance,
    });

    // 2. Utworzenie statycznego RigidBody i Collidera w silniku Rapier3D (WASM)
    if (this.rapierWorld && LevelBuilder.rapierInitialized) {
      try {
        const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
        const rigidBody = this.rapierWorld.createRigidBody(rigidBodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(w * 0.5, h * 0.5, d * 0.5);
        this.rapierWorld.createCollider(colliderDesc, rigidBody);
      } catch {
        // Ignoruj błąd jeśli WASM nie jest aktywny
      }
    }
  }
}
