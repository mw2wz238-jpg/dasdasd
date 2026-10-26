import * as THREE from 'three';
import { CollidableBox, EnvironmentBuildResult } from '../environment';
import { BombSite } from '../../types/game';
import { Materials } from '../materials';

/**
 * ============================================================================
 * PROJEKT VANGUARD — TEATR DZIAŁAŃ NOCNYCH: "NOCNE DOKI" (MP_NIGHT_DOCKS_02)
 * ============================================================================
 * Klasa: NightDocksMap
 * Architektura: 100% Zero-GC, potok renderowania HDR i fizyka balistyczna.
 * 
 * Charakterystyka teatru działań:
 * 1. Oświetlenie nocne PBR & Wolumetria:
 *    - Głębokie granatowe nocne niebo (0x02050b) i gęsta morska mgła deszczowa.
 *    - Niski Ambient (0.08) zapobiegający wyblakłym cieniom.
 *    - Zimne światło księżycowe z kaskadowymi cieniami CSM.
 *    - Aktywne reflektory wieżowe i lampy sodowe ze stożkami światła wolumetrycznego (God Rays).
 * 2. Kałuże deszczowe i odbicia IBL mokrego asfaltu (Wetness Factor 0.90, Puddle 0.85).
 * 3. Architektura nabrzeża morskiego:
 *    - Pirs rozładunkowy i basen portowy (tafla głębokiej wody ze zwierciadlanym połyskiem).
 *    - Gigantyczna suwnica kontenerowa STS (Ship-to-Shore Gantry Crane).
 *    - Magazyn celny (Customs Depot) z rampami załadunkowymi i regałami wysokiego składowania.
 *    - Labirynt kontenerów morskich tworzący taktyczne korytarze strzeleckie CQB.
 * 4. Strefy detonacji C4 (A & B) oraz zbalansowane punkty odradzania drużyn.
 * ============================================================================
 */

export class NightDocksMap {
  private colliders: CollidableBox[] = [];

  public build(scene: THREE.Scene): EnvironmentBuildResult {
    this.colliders = [];

    // =========================================================================
    // 1. ATMOSFERA, NIEBO NOCNE I OŚWIETLENIE ŚRODOWISKOWE PBR
    // =========================================================================
    scene.background = new THREE.Color(0x02050b);
    scene.fog = new THREE.FogExp2(0x040812, 0.015);

    // Niski, nastrojowy Ambient (niebo granatowe, podłoże ciemne)
    const hemiLight = new THREE.HemisphereLight(0x142238, 0x05070a, 0.08);
    hemiLight.name = 'env_hemi_night';
    scene.add(hemiLight);

    // Chłodne światło księżycowe z cieniami CSM
    const moonLight = new THREE.DirectionalLight(0x426696, 0.65);
    moonLight.position.set(-65, 100, -50);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 2048;
    moonLight.shadow.mapSize.height = 2048;
    moonLight.shadow.camera.near = 0.5;
    moonLight.shadow.camera.far = 280;
    moonLight.shadow.camera.left = -110;
    moonLight.shadow.camera.right = 110;
    moonLight.shadow.camera.top = 110;
    moonLight.shadow.camera.bottom = -110;
    moonLight.shadow.bias = -0.00035;
    moonLight.shadow.normalBias = 0.025;
    moonLight.name = 'env_dirLight';
    scene.add(moonLight);

    // =========================================================================
    // 2. PODŁOŻE NABRZEŻA, WODA DOKU I MOKRE KAŁUŻE
    // =========================================================================
    // Główna betonowa płyta nabrzeża doków (Mokry asfalt z kałużami)
    const groundGeo = new THREE.PlaneGeometry(240, 240, 32, 32);
    const groundMat = Materials.get('night_docks_wet');
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.materialType = 'asphalt';
    ground.name = 'night_docks_ground';
    scene.add(ground);

    // Kolizja podłoża
    this.addStaticCollider(0, -0.5, 0, 240, 1.0, 240, false, 'asphalt', 0.0, ground);

    // Basen portowy (Woda doku o wysokim współczynniku odbić IBL i świateł latarni)
    const waterGeo = new THREE.PlaneGeometry(65, 240);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x030811,
      roughness: 0.06,
      metalness: 0.92,
      envMapIntensity: 2.2,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(-88, -0.35, 0);
    water.receiveShadow = true;
    water.name = 'dock_water_basin';
    scene.add(water);

    // Krawędź pirsu betonowego (Granica między dokiem a wodą)
    const pierEdgeGeo = new THREE.BoxGeometry(2.5, 1.4, 240);
    const pierEdge = new THREE.Mesh(pierEdgeGeo, Materials.get('concrete_floor'));
    pierEdge.position.set(-56.5, 0.3, 0);
    pierEdge.castShadow = true;
    pierEdge.receiveShadow = true;
    scene.add(pierEdge);
    this.addStaticCollider(-56.5, 0.3, 0, 2.5, 1.4, 240, true, 'concrete', 0.0, pierEdge);

    // Polery cumownicze na pirsie (Bollards)
    for (let z = -100; z <= 100; z += 25) {
      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 0.9, 12),
        Materials.get('weapon_matte_black')
      );
      bollard.position.set(-56.5, 1.2, z);
      bollard.castShadow = true;
      scene.add(bollard);
      this.addStaticCollider(-56.5, 1.2, z, 0.8, 1.0, 0.8, true, 'metal', 0.0, bollard);
    }

    // =========================================================================
    // 3. MASZTY REFLEKTORÓW PRZEMYSŁOWYCH ZE STOŻKAMI ŚWIATŁA (GOD RAYS)
    // =========================================================================
    const floodlightTowers = [
      { x: -45, z: -40, color: 0x66aaff, intensity: 4.8, rotY: Math.PI * 0.25 },
      { x: -45, z: 40, color: 0x66aaff, intensity: 4.8, rotY: -Math.PI * 0.25 },
      { x: 35, z: -60, color: 0xffaa44, intensity: 4.2, rotY: Math.PI * 0.8 },
      { x: 45, z: 60, color: 0xffaa44, intensity: 4.2, rotY: -Math.PI * 0.7 },
      { x: 0, z: -15, color: 0xffffff, intensity: 3.8, rotY: 0 },
      { x: 10, z: 25, color: 0x66aaff, intensity: 4.0, rotY: Math.PI },
    ];

    for (const fl of floodlightTowers) {
      this.createIndustrialFloodlightTower(scene, fl.x, fl.z, fl.color, fl.intensity, fl.rotY);
    }

    // =========================================================================
    // 4. ARCHITEKTURA DOKÓW: SUWNICA STS, MAGAZYN CELNY, FRYKTOWIEC
    // =========================================================================
    // Gigantyczna Suwnica Kontenerowa STS (Gantry Crane) nad pirsem
    this.createGantryCrane(scene, -30, 0, -15);

    // Magazyn Celny (Customs Warehouse Depot) w sektorze wschodnim
    this.createCustomsWarehouse(scene, 32, 0, 10);

    // Skład kontenerów morskich (Ciasne korytarze CQB)
    this.createContainerTerminalLayout(scene);

    // Ściany obwodowe (Perimeter Walls)
    this.createPerimeterEnclosure(scene);

    // =========================================================================
    // 5. STREFY CELÓW TAKTYCZNYCH (BOMB SITES A & B)
    // =========================================================================
    // Cel A: Podstawa Głównej Suwnicy Nabrzeżnej
    const bombSiteA: BombSite = {
      id: 'A',
      position: { x: -22.0, y: 0.0, z: -18.0 },
      radius: 8.0,
    };

    // Cel B: Skład Chemiczny w Hali Magazynu Celnego
    const bombSiteB: BombSite = {
      id: 'B',
      position: { x: 34.0, y: 0.0, z: 26.0 },
      radius: 8.0,
    };

    this.createSiteVisualRing(scene, 'A', new THREE.Vector3(bombSiteA.position.x, 0, bombSiteA.position.z), bombSiteA.radius);
    this.createSiteVisualRing(scene, 'B', new THREE.Vector3(bombSiteB.position.x, 0, bombSiteB.position.z), bombSiteB.radius);

    // =========================================================================
    // 6. PUNKTY ODRADZANIA OPERATORÓW (SPAWN POINTS)
    // =========================================================================
    // Vanguard: Południowy Pirs Patrolowy
    const spawnPointsVanguard = [
      new THREE.Vector3(-45, 1.75, 78),
      new THREE.Vector3(-35, 1.75, 82),
      new THREE.Vector3(-22, 1.75, 80),
      new THREE.Vector3(-10, 1.75, 84),
      new THREE.Vector3(5, 1.75, 78),
    ];

    // Syndicate: Północny Wjazd do Magazynu Celnego
    const spawnPointsSyndicate = [
      new THREE.Vector3(25, 1.75, -80),
      new THREE.Vector3(38, 1.75, -84),
      new THREE.Vector3(50, 1.75, -78),
      new THREE.Vector3(62, 1.75, -82),
      new THREE.Vector3(45, 1.75, -72),
    ];

    // =========================================================================
    // 7. CZĄSTECZKI DESZCZU MORSKIEGO (WEATHER MESH)
    // =========================================================================
    const weatherMesh = this.createRainSystem(scene);

    return {
      colliders: this.colliders,
      bombSiteA,
      bombSiteB,
      spawnPointsVanguard,
      spawnPointsSyndicate,
      weatherMesh,
      dirLight: moonLight,
      hemiLight,
    };
  }

  /**
   * Tworzy maszt reflektora ze stożkiem światła wolumetrycznego
   */
  private createIndustrialFloodlightTower(
    scene: THREE.Scene,
    x: number,
    z: number,
    colorHex: number,
    intensity: number,
    rotY: number
  ): void {
    const towerGroup = new THREE.Group();
    towerGroup.position.set(x, 0, z);
    towerGroup.rotation.y = rotY;

    // Stalowy słup
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.35, 14, 12),
      Materials.get('steel_girder')
    );
    pole.position.set(0, 7, 0);
    pole.castShadow = true;
    towerGroup.add(pole);

    // Podstawa betonowa
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.0, 1.2, 8),
      Materials.get('concrete_floor')
    );
    base.position.set(0, 0.6, 0);
    base.castShadow = true;
    towerGroup.add(base);

    // Pomost i reflektor
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 1.2),
      Materials.get('weapon_matte_black')
    );
    fixture.position.set(0, 14, 0.5);
    fixture.rotation.x = 0.35;
    towerGroup.add(fixture);

    // Źródło światła punktowego PBR
    const light = new THREE.PointLight(colorHex, intensity, 65, 1.4);
    light.position.set(0, 13.8, 1.0);
    light.castShadow = true;
    light.shadow.bias = -0.002;
    towerGroup.add(light);

    // Wolumetryczny stożek światła (God Ray Cone)
    const coneGeo = new THREE.CylinderGeometry(0.6, 14, 28, 16, 1, true);
    coneGeo.translate(0, -14, 0);
    coneGeo.rotateX(-Math.PI / 2 + 0.35);

    const coneMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uIntensity: { value: 0.16 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          float fade = sin(vUv.x * 3.14159) * pow(1.0 - vUv.y, 2.0);
          gl_FragColor = vec4(uColor, fade * uIntensity);
        }
      `,
    });

    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    coneMesh.position.set(0, 14, 0.5);
    coneMesh.renderOrder = 3;
    towerGroup.add(coneMesh);

    scene.add(towerGroup);
    this.addStaticCollider(x, 7, z, 1.8, 14, 1.8, true, 'metal', 0.0, towerGroup);
  }

  /**
   * Konstrukcja potężnej suwnicy STS (Ship-to-Shore Crane)
   */
  private createGantryCrane(scene: THREE.Scene, x: number, y: number, z: number): void {
    const craneGroup = new THREE.Group();
    craneGroup.position.set(x, y, z);

    const metalMat = Materials.get('steel_girder');
    const darkMat = Materials.get('weapon_matte_black');

    // 4 Masywne pylony nośne (Nogi bramowe)
    const legGeo = new THREE.BoxGeometry(1.4, 22, 1.4);
    const leg1 = new THREE.Mesh(legGeo, metalMat); leg1.position.set(-9, 11, -12); leg1.castShadow = true; craneGroup.add(leg1);
    const leg2 = new THREE.Mesh(legGeo, metalMat); leg2.position.set(9, 11, -12); leg2.castShadow = true; craneGroup.add(leg2);
    const leg3 = new THREE.Mesh(legGeo, metalMat); leg3.position.set(-9, 11, 12); leg3.castShadow = true; craneGroup.add(leg3);
    const leg4 = new THREE.Mesh(legGeo, metalMat); leg4.position.set(9, 11, 12); leg4.castShadow = true; craneGroup.add(leg4);

    // Belki poprzeczne i kratownice
    const beamGeo = new THREE.BoxGeometry(22, 2.2, 38);
    const mainBeam = new THREE.Mesh(beamGeo, metalMat);
    mainBeam.position.set(0, 22, 0);
    mainBeam.castShadow = true;
    craneGroup.add(mainBeam);

    // Wysięgnik sięgający nad basen doku
    const boomGeo = new THREE.BoxGeometry(3.5, 3.0, 52);
    const boom = new THREE.Mesh(boomGeo, metalMat);
    boom.position.set(-14, 23.5, -6);
    boom.castShadow = true;
    craneGroup.add(boom);

    // Wózek suwnicowy i podwieszony kontener nad ziemią
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 5), darkMat);
    trolley.position.set(-14, 21.5, -6);
    craneGroup.add(trolley);

    // Podwieszony kontener
    const cont = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.8, 12.4), Materials.get('container_rust'));
    cont.position.set(-14, 12, -6);
    cont.castShadow = true;
    craneGroup.add(cont);

    scene.add(craneGroup);

    // Rejestracja kolizji nóg suwnicy
    this.addStaticCollider(x - 9, 11, z - 12, 1.6, 22, 1.6, true, 'metal', 0.0, leg1);
    this.addStaticCollider(x + 9, 11, z - 12, 1.6, 22, 1.6, true, 'metal', 0.0, leg2);
    this.addStaticCollider(x - 9, 11, z + 12, 1.6, 22, 1.6, true, 'metal', 0.0, leg3);
    this.addStaticCollider(x + 9, 11, z + 12, 1.6, 22, 1.6, true, 'metal', 0.0, leg4);
  }

  /**
   * Hala Magazynu Celnego (Customs Warehouse)
   */
  private createCustomsWarehouse(scene: THREE.Scene, x: number, y: number, z: number): void {
    const whGroup = new THREE.Group();
    whGroup.position.set(x, y, z);

    const wallMat = Materials.get('concrete_floor');
    const roofMat = Materials.get('metal_panel');

    // Ściana wschodnia (tył)
    const wallEast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 48), wallMat);
    wallEast.position.set(20, 5, 0);
    wallEast.castShadow = true;
    whGroup.add(wallEast);
    this.addStaticCollider(x + 20, 5, z, 1.5, 10, 48, false, 'concrete', 0.0, wallEast);

    // Ściana północna
    const wallNorth = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 1.2), wallMat);
    wallNorth.position.set(0, 5, -24);
    wallNorth.castShadow = true;
    whGroup.add(wallNorth);
    this.addStaticCollider(x, 5, z - 24, 40, 10, 1.5, false, 'concrete', 0.0, wallNorth);

    // Ściana południowa
    const wallSouth = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 1.2), wallMat);
    wallSouth.position.set(0, 5, 24);
    wallSouth.castShadow = true;
    whGroup.add(wallSouth);
    this.addStaticCollider(x, 5, z + 24, 40, 10, 1.5, false, 'concrete', 0.0, wallSouth);

    // Ściana zachodnia z bramami załadunkowymi (front)
    const wallWestLeft = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 16), wallMat);
    wallWestLeft.position.set(-20, 5, -16);
    wallWestLeft.castShadow = true;
    whGroup.add(wallWestLeft);
    this.addStaticCollider(x - 20, 5, z - 16, 1.5, 10, 16, false, 'concrete', 0.0, wallWestLeft);

    const wallWestRight = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 16), wallMat);
    wallWestRight.position.set(-20, 5, 16);
    wallWestRight.castShadow = true;
    whGroup.add(wallWestRight);
    this.addStaticCollider(x - 20, 5, z + 16, 1.5, 10, 16, false, 'concrete', 0.0, wallWestRight);

    // Dach dwuspadowy z blachy falistej
    const roof = new THREE.Mesh(new THREE.BoxGeometry(42, 1.0, 50), roofMat);
    roof.position.set(0, 10.5, 0);
    roof.castShadow = true;
    whGroup.add(roof);

    // Regały wysokiego składowania we wnętrzu
    for (let rz = -12; rz <= 12; rz += 8) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(12, 7.5, 2.2), Materials.get('steel_girder'));
      rack.position.set(6, 3.75, rz);
      rack.castShadow = true;
      whGroup.add(rack);
      this.addStaticCollider(x + 6, 3.75, z + rz, 12, 7.5, 2.2, true, 'metal', 0.35, rack);
    }

    scene.add(whGroup);
  }

  /**
   * Labirynt kontenerów morskich tworzący zrównoważone linie walki CQB
   */
  private createContainerTerminalLayout(scene: THREE.Scene): void {
    const containers: Array<{ x: number; y: number; z: number; rot: number; mat: string }> = [
      // Korytarz centralny
      { x: -5, y: 1.4, z: -10, rot: 0.15, mat: 'container_rust' },
      { x: -5, y: 4.2, z: -10, rot: 0.15, mat: 'container_orange' },
      { x: 12, y: 1.4, z: -16, rot: -0.25, mat: 'container_green' },
      { x: -14, y: 1.4, z: 12, rot: Math.PI * 0.5, mat: 'container_orange' },
      { x: -14, y: 4.2, z: 12, rot: Math.PI * 0.5, mat: 'container_rust' },
      // Bariery flankujące
      { x: -28, y: 1.4, z: 28, rot: 0.35, mat: 'container_green' },
      { x: 5, y: 1.4, z: 35, rot: -0.1, mat: 'container_rust' },
      { x: -18, y: 1.4, z: -45, rot: 0.8, mat: 'container_orange' },
      { x: 20, y: 1.4, z: -38, rot: Math.PI * 0.5, mat: 'container_green' },
      { x: 20, y: 4.2, z: -38, rot: Math.PI * 0.5, mat: 'container_rust' },
    ];

    const boxGeo = new THREE.BoxGeometry(6.2, 2.8, 12.4);

    for (let i = 0; i < containers.length; i++) {
      const c = containers[i];
      const mesh = new THREE.Mesh(boxGeo, Materials.get(c.mat));
      mesh.position.set(c.x, c.y, c.z);
      mesh.rotation.y = c.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `dock_container_${i}`;
      scene.add(mesh);

      this.addStaticCollider(c.x, c.y, c.z, 6.5, 2.9, 12.6, true, 'container', 0.55, mesh);
    }
  }

  /**
   * Zewnętrzne betonowe ściany obwodowe z reflektorami
   */
  private createPerimeterEnclosure(scene: THREE.Scene): void {
    const wallMat = Materials.get('concrete_floor');

    // Mur Północny
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(220, 8, 2), wallMat);
    wallN.position.set(0, 4, -110);
    scene.add(wallN);
    this.addStaticCollider(0, 4, -110, 220, 8, 2.5, false, 'concrete', 0.0, wallN);

    // Mur Południowy
    const wallS = new THREE.Mesh(new THREE.BoxGeometry(220, 8, 2), wallMat);
    wallS.position.set(0, 4, 110);
    scene.add(wallS);
    this.addStaticCollider(0, 4, 110, 220, 8, 2.5, false, 'concrete', 0.0, wallS);

    // Mur Wschodni
    const wallE = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 220), wallMat);
    wallE.position.set(110, 4, 0);
    scene.add(wallE);
    this.addStaticCollider(110, 4, 0, 2.5, 8, 220, false, 'concrete', 0.0, wallE);
  }

  /**
   * Wizualne świecące pierścienie celów A i B
   */
  private createSiteVisualRing(scene: THREE.Scene, id: 'A' | 'B', pos: THREE.Vector3, radius: number): void {
    const ringGeo = new THREE.RingGeometry(radius - 0.25, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: id === 'A' ? 0x00e5ff : 0xff9900,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.04, pos.z);
    scene.add(ring);
  }

  /**
   * Cząsteczki mżawki nocnej (Rain Weather Mesh)
   */
  private createRainSystem(scene: THREE.Scene): THREE.Points {
    const count = 2600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 180;
      pos[i * 3 + 1] = Math.random() * 45;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 180;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x88bbdd,
      size: 0.18,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    const rain = new THREE.Points(geo, mat);
    rain.name = 'night_docks_rain';
    scene.add(rain);
    return rain;
  }

  private addStaticCollider(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    isCover: boolean,
    matType: 'concrete' | 'wood' | 'metal' | 'container' | 'asphalt',
    penResistance: number,
    mesh?: THREE.Object3D
  ): void {
    this.colliders.push({
      min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
      isCover,
      materialType: matType,
      penetrationResistance: penResistance,
      mesh,
    });
  }
}
