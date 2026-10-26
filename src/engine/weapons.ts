import * as THREE from 'three';
import { WeaponStats, WeaponAttachmentConfig } from '../types/game';
import { Materials } from './materials';

export const WEAPON_REGISTRY: Record<string, WeaponStats> = {
  m4a1: {
    id: 'm4a1',
    name: 'M4A1 Tactical',
    category: 'rifle',
    price: 3100,
    damage: 34,
    headshotMultiplier: 3.5,
    fireRateRPM: 720,
    magSize: 30,
    reserveAmmo: 90,
    reloadTimeSec: 2.1,
    spreadNormal: 0.024,
    spreadAds: 0.003,
    recoilVertical: 0.038,
    recoilHorizontal: 0.016,
    rangeMeters: 110,
    bulletSpeed: 880,
    killReward: 300,
  },
  awp: {
    id: 'awp',
    name: 'AWP / L115A',
    category: 'sniper',
    price: 4750,
    damage: 115,
    headshotMultiplier: 4.0,
    fireRateRPM: 48,
    magSize: 10,
    reserveAmmo: 30,
    reloadTimeSec: 3.2,
    spreadNormal: 0.12,
    spreadAds: 0.0005,
    recoilVertical: 0.14,
    recoilHorizontal: 0.03,
    rangeMeters: 350,
    bulletSpeed: 950,
    killReward: 300,
  },
  mp5: {
    id: 'mp5',
    name: 'MP5-SD Submachine',
    category: 'smg',
    price: 1500,
    damage: 26,
    headshotMultiplier: 2.8,
    fireRateRPM: 800,
    magSize: 30,
    reserveAmmo: 120,
    reloadTimeSec: 1.8,
    spreadNormal: 0.035,
    spreadAds: 0.008,
    recoilVertical: 0.025,
    recoilHorizontal: 0.018,
    rangeMeters: 65,
    bulletSpeed: 700,
    killReward: 600,
  },
  shotgun: {
    id: 'shotgun',
    name: 'SPAS-12 Breacher',
    category: 'shotgun',
    price: 1800,
    damage: 120, // Multi-pellet total
    headshotMultiplier: 2.0,
    fireRateRPM: 85,
    magSize: 8,
    reserveAmmo: 32,
    reloadTimeSec: 2.6,
    spreadNormal: 0.08,
    spreadAds: 0.045,
    recoilVertical: 0.095,
    recoilHorizontal: 0.04,
    rangeMeters: 30,
    bulletSpeed: 450,
    killReward: 900,
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle .50',
    category: 'pistol',
    price: 700,
    damage: 53,
    headshotMultiplier: 3.2,
    fireRateRPM: 270,
    magSize: 7,
    reserveAmmo: 35,
    reloadTimeSec: 1.7,
    spreadNormal: 0.038,
    spreadAds: 0.006,
    recoilVertical: 0.065,
    recoilHorizontal: 0.025,
    rangeMeters: 55,
    bulletSpeed: 620,
    killReward: 300,
  },
  p250: {
    id: 'p250',
    name: 'P250 Sidearm',
    category: 'pistol',
    price: 300,
    damage: 35,
    headshotMultiplier: 2.9,
    fireRateRPM: 400,
    magSize: 13,
    reserveAmmo: 52,
    reloadTimeSec: 1.6,
    spreadNormal: 0.042,
    spreadAds: 0.009,
    recoilVertical: 0.032,
    recoilHorizontal: 0.015,
    rangeMeters: 45,
    bulletSpeed: 550,
    killReward: 300,
  },
};

export const DEFAULT_ATTACHMENTS: WeaponAttachmentConfig = {
  sight: 'holographic',
  barrel: 'standard',
  magazine: 'standard',
  stock: 'tactical',
  grip: 'vertical',
  camo: 'military_black',
};

export class WeaponModelBuilder {
  public static buildProceduralWeapon(
    weaponId: string,
    attachments: WeaponAttachmentConfig = DEFAULT_ATTACHMENTS,
    isFirstPerson: boolean = true
  ): THREE.Group {
    const root = new THREE.Group();

    // Select camo material
    let camoMat = Materials.get('weapon_matte_black');
    if (attachments.camo === 'desert_tan') camoMat = Materials.get('weapon_camo_desert');
    else if (attachments.camo === 'arctic_snow') camoMat = Materials.get('weapon_camo_arctic');
    else if (attachments.camo === 'carbon_gold') camoMat = Materials.get('weapon_gold_elite');

    const metalMat = Materials.get('weapon_metal_blued');
    const blackMat = Materials.get('weapon_matte_black');

    if (weaponId === 'm4a1') {
      // Receiver
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 0.28), camoMat);
      receiver.position.set(0, 0, 0);
      root.add(receiver);

      // Picatinny top rail
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.015, 0.38), metalMat);
      rail.position.set(0, 0.045, 0.04);
      root.add(rail);

      // Handguard
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.055, 0.26), camoMat);
      handguard.position.set(0, 0.005, 0.26);
      root.add(handguard);

      // Barrel
      const isSuppressed = attachments.barrel === 'suppressed';
      const barrelLen = isSuppressed ? 0.22 : 0.28;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, barrelLen, 16), metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.01, 0.38 + barrelLen / 2);
      root.add(barrel);

      // Muzzle Device
      if (isSuppressed) {
        const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 16), blackMat);
        suppressor.rotation.x = Math.PI / 2;
        suppressor.position.set(0, 0.01, 0.38 + barrelLen + 0.09);
        root.add(suppressor);
      } else if (attachments.barrel === 'compensator') {
        const comp = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.065), metalMat);
        comp.position.set(0, 0.01, 0.38 + barrelLen + 0.032);
        root.add(comp);
      } else {
        const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 12), metalMat);
        muzzleBrake.rotation.x = Math.PI / 2;
        muzzleBrake.position.set(0, 0.01, 0.38 + barrelLen + 0.025);
        root.add(muzzleBrake);
      }

      // Magazine
      const isExtended = attachments.magazine === 'extended';
      const isDrum = attachments.magazine === 'drum';
      if (isDrum) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 16), blackMat);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0, -0.075, 0.06);
        root.add(drum);
      } else if (attachments.magazine === 'fast_mag') {
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.13, 0.065), camoMat);
        mag.rotation.x = 0.15;
        mag.position.set(0, -0.04 - 0.065, 0.07);
        root.add(mag);
        const pullPlate = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.02, 0.072), blackMat);
        pullPlate.position.set(0, -0.12, 0.07);
        pullPlate.rotation.x = 0.15;
        root.add(pullPlate);
      } else {
        const magHeight = isExtended ? 0.22 : 0.15;
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032, magHeight, 0.065), camoMat);
        mag.rotation.x = 0.15; // Slanted STANAG angle
        mag.position.set(0, -0.04 - magHeight / 2, 0.07);
        root.add(mag);
      }

      // Pistol grip
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.05), blackMat);
      grip.rotation.x = -0.35;
      grip.position.set(0, -0.075, -0.09);
      root.add(grip);

      // Stock
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.09, 0.22), camoMat);
      stock.position.set(0, 0.015, -0.24);
      root.add(stock);

      // Buffer tube
      const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 12), metalMat);
      bufferTube.rotation.x = Math.PI / 2;
      bufferTube.position.set(0, 0.02, -0.16);
      root.add(bufferTube);

      // Underbarrel Grip
      if (attachments.grip === 'vertical') {
        const vGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 12), blackMat);
        vGrip.position.set(0, -0.065, 0.26);
        root.add(vGrip);
      } else if (attachments.grip === 'angled') {
        const aGrip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.04, 0.12), blackMat);
        aGrip.rotation.x = -0.25;
        aGrip.position.set(0, -0.035, 0.25);
        root.add(aGrip);
      } else if (attachments.grip === 'bipod') {
        const bipodBase = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.05), blackMat);
        bipodBase.position.set(0, -0.028, 0.32);
        root.add(bipodBase);
        const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), metalMat);
        legL.rotation.x = Math.PI / 2;
        legL.position.set(-0.025, -0.04, 0.25);
        root.add(legL);
        const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), metalMat);
        legR.rotation.x = Math.PI / 2;
        legR.position.set(0.025, -0.04, 0.25);
        root.add(legR);
      }
    } else if (weaponId === 'awp') {
      // Sniper Heavy Chassis
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.72), camoMat);
      chassis.position.set(0, 0, 0);
      root.add(chassis);

      // Long Fluted Barrel
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.55, 16), metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, 0.62);
      root.add(barrel);

      // Heavy Muzzle Brake
      const brake = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.08), metalMat);
      brake.position.set(0, 0.02, 0.92);
      root.add(brake);

      // Bolt Action Handle
      const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), metalMat);
      boltHandle.rotation.z = Math.PI / 2;
      boltHandle.position.set(0.04, 0.03, -0.05);
      root.add(boltHandle);

      // Ergonomic Thumbhole Stock
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.32), camoMat);
      stock.position.set(0, -0.02, -0.42);
      root.add(stock);

      // Bi-pod folded
      const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), blackMat);
      bipodL.rotation.x = Math.PI / 2;
      bipodL.position.set(-0.03, -0.03, 0.45);
      root.add(bipodL);
      const bipodR = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), blackMat);
      bipodR.rotation.x = Math.PI / 2;
      bipodR.position.set(0.03, -0.03, 0.45);
      root.add(bipodR);
    } else if (weaponId === 'mp5') {
      // MP5 Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.065, 0.32), blackMat);
      body.position.set(0, 0, 0);
      root.add(body);

      // Integrated Suppressor Shroud
      const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 16), camoMat);
      shroud.rotation.x = Math.PI / 2;
      shroud.position.set(0, 0.01, 0.28);
      root.add(shroud);

      // Curved 9mm Magazine
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.18, 0.04), blackMat);
      mag.rotation.x = 0.25;
      mag.position.set(0, -0.08, 0.05);
      root.add(mag);

      // Pistol grip
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.04), blackMat);
      grip.rotation.x = -0.3;
      grip.position.set(0, -0.07, -0.1);
      root.add(grip);

      // Retractable Stock Rods
      const stockRod = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.015, 0.22), metalMat);
      stockRod.position.set(0, 0.015, -0.22);
      root.add(stockRod);
    } else if (weaponId === 'shotgun') {
      // Shotgun Receiver
      const recv = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.08, 0.35), blackMat);
      recv.position.set(0, 0, 0);
      root.add(recv);

      // Double Barrel & Tube
      const mainBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.48, 16), metalMat);
      mainBarrel.rotation.x = Math.PI / 2;
      mainBarrel.position.set(0, 0.025, 0.38);
      root.add(mainBarrel);

      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.42, 16), metalMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, -0.01, 0.36);
      root.add(tube);

      // Pump slide handle
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.18, 16), camoMat);
      pump.rotation.x = Math.PI / 2;
      pump.position.set(0, -0.01, 0.32);
      root.add(pump);

      // Heat shield with holes
      const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 16, 1, true, 0, Math.PI), metalMat);
      heatShield.rotation.x = Math.PI / 2;
      heatShield.rotation.z = Math.PI;
      heatShield.position.set(0, 0.03, 0.32);
      root.add(heatShield);

      // Fixed polymer stock
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.28), camoMat);
      stock.position.set(0, -0.02, -0.28);
      root.add(stock);
    } else {
      // Pistols (Deagle / P250)
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.22), weaponId === 'deagle' ? metalMat : blackMat);
      slide.position.set(0, 0.02, 0);
      root.add(slide);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.04, 0.2), camoMat);
      frame.position.set(0, -0.015, 0);
      root.add(frame);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.05), blackMat);
      grip.rotation.x = -0.3;
      grip.position.set(0, -0.075, -0.06);
      root.add(grip);
    }

    // Attach Sight to Picatinny
    this.addSightOptic(root, weaponId, attachments.sight);

    // If first person mode, attach tactical gloved operator hands!
    if (isFirstPerson) {
      this.addTacticalHands(root, weaponId, attachments);
    }

    // Calculate muzzle anchor
    const muzzleAnchor = new THREE.Object3D();
    const isSuppressed = attachments.barrel === 'suppressed';
    if (weaponId === 'm4a1') {
      muzzleAnchor.position.set(0, 0.01, isSuppressed ? 0.72 : 0.69);
    } else if (weaponId === 'awp') {
      muzzleAnchor.position.set(0, 0.02, 0.98);
    } else if (weaponId === 'mp5') {
      muzzleAnchor.position.set(0, 0.01, 0.45);
    } else if (weaponId === 'shotgun') {
      muzzleAnchor.position.set(0, 0.025, 0.64);
    } else {
      muzzleAnchor.position.set(0, 0.02, 0.13);
    }
    muzzleAnchor.name = 'muzzleAnchor';
    root.add(muzzleAnchor);

    // Wyłączenie frustum culling dla modelu broni w pierwszym planie (zapobiega znikaniu)
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.frustumCulled = false;
      }
    });

    return root;
  }

  private static addSightOptic(root: THREE.Group, weaponId: string, sightType: string) {
    const metalMat = Materials.get('weapon_metal_blued');
    const blackMat = Materials.get('weapon_matte_black');
    const glassMat = Materials.get('optic_glass');
    const redMat = Materials.get('reticle_red');
    const greenMat = Materials.get('reticle_green');

    const sightGroup = new THREE.Group();
    sightGroup.name = 'sightGroup';

    const yMount = weaponId === 'awp' ? 0.045 : (weaponId === 'deagle' || weaponId === 'p250' ? 0.045 : 0.055);
    const zMount = weaponId === 'awp' ? 0.05 : (weaponId === 'deagle' || weaponId === 'p250' ? 0.02 : 0.08);

    if (sightType === 'sniper_scope') {
      // 8x Mil-Dot High-Power Precision Sniper Scope
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.028, 0.2), blackMat);
      sightGroup.add(mount);

      const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 16), metalMat);
      scopeBody.rotation.x = Math.PI / 2;
      scopeBody.position.set(0, 0.046, 0);
      sightGroup.add(scopeBody);

      // Objective Bell (Front)
      const frontBell = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.08, 16), metalMat);
      frontBell.rotation.x = Math.PI / 2;
      frontBell.position.set(0, 0.046, 0.16);
      sightGroup.add(frontBell);

      // Sunshade tube
      const sunshade = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 16), blackMat);
      sunshade.rotation.x = Math.PI / 2;
      sunshade.position.set(0, 0.046, 0.22);
      sightGroup.add(sunshade);

      // Eyepiece (Rear)
      const rearEye = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.06, 16), blackMat);
      rearEye.rotation.x = Math.PI / 2;
      rearEye.position.set(0, 0.046, -0.16);
      sightGroup.add(rearEye);

      // Elevation Turret
      const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.025, 12), blackMat);
      elevTurret.position.set(0, 0.072, 0.02);
      sightGroup.add(elevTurret);

      // Windage Turret
      const windTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.025, 12), blackMat);
      windTurret.rotation.z = Math.PI / 2;
      windTurret.position.set(0.028, 0.046, 0.02);
      sightGroup.add(windTurret);

      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), glassMat);
      glass.position.set(0, 0.046, -0.19);
      sightGroup.add(glass);
    } else if (sightType === 'holographic') {
      // EOTech 552 Holo Sight
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.02, 0.11), blackMat);
      sightGroup.add(base);

      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.05, 0.1), metalMat);
      hood.position.set(0, 0.03, 0);
      sightGroup.add(hood);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.034, 0.005), glassMat);
      glass.position.set(0, 0.03, 0);
      sightGroup.add(glass);

      // Holographic glowing reticle ring & dot
      const reticleRing = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.0095, 24), redMat);
      reticleRing.position.set(0, 0.03, 0.004);
      sightGroup.add(reticleRing);

      const reticleDot = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 12), redMat);
      reticleDot.position.set(0, 0.03, 0.004);
      sightGroup.add(reticleDot);
    } else if (sightType === 'reddot') {
      // Micro T-1 Red Dot Reflex
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.08), blackMat);
      sightGroup.add(base);

      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.07, 16), metalMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.03, 0);
      sightGroup.add(tube);

      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), glassMat);
      glass.position.set(0, 0.03, 0);
      sightGroup.add(glass);

      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12), redMat);
      dot.position.set(0, 0.03, 0.002);
      sightGroup.add(dot);
    } else if (sightType === 'acog_scope' || weaponId === 'awp') {
      // 4x Trijicon ACOG / Precision Scope
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.025, 0.14), blackMat);
      sightGroup.add(mount);

      const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.22, 16), metalMat);
      scopeBody.rotation.x = Math.PI / 2;
      scopeBody.position.set(0, 0.042, 0);
      sightGroup.add(scopeBody);

      // Objective Bell
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.06, 16), metalMat);
      bell.rotation.x = Math.PI / 2;
      bell.position.set(0, 0.042, 0.13);
      sightGroup.add(bell);

      // Fiber optic tube on top
      const fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 8), greenMat);
      fiber.rotation.x = Math.PI / 2;
      fiber.position.set(0, 0.068, 0);
      sightGroup.add(fiber);

      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), glassMat);
      glass.position.set(0, 0.042, -0.1);
      sightGroup.add(glass);
    } else {
      // Standard iron sights
      const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.035, 0.008), metalMat);
      frontSight.position.set(0, 0.025, 0.28);
      sightGroup.add(frontSight);

      const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.025, 0.012), metalMat);
      rearSight.position.set(0, 0.02, -0.06);
      sightGroup.add(rearSight);
    }

    sightGroup.position.set(0, yMount, zMount);
    root.add(sightGroup);
  }

  private static addTacticalHands(root: THREE.Group, weaponId: string, attachments: WeaponAttachmentConfig) {
    const gloveMat = Materials.get('operative_glove');
    const handsGroup = new THREE.Group();
    handsGroup.name = 'tacticalHands';

    // Right Hand (Trigger & Pistol Grip)
    const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.35, 12), gloveMat);
    rForearm.rotation.set(-0.7, 0.25, -0.4);
    rForearm.position.set(0.12, -0.22, -0.22);
    handsGroup.add(rForearm);

    const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 0.08), gloveMat);
    rHand.rotation.set(-0.35, 0, 0);
    rHand.position.set(0.03, -0.08, -0.08);
    handsGroup.add(rHand);

    // Left Hand (Supporting Handguard / Foregrip)
    const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.38, 12), gloveMat);
    lForearm.rotation.set(0.4, -0.3, 0.65);
    lForearm.position.set(-0.16, -0.24, 0.1);
    handsGroup.add(lForearm);

    const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.075), gloveMat);
    if (attachments.grip === 'vertical') {
      lHand.position.set(0.01, -0.065, 0.26);
    } else {
      lHand.position.set(0.01, -0.015, weaponId === 'shotgun' ? 0.32 : 0.24);
    }
    handsGroup.add(lHand);

    root.add(handsGroup);
  }
}
