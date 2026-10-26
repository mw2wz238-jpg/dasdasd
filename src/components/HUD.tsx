import React from 'react';
import { RoundState, Combatant, KillfeedEntry, Team, RadioCallout } from '../types/game';
import { Shield, Heart, DollarSign, Crosshair as CrosshairIcon, Eye, Wrench, Radio, Zap } from 'lucide-react';

interface HUDProps {
  player: Combatant | null;
  roundState: RoundState;
  roundTimer: number;
  roundNumber: number;
  scoreVanguard: number;
  scoreSyndicate: number;
  killfeed: KillfeedEntry[];
  combatants: Combatant[];
  isAds: boolean;
  hitmarker: { active: boolean; isHeadshot: boolean } | null;
  damageDirection: number | null; // Angle in radians
  onOpenBuyMenu: () => void;
  spectatorTarget: Combatant | null;
  onCycleSpectator: () => void;
  zoneName: string;
  bombSiteA?: { x: number; z: number };
  bombSiteB?: { x: number; z: number };
  isNearSiteA?: boolean;
  isNearSiteB?: boolean;
  isNearPlantedBomb?: boolean;
  plantProgress?: number;
  defuseProgress?: number;
  onInspectWeapon?: () => void;
  radioCallouts?: RadioCallout[];
  uavActive?: boolean;
  isPredatorActive?: boolean;
  predatorAltitude?: number;
  killstreakBanner?: string | null;
  bloomStrength?: number;
  onBloomStrengthChange?: (val: number) => void;
}

export const HUD: React.FC<HUDProps> = ({
  player,
  roundState,
  roundTimer,
  roundNumber,
  scoreVanguard,
  scoreSyndicate,
  killfeed,
  combatants,
  isAds,
  hitmarker,
  damageDirection,
  onOpenBuyMenu,
  spectatorTarget,
  onCycleSpectator,
  zoneName,
  bombSiteA,
  bombSiteB,
  isNearSiteA = false,
  isNearSiteB = false,
  isNearPlantedBomb = false,
  plantProgress = 0,
  defuseProgress = 0,
  onInspectWeapon,
  radioCallouts = [],
  uavActive = false,
  isPredatorActive = false,
  predatorAltitude = 65,
  killstreakBanner = null,
  bloomStrength = 0.45,
  onBloomStrengthChange,
}) => {
  const isAlive = player?.isAlive ?? false;
  const isSniperScope = isAds && (player?.weapon.category === 'sniper' || player?.weapon.id === 'awp');

  // Format timer
  const minutes = Math.floor(roundTimer / 60);
  const seconds = Math.floor(roundTimer % 60);
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Round phase description
  let phaseText = 'ZABIJ DRUŻYNĘ / CHROŃ STREFY A & B';
  let phaseBadgeColor = 'bg-red-950/80 text-red-300 border-red-500/50';
  if (roundState === 'BUY_PHASE') {
    phaseText = `FAZA ZAKUPÓW [B]: ${seconds}s`;
    phaseBadgeColor = 'bg-amber-950/80 text-amber-300 border-amber-500/50';
  } else if (roundState === 'EQUIPMENT_LOCK') {
    phaseText = 'PRZYGOTOWANIE DO AKCJI...';
    phaseBadgeColor = 'bg-blue-950/80 text-blue-300 border-blue-500/50';
  } else if (roundState === 'BOMB_PLANTED') {
    phaseText = `⚠️ BOMBA PODŁOŻONA — ZEGAR C4: ${Math.round(roundTimer)}s`;
    phaseBadgeColor = 'bg-red-600 text-white border-red-300 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]';
  } else if (roundState === 'ROUND_END' || roundState === 'REWARDS') {
    phaseText = 'RUNDA ZAKOŃCZONA';
    phaseBadgeColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50';
  } else if (roundState === 'MATCH_END') {
    phaseText = 'MECZ ZAKOŃCZONY';
    phaseBadgeColor = 'bg-yellow-950/80 text-yellow-300 border-yellow-500/50';
  }

  // Radar points
  const radarScale = 0.8;
  const activeEnemies = combatants.filter((c) => c.isAlive && c.team !== player?.team);
  const activeAllies = combatants.filter((c) => c.isAlive && c.team === player?.team && !c.isPlayer);

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10 font-sans text-white overflow-hidden">
      {/* Flashbang Retinal Whiteout Overlay with Exponential Decay */}
      {player && player.isFlashedUntil && player.isFlashedUntil > Date.now() && (
        <div
          style={{
            opacity: Math.min(1.0, Math.pow((player.isFlashedUntil - Date.now()) / 3800, 0.72)),
          }}
          className="fixed inset-0 bg-white pointer-events-none z-50 transition-opacity duration-75 flex items-center justify-center backdrop-blur-2xl"
        >
          <div className="text-zinc-500 font-mono text-xs tracking-widest uppercase opacity-30 select-none">
            ••• RETINAL FLASH AFTERIMAGE •••
          </div>
        </div>
      )}

      {/* Predator Drone FLIR Thermal Camera HUD */}
      {isPredatorActive && (
        <div className="fixed inset-0 z-40 pointer-events-none bg-emerald-950/20 backdrop-contrast-125 flex flex-col justify-between p-8 font-mono">
          {/* Top FLIR Banner */}
          <div className="flex justify-between items-start border-b border-emerald-500/50 pb-3 bg-black/65 px-6 py-2.5 rounded-lg shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
              <span className="text-emerald-400 font-black tracking-widest text-sm">
                FLIR OPTICAL THERMAL DRONE • AGM-114 PREDATOR
              </span>
            </div>
            <div className="text-emerald-400 text-xs tracking-widest">
              ALT: <span className="text-white text-lg font-black tabular-nums">{Math.max(0, Math.round(predatorAltitude))} M</span>
            </div>
          </div>

          {/* Center Targeting Bracket */}
          <div className="relative self-center flex items-center justify-center w-72 h-72 border border-emerald-500/40 rounded-xl">
            <div className="w-14 h-14 border-2 border-red-500 animate-pulse flex items-center justify-center">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
            </div>
            <span className="absolute -bottom-8 text-[11px] tracking-widest text-emerald-400 font-black">
              TARGET LOCK [STEROWANIE MYSZKĄ / LPM = TURBO]
            </span>
          </div>

          {/* Bottom telemetry */}
          <div className="flex justify-between items-center text-xs text-emerald-400 border-t border-emerald-500/50 pt-3 bg-black/65 px-6 py-2.5 rounded-lg shadow-2xl">
            <span>PRĘDKOŚĆ OPADANIA: 35 M/S</span>
            <span className="text-red-400 font-black tracking-wider animate-pulse">WARHEAD ARMED • UDERZENIE W CEL</span>
            <span>FLIR 1.0X MONO</span>
          </div>
        </div>
      )}

      {/* Killstreak Banner notification */}
      {killstreakBanner && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 px-6 py-2 bg-amber-500 text-zinc-950 font-black tracking-widest text-sm rounded-lg shadow-[0_0_25px_rgba(245,158,11,0.8)] border border-amber-300 animate-bounce uppercase">
          ⚡ {killstreakBanner}
        </div>
      )}

      {/* 1. TOP HEADER - SCOREBOARD & ROUND TIMER */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="flex items-center gap-4 bg-zinc-950/90 border border-zinc-800/90 rounded-md px-6 py-2 shadow-2xl backdrop-blur-sm">
          {/* Blue Team (Vanguard) */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-black tracking-wider text-blue-400">VANGUARD</span>
            <span className="text-2xl font-black tabular-nums text-blue-400 bg-blue-950/60 px-2.5 py-0.5 rounded border border-blue-500/30">
              {scoreVanguard}
            </span>
          </div>

          {/* Time & Round */}
          <div className="flex flex-col items-center px-4 border-x border-zinc-700/60">
            <span className="text-xl font-black tracking-widest tabular-nums text-zinc-100">
              {formattedTime}
            </span>
            <span className="text-[10px] tracking-widest text-zinc-400 font-bold uppercase">
              RUNDA {roundNumber} / 24
            </span>
          </div>

          {/* Red Team (Syndicate) */}
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tabular-nums text-red-400 bg-red-950/60 px-2.5 py-0.5 rounded border border-red-500/30">
              {scoreSyndicate}
            </span>
            <span className="text-xs font-black tracking-wider text-red-400">SYNDICATE</span>
          </div>
        </div>

        {/* Phase Badge */}
        <div className={`mt-1.5 px-3 py-0.5 text-[11px] font-black tracking-widest uppercase rounded border ${phaseBadgeColor}`}>
          {phaseText}
        </div>
      </div>

      {/* 2. TOP LEFT - TACTICAL CIRCULAR RADAR */}
      <div className="absolute top-5 left-5 flex flex-col gap-1">
        <div className="relative w-36 h-36 rounded-full bg-zinc-950/85 border-2 border-emerald-500/40 shadow-2xl overflow-hidden">
          {/* Compass Grid */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-px bg-emerald-500/20" />
            <div className="h-full w-px bg-emerald-500/20" />
            <div className="w-20 h-20 rounded-full border border-emerald-500/20" />
          </div>

          {/* Cardinal N/E/S/W */}
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-black text-emerald-400/80">N</span>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black text-emerald-400/80">S</span>
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-emerald-400/80">W</span>
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-emerald-400/80">E</span>

          {/* Center Player Arrow */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center">
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-emerald-400 shadow-sm" />
          </div>

          {/* Bomb Site A Radar Marker */}
          {bombSiteA && player && (
            (() => {
              const dx = (bombSiteA.x - player.pos.x) * radarScale;
              const dz = (bombSiteA.z - player.pos.z) * radarScale;
              const dist = Math.hypot(dx, dz);
              const angle = Math.atan2(dz, dx);
              const clampedDist = Math.min(62, dist);
              const screenX = 72 + Math.cos(angle) * clampedDist;
              const screenY = 72 + Math.sin(angle) * clampedDist;
              return (
                <div
                  style={{ left: `${screenX}px`, top: `${screenY}px` }}
                  className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500 text-[10px] font-black flex items-center justify-center text-black border border-white shadow-md font-sans"
                >
                  A
                </div>
              );
            })()
          )}

          {/* Bomb Site B Radar Marker */}
          {bombSiteB && player && (
            (() => {
              const dx = (bombSiteB.x - player.pos.x) * radarScale;
              const dz = (bombSiteB.z - player.pos.z) * radarScale;
              const dist = Math.hypot(dx, dz);
              const angle = Math.atan2(dz, dx);
              const clampedDist = Math.min(62, dist);
              const screenX = 72 + Math.cos(angle) * clampedDist;
              const screenY = 72 + Math.sin(angle) * clampedDist;
              return (
                <div
                  style={{ left: `${screenX}px`, top: `${screenY}px` }}
                  className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400 text-[10px] font-black flex items-center justify-center text-black border border-white shadow-md font-sans"
                >
                  B
                </div>
              );
            })()
          )}

          {/* Allied Blips */}
          {activeAllies.map((a) => {
            if (!player) return null;
            const dx = (a.pos.x - player.pos.x) * radarScale;
            const dz = (a.pos.z - player.pos.z) * radarScale;
            const screenX = 72 + dx;
            const screenY = 72 + dz;
            if (Math.hypot(dx, dz) > 65) return null;
            return (
              <div
                key={a.id}
                style={{ left: `${screenX}px`, top: `${screenY}px` }}
                className="absolute w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400 border border-blue-200 shadow-[0_0_6px_rgba(96,165,250,0.8)]"
              />
            );
          })}

          {/* Enemy Blips */}
          {activeEnemies.map((e) => {
            if (!player) return null;
            const dx = (e.pos.x - player.pos.x) * radarScale;
            const dz = (e.pos.z - player.pos.z) * radarScale;
            const screenX = 72 + dx;
            const screenY = 72 + dz;
            if (Math.hypot(dx, dz) > 65) return null;
            return (
              <div
                key={e.id}
                style={{ left: `${screenX}px`, top: `${screenY}px` }}
                className="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 border border-white shadow-[0_0_8px_rgba(239,68,68,1)] animate-pulse"
              />
            );
          })}
          {/* Rotating UAV radar sweep line */}
          {uavActive && (
            <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-spin opacity-50 [border-right-color:transparent] [border-bottom-color:transparent]" />
          )}
        </div>
        <div className="text-[10px] tracking-wider font-bold text-zinc-400 px-1 uppercase flex items-center justify-between">
          <span>{zoneName}</span>
          {uavActive && (
            <span className="text-[9px] font-black text-emerald-400 animate-pulse flex items-center gap-1">
              <Radio className="w-2.5 h-2.5" /> UAV AKTYWNY
            </span>
          )}
        </div>

        {/* Radio Callouts Feed */}
        {radioCallouts && radioCallouts.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2 max-w-[280px]">
            {radioCallouts.slice(0, 3).map((callout) => (
              <div
                key={callout.id}
                className="flex items-center gap-2 bg-zinc-950/85 border border-zinc-700/80 px-2.5 py-1 rounded shadow-lg text-xs backdrop-blur-sm"
              >
                <Radio className="w-3 h-3 text-amber-400 shrink-0" />
                <span className={`font-black text-[11px] ${callout.team === 'VANGUARD' ? 'text-blue-400' : 'text-red-400'}`}>
                  {callout.speakerName}:
                </span>
                <span className="text-zinc-200 text-[10px] truncate">{callout.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Killstreak Status Dock */}
      <div className="absolute right-5 top-24 flex flex-col gap-2 items-end">
        <div className="text-[10px] tracking-widest font-black text-zinc-400 uppercase bg-zinc-950/80 px-2.5 py-1 rounded border border-zinc-800 backdrop-blur-sm">
          SERIA: <span className="text-amber-400 font-mono text-xs">{player?.currentStreak ?? 0}</span> ZABÓJSTW
        </div>

        {/* 3: UAV */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-black transition-all ${
            (player?.currentStreak ?? 0) >= 3
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
              : 'bg-zinc-950/70 border-zinc-800 text-zinc-500'
          }`}
        >
          <span className="bg-zinc-800 px-1 py-0.5 rounded font-mono text-[10px] text-zinc-300">[3]</span>
          <span>ZWIAD UAV</span>
          <span className="text-[10px] opacity-70">3 KILLS</span>
        </div>

        {/* 4: AIRSTRIKE */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-black transition-all ${
            (player?.currentStreak ?? 0) >= 5
              ? 'bg-amber-950/90 border-amber-500 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
              : 'bg-zinc-950/70 border-zinc-800 text-zinc-500'
          }`}
        >
          <span className="bg-zinc-800 px-1 py-0.5 rounded font-mono text-[10px] text-zinc-300">[4]</span>
          <span>NALOT MYŚLIWSKI</span>
          <span className="text-[10px] opacity-70">5 KILLS</span>
        </div>

        {/* 5: PREDATOR */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-black transition-all ${
            (player?.currentStreak ?? 0) >= 7
              ? 'bg-red-950/90 border-red-500 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse'
              : 'bg-zinc-950/70 border-zinc-800 text-zinc-500'
          }`}
        >
          <span className="bg-zinc-800 px-1 py-0.5 rounded font-mono text-[10px] text-zinc-300">[5]</span>
          <span>DRON PREDATOR</span>
          <span className="text-[10px] opacity-70">7 KILLS</span>
        </div>

        {/* Bloom Intensity Tactical Slider */}
        {onBloomStrengthChange && (
          <div className="pointer-events-auto flex flex-col gap-1.5 bg-zinc-950/90 border border-zinc-800 p-3 rounded-lg shadow-xl backdrop-blur-md mt-2 w-48">
            <div className="flex justify-between items-center text-[10px] font-black tracking-widest text-zinc-300">
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> BLOOM HDR</span>
              <span className="text-amber-400 font-mono">{((bloomStrength ?? 0.45) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.5"
              step="0.05"
              value={bloomStrength ?? 0.45}
              onChange={(e) => onBloomStrengthChange(parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
            />
            <div className="text-[9px] text-zinc-500 tracking-wider text-center">SKALOWANIE ŚRODOWISKOWE</div>
          </div>
        )}
      </div>

      {/* 3. TOP RIGHT - TACTICAL KILLFEED */}
      <div className="absolute top-5 right-5 flex flex-col gap-1.5 items-end max-w-xs">
        {killfeed.map((entry) => {
          const isKillerBlue = entry.killerTeam === 'VANGUARD';
          const isVictimBlue = entry.victimTeam === 'VANGUARD';
          return (
            <div
              key={entry.id}
              className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-800/80 px-3 py-1 rounded text-xs shadow-md animate-fadeIn"
            >
              <span className={`font-black ${isKillerBlue ? 'text-blue-400' : 'text-red-400'}`}>
                {entry.killerName}
              </span>
              <span className="text-[11px] text-zinc-400 font-mono">
                {entry.isHeadshot ? '💥🎯' : '🔫'}
              </span>
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                {entry.weaponName}
              </span>
              <span className={`font-black ${isVictimBlue ? 'text-blue-400' : 'text-red-400'}`}>
                {entry.victimName}
              </span>
            </div>
          );
        })}
      </div>

      {/* 4. CENTER RETICLE / SCOPE / HITMARKER */}
      {!isAds && isAlive && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
          <div className="absolute top-0 w-0.5 h-2 bg-emerald-400/80" />
          <div className="absolute bottom-0 w-0.5 h-2 bg-emerald-400/80" />
          <div className="absolute left-0 w-2 h-0.5 bg-emerald-400/80" />
          <div className="absolute right-0 w-2 h-0.5 bg-emerald-400/80" />
        </div>
      )}

      {/* Sniper Fullscreen Scope Overlay */}
      {isSniperScope && isAlive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
          {/* Black circle mask */}
          <div className="relative w-[540px] h-[540px] rounded-full border-4 border-emerald-500/60 shadow-[0_0_50px_rgba(0,0,0,0.95)] flex items-center justify-center">
            {/* Crosshair lines */}
            <div className="absolute w-full h-[1.5px] bg-emerald-400" />
            <div className="absolute h-full w-[1.5px] bg-emerald-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_red]" />
            {/* Range markings */}
            <div className="absolute bottom-16 text-xs text-emerald-400 font-mono tracking-widest font-black">
              100M • RANGE CALIBRATED
            </div>
          </div>
        </div>
      )}

      {/* Hitmarker Flash */}
      {hitmarker?.active && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-ping">
          <div
            className={`w-7 h-7 border-2 rotate-45 ${
              hitmarker.isHeadshot
                ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,1)]'
                : 'border-white shadow-[0_0_8px_rgba(255,255,255,0.9)]'
            }`}
          />
        </div>
      )}

      {/* Directional Damage Arrow */}
      {damageDirection !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            style={{ transform: `rotate(${damageDirection}rad) translateY(-140px)` }}
            className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-b-[24px] border-b-red-600 shadow-[0_0_20px_rgba(220,38,38,1)]"
          />
        </div>
      )}

      {/* C4 Plant Prompt in Bomb Site */}
      {(isNearSiteA || isNearSiteB) && roundState === 'LIVE_COMBAT' && isAlive && (
        <div className="absolute top-[62%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 bg-zinc-950/90 border border-amber-500/70 px-6 py-3 rounded-xl shadow-[0_0_25px_rgba(245,158,11,0.4)] backdrop-blur-md">
          <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
            STREFA DETONACJI {isNearSiteA ? 'A' : 'B'}
          </span>
          <span className="text-xs font-bold text-zinc-200">
            PRZYTRZYMAJ <span className="text-amber-400 font-mono">[E]</span> ABY PODŁOŻYĆ C4
          </span>
          {plantProgress > 0 && (
            <div className="w-56 h-2 bg-zinc-800 rounded-full overflow-hidden mt-1 border border-zinc-700">
              <div
                style={{ width: `${plantProgress * 100}%` }}
                className="h-full bg-amber-500 transition-all duration-75"
              />
            </div>
          )}
        </div>
      )}

      {/* C4 Defuse Prompt near Planted Bomb */}
      {isNearPlantedBomb && roundState === 'BOMB_PLANTED' && isAlive && (
        <div className="absolute top-[62%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 bg-zinc-950/90 border border-red-500 px-6 py-3 rounded-xl shadow-[0_0_30px_rgba(239,68,68,0.6)] backdrop-blur-md">
          <span className="text-xs font-black text-red-400 uppercase tracking-widest animate-pulse">
            ⚠️ AKTYWNY ŁADUNEK C4
          </span>
          <span className="text-xs font-bold text-white">
            PRZYTRZYMAJ <span className="text-cyan-400 font-mono">[E]</span> ABY ROZBROIĆ BOMBE
          </span>
          {defuseProgress > 0 && (
            <div className="w-56 h-2.5 bg-zinc-800 rounded-full overflow-hidden mt-1 border border-zinc-700">
              <div
                style={{ width: `${defuseProgress * 100}%` }}
                className="h-full bg-cyan-400 transition-all duration-75"
              />
            </div>
          )}
        </div>
      )}

      {/* 5. BOTTOM LEFT - HEALTH, ARMOR & CASH */}
      <div className="absolute bottom-6 left-6 flex items-end gap-5">
        {/* Health */}
        <div className="flex items-center gap-2 bg-zinc-950/85 border border-zinc-800/90 px-4 py-2 rounded-lg shadow-xl backdrop-blur-sm">
          <Heart className="w-6 h-6 text-red-500 fill-red-500/20" />
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-zinc-400 tracking-wider">ZDROWIE</span>
            <span className="text-2xl font-black tabular-nums tracking-tight text-white">
              {player ? Math.max(0, Math.round(player.hp)) : 100}
            </span>
          </div>
        </div>

        {/* Armor */}
        <div className="flex items-center gap-2 bg-zinc-950/85 border border-zinc-800/90 px-4 py-2 rounded-lg shadow-xl backdrop-blur-sm">
          <Shield className="w-6 h-6 text-blue-400 fill-blue-400/20" />
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-zinc-400 tracking-wider">KAMIZELKA</span>
            <span className="text-2xl font-black tabular-nums tracking-tight text-blue-300">
              {player ? Math.max(0, Math.round(player.armor)) : 100}
            </span>
          </div>
        </div>

        {/* Defuse Kit Badge */}
        {player?.hasDefuseKit && (
          <div className="flex items-center gap-2 bg-zinc-950/85 border border-cyan-500/50 px-3.5 py-2 rounded-lg shadow-xl backdrop-blur-sm animate-fadeIn">
            <Wrench className="w-5 h-5 text-cyan-400" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-cyan-400 tracking-wider">DEFUSE KIT</span>
              <span className="text-xs font-bold text-zinc-200">2.5s SZYBKI</span>
            </div>
          </div>
        )}

        {/* Cash */}
        <div className="flex items-center gap-1.5 bg-zinc-950/85 border border-emerald-500/30 px-3.5 py-2 rounded-lg shadow-xl backdrop-blur-sm">
          <DollarSign className="w-5 h-5 text-emerald-400" />
          <span className="text-xl font-black tabular-nums text-emerald-400">
            {player?.cash.toLocaleString() ?? '1,000'}
          </span>
        </div>
      </div>

      {/* 6. BOTTOM RIGHT - AMMO, WEAPON & GRENADES */}
      <div className="absolute bottom-6 right-6 flex items-end gap-6">
        {/* Tactical Grenade & Gear Icons */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-800 px-2.5 py-1 rounded text-xs font-bold text-zinc-300">
            <span className="text-emerald-400 font-mono text-[10px] bg-zinc-800 px-1 py-0.5 rounded">[G]</span>
            <span>FRAG M67</span>
          </div>
          <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-800 px-2.5 py-1 rounded text-xs font-bold text-zinc-300">
            <span className="text-emerald-400 font-mono text-[10px] bg-zinc-800 px-1 py-0.5 rounded">[F]</span>
            <span>SMOKE M18</span>
          </div>
          <div className="flex items-center justify-between gap-2 bg-zinc-950/80 border border-zinc-800 px-2.5 py-1 rounded text-xs font-bold text-zinc-300">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 font-mono text-[10px] bg-zinc-800 px-1 py-0.5 rounded">[Z]</span>
              <span>FLASHBANG</span>
            </div>
            <span className="text-amber-400 font-mono text-xs">{player?.flashbangs ?? 1}</span>
          </div>
          <div className="flex items-center justify-between gap-2 bg-zinc-950/80 border border-zinc-800 px-2.5 py-1 rounded text-xs font-bold text-zinc-300">
            <div className="flex items-center gap-1.5">
              <span className="text-cyan-400 font-mono text-[10px] bg-zinc-800 px-1 py-0.5 rounded">[X]</span>
              <span>CLAYMORE</span>
            </div>
            <span className="text-cyan-400 font-mono text-xs">{player?.claymores ?? 1}</span>
          </div>
        </div>

        {/* Weapon Details & Ammo */}
        <div className="flex flex-col items-end bg-zinc-950/85 border border-zinc-800/90 px-6 py-2 rounded-lg shadow-xl backdrop-blur-sm">
          <div className="text-xs font-black tracking-widest text-zinc-300 uppercase">
            {player?.weapon.name ?? 'M4A1 TACTICAL'}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black tabular-nums text-white">
              {player?.currentMag ?? 30}
            </span>
            <span className="text-xl font-bold tabular-nums text-zinc-500">
              / {player?.reserveAmmo ?? 90}
            </span>
          </div>
          <div className="text-[10px] tracking-wider text-emerald-400 font-bold uppercase mt-0.5">
            OGIEŃ CIĄGŁY • 5.56MM NATO
          </div>

          {/* Inspect Button & Shortcut */}
          <button
            onClick={onInspectWeapon}
            className="pointer-events-auto mt-2 px-3 py-1 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500/50 rounded text-[10px] font-black text-zinc-300 hover:text-amber-400 uppercase tracking-wider cursor-pointer transition-colors"
          >
            [Y] INSPEKCJA BRONI
          </button>
        </div>
      </div>

      {/* 7. BUY PHASE PROMPT BUTTON (LEWY DOLNY RÓG - NIE ZASŁANIA CELOWNIKA) */}
      {roundState === 'BUY_PHASE' && (
        <div className="absolute bottom-24 left-6 pointer-events-auto animate-fadeIn">
          <button
            onClick={onOpenBuyMenu}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-wider text-xs rounded-lg shadow-[0_0_20px_rgba(245,158,11,0.5)] transition-all transform hover:scale-105 active:scale-95 cursor-pointer uppercase border border-amber-300"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>SKLEP BRONI <span className="bg-zinc-950/20 px-1 py-0.5 rounded text-[10px] font-mono">[B]</span></span>
          </button>
        </div>
      )}

      {/* 8. SPECTATOR OVERLAY (WHEN DEAD) */}
      {!isAlive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
          <div className="flex items-center gap-3 bg-red-950/90 border border-red-500/60 rounded-lg px-6 py-2.5 shadow-2xl backdrop-blur-md">
            <Eye className="w-5 h-5 text-red-400 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[11px] font-black tracking-widest text-red-400 uppercase">
                ZGINĄŁEŚ W AKCJI • TRYB OBSERWATORA
              </span>
              <span className="text-sm font-bold text-white">
                Obserwujesz: {spectatorTarget?.name ?? 'Sojusznik'} ({spectatorTarget?.weapon.name ?? 'M4A1'})
              </span>
            </div>
            <button
              onClick={onCycleSpectator}
              className="ml-3 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white rounded border border-zinc-600 cursor-pointer"
            >
              ZMIEŃ CEL [SPACJA]
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
