import React from 'react';
import { Play, Sliders, MapPin, Volume2, VolumeX, Shield, Users, Radio } from 'lucide-react';
import { MapId } from '../types/game';

interface TitleScreenProps {
  onStartGame: () => void;
  onOpenMultiplayer: () => void;
  onOpenGunsmith: () => void;
  onOpenMapSelect: () => void;
  currentMap: MapId;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartGame,
  onOpenMultiplayer,
  onOpenGunsmith,
  onOpenMapSelect,
  currentMap,
  isMuted,
  onToggleMute,
}) => {
  const mapNames: Record<MapId, string> = {
    industrial: 'Sektor 04: Strefa Przemysłowa (Dzień)',
    winter_village: 'Górska Wioska (Zima)',
    night_docks: 'Doki (Noc / Deszcz)',
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between p-6 sm:p-10 md:p-12 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent pointer-events-none select-none text-white font-sans overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-3">
          {/* Bespoke inline SVG logo lockup */}
          <svg className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500 fill-current shrink-0" viewBox="0 0 100 100">
            <polygon points="50,5 95,85 70,85 50,45 30,85 5,85" />
            <polygon points="50,60 62,85 38,85" />
          </svg>
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-widest text-amber-400 uppercase">
              PROJECT VANGUARD
            </span>
            <span className="text-[10px] tracking-wider text-zinc-400 font-bold uppercase">
              AAA MULTIPLAYER FPS • 5v5 TAC-SHOOTER
            </span>
          </div>
        </div>

        <button
          onClick={onToggleMute}
          className="p-2.5 sm:p-3 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 rounded-xl text-zinc-300 hover:text-white cursor-pointer transition-all shadow-lg"
          title="Dźwięk"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Center Title Lockup */}
      <div className="max-w-2xl flex flex-col gap-3 my-auto py-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-md text-[11px] font-black text-amber-400 tracking-wider uppercase w-fit">
          <Shield className="w-3.5 h-3.5" />
          SILNIK PBR 3D FPP • SIECIOWE POKOJE 5v5 & MATCHMAKING
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white uppercase drop-shadow-2xl leading-none">
          PROJECT<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-white">
            VANGUARD
          </span>
        </h1>

        <p className="text-xs sm:text-sm text-zinc-300 font-medium max-w-lg leading-relaxed drop-shadow-md">
          Taktyczny shooter pierwszoosobowy 3D w standardzie AAA. Pokoje sieciowe 5v5, autorytatywny cykl rund (Search & Destroy / Bomb Defusal), zaawansowany Rusznikarz, Killstreaki i pełny potok PBR / HDR.
        </p>

        {/* Primary CTA Buttons */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3 pointer-events-auto">
          {/* Main Multiplayer War-Room Button */}
          <button
            onClick={onOpenMultiplayer}
            className="flex items-center gap-3 px-6 sm:px-8 py-3.5 sm:py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-widest text-xs sm:text-sm rounded-xl shadow-[0_0_35px_rgba(245,158,11,0.7)] transition-all transform hover:scale-105 active:scale-95 cursor-pointer uppercase"
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            LOBBY MULTIPLAYER & POKOJE 5v5
          </button>

          {/* Quick Start Instant Match */}
          <button
            onClick={onStartGame}
            className="flex items-center gap-2 px-5 py-3.5 sm:py-4 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-white font-black tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer uppercase"
          >
            <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
            SZYBKI MECZ
          </button>

          <button
            onClick={onOpenGunsmith}
            className="flex items-center gap-2 px-5 py-3.5 sm:py-4 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-white font-black tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer uppercase"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            RUSZNIKARZ
          </button>

          <button
            onClick={onOpenMapSelect}
            className="flex items-center gap-2 px-5 py-3.5 sm:py-4 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-white font-black tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer uppercase"
          >
            <MapPin className="w-4 h-4 text-blue-400" />
            MAPA: {mapNames[currentMap]}
          </button>
        </div>
      </div>

      {/* Flat Control Hints Line at Bottom */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-zinc-800/80 pt-3 gap-1">
        <span>WASD Ruch · LPM Strzał · PPM Celowanie · [B] Sklep · [3/4/5] Killstreaki · [Z] Flashbang · [X] Claymore</span>
        <span className="text-zinc-500">G Odłamkowy · F Dymny · C Kucnij · Shift Sprint · R Przeładuj</span>
      </div>
    </div>
  );
};
