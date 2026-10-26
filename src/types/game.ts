export type RoundState = 
  | 'WARMUP'
  | 'BUY_PHASE'
  | 'EQUIPMENT_LOCK'
  | 'LIVE_COMBAT'
  | 'BOMB_PLANTED'
  | 'ROUND_END'
  | 'REWARDS'
  | 'MATCH_END';

export type Team = 'VANGUARD' | 'SYNDICATE'; // Blue (Counter-Terror / Defense) vs Red (Terror / Attack)

export type MapId = 'industrial' | 'winter_village' | 'night_docks';

export interface BombSite {
  id: 'A' | 'B';
  position: { x: number; y: number; z: number };
  radius: number;
}

export interface PlantedBomb {
  position: { x: number; y: number; z: number };
  site: 'A' | 'B';
  plantedAt: number;
  timerSec: number;
  defuseProgress: number; // 0 to 1
  defusingCombatantId: string | null;
  isDefused: boolean;
  isExploded: boolean;
}

export interface WeaponAttachmentConfig {
  sight: 'ironsight' | 'reddot' | 'holographic' | 'acog_scope' | 'sniper_scope';
  barrel: 'standard' | 'suppressed' | 'heavy_long' | 'compensator';
  magazine: 'standard' | 'extended' | 'fast_mag' | 'drum';
  stock: 'tactical' | 'heavy' | 'lightweight';
  grip: 'none' | 'vertical' | 'angled' | 'bipod';
  camo: 'military_black' | 'desert_tan' | 'arctic_snow' | 'carbon_gold' | 'digital_camo';
}

export interface WeaponStats {
  id: string;
  name: string;
  category: 'rifle' | 'sniper' | 'smg' | 'shotgun' | 'pistol';
  price: number;
  damage: number;
  headshotMultiplier: number;
  fireRateRPM: number;
  magSize: number;
  reserveAmmo: number;
  reloadTimeSec: number;
  spreadNormal: number;
  spreadAds: number;
  recoilVertical: number;
  recoilHorizontal: number;
  rangeMeters: number;
  bulletSpeed: number;
  killReward: number;
}

export interface PlayerInventory {
  primary: WeaponStats | null;
  secondary: WeaponStats;
  primaryAttachments: WeaponAttachmentConfig;
  knife: boolean;
  armor: number; // 0 - 100
  helmet: boolean;
  fragGrenades: number;
  smokeGrenades: number;
  flashbangs: number;
  claymores: number;
  hasDefuseKit: boolean;
  cash: number;
}

export type KillstreakType = 'UAV' | 'AIRSTRIKE' | 'PREDATOR';

export interface Combatant {
  id: string;
  name: string;
  team: Team;
  isPlayer: boolean;
  isAlive: boolean;
  hp: number;
  maxHp: number;
  armor: number;
  hasHelmet: boolean;
  hasDefuseKit: boolean;
  flashbangs: number;
  claymores: number;
  currentStreak: number;
  isFlashedUntil: number; // timestamp ms
  deathImpulse?: { x: number; y: number; z: number };
  weapon: WeaponStats;
  currentMag: number;
  reserveAmmo: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  mvpStars: number;
  cash: number;
  pos: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  role: 'assaulter' | 'sniper' | 'shield' | 'juggernaut';
}

export interface ClaymoreMine {
  id: string;
  ownerId: string;
  ownerTeam: Team;
  pos: { x: number; y: number; z: number };
  yaw: number;
  isArmed: boolean;
  armedAt: number;
}

export interface ActiveAirStrike {
  id: string;
  targetPos: { x: number; z: number };
  ownerTeam: Team;
  startTime: number;
  strikesCompleted: number;
  totalStrikes: number;
}

export interface RadioCallout {
  id: string;
  speakerName: string;
  team: Team;
  text: string;
  type: 'grenade' | 'flashbang' | 'reloading' | 'enemy_spotted' | 'bomb_planted' | 'bomb_defused' | 'uav_online' | 'airstrike_incoming';
  timestamp: number;
}

export interface KillfeedEntry {
  id: string;
  killerName: string;
  killerTeam: Team;
  victimName: string;
  victimTeam: Team;
  weaponName: string;
  isHeadshot: boolean;
  timestamp: number;
}

export interface SmokeCloud {
  id: string;
  position: { x: number; y: number; z: number };
  radius: number;
  createdAt: number;
  durationSec: number;
}

export interface EconomyLedgerRecord {
  transactionId: string;
  playerId: string;
  type: 'BUY_WEAPON' | 'BUY_ARMOR' | 'BUY_GRENADE' | 'BUY_TACTICAL' | 'BUY_DEFUSE_KIT' | 'ROUND_WIN' | 'ROUND_LOSS' | 'KILL_REWARD';
  amount: number;
  timestamp: number;
  resultingBalance: number;
}
