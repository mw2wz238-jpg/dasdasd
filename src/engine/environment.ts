import * as THREE from 'three';
import { MapId, BombSite } from '../types/game';
import { Materials } from './materials';
import { LevelBuilder } from './LevelBuilder';
import { NightDocksMap } from './maps/NightDocksMap';

export interface CollidableBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  mesh?: THREE.Object3D;
  isCover?: boolean;
  materialType?: 'concrete' | 'wood' | 'metal' | 'container' | 'glass' | 'asphalt';
  penetrationResistance?: number; // 0 = impenetrable, 0.35 = wood, 0.55 = sheet metal container
}

export interface EnvironmentBuildResult {
  colliders: CollidableBox[];
  spawnPointsVanguard: THREE.Vector3[];
  spawnPointsSyndicate: THREE.Vector3[];
  bombSiteA: BombSite;
  bombSiteB: BombSite;
  dirLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  weatherMesh: THREE.Points | null;
}

export class EnvironmentBuilder {
  public colliders: CollidableBox[] = [];
  private levelBuilder: LevelBuilder = new LevelBuilder();

  public buildMap(scene: THREE.Scene, mapId: MapId): EnvironmentBuildResult {
    this.colliders = [];

    // Clear existing objects if any
    const toRemove: THREE.Object3D[] = [];
    scene.children.forEach((c) => {
      if (c.name.startsWith('env_')) toRemove.push(c);
    });
    toRemove.forEach((c) => scene.remove(c));

    let envResult;
    if (mapId === 'winter_village') {
      envResult = this.buildWinterVillage(scene);
    } else if (mapId === 'night_docks') {
      envResult = new NightDocksMap().build(scene);
    } else {
      envResult = this.buildIndustrialZone(scene);
    }

    const weatherMesh = this.createWeatherSystem(scene, mapId);

    return {
      ...envResult,
      weatherMesh,
    };
  }

  public addCollider(
    mesh: THREE.Object3D,
    isCover: boolean = true,
    materialType: 'concrete' | 'wood' | 'metal' | 'container' = 'concrete',
    penetrationResistance: number = 0.0
  ) {
    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push({
      min: box.min.clone(),
      max: box.max.clone(),
      mesh,
      isCover,
      materialType,
      penetrationResistance,
    });
  }

  private buildIndustrialZone(scene: THREE.Scene) {
    // Generowanie mapy na podstawie blueprintu technicznego CAD (MP_INDUSTRIAL_SECTOR_04)
    const levelRes = this.levelBuilder.buildIndustrialSector04(scene);
    this.colliders = levelRes.colliders;

    return {
      colliders: levelRes.colliders,
      spawnPointsVanguard: levelRes.spawnPointsVanguard,
      spawnPointsSyndicate: levelRes.spawnPointsSyndicate,
      bombSiteA: levelRes.bombSiteA,
      bombSiteB: levelRes.bombSiteB,
      dirLight: levelRes.dirLight,
      hemiLight: levelRes.hemiLight,
    };
  }

  private buildWinterVillage(scene: THREE.Scene) {
    // Winter Mountain Atmosphere: Cold overcast daylight with snowy mist
    scene.background = new THREE.Color(0xaec2d6);
    scene.fog = new THREE.FogExp2(0xaec2d6, 0.009);

    const hemiLight = new THREE.HemisphereLight(0xd9e5f0, 0x4a5666, 0.85);
    hemiLight.name = 'env_hemi';
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xf5f8fc, 1.6);
    dirLight.position.set(50, 90, 70);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = 0.02;
    dirLight.name = 'env_dirLight';
    scene.add(dirLight);

    // Alpejskie promienie świetlne przebijające przez śnieżną mgłę
    this.createVolumetricSunBeams(scene, new THREE.Vector3(50, 90, 70), new THREE.Vector3(0, 0, 0), 0xddeaff);

    // Snow Ground
    const groundGeo = new THREE.PlaneGeometry(240, 240, 48, 48);
    const ground = new THREE.Mesh(groundGeo, Materials.get('snow_ground'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'env_ground';
    scene.add(ground);

    // Alpine Log Cabins
    const cabinCoords = [
      { x: -30, z: -25, rot: 0.2 },
      { x: 35, z: -20, rot: -0.3 },
      { x: -32, z: 28, rot: 0.1 },
      { x: 30, z: 32, rot: -0.15 },
    ];
    cabinCoords.forEach((c) => this.createAlpineCabin(scene, new THREE.Vector3(c.x, 0, c.z), c.rot));

    // Stone Arch Bridge Chokepoint in the center
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, 1.8, 28), Materials.get('concrete_floor'));
    bridge.position.set(0, 0.9, 0);
    bridge.receiveShadow = true;
    bridge.castShadow = true;
    bridge.name = 'env_bridge';
    scene.add(bridge);
    this.addCollider(bridge, true);

    // Stone bridge railings
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 28), Materials.get('concrete_floor'));
    railL.position.set(-5.1, 2.1, 0);
    railL.castShadow = true;
    scene.add(railL);
    this.addCollider(railL, true);

    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 28), Materials.get('concrete_floor'));
    railR.position.set(5.1, 2.1, 0);
    railR.castShadow = true;
    scene.add(railR);
    this.addCollider(railR, true);

    // Pine Trees
    for (let i = 0; i < 38; i++) {
      const angle = (i / 38) * Math.PI * 2;
      const r = 22 + ((i * 13) % 40);
      const px = Math.cos(angle) * r;
      const pz = Math.sin(angle) * r;
      if (Math.abs(px) < 8 && Math.abs(pz) < 18) continue; // Keep bridge clear
      this.createPineTree(scene, new THREE.Vector3(px, 0, pz), 6 + (i % 4) * 2);
    }

    // Create Bomb Sites A & B
    const bombSiteA: BombSite = { id: 'A', position: { x: -22, y: 0, z: -8 }, radius: 7.5 };
    const bombSiteB: BombSite = { id: 'B', position: { x: 22, y: 0, z: -8 }, radius: 7.5 };
    this.createBombSiteVisual(scene, 'A', new THREE.Vector3(bombSiteA.position.x, 0, bombSiteA.position.z), bombSiteA.radius);
    this.createBombSiteVisual(scene, 'B', new THREE.Vector3(bombSiteB.position.x, 0, bombSiteB.position.z), bombSiteB.radius);

    // Taktyczne umocnienia zimowe przy celach misji
    this.createSandbagBunker(scene, new THREE.Vector3(-20, 0, -12), 0.2);
    this.createSandbagBunker(scene, new THREE.Vector3(20, 0, -12), -0.2);

    this.createBoundaryWalls(scene, 110);

    // Zoptymalizowane instancjonowanie skrzyń i beczek (InstancedMesh)
    this.createInstancedBarrelsAndCrates(scene, 'winter_village');

    return {
      colliders: this.colliders,
      spawnPointsVanguard: [
        new THREE.Vector3(-14, 1.75, 46),
        new THREE.Vector3(-7, 1.75, 50),
        new THREE.Vector3(0, 1.75, 48),
        new THREE.Vector3(7, 1.75, 50),
        new THREE.Vector3(14, 1.75, 46),
      ],
      spawnPointsSyndicate: [
        new THREE.Vector3(-14, 1.75, -46),
        new THREE.Vector3(-7, 1.75, -50),
        new THREE.Vector3(0, 1.75, -48),
        new THREE.Vector3(7, 1.75, -50),
        new THREE.Vector3(14, 1.75, -46),
      ],
      bombSiteA,
      bombSiteB,
      dirLight,
      hemiLight,
    };
  }

  private buildNightDocks(scene: THREE.Scene) {
    // Night Rain Industrial Harbor
    scene.background = new THREE.Color(0x06090e);
    scene.fog = new THREE.FogExp2(0x06090e, 0.012);

    const hemiLight = new THREE.HemisphereLight(0x182436, 0x090b10, 0.4);
    hemiLight.name = 'env_hemi';
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0x3a5682, 0.5); // Moonlight
    dirLight.position.set(-60, 90, -40);
    dirLight.castShadow = true;
    dirLight.name = 'env_dirLight';
    scene.add(dirLight);

    // Wet Reflective Tarmac
    const groundGeo = new THREE.PlaneGeometry(240, 240, 48, 48);
    const ground = new THREE.Mesh(groundGeo, Materials.get('asphalt_wet'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'env_ground';
    scene.add(ground);

    // High-contrast Floodlights (Blue and Amber)
    const lightPositions = [
      { x: -30, z: -30, color: 0x4488ff },
      { x: 30, z: -30, color: 0xffaa33 },
      { x: -30, z: 30, color: 0xffaa33 },
      { x: 30, z: 30, color: 0x4488ff },
      { x: 0, z: 0, color: 0xffffff },
    ];

    lightPositions.forEach((lp) => {
      // Light pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 12, 12), Materials.get('weapon_metal_blued'));
      pole.position.set(lp.x, 6, lp.z);
      pole.castShadow = true;
      scene.add(pole);
      this.addCollider(pole, true);

      // Light lamp fixture
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), Materials.get('weapon_matte_black'));
      fixture.position.set(lp.x, 12, lp.z);
      scene.add(fixture);

      // PointLight with strong specular highlights on wet ground
      const light = new THREE.PointLight(lp.color, 4.5, 55, 1.2);
      light.position.set(lp.x, 11.5, lp.z);
      scene.add(light);

      // Stożek światła wolumetrycznego dla lamp dokowych
      this.createVolumetricLightCone(scene, new THREE.Vector3(lp.x, 11.8, lp.z), lp.color);
    });

    // Dark Containers with rust
    const containerCoords = [
      { x: -16, z: -12, rot: 0.1, mat: 'container_rust' },
      { x: 16, z: -10, rot: -0.2, mat: 'container_orange' },
      { x: 0, z: 12, rot: 1.57, mat: 'container_green' },
      { x: -24, z: 18, rot: 0.3, mat: 'container_rust' },
      { x: 22, z: 22, rot: -0.1, mat: 'container_orange' },
    ];
    containerCoords.forEach((c) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.8, 12.4), Materials.get(c.mat));
      box.position.set(c.x, 1.4, c.z);
      box.rotation.y = c.rot;
      box.castShadow = true;
      box.receiveShadow = true;
      scene.add(box);
      this.addCollider(box, true);
    });

    // Create Bomb Sites A & B
    const bombSiteA: BombSite = { id: 'A', position: { x: -24, y: 0, z: -5 }, radius: 7.5 };
    const bombSiteB: BombSite = { id: 'B', position: { x: 24, y: 0, z: -5 }, radius: 7.5 };
    this.createBombSiteVisual(scene, 'A', new THREE.Vector3(bombSiteA.position.x, 0, bombSiteA.position.z), bombSiteA.radius);
    this.createBombSiteVisual(scene, 'B', new THREE.Vector3(bombSiteB.position.x, 0, bombSiteB.position.z), bombSiteB.radius);

    // Kładka załadunkowa i umocnienia portowe
    this.createTacticalCatwalk(scene, new THREE.Vector3(18, 0, -25), 22, -Math.PI / 3);
    this.createSandbagBunker(scene, new THREE.Vector3(-22, 0, -9), Math.PI / 4);

    this.createBoundaryWalls(scene, 110);

    // Zoptymalizowane instancjonowanie skrzyń i beczek (InstancedMesh)
    this.createInstancedBarrelsAndCrates(scene, 'night_docks');

    return {
      colliders: this.colliders,
      spawnPointsVanguard: [
        new THREE.Vector3(-14, 1.75, 46),
        new THREE.Vector3(-7, 1.75, 50),
        new THREE.Vector3(0, 1.75, 48),
        new THREE.Vector3(7, 1.75, 50),
        new THREE.Vector3(14, 1.75, 46),
      ],
      spawnPointsSyndicate: [
        new THREE.Vector3(-14, 1.75, -46),
        new THREE.Vector3(-7, 1.75, -50),
        new THREE.Vector3(0, 1.75, -48),
        new THREE.Vector3(7, 1.75, -50),
        new THREE.Vector3(14, 1.75, -46),
      ],
      bombSiteA,
      bombSiteB,
      dirLight,
      hemiLight,
    };
  }

  public createBombSiteVisual(scene: THREE.Scene, siteId: 'A' | 'B', pos: THREE.Vector3, radius: number = 7.5) {
    const group = new THREE.Group();
    group.name = `env_bombsite_${siteId}`;

    // Glowing ground decal ring
    const ringGeo = new THREE.RingGeometry(radius - 0.45, radius, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: siteId === 'A' ? 0xffaa00 : 0x00d4ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.04, 0);
    group.add(ring);

    // Hazard zone corner boundary posts with pulsing LED beacons
    const corners = [
      { x: -radius * 0.7, z: -radius * 0.7 },
      { x: radius * 0.7, z: -radius * 0.7 },
      { x: -radius * 0.7, z: radius * 0.7 },
      { x: radius * 0.7, z: radius * 0.7 },
    ];
    corners.forEach((c) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8), Materials.get('weapon_matte_black'));
      p.position.set(c.x, 0.7, c.z);
      group.add(p);
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: siteId === 'A' ? 0xff8800 : 0x00aaff })
      );
      beacon.position.set(c.x, 1.4, c.z);
      group.add(beacon);
    });

    // Holographic 3D floating Letter (A or B)
    const letterGroup = new THREE.Group();
    const letterMat = new THREE.MeshBasicMaterial({ color: siteId === 'A' ? 0xffaa00 : 0x00ddff });
    if (siteId === 'A') {
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), letterMat);
      legL.rotation.z = 0.22;
      legL.position.set(-0.5, 0, 0);
      letterGroup.add(legL);

      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), letterMat);
      legR.rotation.z = -0.22;
      legR.position.set(0.5, 0, 0);
      letterGroup.add(legR);

      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.25), letterMat);
      bar.position.set(0, -0.15, 0);
      letterGroup.add(bar);
    } else {
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), letterMat);
      spine.position.set(-0.4, 0, 0);
      letterGroup.add(spine);

      const topLoop = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 16, Math.PI), letterMat);
      topLoop.rotation.z = -Math.PI / 2;
      topLoop.position.set(-0.4, 0.55, 0);
      letterGroup.add(topLoop);

      const btmLoop = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 8, 16, Math.PI), letterMat);
      btmLoop.rotation.z = -Math.PI / 2;
      btmLoop.position.set(-0.4, -0.55, 0);
      letterGroup.add(btmLoop);
    }

    letterGroup.position.set(0, 3.5, 0);
    letterGroup.name = 'floatingLetter';
    group.add(letterGroup);

    group.position.copy(pos);
    scene.add(group);
  }

  private createTowerCrane(scene: THREE.Scene, pos: THREE.Vector3, height: number, armAngle: number) {
    const craneGroup = new THREE.Group();
    craneGroup.name = 'env_crane';

    const steelMat = Materials.get('steel_girder');

    // Tower Mast (Square lattice column)
    const mast = new THREE.Mesh(new THREE.BoxGeometry(3.2, height, 3.2), steelMat);
    mast.position.set(0, height / 2, 0);
    mast.castShadow = true;
    craneGroup.add(mast);

    // Operator Cab & Slewing Ring
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.8, 4.2), Materials.get('weapon_matte_black'));
    cab.position.set(0, height + 1.4, 0);
    cab.rotation.y = armAngle;
    craneGroup.add(cab);

    // Horizontal Jib Arm (Extending forward 35m)
    const jib = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 42), steelMat);
    jib.position.set(0, height + 3.2, 16);
    jib.rotation.y = armAngle;
    jib.castShadow = true;
    craneGroup.add(jib);

    // Counter-Jib & Concrete Counterweights
    const counterJib = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 14), steelMat);
    counterJib.position.set(0, height + 3.2, -10);
    counterJib.rotation.y = armAngle;
    craneGroup.add(counterJib);

    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 4.8), Materials.get('concrete_floor'));
    counterweight.position.set(0, height + 3.2, -14);
    counterweight.rotation.y = armAngle;
    counterweight.castShadow = true;
    craneGroup.add(counterweight);

    craneGroup.position.copy(pos);
    scene.add(craneGroup);
    this.addCollider(mast, true);
  }

  private createSmokestack(scene: THREE.Scene, pos: THREE.Vector3, height: number) {
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3.4, height, 20),
      Materials.get('concrete_floor')
    );
    stack.position.set(pos.x, height / 2, pos.z);
    stack.castShadow = true;
    stack.receiveShadow = true;
    stack.name = 'env_smokestack';
    scene.add(stack);
    this.addCollider(stack, true);
  }

  private createFuelTank(scene: THREE.Scene, pos: THREE.Vector3, radius: number, height: number) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 24),
      Materials.get('weapon_metal_blued')
    );
    tank.position.set(pos.x, height / 2, pos.z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    tank.name = 'env_fueltank';
    scene.add(tank);
    this.addCollider(tank, true);
  }

  private createAlpineCabin(scene: THREE.Scene, pos: THREE.Vector3, rotY: number) {
    const cabin = new THREE.Group();
    cabin.name = 'env_cabin';

    // Main cabin walls
    const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 5.5, 9), Materials.get('container_rust'));
    walls.position.set(0, 2.75, 0);
    walls.castShadow = true;
    walls.receiveShadow = true;
    cabin.add(walls);

    // Sloped snowy roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(8.5, 4, 4), Materials.get('snow_ground'));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, 7.5, 0);
    roof.scale.set(1.4, 1.0, 1.1);
    roof.castShadow = true;
    cabin.add(roof);

    cabin.position.copy(pos);
    cabin.rotation.y = rotY;
    scene.add(cabin);
    this.addCollider(walls, true);
  }

  private createPineTree(scene: THREE.Scene, pos: THREE.Vector3, height: number) {
    const tree = new THREE.Group();
    tree.name = 'env_tree';

    // Trunk
    const trunkH = height * 0.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, trunkH, 8), Materials.get('weapon_matte_black'));
    trunk.position.set(0, trunkH / 2, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    // 3 Foliage cones with snow tint
    const tierCount = 3;
    for (let t = 0; t < tierCount; t++) {
      const coneR = (height * 0.35) * (1 - t * 0.25);
      const coneH = height * 0.4;
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 8), Materials.get('snow_ground'));
      foliage.position.set(0, trunkH + t * (coneH * 0.6), 0);
      foliage.castShadow = true;
      tree.add(foliage);
    }

    tree.position.copy(pos);
    scene.add(tree);
    this.addCollider(trunk, false);
  }

  private createBoundaryWalls(scene: THREE.Scene, halfSize: number) {
    const wallThickness = 4;
    const wallHeight = 16;
    const wallMat = Materials.get('concrete_floor');

    // North, South, East, West invisible/concrete bounding walls
    const n = new THREE.Mesh(new THREE.BoxGeometry(halfSize * 2, wallHeight, wallThickness), wallMat);
    n.position.set(0, wallHeight / 2, -halfSize);
    scene.add(n);
    this.addCollider(n, true);

    const s = new THREE.Mesh(new THREE.BoxGeometry(halfSize * 2, wallHeight, wallThickness), wallMat);
    s.position.set(0, wallHeight / 2, halfSize);
    scene.add(s);
    this.addCollider(s, true);

    const e = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, halfSize * 2), wallMat);
    e.position.set(halfSize, wallHeight / 2, 0);
    scene.add(e);
    this.addCollider(e, true);

    const w = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, halfSize * 2), wallMat);
    w.position.set(-halfSize, wallHeight / 2, 0);
    scene.add(w);
    this.addCollider(w, true);
  }

  public createWeatherSystem(scene: THREE.Scene, mapId: MapId): THREE.Points | null {
    if (mapId === 'industrial') return null;

    const count = mapId === 'night_docks' ? 2200 : 1600;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 160;
      positions[i * 3 + 1] = Math.random() * 35;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 160;

      if (mapId === 'night_docks') {
        // Rain falls rapidly with a slight wind slant
        velocities[i * 3] = 1.2;
        velocities[i * 3 + 1] = -34 - Math.random() * 12;
        velocities[i * 3 + 2] = 0.8;
      } else {
        // Snow drifts with turbulence
        velocities[i * 3] = 2.5 + Math.random() * 2.0;
        velocities[i * 3 + 1] = -4.5 - Math.random() * 2.5;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 2.0;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
      color: mapId === 'night_docks' ? 0x99bbdd : 0xffffff,
      size: mapId === 'night_docks' ? 0.18 : 0.28,
      transparent: true,
      opacity: mapId === 'night_docks' ? 0.65 : 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const weatherPoints = new THREE.Points(geometry, material);
    weatherPoints.name = 'env_weather';
    scene.add(weatherPoints);
    return weatherPoints;
  }

  public updateWeather(weatherMesh: THREE.Points | null, dt: number, mapId: MapId) {
    if (!weatherMesh || mapId === 'industrial') return;
    const posAttr = weatherMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const velAttr = weatherMesh.geometry.getAttribute('velocity') as THREE.BufferAttribute;
    if (!posAttr || !velAttr) return;

    const positions = posAttr.array as Float32Array;
    const velocities = velAttr.array as Float32Array;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;

      if (positions[i * 3 + 1] <= 0.05) {
        positions[i * 3 + 1] = 32 + Math.random() * 5;
        positions[i * 3] = (Math.random() - 0.5) * 160;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 160;
      }
    }

    posAttr.needsUpdate = true;
  }

  // Wolumetryczne promienie słoneczne (God Rays)
  public createVolumetricSunBeams(scene: THREE.Scene, origin: THREE.Vector3, target: THREE.Vector3, color: number = 0xffe8b4) {
    const dir = new THREE.Vector3().subVectors(target, origin);
    const len = dir.length();
    const beamGeo = new THREE.CylinderGeometry(2.0, 16.0, len, 16, 1, true);
    beamGeo.translate(0, len * 0.5, 0);
    beamGeo.rotateX(Math.PI * 0.5);

    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.copy(origin);
    beamMesh.lookAt(target);
    beamMesh.name = 'env_volumetric_beam';
    scene.add(beamMesh);
  }

  // Wolumetryczny stożek światła dla lamp ulicznych i dokowych
  public createVolumetricLightCone(scene: THREE.Scene, pos: THREE.Vector3, color: number) {
    const coneGeo = new THREE.CylinderGeometry(0.35, 4.8, 11.5, 16, 1, true);
    coneGeo.translate(0, -5.75, 0);

    const coneMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.copy(pos);
    cone.name = 'env_light_cone';
    scene.add(cone);
  }

  // Zoptymalizowana pula obiektów instancjonowanych (Zero-GC InstancedMesh)
  public createInstancedBarrelsAndCrates(scene: THREE.Scene, mapId: MapId) {
    const barrelCount = 16;
    const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.2, 12);
    const barrelMesh = new THREE.InstancedMesh(barrelGeo, Materials.get('container_rust'), barrelCount);
    barrelMesh.name = 'env_instanced_barrels';
    barrelMesh.castShadow = true;
    barrelMesh.receiveShadow = true;

    const crateCount = 16;
    const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    const crateMesh = new THREE.InstancedMesh(crateGeo, Materials.get('wood_crate'), crateCount);
    crateMesh.name = 'env_instanced_crates';
    crateMesh.castShadow = true;
    crateMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();

    const barrelPositions = [
      { x: -18, z: -14 }, { x: -16.8, z: -14 }, { x: -17.4, z: -15.2 },
      { x: 18, z: 12 }, { x: 19.2, z: 12 }, { x: 18.6, z: 13.2 },
      { x: -5, z: 22 }, { x: -6.2, z: 22 },
      { x: 28, z: -24 }, { x: 29.2, z: -24 },
      { x: -32, z: 8 }, { x: -33.2, z: 8 },
      { x: 8, z: -18 }, { x: 9.2, z: -18 },
      { x: -22, z: -35 }, { x: -20.8, z: -35 },
    ];

    barrelPositions.forEach((b, idx) => {
      dummy.position.set(b.x, 0.6, b.z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.updateMatrix();
      barrelMesh.setMatrixAt(idx, dummy.matrix);

      this.colliders.push({
        min: new THREE.Vector3(b.x - 0.45, 0, b.z - 0.45),
        max: new THREE.Vector3(b.x + 0.45, 1.2, b.z + 0.45),
        isCover: true,
        materialType: 'metal',
        penetrationResistance: 0.55,
      });
    });

    const cratePositions = [
      { x: -22, z: -8, y: 0 }, { x: -22, z: -9.5, y: 0 }, { x: -22, z: -8.7, y: 1.4 },
      { x: 24, z: 14, y: 0 }, { x: 24, z: 15.5, y: 0 },
      { x: -2, z: -25, y: 0 }, { x: -3.5, z: -25, y: 0 },
      { x: 12, z: 32, y: 0 }, { x: 13.5, z: 32, y: 0 },
      { x: -15, z: 38, y: 0 }, { x: -16.5, z: 38, y: 0 },
      { x: 32, z: -12, y: 0 }, { x: 33.5, z: -12, y: 0 },
      { x: -8, z: 5, y: 0 }, { x: -6.5, z: 5, y: 0 },
      { x: 14, z: -8, y: 0 },
    ];

    cratePositions.forEach((c, idx) => {
      dummy.position.set(c.x, (c.y ?? 0) + 0.7, c.z);
      dummy.rotation.set(0, (idx % 4) * (Math.PI / 6), 0);
      dummy.updateMatrix();
      crateMesh.setMatrixAt(idx, dummy.matrix);

      this.colliders.push({
        min: new THREE.Vector3(c.x - 0.7, c.y ?? 0, c.z - 0.7),
        max: new THREE.Vector3(c.x + 0.7, (c.y ?? 0) + 1.4, c.z + 0.7),
        isCover: true,
        materialType: 'wood',
        penetrationResistance: 0.35,
      });
    });

    barrelMesh.instanceMatrix.needsUpdate = true;
    crateMesh.instanceMatrix.needsUpdate = true;
    barrelMesh.computeBoundingSphere();
    crateMesh.computeBoundingSphere();

    scene.add(barrelMesh);
    scene.add(crateMesh);
  }

  // Taktyczna kładka przemysłowa (Catwalk) z pomostem kratowym i schodami
  public createTacticalCatwalk(scene: THREE.Scene, start: THREE.Vector3, length: number, rotY: number = 0) {
    const group = new THREE.Group();
    group.position.copy(start);
    group.rotation.y = rotY;

    // Platforma główna z kraty pomostowej
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.25, length),
      Materials.get('metal_panel')
    );
    platform.position.set(0, 3.5, length / 2);
    platform.castShadow = true;
    platform.receiveShadow = true;
    group.add(platform);

    // Stalowe filary podpierające
    const pillarCount = Math.floor(length / 6) + 1;
    for (let i = 0; i < pillarCount; i++) {
      const zPos = (i / (pillarCount - 1 || 1)) * length;
      const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.5, 0.35), Materials.get('steel_girder'));
      pillarL.position.set(-1.45, 1.75, zPos);
      pillarL.castShadow = true;
      group.add(pillarL);

      const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.5, 0.35), Materials.get('steel_girder'));
      pillarR.position.set(1.45, 1.75, zPos);
      pillarR.castShadow = true;
      group.add(pillarR);
    }

    // Barierki ochronne
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, length), Materials.get('weapon_metal_blued'));
    railL.position.set(-1.55, 4.15, length / 2);
    railL.castShadow = true;
    group.add(railL);

    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, length), Materials.get('weapon_metal_blued'));
    railR.position.set(1.55, 4.15, length / 2);
    railR.castShadow = true;
    group.add(railR);

    // Schody wejściowe
    const steps = 10;
    for (let s = 0; s < steps; s++) {
      const stepY = (s / steps) * 3.5;
      const stepZ = -((steps - s) * 0.55);
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 0.6), Materials.get('metal_panel'));
      stepMesh.position.set(0, stepY, stepZ);
      stepMesh.castShadow = true;
      stepMesh.receiveShadow = true;
      group.add(stepMesh);
    }

    scene.add(group);
    this.addCollider(platform, true, 'metal', 0.65);
  }

  // Taktyczne umocnienie z worków z piaskiem (Sandbag Bunker) wokół bomb site
  public createSandbagBunker(scene: THREE.Scene, center: THREE.Vector3, rotY: number = 0) {
    const bunkerGroup = new THREE.Group();
    bunkerGroup.position.copy(center);
    bunkerGroup.rotation.y = rotY;

    // Podkowa z worków z piaskiem / bloków kompozytowych
    const sandbagCoords = [
      { x: -2.8, z: 0, rot: Math.PI / 2 },
      { x: 2.8, z: 0, rot: Math.PI / 2 },
      { x: -1.6, z: -2.2, rot: 0 },
      { x: 1.6, z: -2.2, rot: 0 },
    ];

    sandbagCoords.forEach((s) => {
      // 3 warstwy worków
      for (let layer = 0; layer < 3; layer++) {
        const bag = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 0.42, 0.8),
          Materials.get('weapon_camo_desert')
        );
        bag.position.set(s.x, layer * 0.42 + 0.21, s.z);
        bag.rotation.y = s.rot;
        bag.castShadow = true;
        bag.receiveShadow = true;
        bunkerGroup.add(bag);
      }
    });

    scene.add(bunkerGroup);
    const boxCol = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.3, 4.4), Materials.get('weapon_camo_desert'));
    boxCol.position.copy(center);
    boxCol.visible = false;
    scene.add(boxCol);
    this.addCollider(boxCol, true, 'concrete', 0.0);
  }
}
