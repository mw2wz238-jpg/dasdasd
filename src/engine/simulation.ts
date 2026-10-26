import * as THREE from 'three';
import {
  RoundState,
  Team,
  Combatant,
  WeaponStats,
  KillfeedEntry,
  EconomyLedgerRecord,
  MapId,
  BombSite,
  PlantedBomb,
  KillstreakType,
  ClaymoreMine,
  ActiveAirStrike,
  RadioCallout,
} from '../types/game';
import { WEAPON_REGISTRY, DEFAULT_ATTACHMENTS } from './weapons';
import { CollidableBox } from './environment';
import { ParticleSystem } from './particles';
import { Sound } from './audio';
import { Materials } from './materials';
import type { ImpactVFXManager } from './vfx/ImpactVFXManager';

// Pula statycznych wektorów dla architektury Zero-GC w pętli 60Hz
const _scratchTargetPos = new THREE.Vector3();
const _scratchHeadCenter = new THREE.Vector3();
const _scratchBodyCenter = new THREE.Vector3();
const _scratchToHead = new THREE.Vector3();
const _scratchToBody = new THREE.Vector3();
const _scratchClosestH = new THREE.Vector3();
const _scratchClosestB = new THREE.Vector3();
const _botP1 = new THREE.Vector3();
const _botP2 = new THREE.Vector3();
const _botOrigin = new THREE.Vector3();
const _botDir = new THREE.Vector3();

export interface ActiveGrenade {
  id: string;
  type: 'frag' | 'smoke' | 'flashbang';
  ownerId: string;
  ownerTeam: Team;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuseSec: number;
}

export class SimulationEngine {
  public roundState: RoundState = 'BUY_PHASE';
  public roundNumber: number = 1;
  public maxRoundsToWin: number = 13;
  public scoreVanguard: number = 0;
  public scoreSyndicate: number = 0;

  public roundTimer: number = 15; // Starts with 15s buy phase
  public roundTimeLimit: number = 115; // 1m 55s live combat
  public buyPhaseDuration: number = 15;

  public combatants: Map<string, Combatant> = new Map();
  public activeGrenades: ActiveGrenade[] = [];
  public activeClaymores: { mine: ClaymoreMine; mesh: THREE.Group }[] = [];
  public activeAirStrikes: ActiveAirStrike[] = [];
  public radioCallouts: RadioCallout[] = [];
  public uavActiveUntil: number = 0;
  public killfeed: KillfeedEntry[] = [];
  public ledger: EconomyLedgerRecord[] = [];

  // Bomb & Objective State
  public bombSiteA: BombSite = { id: 'A', position: { x: -26, y: 0, z: -10 }, radius: 7.5 };
  public bombSiteB: BombSite = { id: 'B', position: { x: 26, y: 0, z: -10 }, radius: 7.5 };
  public plantedBomb: PlantedBomb | null = null;
  public bombMesh: THREE.Group | null = null;
  public plantProgress: number = 0; // 0 to 1
  public plantingCombatantId: string | null = null;
  public defuseProgress: number = 0; // 0 to 1
  public defusingCombatantId: string | null = null;
  private bombBeepTimer: number = 0;

  // Idempotency tracking to prevent duplicate round rewards or purchase replays
  private processedRoundRewards = new Set<number>();
  private processedTransactions = new Set<string>();

  public colliders: CollidableBox[] = [];
  public particles: ParticleSystem;
  public impactVFX: ImpactVFXManager | null = null;
  public scene: THREE.Scene;

  public setImpactVFXManager(mgr: ImpactVFXManager): void {
    this.impactVFX = mgr;
  }

  public playerRef: Combatant | null = null;
  public consecutiveLossesVanguard: number = 0;
  public consecutiveLossesSyndicate: number = 0;

  public roundWinner: Team | null = null;
  public mvpCombatant: Combatant | null = null;

  // 3D visual representations of AI bots
  public botMeshes: Map<string, THREE.Group> = new Map();

  // Callbacks for UI updates
  public onStateChange?: (state: RoundState) => void;
  public onKillfeed?: (entry: KillfeedEntry) => void;
  public onScoreChange?: (vg: number, sy: number) => void;
  public onHitConfirmed?: (isHeadshot: boolean, damage: number) => void;
  public onPlayerDamaged?: (currentHp: number, attackerPos: THREE.Vector3) => void;
  public onBombPlanted?: (site: 'A' | 'B') => void;
  public onBombDefused?: () => void;
  public onKillstreakAwarded?: (type: KillstreakType) => void;
  public onRadioCallout?: (callout: RadioCallout) => void;

  constructor(scene: THREE.Scene, particles: ParticleSystem) {
    this.scene = scene;
    this.particles = particles;
  }

  public initMatch(
    mapId: MapId,
    vanguardSpawns: THREE.Vector3[],
    syndicateSpawns: THREE.Vector3[],
    playerTeam: 'VANGUARD' | 'SYNDICATE' = 'VANGUARD'
  ) {
    this.combatants.clear();
    this.botMeshes.forEach((g) => this.scene.remove(g));
    this.botMeshes.clear();
    this.activeGrenades.forEach((g) => this.scene.remove(g.mesh));
    this.activeGrenades = [];
    this.killfeed = [];
    this.ledger = [];
    this.processedRoundRewards.clear();
    this.processedTransactions.clear();

    this.roundNumber = 1;
    this.scoreVanguard = 0;
    this.scoreSyndicate = 0;
    this.consecutiveLossesVanguard = 0;
    this.consecutiveLossesSyndicate = 0;

    const isPlayerVanguard = playerTeam === 'VANGUARD';
    const playerSpawn = isPlayerVanguard ? vanguardSpawns[2] : syndicateSpawns[2];

    // 1. Inicjalizacja Gracza
    const player: Combatant = {
      id: 'player_0',
      name: isPlayerVanguard ? 'Vanguard Operator' : 'Syndicate Operative',
      team: playerTeam,
      isPlayer: true,
      isAlive: true,
      hp: 100,
      maxHp: 100,
      armor: 100,
      hasHelmet: true,
      hasDefuseKit: isPlayerVanguard,
      flashbangs: 1,
      claymores: 1,
      currentStreak: 0,
      isFlashedUntil: 0,
      weapon: WEAPON_REGISTRY.m4a1,
      currentMag: WEAPON_REGISTRY.m4a1.magSize,
      reserveAmmo: WEAPON_REGISTRY.m4a1.reserveAmmo,
      kills: 0,
      deaths: 0,
      assists: 0,
      damageDealt: 0,
      mvpStars: 0,
      cash: 1000,
      pos: { x: playerSpawn.x, y: playerSpawn.y, z: playerSpawn.z },
      yaw: isPlayerVanguard ? 0 : Math.PI,
      pitch: 0,
      role: 'assaulter',
    };
    this.combatants.set(player.id, player);
    this.playerRef = player;

    // 2. Inicjalizacja drużyny Vanguard (4 boty jeśli gracz jest w Vanguard, 5 jeśli w Syndicate)
    const vgNames = ['Ghost', 'Soap', 'Roach', 'Gaz', 'Price'];
    const vgRoles: ('assaulter' | 'sniper' | 'shield' | 'assaulter')[] = ['assaulter', 'sniper', 'shield', 'assaulter'];
    const vgWeapons = [WEAPON_REGISTRY.m4a1, WEAPON_REGISTRY.awp, WEAPON_REGISTRY.shotgun, WEAPON_REGISTRY.mp5, WEAPON_REGISTRY.m4a1];
    const vgBotCount = isPlayerVanguard ? 4 : 5;

    for (let i = 0; i < vgBotCount; i++) {
      const spawnIndex = isPlayerVanguard ? (i < 2 ? i : i + 1) : i;
      const spawn = vanguardSpawns[spawnIndex];
      const bot: Combatant = {
        id: `vg_bot_${i}`,
        name: vgNames[i],
        team: 'VANGUARD',
        isPlayer: false,
        isAlive: true,
        hp: 100,
        maxHp: 100,
        armor: 100,
        hasHelmet: true,
        hasDefuseKit: i === 0,
        flashbangs: 1,
        claymores: 1,
        currentStreak: 0,
        isFlashedUntil: 0,
        weapon: vgWeapons[i],
        currentMag: vgWeapons[i].magSize,
        reserveAmmo: vgWeapons[i].reserveAmmo,
        kills: 0,
        deaths: 0,
        assists: 0,
        damageDealt: 0,
        mvpStars: 0,
        cash: 1000,
        pos: { x: spawn.x, y: spawn.y, z: spawn.z },
        yaw: 0,
        pitch: 0,
        role: vgRoles[i % vgRoles.length],
      };
      this.combatants.set(bot.id, bot);
      this.createBotVisual(bot);
    }

    // 3. Inicjalizacja drużyny Syndicate (4 boty jeśli gracz jest w Syndicate, 5 jeśli w Vanguard)
    const syNames = ['Viper', 'Nikolai', 'Razor', 'Bane', 'Juggernaut'];
    const syRoles: ('assaulter' | 'sniper' | 'shield' | 'assaulter' | 'juggernaut')[] = [
      'assaulter',
      'sniper',
      'shield',
      'assaulter',
      'juggernaut',
    ];
    const syWeapons = [
      WEAPON_REGISTRY.m4a1,
      WEAPON_REGISTRY.awp,
      WEAPON_REGISTRY.shotgun,
      WEAPON_REGISTRY.mp5,
      WEAPON_REGISTRY.m4a1,
    ];
    const syBotCount = !isPlayerVanguard ? 4 : 5;

    for (let i = 0; i < syBotCount; i++) {
      const spawnIndex = !isPlayerVanguard ? (i < 2 ? i : i + 1) : i;
      const spawn = syndicateSpawns[spawnIndex];
      const isJugg = syRoles[i] === 'juggernaut';
      const bot: Combatant = {
        id: `sy_bot_${i}`,
        name: syNames[i],
        team: 'SYNDICATE',
        isPlayer: false,
        isAlive: true,
        hp: isJugg ? 350 : 100,
        maxHp: isJugg ? 350 : 100,
        armor: isJugg ? 150 : 100,
        hasHelmet: true,
        hasDefuseKit: false,
        flashbangs: 1,
        claymores: 1,
        currentStreak: 0,
        isFlashedUntil: 0,
        weapon: syWeapons[i],
        currentMag: syWeapons[i].magSize,
        reserveAmmo: syWeapons[i].reserveAmmo,
        kills: 0,
        deaths: 0,
        assists: 0,
        damageDealt: 0,
        mvpStars: 0,
        cash: 1000,
        pos: { x: spawn.x, y: spawn.y, z: spawn.z },
        yaw: Math.PI,
        pitch: 0,
        role: syRoles[i],
      };
      this.combatants.set(bot.id, bot);
      this.createBotVisual(bot);
    }

    this.startRound(vanguardSpawns, syndicateSpawns);
  }

  private createBotVisual(bot: Combatant) {
    const group = new THREE.Group();
    group.name = `visual_${bot.id}`;

    const uniformMat = new THREE.MeshStandardMaterial({
      color: bot.team === 'VANGUARD' ? 0x223a5e : 0x541818,
      roughness: 0.7,
      metalness: 0.1,
    });
    const vestMat = new THREE.MeshStandardMaterial({
      color: bot.role === 'juggernaut' ? 0x111111 : 0x181c22,
      roughness: 0.5,
      metalness: 0.4,
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e24,
      roughness: 0.4,
      metalness: 0.6,
    });

    // Torso / Vest
    const torsoScale = bot.role === 'juggernaut' ? 1.4 : 1.0;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55 * torsoScale, 0.75 * torsoScale, 0.35 * torsoScale), vestMat);
    torso.position.y = 1.05 * torsoScale;
    torso.castShadow = true;
    group.add(torso);

    // Head & Tactical Helmet
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3 * torsoScale, 0.32 * torsoScale, 0.3 * torsoScale), uniformMat);
    head.position.y = 1.62 * torsoScale;
    head.name = 'head';
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34 * torsoScale, 0.22 * torsoScale, 0.34 * torsoScale), helmetMat);
    helmet.position.y = 1.72 * torsoScale;
    helmet.castShadow = true;
    group.add(helmet);

    // Goggles / Visor
    const visorMat = new THREE.MeshStandardMaterial({
      color: bot.role === 'sniper' ? 0xff2222 : 0x33ff66,
      emissive: bot.role === 'sniper' ? 0xaa1111 : 0x116622,
      roughness: 0.1,
      metalness: 0.9,
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24 * torsoScale, 0.08 * torsoScale, 0.06 * torsoScale), visorMat);
    visor.position.set(0, 1.63 * torsoScale, 0.17 * torsoScale);
    group.add(visor);

    // Arms
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.16 * torsoScale, 0.65 * torsoScale, 0.16 * torsoScale), uniformMat);
    lArm.position.set(-0.35 * torsoScale, 1.0 * torsoScale, 0.1 * torsoScale);
    group.add(lArm);

    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.16 * torsoScale, 0.65 * torsoScale, 0.16 * torsoScale), uniformMat);
    rArm.position.set(0.35 * torsoScale, 1.0 * torsoScale, 0.15 * torsoScale);
    group.add(rArm);

    // Legs
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2 * torsoScale, 0.75 * torsoScale, 0.2 * torsoScale), uniformMat);
    lLeg.position.set(-0.16 * torsoScale, 0.38 * torsoScale, 0);
    lLeg.castShadow = true;
    group.add(lLeg);

    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2 * torsoScale, 0.75 * torsoScale, 0.2 * torsoScale), uniformMat);
    rLeg.position.set(0.16 * torsoScale, 0.38 * torsoScale, 0);
    rLeg.castShadow = true;
    group.add(rLeg);

    // Weapon representation
    const wpnMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, bot.role === 'sniper' ? 0.9 : 0.6),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.9 })
    );
    wpnMesh.position.set(0.22, 1.05 * torsoScale, 0.35);
    wpnMesh.castShadow = true;
    group.add(wpnMesh);

    // Sniper Laser pointer
    if (bot.role === 'sniper') {
      const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
      const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 45, 8), laserMat);
      laser.rotation.x = Math.PI / 2;
      laser.position.set(0.22, 1.08, 22.5);
      laser.name = 'sniperLaser';
      group.add(laser);
    }

    group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
    this.scene.add(group);
    this.botMeshes.set(bot.id, group);
  }

  public createC4Mesh(pos: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.name = 'prop_c4';

    // C4 explosive block
    const c4Mat = new THREE.MeshStandardMaterial({ color: 0x8a7050, roughness: 0.8, metalness: 0.1 });
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.2 });
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.55), c4Mat);
    block.position.y = 0.09;
    block.castShadow = true;
    group.add(block);

    // Black electrical tape bands
    const tape1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.185, 0.08), tapeMat);
    tape1.position.set(0, 0.09, -0.14);
    group.add(tape1);
    const tape2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.185, 0.08), tapeMat);
    tape2.position.set(0, 0.09, 0.14);
    group.add(tape2);

    // Receiver unit with digital display
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.22), Materials.get('weapon_matte_black'));
    receiver.position.set(0, 0.21, 0);
    group.add(receiver);

    // Glowing blinking red LED beacon
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), ledMat);
    led.position.set(0.08, 0.25, 0.06);
    led.name = 'c4_led';
    group.add(led);

    // Beeping light pulse
    const pointLight = new THREE.PointLight(0xff0000, 2.5, 6);
    pointLight.position.set(0, 0.35, 0);
    pointLight.name = 'c4_light';
    group.add(pointLight);

    group.position.copy(pos);
    this.scene.add(group);
    return group;
  }

  public startPlanting(combatantId: string, site: 'A' | 'B'): boolean {
    if (this.roundState !== 'LIVE_COMBAT' || this.plantedBomb) return false;
    const c = this.combatants.get(combatantId);
    if (!c || !c.isAlive) return false;

    const targetSite = site === 'A' ? this.bombSiteA : this.bombSiteB;
    const dist = Math.hypot(c.pos.x - targetSite.position.x, c.pos.z - targetSite.position.z);
    if (dist > targetSite.radius) return false;

    this.plantingCombatantId = combatantId;
    return true;
  }

  public cancelPlanting(): void {
    this.plantingCombatantId = null;
    this.plantProgress = 0;
  }

  public plantBomb(combatantId: string, site: 'A' | 'B', pos: THREE.Vector3): void {
    if (this.plantedBomb) return;
    this.plantedBomb = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      site,
      plantedAt: Date.now(),
      timerSec: 40.0,
      defuseProgress: 0,
      defusingCombatantId: null,
      isDefused: false,
      isExploded: false,
    };
    this.roundState = 'BOMB_PLANTED';
    this.roundTimer = 40.0;
    this.plantProgress = 0;
    this.plantingCombatantId = null;

    // Spawn 3D C4 prop
    this.bombMesh = this.createC4Mesh(new THREE.Vector3(pos.x, 0, pos.z));

    Sound.playBombPlanted();
    if (this.onBombPlanted) this.onBombPlanted(site);
    if (this.onStateChange) this.onStateChange(this.roundState);
  }

  public startDefusing(combatantId: string): boolean {
    if (this.roundState !== 'BOMB_PLANTED' || !this.plantedBomb || this.plantedBomb.isDefused || this.plantedBomb.isExploded) {
      return false;
    }
    const c = this.combatants.get(combatantId);
    if (!c || !c.isAlive || c.team !== 'VANGUARD') return false;

    const bPos = this.plantedBomb.position;
    const dist = Math.hypot(c.pos.x - bPos.x, c.pos.z - bPos.z);
    if (dist > 3.5) return false;

    this.defusingCombatantId = combatantId;
    this.plantedBomb.defusingCombatantId = combatantId;
    return true;
  }

  public cancelDefusing(): void {
    this.defusingCombatantId = null;
    this.defuseProgress = 0;
    if (this.plantedBomb) {
      this.plantedBomb.defusingCombatantId = null;
      this.plantedBomb.defuseProgress = 0;
    }
  }

  public startRound(vanguardSpawns: THREE.Vector3[], syndicateSpawns: THREE.Vector3[]) {
    this.roundState = 'BUY_PHASE';
    this.roundTimer = this.buyPhaseDuration;
    this.roundWinner = null;
    this.mvpCombatant = null;

    // Reset bomb state
    this.plantedBomb = null;
    if (this.bombMesh) {
      this.scene.remove(this.bombMesh);
      this.bombMesh = null;
    }
    this.plantProgress = 0;
    this.plantingCombatantId = null;
    this.defuseProgress = 0;
    this.defusingCombatantId = null;
    this.bombBeepTimer = 0;

    // Clear tactical entities from scene
    this.activeClaymores.forEach((c) => this.scene.remove(c.mesh));
    this.activeClaymores = [];
    this.activeGrenades.forEach((g) => this.scene.remove(g.mesh));
    this.activeGrenades = [];
    this.activeAirStrikes = [];

    Sound.playRoundStart();

    // Reset combatants for next round
    let vgIdx = 0;
    let syIdx = 0;

    this.combatants.forEach((c) => {
      c.isAlive = true;
      c.hp = c.role === 'juggernaut' ? 350 : 100;
      c.maxHp = c.hp;
      c.currentMag = c.weapon.magSize;
      c.reserveAmmo = c.weapon.reserveAmmo;
      c.deathImpulse = undefined;
      c.isFlashedUntil = 0;
      if (c.flashbangs === undefined) c.flashbangs = 1;
      if (c.claymores === undefined) c.claymores = 1;

      // Position reset to team spawns
      if (c.team === 'VANGUARD') {
        const sp = vanguardSpawns[vgIdx % vanguardSpawns.length];
        c.pos = { x: sp.x, y: sp.y, z: sp.z };
        c.yaw = 0;
        vgIdx++;
      } else {
        const sp = syndicateSpawns[syIdx % syndicateSpawns.length];
        c.pos = { x: sp.x, y: sp.y, z: sp.z };
        c.yaw = Math.PI;
        syIdx++;
      }

      // Update 3D mesh and reset ragdoll rotation
      const mesh = this.botMeshes.get(c.id);
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(c.pos.x, 0, c.pos.z);
        mesh.rotation.set(0, c.yaw, 0);
      }
    });

    if (this.onStateChange) this.onStateChange(this.roundState);
  }

  public buyItem(
    playerId: string,
    itemId: string,
    price: number,
    type: 'BUY_WEAPON' | 'BUY_ARMOR' | 'BUY_GRENADE' | 'BUY_TACTICAL' | 'BUY_DEFUSE_KIT'
  ): boolean {
    // Only allowed during BUY_PHASE!
    if (this.roundState !== 'BUY_PHASE') return false;

    const combatant = this.combatants.get(playerId);
    if (!combatant || !combatant.isAlive) return false;

    // Check funds
    if (combatant.cash < price) return false;

    // Atomic transaction
    const txId = `tx_${this.roundNumber}_${playerId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (this.processedTransactions.has(txId)) return false; // Duplicate protection
    this.processedTransactions.add(txId);

    combatant.cash -= price;

    if (type === 'BUY_WEAPON') {
      const weapon = WEAPON_REGISTRY[itemId];
      if (weapon) {
        combatant.weapon = weapon;
        combatant.currentMag = weapon.magSize;
        combatant.reserveAmmo = weapon.reserveAmmo;
      }
    } else if (type === 'BUY_ARMOR') {
      combatant.armor = 100;
      combatant.hasHelmet = true;
    } else if (type === 'BUY_DEFUSE_KIT') {
      combatant.hasDefuseKit = true;
    } else if (type === 'BUY_TACTICAL') {
      if (itemId === 'flashbang') {
        combatant.flashbangs = Math.min(2, combatant.flashbangs + 1);
      } else if (itemId === 'claymore') {
        combatant.claymores = Math.min(2, combatant.claymores + 1);
      }
    }

    this.ledger.push({
      transactionId: txId,
      playerId,
      type,
      amount: -price,
      timestamp: Date.now(),
      resultingBalance: combatant.cash,
    });

    Sound.playUIBeep(true);
    return true;
  }

  public validateAndExecuteShot(
    shooterId: string,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    spread: number
  ): { hit: boolean; isHeadshot: boolean; victimId?: string; damageDealt?: number } {
    // Reject shot if not LIVE_COMBAT
    if (this.roundState !== 'LIVE_COMBAT') {
      return { hit: false, isHeadshot: false };
    }

    const shooter = this.combatants.get(shooterId);
    if (!shooter || !shooter.isAlive || shooter.currentMag <= 0) {
      return { hit: false, isHeadshot: false };
    }

    // Authoritative ammo consumption
    shooter.currentMag--;

    const shotDir = this.applyWeaponSpread(direction, spread);

    // Check line of sight with active smoke clouds
    const maxRange = shooter.weapon.rangeMeters;
    const endPoint = origin.clone().addScaledVector(shotDir, maxRange);

    if (this.particles.isLineBlockedBySmoke(origin, endPoint)) {
      // Bullet penetrating smoke has 75% reduced accuracy and chance to strike
      if (Math.random() < 0.7) {
        return { hit: false, isHeadshot: false };
      }
    }

    // Check environment wall collisions first
    const { closestWallDist, closestCollider, closestIntersection } = this.raycastWalls(origin, shotDir, maxRange);

    const isPenetrable = Boolean(closestCollider && (closestCollider.penetrationResistance ?? 0) > 0);
    const penResistance = isPenetrable ? (closestCollider!.penetrationResistance ?? 0.45) : 1.0;

    // Check combatants
    const { victim: closestVictim, hitDistance: closestDist, isHeadshot, isWallbang } = this.findHitscanVictim(
      shooter,
      origin,
      shotDir,
      closestWallDist,
      isPenetrable,
      maxRange
    );

    if (closestVictim) {
      const damageDealt = this.applyShotDamage(
        shooter,
        closestVictim,
        shotDir,
        origin,
        closestDist,
        isHeadshot,
        isWallbang,
        closestIntersection,
        closestCollider,
        penResistance
      );

      return { hit: true, isHeadshot, victimId: closestVictim.id, damageDealt };
    }

    // Hit environment only
    if (closestWallDist < Infinity && closestIntersection) {
      const hitPt = closestIntersection.point;
      const normal = closestIntersection.face ? closestIntersection.face.normal : new THREE.Vector3(0, 1, 0);

      // System tagowania powierzchni materiałowych
      const matType = closestCollider?.materialType ||
        (closestIntersection.object.userData?.materialType as string) ||
        'concrete';

      this.particles.spawnImpactParticles(hitPt, normal, matType);
      if (this.impactVFX) {
        this.impactVFX.spawnImpact(hitPt, normal, shotDir, matType);
      }
      Sound.playImpactSound(matType, hitPt, this.playerRef?.pos);
    }

    return { hit: false, isHeadshot: false };
  }

  // Randomizes the shot direction within the weapon's current spread cone.
  private applyWeaponSpread(direction: THREE.Vector3, spread: number): THREE.Vector3 {
    const shotDir = direction.clone();
    shotDir.x += (Math.random() - 0.5) * spread;
    shotDir.y += (Math.random() - 0.5) * spread;
    shotDir.z += (Math.random() - 0.5) * spread;
    shotDir.normalize();
    return shotDir;
  }

  // Raycasts the shot against level geometry and resolves which CollidableBox,
  // if any, was the closest thing hit (used for wallbang penetration math).
  public raycastWalls(
    origin: THREE.Vector3,
    shotDir: THREE.Vector3,
    maxRange: number
  ): { closestWallDist: number; closestCollider: CollidableBox | null; closestIntersection: THREE.Intersection | null } {
    const raycaster = new THREE.Raycaster(origin, shotDir, 0.1, maxRange);
    const wallMeshes = this.colliders.map((c) => c.mesh).filter((m): m is THREE.Object3D => Boolean(m));
    const wallIntersects = raycaster.intersectObjects(wallMeshes, true);

    let closestWallDist = Infinity;
    let closestCollider: CollidableBox | null = null;
    let closestIntersection: THREE.Intersection | null = null;

    if (wallIntersects.length > 0) {
      closestIntersection = wallIntersects[0];
      closestWallDist = closestIntersection.distance;
      for (const col of this.colliders) {
        if (col.mesh === closestIntersection.object || (col.mesh && col.mesh.children.includes(closestIntersection.object))) {
          closestCollider = col;
          break;
        }
      }
    }

    return { closestWallDist, closestCollider, closestIntersection };
  }

  // Tests the shot against every enemy combatant's head/body hitboxes and
  // returns the nearest one actually struck (if any), honoring wallbangs.
  private findHitscanVictim(
    shooter: Combatant,
    origin: THREE.Vector3,
    shotDir: THREE.Vector3,
    closestWallDist: number,
    isPenetrable: boolean,
    maxRange: number
  ): { victim: Combatant | null; hitDistance: number; isHeadshot: boolean; isWallbang: boolean } {
    let closestVictim: Combatant | null = null;
    let closestDist = isPenetrable ? maxRange : closestWallDist;
    let isHeadshot = false;
    let isWallbang = false;

    this.combatants.forEach((target) => {
      if (target.id === shooter.id || !target.isAlive || target.team === shooter.team) return;

      _scratchTargetPos.set(target.pos.x, target.pos.y, target.pos.z);
      _scratchHeadCenter.set(target.pos.x, target.pos.y + 1.6, target.pos.z);
      _scratchBodyCenter.set(target.pos.x, target.pos.y + 0.9, target.pos.z);

      // Test head (Zero-GC)
      _scratchToHead.subVectors(_scratchHeadCenter, origin);
      const projH = _scratchToHead.dot(shotDir);
      if (projH > 0 && projH < closestDist) {
        _scratchClosestH.copy(origin).addScaledVector(shotDir, projH);
        if (_scratchClosestH.distanceTo(_scratchHeadCenter) < 0.24) {
          closestVictim = target;
          closestDist = projH;
          isHeadshot = true;
          isWallbang = projH > closestWallDist;
          return;
        }
      }

      // Test body (Zero-GC)
      _scratchToBody.subVectors(_scratchBodyCenter, origin);
      const projB = _scratchToBody.dot(shotDir);
      if (projB > 0 && projB < closestDist) {
        _scratchClosestB.copy(origin).addScaledVector(shotDir, projB);
        if (_scratchClosestB.distanceTo(_scratchBodyCenter) < 0.45) {
          closestVictim = target;
          closestDist = projB;
          isHeadshot = false;
          isWallbang = projB > closestWallDist;
        }
      }
    });

    return { victim: closestVictim, hitDistance: closestDist, isHeadshot, isWallbang };
  }

  // Applies damage (headshot multiplier, wallbang attenuation, armor
  // absorption), fires hit-feedback callbacks/sound/particles, and routes
  // into resolveKill() if the victim's HP reaches zero. Returns the final
  // raw damage number dealt, after all reductions.
  public applyShotDamage(
    shooter: Combatant,
    victim: Combatant,
    shotDir: THREE.Vector3,
    origin: THREE.Vector3,
    hitDistance: number,
    isHeadshot: boolean,
    isWallbang: boolean,
    closestIntersection: THREE.Intersection | null,
    closestCollider: CollidableBox | null,
    penResistance: number
  ): number {
    let rawDmg = shooter.weapon.damage;
    if (isHeadshot) {
      rawDmg *= shooter.weapon.headshotMultiplier;
    }

    // Wallbang penetration damage attenuation
    if (isWallbang && closestIntersection && closestCollider) {
      rawDmg *= 1.0 - penResistance;
      Sound.playWallbang();
      const wallNorm = closestIntersection.face ? closestIntersection.face.normal : new THREE.Vector3(0, 1, 0);
      this.particles.wallbangImpact(closestIntersection.point, wallNorm, closestCollider.materialType ?? 'wood');
    }

    // Armor absorption
    if (victim.armor > 0) {
      const absorbed = rawDmg * 0.35;
      victim.armor = Math.max(0, victim.armor - absorbed);
      rawDmg = rawDmg * 0.65;
    }

    victim.hp = Math.max(0, victim.hp - rawDmg);
    shooter.damageDealt += rawDmg;

    // Particle blood
    const hitPt = origin.clone().addScaledVector(shotDir, hitDistance);
    this.particles.spawnBlood(hitPt, shotDir, isHeadshot ? 35 : 20);
    if (this.impactVFX) {
      this.impactVFX.spawnImpact(hitPt, shotDir.clone().negate(), shotDir, 'flesh', isHeadshot);
    }

    // Hit confirmation
    if (shooter.isPlayer && this.onHitConfirmed) {
      this.onHitConfirmed(isHeadshot, Math.round(rawDmg));
      Sound.playHitmarker(isHeadshot);
    }

    // Player feedback if player was damaged
    if (victim.isPlayer && this.onPlayerDamaged) {
      this.onPlayerDamaged(victim.hp, new THREE.Vector3(shooter.pos.x, shooter.pos.y, shooter.pos.z));
    }

    // Check death
    if (victim.hp <= 0) {
      this.resolveKill(shooter, victim, shotDir, isHeadshot);
    }

    return rawDmg;
  }

  // Handles everything that happens the instant a combatant is eliminated:
  // streak bookkeeping, killstreak milestone callouts, ragdoll impulse,
  // cash reward, killfeed entry, death-pose mesh animation, round-end check.
  private resolveKill(shooter: Combatant, victim: Combatant, shotDir: THREE.Vector3, isHeadshot: boolean): void {
    victim.isAlive = false;
    victim.deaths++;
    victim.currentStreak = 0; // reset victim streak
    shooter.kills++;
    shooter.currentStreak++;

    // Killstreak Milestones check
    if (shooter.currentStreak === 3) {
      if (this.onKillstreakAwarded) this.onKillstreakAwarded('UAV');
      this.triggerCallout(shooter, 'uav_online', `${shooter.name}: UAV gotowe do użycia!`);
    } else if (shooter.currentStreak === 5) {
      if (this.onKillstreakAwarded) this.onKillstreakAwarded('AIRSTRIKE');
      this.triggerCallout(shooter, 'airstrike_incoming', `${shooter.name}: Nalot taktyczny gotowy!`);
    } else if (shooter.currentStreak === 7) {
      if (this.onKillstreakAwarded) this.onKillstreakAwarded('PREDATOR');
      this.triggerCallout(shooter, 'uav_online', `${shooter.name}: Pocisk Predator uzbrojony!`);
    }

    // Ragdoll knockback impulse
    const impactForce = shooter.weapon.category === 'shotgun' ? 9.5 : (shooter.weapon.category === 'sniper' ? 8.0 : 4.5);
    victim.deathImpulse = {
      x: shotDir.x * impactForce,
      y: 2.2,
      z: shotDir.z * impactForce,
    };

    // Add kill reward
    const reward = shooter.weapon.killReward;
    shooter.cash += reward;

    const kfEntry: KillfeedEntry = {
      id: `kf_${Date.now()}_${Math.random()}`,
      killerName: shooter.name,
      killerTeam: shooter.team,
      victimName: victim.name,
      victimTeam: victim.team,
      weaponName: shooter.weapon.name,
      isHeadshot,
      timestamp: Date.now(),
    };
    this.killfeed.unshift(kfEntry);
    if (this.killfeed.length > 6) this.killfeed.pop();
    if (this.onKillfeed) this.onKillfeed(kfEntry);

    // Animate dead bot mesh
    const bMesh = this.botMeshes.get(victim.id);
    if (bMesh) {
      bMesh.rotation.x = -Math.PI / 2;
      bMesh.position.y = 0.2;
    }

    this.checkRoundEndConditions();
  }

  public throwGrenade(
    ownerId: string,
    type: 'frag' | 'smoke' | 'flashbang',
    origin: THREE.Vector3,
    direction: THREE.Vector3
  ) {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return;

    const owner = this.combatants.get(ownerId);
    if (!owner || !owner.isAlive) return;

    if (type === 'flashbang') {
      if (owner.flashbangs <= 0) return;
      owner.flashbangs--;
      this.triggerCallout(owner, 'flashbang', `${owner.name}: Rzucam granat błyskowy!`);
    } else if (type === 'frag') {
      this.triggerCallout(owner, 'grenade', `${owner.name}: Granat odłamkowy w drodze!`);
    }

    // Build 3D grenade mesh
    const geo = new THREE.SphereGeometry(0.12, 12, 12);
    const color = type === 'frag' ? 0x224422 : (type === 'flashbang' ? 0xcccccc : 0x446688);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const throwVel = direction.clone().multiplyScalar(22);
    throwVel.y += 4.5; // Arc trajectory

    this.activeGrenades.push({
      id: `grenade_${Date.now()}_${Math.random()}`,
      type,
      ownerId,
      ownerTeam: owner.team,
      mesh,
      pos: origin.clone(),
      vel: throwVel,
      fuseSec: type === 'frag' ? 3.0 : (type === 'flashbang' ? 1.6 : 2.5),
    });
  }

  public plantClaymore(ownerId: string, pos: THREE.Vector3, yaw: number): boolean {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return false;
    const owner = this.combatants.get(ownerId);
    if (!owner || !owner.isAlive || owner.claymores <= 0) return false;
    owner.claymores--;

    // Build 3D Claymore mine
    const group = new THREE.Group();
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x3b5323, roughness: 0.6, metalness: 0.1 });
    const blackMat = Materials.get('weapon_matte_black');

    // Curved front face case
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.09), greenMat);
    body.position.set(0, 0.15, 0);
    body.castShadow = true;
    group.add(body);

    // Front sensor lenses
    const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    lensL.rotation.x = Math.PI / 2;
    lensL.position.set(-0.08, 0.18, 0.05);
    group.add(lensL);
    const lensR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    lensR.rotation.x = Math.PI / 2;
    lensR.position.set(0.08, 0.18, 0.05);
    group.add(lensR);

    // Wire tripod scissor legs
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), blackMat);
    legL.position.set(-0.12, 0.07, 0);
    legL.rotation.z = 0.25;
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), blackMat);
    legR.position.set(0.12, 0.07, 0);
    legR.rotation.z = -0.25;
    group.add(legR);

    // Laser tripwire visual indicators
    const tripGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.08, 0.18, 0.06),
      new THREE.Vector3(-0.6, 0.05, 2.5),
      new THREE.Vector3(0.08, 0.18, 0.06),
      new THREE.Vector3(0.6, 0.05, 2.5),
    ]);
    const tripLines = new THREE.LineSegments(
      tripGeo,
      new THREE.LineBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.55 })
    );
    group.add(tripLines);

    group.position.copy(pos);
    group.rotation.y = yaw;
    this.scene.add(group);

    Sound.playClaymoreArm();
    this.activeClaymores.push({
      mine: {
        id: `claymore_${Date.now()}_${Math.random()}`,
        ownerId,
        ownerTeam: owner.team,
        pos: { x: pos.x, y: pos.y, z: pos.z },
        yaw,
        isArmed: false,
        armedAt: Date.now() + 1500, // Arms in 1.5s
      },
      mesh: group,
    });

    this.triggerCallout(owner, 'grenade', `${owner.name}: Mina Claymore rozstawiona!`);
    return true;
  }

  public activateKillstreak(
    combatantId: string,
    type: KillstreakType,
    targetPos?: { x: number; z: number }
  ): boolean {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return false;
    const c = this.combatants.get(combatantId);
    if (!c || !c.isAlive) return false;

    if (type === 'UAV') {
      if (c.currentStreak < 3) return false;
      this.uavActiveUntil = Date.now() + 25000;
      Sound.playUAVScan();
      this.triggerCallout(c, 'uav_online', `${c.name}: Zwiad satelitarny UAV aktywny!`);
      return true;
    } else if (type === 'AIRSTRIKE') {
      if (c.currentStreak < 5) return false;
      const tX = targetPos ? targetPos.x : (c.team === 'VANGUARD' ? 0 : 0);
      const tZ = targetPos ? targetPos.z : (c.team === 'VANGUARD' ? -15 : 15);
      this.activeAirStrikes.push({
        id: `strike_${Date.now()}`,
        targetPos: { x: tX, z: tZ },
        ownerTeam: c.team,
        startTime: Date.now(),
        strikesCompleted: 0,
        totalStrikes: 3,
      });
      Sound.playAirstrikeJet();
      this.triggerCallout(c, 'airstrike_incoming', `${c.name}: Nalot taktyczny wezwany na sektor!`);
      return true;
    } else if (type === 'PREDATOR') {
      if (c.currentStreak < 7) return false;
      Sound.playPredatorRocket();
      const enemyTeam = c.team === 'VANGUARD' ? 'SYNDICATE' : 'VANGUARD';
      const enemies = Array.from(this.combatants.values()).filter((e) => e.isAlive && e.team === enemyTeam);
      const target = enemies[0];
      const strikePos = target ? new THREE.Vector3(target.pos.x, 0, target.pos.z) : new THREE.Vector3(0, 0, 0);

      setTimeout(() => {
        this.particles.spawnExplosion(strikePos);
        Sound.playExplosion(strikePos, this.playerRef?.pos);
        this.combatants.forEach((victim) => {
          if (!victim.isAlive || victim.team === c.team) return;
          const dist = Math.hypot(victim.pos.x - strikePos.x, victim.pos.z - strikePos.z);
          if (dist < 14) {
            victim.hp = 0;
            victim.isAlive = false;
            victim.deaths++;
            c.kills++;
            c.cash += 300;
          }
        });
        this.checkRoundEndConditions();
      }, 1200);

      this.triggerCallout(c, 'uav_online', `${c.name}: Pocisk Predator uderza w cel!`);
      return true;
    }

    return false;
  }

  public triggerCallout(
    speaker: Combatant,
    type: 'grenade' | 'flashbang' | 'reloading' | 'enemy_spotted' | 'bomb_planted' | 'bomb_defused' | 'uav_online' | 'airstrike_incoming',
    text: string
  ) {
    const callout: RadioCallout = {
      id: `callout_${Date.now()}_${Math.random()}`,
      speakerName: speaker.name,
      team: speaker.team,
      type,
      text,
      timestamp: Date.now(),
    };
    this.radioCallouts.unshift(callout);
    if (this.radioCallouts.length > 5) this.radioCallouts.pop();
    Sound.playRadioCallout(type);
    if (this.onRadioCallout) this.onRadioCallout(callout);
  }

  public checkRoundEndConditions(): boolean {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return false;

    let vgAlive = 0;
    let syAlive = 0;

    this.combatants.forEach((c) => {
      if (c.isAlive) {
        if (c.team === 'VANGUARD') vgAlive++;
        else syAlive++;
      }
    });

    if (this.roundState === 'BOMB_PLANTED') {
      // If bomb is planted, eliminating Syndicate is NOT enough - Vanguard MUST defuse before 40s!
      if (vgAlive === 0) {
        this.endRound('SYNDICATE', 'VANGUARD ELIMINATED — BOMB IS ACTIVE');
        return true;
      }
      return false;
    }

    if (syAlive === 0) {
      this.endRound('VANGUARD', 'SYNDICATE ELIMINATED');
      return true;
    } else if (vgAlive === 0) {
      this.endRound('SYNDICATE', 'VANGUARD ELIMINATED');
      return true;
    }

    return false;
  }

  public endRound(winner: Team, reason: string) {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return;

    this.roundState = 'ROUND_END';
    this.roundWinner = winner;

    if (winner === 'VANGUARD') {
      this.scoreVanguard++;
      this.consecutiveLossesVanguard = 0;
      this.consecutiveLossesSyndicate++;
      Sound.playRoundWon();
    } else {
      this.scoreSyndicate++;
      this.consecutiveLossesSyndicate = 0;
      this.consecutiveLossesVanguard++;
      Sound.playRoundLost();
    }

    if (this.onScoreChange) this.onScoreChange(this.scoreVanguard, this.scoreSyndicate);
    if (this.onStateChange) this.onStateChange(this.roundState);

    // Pick MVP based on kills & damage this round
    let highestMvpScore = -1;
    this.combatants.forEach((c) => {
      if (c.team === winner) {
        const score = c.kills * 100 + c.damageDealt;
        if (score > highestMvpScore) {
          highestMvpScore = score;
          this.mvpCombatant = c;
        }
      }
    });
    if (this.mvpCombatant) {
      this.mvpCombatant.mvpStars++;
    }

    // Process Idempotent Rewards after a short delay
    setTimeout(() => {
      this.processRoundRewards(winner);
    }, 2000);
  }

  private processRoundRewards(winner: Team) {
    if (this.processedRoundRewards.has(this.roundNumber)) {
      return; // Already rewarded!
    }
    this.processedRoundRewards.add(this.roundNumber);
    this.roundState = 'REWARDS';

    const winBonus = 3250;
    const baseLoss = 1400;

    this.combatants.forEach((c) => {
      let reward = 0;
      let txType: 'ROUND_WIN' | 'ROUND_LOSS' = 'ROUND_LOSS';

      if (c.team === winner) {
        reward = winBonus;
        txType = 'ROUND_WIN';
      } else {
        const lossStreak = c.team === 'VANGUARD' ? this.consecutiveLossesVanguard : this.consecutiveLossesSyndicate;
        reward = Math.min(3400, baseLoss + (lossStreak - 1) * 500);
      }

      c.cash = Math.min(16000, c.cash + reward);

      this.ledger.push({
        transactionId: `reward_r${this.roundNumber}_${c.id}`,
        playerId: c.id,
        type: txType,
        amount: reward,
        timestamp: Date.now(),
        resultingBalance: c.cash,
      });
    });

    if (this.onStateChange) this.onStateChange(this.roundState);

    // Check Match End
    if (this.scoreVanguard >= this.maxRoundsToWin || this.scoreSyndicate >= this.maxRoundsToWin) {
      setTimeout(() => {
        this.roundState = 'MATCH_END';
        if (this.onStateChange) this.onStateChange(this.roundState);
      }, 4000);
    } else {
      // Transition to next round after 5s
      setTimeout(() => {
        this.roundNumber++;
        this.startRound(
          [
            new THREE.Vector3(-18, 1.75, 48),
            new THREE.Vector3(-9, 1.75, 52),
            new THREE.Vector3(0, 1.75, 50),
            new THREE.Vector3(9, 1.75, 52),
            new THREE.Vector3(18, 1.75, 48),
          ],
          [
            new THREE.Vector3(-18, 1.75, -48),
            new THREE.Vector3(-9, 1.75, -52),
            new THREE.Vector3(0, 1.75, -50),
            new THREE.Vector3(9, 1.75, -52),
            new THREE.Vector3(18, 1.75, -48),
          ]
        );
      }, 5000);
    }
  }

  public update(dt: number) {
    // 1. Round Timer Countdown
    if (this.roundState === 'BUY_PHASE') {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.roundState = 'EQUIPMENT_LOCK';
        this.roundTimer = 2.0; // 2s lock
        if (this.onStateChange) this.onStateChange(this.roundState);
      }
    } else if (this.roundState === 'EQUIPMENT_LOCK') {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.roundState = 'LIVE_COMBAT';
        this.roundTimer = this.roundTimeLimit;
        if (this.onStateChange) this.onStateChange(this.roundState);
      }
    } else if (this.roundState === 'LIVE_COMBAT') {
      this.roundTimer -= dt;

      // Handle AI bot bomb planting attempt if Syndicate near bombsite
      if (this.plantingCombatantId) {
        this.plantProgress += dt / 3.5;
        if (this.plantProgress >= 1.0) {
          const planter = this.combatants.get(this.plantingCombatantId);
          if (planter && planter.isAlive) {
            const site: 'A' | 'B' =
              Math.hypot(planter.pos.x - this.bombSiteA.position.x, planter.pos.z - this.bombSiteA.position.z) <
              this.bombSiteA.radius
                ? 'A'
                : 'B';
            this.plantBomb(planter.id, site, new THREE.Vector3(planter.pos.x, 0, planter.pos.z));
          }
        }
      }

      if (this.roundTimer <= 0) {
        // Time expired without plant! Defenders (Vanguard) win!
        this.endRound('VANGUARD', 'ROUND TIME EXPIRED - DEFENDERS WIN');
      }
    } else if (this.roundState === 'BOMB_PLANTED' && this.plantedBomb) {
      this.plantedBomb.timerSec -= dt;
      this.roundTimer = Math.max(0, this.plantedBomb.timerSec);

      // Accelerating beep
      const beepInterval =
        this.plantedBomb.timerSec > 20 ? 1.0 : this.plantedBomb.timerSec > 10 ? 0.5 : this.plantedBomb.timerSec > 4 ? 0.25 : 0.12;
      this.bombBeepTimer += dt;
      if (this.bombBeepTimer >= beepInterval) {
        this.bombBeepTimer = 0;
        Sound.playBombBeep(this.plantedBomb.timerSec < 10);
      }

      // Handle Defusing
      if (this.defusingCombatantId) {
        const defuser = this.combatants.get(this.defusingCombatantId);
        if (!defuser || !defuser.isAlive) {
          this.cancelDefusing();
        } else {
          // Defuse kit reduces time from 5.0s to 2.5s
          const defuseDuration = defuser.hasDefuseKit ? 2.5 : 5.0;
          this.defuseProgress += dt / defuseDuration;
          this.plantedBomb.defuseProgress = this.defuseProgress;
          if (Math.random() < 0.15) Sound.playDefuseWireSnip();

          if (this.defuseProgress >= 1.0) {
            this.plantedBomb.isDefused = true;
            Sound.playBombDefused();
            if (this.onBombDefused) this.onBombDefused();
            this.triggerCallout(defuser, 'bomb_defused', `${defuser.name}: Ładunek C4 rozbrojony! Teren zabezpieczony.`);
            this.endRound('VANGUARD', 'BOMBA ROZBROJONA — VANGUARD WYGRYWA!');
          }
        }
      }

      // Handle Bomb Detonation
      if (this.plantedBomb.timerSec <= 0 && !this.plantedBomb.isDefused) {
        this.plantedBomb.isExploded = true;
        const bPos = new THREE.Vector3(this.plantedBomb.position.x, 0.4, this.plantedBomb.position.z);
        this.particles.spawnExplosion(bPos);
        Sound.playExplosion(bPos, this.playerRef?.pos);

        // Blast radius elimination
        this.combatants.forEach((c) => {
          if (!c.isAlive) return;
          const dist = Math.hypot(c.pos.x - bPos.x, c.pos.z - bPos.z);
          if (dist < 35) {
            c.hp = 0;
            c.isAlive = false;
            c.deaths++;
          }
        });

        this.endRound('SYNDICATE', 'BOMBA ZDETONOWANA — SYNDICATE WYGRYWA!');
      }
    }

    // 2. Grenade Physics & Explosion
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuseSec -= dt;

      g.vel.y -= 18 * dt; // Gravity
      g.pos.x += g.vel.x * dt;
      g.pos.y += g.vel.y * dt;
      g.pos.z += g.vel.z * dt;

      // Floor bounce
      if (g.pos.y < 0.1) {
        g.pos.y = 0.1;
        g.vel.y = -g.vel.y * 0.45;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }

      g.mesh.position.copy(g.pos);

      if (g.fuseSec <= 0) {
        // Detonate!
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);

        if (g.type === 'frag') {
          this.particles.spawnExplosion(g.pos);
          Sound.playExplosion({ x: g.pos.x, y: g.pos.y, z: g.pos.z }, this.playerRef?.pos);

          // Damage radius 8.5m
          const blastRadius = 8.5;
          this.combatants.forEach((c) => {
            if (!c.isAlive) return;
            const cPos = new THREE.Vector3(c.pos.x, c.pos.y, c.pos.z);
            const dist = cPos.distanceTo(g.pos);
            if (dist < blastRadius) {
              const falloff = 1 - dist / blastRadius;
              const dmg = 95 * falloff;
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp <= 0) {
                c.isAlive = false;
                c.deaths++;
                const owner = this.combatants.get(g.ownerId);
                if (owner) {
                  owner.kills++;
                  owner.cash += 300;
                }
                this.checkRoundEndConditions();
              }
            }
          });
        } else if (g.type === 'flashbang') {
          this.particles.flashbangBurst(g.pos);
          Sound.playTinnitus(3.8);

          // Flashbang blindness check within 26m
          this.combatants.forEach((c) => {
            if (!c.isAlive) return;
            const cPos = new THREE.Vector3(c.pos.x, 1.6, c.pos.z);
            const dist = cPos.distanceTo(g.pos);
            if (dist < 26) {
              const toFlash = g.pos.clone().sub(cPos).normalize();
              const { closestWallDist } = this.raycastWalls(cPos, toFlash, dist);
              if (closestWallDist >= dist - 0.4) {
                // LOS clear to flashbang
                const falloff = Math.max(0.2, 1 - dist / 26);
                const durationMs = Math.round(falloff * 3800);
                c.isFlashedUntil = Date.now() + durationMs;
              }
            }
          });
        } else {
          // Smoke Grenade
          this.particles.spawnSmokeGrenade(g.pos, 18);
          Sound.playSmokeHiss();
        }
      }
    }

    // 3. Active Claymores monitoring and detonation
    for (let i = this.activeClaymores.length - 1; i >= 0; i--) {
      const { mine, mesh } = this.activeClaymores[i];
      if (Date.now() < mine.armedAt) continue;
      mine.isArmed = true;

      const forward = new THREE.Vector3(Math.sin(mine.yaw), 0, Math.cos(mine.yaw));
      let triggered = false;

      this.combatants.forEach((c) => {
        if (!c.isAlive || c.team === mine.ownerTeam) return;
        const toEnemy = new THREE.Vector3(c.pos.x - mine.pos.x, 0, c.pos.z - mine.pos.z);
        const dist = toEnemy.length();
        if (dist <= 3.2) {
          toEnemy.normalize();
          const dot = forward.dot(toEnemy);
          if (dot > 0.5) { // 60 degree forward detection cone
            triggered = true;
          }
        }
      });

      if (triggered) {
        Sound.playClaymoreTrigger();
        this.scene.remove(mesh);
        this.activeClaymores.splice(i, 1);

        setTimeout(() => {
          const pos = new THREE.Vector3(mine.pos.x, mine.pos.y, mine.pos.z);
          this.particles.claymoreExplosion(pos, forward);
          this.particles.spawnExplosion(pos);
          Sound.playExplosion(pos, this.playerRef?.pos);

          this.combatants.forEach((c) => {
            if (!c.isAlive) return;
            const toEnemy = new THREE.Vector3(c.pos.x - mine.pos.x, 0, c.pos.z - mine.pos.z);
            const dist = toEnemy.length();
            if (dist <= 5.5) {
              toEnemy.normalize();
              const dot = forward.dot(toEnemy);
              if (dot > 0.35) {
                const dmg = 140 * (1 - dist / 6.0);
                c.hp = Math.max(0, c.hp - dmg);
                if (c.hp <= 0) {
                  c.isAlive = false;
                  c.deaths++;
                  const owner = this.combatants.get(mine.ownerId);
                  if (owner) {
                    owner.kills++;
                    owner.cash += 300;
                  }
                  this.checkRoundEndConditions();
                }
              }
            }
          });
        }, 100);
      }
    }

    // 4. Active Airstrikes cluster bombing
    for (let i = this.activeAirStrikes.length - 1; i >= 0; i--) {
      const strike = this.activeAirStrikes[i];
      const elapsed = Date.now() - strike.startTime;
      const nextStrikeTargetTime = (strike.strikesCompleted + 1) * 1100;
      if (elapsed >= nextStrikeTargetTime) {
        strike.strikesCompleted++;
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetZ = (Math.random() - 0.5) * 16;
        const impactPos = new THREE.Vector3(strike.targetPos.x + offsetX, 0, strike.targetPos.z + offsetZ);

        this.particles.spawnExplosion(impactPos);
        Sound.playExplosion(impactPos, this.playerRef?.pos);

        this.combatants.forEach((c) => {
          if (!c.isAlive || c.team === strike.ownerTeam) return;
          const dist = Math.hypot(c.pos.x - impactPos.x, c.pos.z - impactPos.z);
          if (dist < 11) {
            const dmg = 135 * (1 - dist / 12);
            c.hp = Math.max(0, c.hp - dmg);
            if (c.hp <= 0) {
              c.isAlive = false;
              c.deaths++;
              this.checkRoundEndConditions();
            }
          }
        });

        if (strike.strikesCompleted >= strike.totalStrikes) {
          this.activeAirStrikes.splice(i, 1);
        }
      }
    }

    // 5. Kinematic Ragdoll physics for eliminated bots
    this.combatants.forEach((c) => {
      if (!c.isAlive && c.deathImpulse) {
        c.pos.x += c.deathImpulse.x * dt;
        c.pos.z += c.deathImpulse.z * dt;
        c.deathImpulse.y -= 14.0 * dt; // Gravity
        c.pos.y = Math.max(0.15, (c.pos.y || 1.0) + c.deathImpulse.y * dt);

        c.deathImpulse.x *= Math.exp(-4.5 * dt);
        c.deathImpulse.z *= Math.exp(-4.5 * dt);

        if (c.pos.y <= 0.16) {
          c.deathImpulse.y = 0;
          if (Math.hypot(c.deathImpulse.x, c.deathImpulse.z) < 0.2) {
            c.deathImpulse = undefined; // Settled
          }
        }

        const mesh = this.botMeshes.get(c.id);
        if (mesh) {
          mesh.position.set(c.pos.x, c.pos.y, c.pos.z);
          mesh.rotation.x = THREE.MathUtils.damp(mesh.rotation.x, -Math.PI / 2, 7, dt);
        }
      }
    });

    // 6. AI Bot Behavior Simulation (at 60Hz tick)
    if (this.roundState === 'LIVE_COMBAT' || this.roundState === 'BOMB_PLANTED') {
      this.updateBotsAI(dt);
    }
  }

  // Pushes a bot out of any overlapping wall/cover collider, mirroring
  // PlayerController.resolveCollisions so bots stop walking through geometry.
  private resolveBotCollision(pos: { x: number; y: number; z: number }) {
    const halfWidth = 0.45;
    const bodyMin = 0.1;
    const bodyMax = 2.2;
    for (const c of this.colliders) {
      if (
        pos.x + halfWidth > c.min.x &&
        pos.x - halfWidth < c.max.x &&
        pos.z + halfWidth > c.min.z &&
        pos.z - halfWidth < c.max.z &&
        bodyMax > c.min.y &&
        bodyMin < c.max.y
      ) {
        const dx1 = Math.abs(pos.x + halfWidth - c.min.x);
        const dx2 = Math.abs(pos.x - halfWidth - c.max.x);
        const dz1 = Math.abs(pos.z + halfWidth - c.min.z);
        const dz2 = Math.abs(pos.z - halfWidth - c.max.z);

        const minOverlap = Math.min(dx1, dx2, dz1, dz2);
        if (minOverlap === dx1) pos.x = c.min.x - halfWidth;
        else if (minOverlap === dx2) pos.x = c.max.x + halfWidth;
        else if (minOverlap === dz1) pos.z = c.min.z - halfWidth;
        else if (minOverlap === dz2) pos.z = c.max.z + halfWidth;
      }
    }
  }

  private updateBotsAI(dt: number) {
    const enemies = Array.from(this.combatants.values()).filter((c) => c.isAlive && c.team === 'SYNDICATE');
    const allies = Array.from(this.combatants.values()).filter((c) => c.isAlive && c.team === 'VANGUARD');

    for (const bot of enemies) {
      // If bomb not planted, Syndicate bots push towards BombSite A or B to plant!
      if (this.roundState === 'LIVE_COMBAT' && !this.plantedBomb) {
        const targetSite = this.bombSiteA;
        const distToSite = Math.hypot(bot.pos.x - targetSite.position.x, bot.pos.z - targetSite.position.z);
        if (distToSite < targetSite.radius && !this.plantingCombatantId) {
          // Start planting C4!
          this.startPlanting(bot.id, 'A');
        }
      }

      // Find closest ally
      let target: Combatant | null = null;
      let minDist = Infinity;
      for (const a of allies) {
        const dist = Math.hypot(a.pos.x - bot.pos.x, a.pos.z - bot.pos.z);
        if (dist < minDist) {
          minDist = dist;
          target = a;
        }
      }

      if (!target) continue;

      const tPos = target.pos;
      const dx = tPos.x - bot.pos.x;
      const dz = tPos.z - bot.pos.z;
      const angle = Math.atan2(dx, dz);
      bot.yaw = angle;

      const botGroup = this.botMeshes.get(bot.id);
      if (botGroup) {
        botGroup.rotation.y = angle;
      }

      // Check if target is blocked by smoke (Zero-GC)
      _botP1.set(bot.pos.x, 1.5, bot.pos.z);
      _botP2.set(tPos.x, 1.5, tPos.z);
      const smokeBlocked = this.particles.isLineBlockedBySmoke(_botP1, _botP2);

      // Movement: Push towards target if far, strafe if close
      const speed = bot.role === 'juggernaut' ? 2.8 : 4.6;
      if (minDist > 18) {
        bot.pos.x += Math.sin(angle) * speed * dt;
        bot.pos.z += Math.cos(angle) * speed * dt;
      } else if (minDist < 6) {
        // Back off or strafe
        bot.pos.x -= Math.sin(angle) * (speed * 0.5) * dt;
        bot.pos.z -= Math.cos(angle) * (speed * 0.5) * dt;
      }

      this.resolveBotCollision(bot.pos);

      if (botGroup) {
        botGroup.position.set(bot.pos.x, 0, bot.pos.z);
      }

      // Shooting logic (Zero-GC)
      if (!smokeBlocked && minDist < bot.weapon.rangeMeters) {
        // Weapon cadence check
        const fireDelay = 60 / bot.weapon.fireRateRPM;
        if (Math.random() < dt / fireDelay && Math.random() < 0.25) {
          _botOrigin.set(bot.pos.x, 1.45, bot.pos.z);
          _botDir.set(dx, tPos.y - bot.pos.y, dz).normalize();
          this.validateAndExecuteShot(bot.id, _botOrigin, _botDir, bot.weapon.spreadNormal * 1.5);
          Sound.playGunshot(bot.weapon.category, false, bot.pos, this.playerRef?.pos);
        }
      }
    }

    // Friendly AI bots push forward towards syndicate
    for (const bot of allies) {
      if (bot.isPlayer) continue;

      let target: Combatant | null = null;
      let minDist = Infinity;
      for (const e of enemies) {
        const dist = Math.hypot(e.pos.x - bot.pos.x, e.pos.z - bot.pos.z);
        if (dist < minDist) {
          minDist = dist;
          target = e;
        }
      }

      if (!target) continue;

      const tPos = target.pos;
      const dx = tPos.x - bot.pos.x;
      const dz = tPos.z - bot.pos.z;
      const angle = Math.atan2(dx, dz);
      bot.yaw = angle;

      const botGroup = this.botMeshes.get(bot.id);
      if (botGroup) {
        botGroup.rotation.y = angle;
      }

      const speed = 4.4;
      if (minDist > 16) {
        bot.pos.x += Math.sin(angle) * speed * dt;
        bot.pos.z += Math.cos(angle) * speed * dt;
      }

      this.resolveBotCollision(bot.pos);

      if (botGroup) {
        botGroup.position.set(bot.pos.x, 0, bot.pos.z);
      }

      _botP1.set(bot.pos.x, 1.5, bot.pos.z);
      _botP2.set(tPos.x, 1.5, tPos.z);
      const smokeBlocked = this.particles.isLineBlockedBySmoke(_botP1, _botP2);

      if (!smokeBlocked && minDist < bot.weapon.rangeMeters) {
        const fireDelay = 60 / bot.weapon.fireRateRPM;
        if (Math.random() < dt / fireDelay && Math.random() < 0.22) {
          _botOrigin.set(bot.pos.x, 1.45, bot.pos.z);
          _botDir.set(dx, tPos.y - bot.pos.y, dz).normalize();
          this.validateAndExecuteShot(bot.id, _botOrigin, _botDir, bot.weapon.spreadNormal * 1.5);
          Sound.playGunshot(bot.weapon.category, false, bot.pos, this.playerRef?.pos);
        }
      }
    }
  }
}
