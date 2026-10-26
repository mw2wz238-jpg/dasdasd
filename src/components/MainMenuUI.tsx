import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapId, Team } from '../types/game';
import { QualityTier } from '../engine/optimization/EngineProfiler';
import { Sound } from '../engine/audio';
import { 
  Shield, 
  Crosshair, 
  Play, 
  Settings, 
  Users, 
  Compass, 
  Flag,
  Swords,
  Timer,
  Radio,
  Sparkles,
  Maximize2
} from 'lucide-react';

// Nowe tło przekazane bezpośrednio przez użytkownika
const userWarehouseBackdrop = '/assets/aistudio/Gemini_Generated_Image_qxec6jqxec6jqxec_83d7e9c8.jfif';

/**
 * ============================================================================
 * PROJEKT VANGUARD: LIVING INDUSTRIAL DEPLOYMENT HUB (BREATHING OPERATORS)
 * ============================================================================
 * Architektura: AAA Game Engine Interface (Zero-GC compliant)
 * Plik: src/components/MainMenuUI.tsx
 * 
 * Cechy implementacji:
 * 1. Zastosowanie oryginalnego tła użytkownika ze zintegrowanymi operatorami.
 * 2. Ożywieni operatorzy (Idle & Breathing Animation):
 *    - Lewy operator (VANGUARD SpecOps): mikroruchy klatki piersiowej, uniesienie broni, oddech taktyczny (4.6s cykl).
 *    - Prawy operator (SYNDICATE PMC): asynchroniczne uniesienie sylwetki, oddech czuwania (5.2s cykl).
 * 3. Paralaksa głębi 2.5D (Mouse Parallax) z zerową alokacją obiektów w ticku.
 * 4. Pływający wolumetryczny pył magazynowy renderowany na canvasie Zero-GC.
 * 5. Czysty, uniesiony neonowy HUD idealnie wkomponowany w centralną przestrzeń magazynu.
 * ============================================================================
 */

export interface MainMenuUIProps {
  currentMap: MapId;
  onSelectMap: (mapId: MapId) => void;
  selectedTeam: Team;
  onSelectTeam: (team: Team) => void;
  qualityTier: QualityTier;
  onSelectQuality: (tier: QualityTier) => void;
  isLoading: boolean;
  loadingProgress: number; // 0 do 100
  loadingStageText: string;
  onStartGame: () => void;
  onOpenGunsmith: () => void;
  onOpenMultiplayer: () => void;
}

export type GameModeOption = 'CONQUEST' | 'TDM' | 'SIEGE' | 'RUSH';

export const MainMenuUI: React.FC<MainMenuUIProps> = ({
  currentMap,
  onSelectMap,
  selectedTeam,
  onSelectTeam,
  qualityTier,
  onSelectQuality,
  isLoading,
  loadingProgress,
  loadingStageText,
  onStartGame,
  onOpenGunsmith,
  onOpenMultiplayer,
}) => {
  // Aktywny tryb rozgrywki
  const [activeMode, setActiveMode] = useState<GameModeOption>('CONQUEST');

  // Ustawienia wideo
  const [vsyncEnabled, setVsyncEnabled] = useState<boolean>(true);
  const [resolutionIndex, setResolutionIndex] = useState<number>(0);
  const resolutions = ['3840x2160', '2560x1440', '1920x1080'];

  // Referencje paralaksy kursora myszy (Zero-GC)
  const containerRef = useRef<HTMLDivElement>(null);
  const parallaxXRef = useRef<number>(0);
  const parallaxYRef = useRef<number>(0);
  const [parallaxOffset, setParallaxOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Płótno cząsteczek kurzu magazynowego
  const dustCanvasRef = useRef<HTMLCanvasElement>(null);

  // Lista teatrów działań
  const mapsData: Array<{ id: MapId; name: string; sector: string; desc: string }> = useMemo(() => [
    {
      id: 'industrial',
      name: 'STREFA PRZEMYSŁOWA DZIEŃ',
      sector: 'SECTOR_04_RAIL_TERMINAL',
      desc: 'Skład kolejowy, terminal kontenerowy i suwnice centralne z dwiema strefami ładunków.',
    },
    {
      id: 'night_docks',
      name: 'HARBOR ASSAULT (NOCNE DOKI)',
      sector: 'SECTOR_07_NAVAL_DEPOT',
      desc: 'Mokre nabrzeże magazynowe spowite ulewnym deszczem i kałużami z odbiciami neonów PBR.',
    },
    {
      id: 'winter_village',
      name: 'GÓRSKA WIOSKA (ZIMA)',
      sector: 'SECTOR_02_WINTER_RIDGE',
      desc: 'Zaśnieżona osada górska z drewnianymi chatami i oblodzonymi wąskimi przesmykami.',
    },
  ], []);

  // Aktualnie wybrana mapa
  const activeMapInfo = useMemo(() => {
    return mapsData.find((m) => m.id === currentMap) || mapsData[0];
  }, [currentMap, mapsData]);

  // Dźwięk interakcji i akcja
  const handleAction = useCallback((fn: () => void) => {
    Sound.playUIBeep(true);
    fn();
  }, []);

  // Przełączanie mapy
  const handleCycleMap = useCallback(() => {
    const idx = mapsData.findIndex((m) => m.id === currentMap);
    const nextIdx = (idx + 1) % mapsData.length;
    handleAction(() => onSelectMap(mapsData[nextIdx].id));
  }, [currentMap, mapsData, handleAction, onSelectMap]);

  // Przełączanie jakości
  const handleCycleQuality = useCallback(() => {
    const tiers = [QualityTier.ULTRA, QualityTier.HIGH, QualityTier.MEDIUM, QualityTier.LOW];
    const curIdx = tiers.indexOf(qualityTier);
    const nextIdx = (curIdx + 1) % tiers.length;
    handleAction(() => onSelectQuality(tiers[nextIdx]));
  }, [qualityTier, handleAction, onSelectQuality]);

  // Obsługa paralaksy myszy (Zero-GC: brak nowych alokacji w mousemove)
  useEffect(() => {
    let animId = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const halfW = window.innerWidth * 0.5;
      const halfH = window.innerHeight * 0.5;
      targetX = (e.clientX - halfW) / halfW; // -1 do 1
      targetY = (e.clientY - halfH) / halfH; // -1 do 1
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    const updateParallax = () => {
      // Płynna interpolacja LERP
      currentX += (targetX - currentX) * 0.05;
      currentY += (targetY - currentY) * 0.05;

      parallaxXRef.current = currentX;
      parallaxYRef.current = currentY;

      setParallaxOffset({
        x: Number((currentX * 12).toFixed(2)),
        y: Number((currentY * 8).toFixed(2))
      });

      animId = requestAnimationFrame(updateParallax);
    };

    animId = requestAnimationFrame(updateParallax);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  // System cząsteczek kurzu wolumetrycznego w świetle reflektorów (Zero-GC Float32Array)
  useEffect(() => {
    const canvas = dustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const DUST_COUNT = 48;
    // Pre-alokowany bufor: [x, y, vx, vy, size, alpha]
    const dustData = new Float32Array(DUST_COUNT * 6);
    for (let i = 0; i < DUST_COUNT; i++) {
      const offset = i * 6;
      dustData[offset] = Math.random() * window.innerWidth;
      dustData[offset + 1] = Math.random() * window.innerHeight;
      dustData[offset + 2] = (Math.random() - 0.5) * 0.3;
      dustData[offset + 3] = -0.15 - Math.random() * 0.35; // powolne unoszenie
      dustData[offset + 4] = 1.0 + Math.random() * 2.2;
      dustData[offset + 5] = 0.15 + Math.random() * 0.45;
    }

    let animId = 0;
    const renderDust = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      for (let i = 0; i < DUST_COUNT; i++) {
        const o = i * 6;
        dustData[o] += dustData[o + 2];
        dustData[o + 1] += dustData[o + 3];

        if (dustData[o + 1] < -10) dustData[o + 1] = h + 10;
        if (dustData[o] < -10) dustData[o] = w + 10;
        if (dustData[o] > w + 10) dustData[o] = -10;

        ctx.fillStyle = `rgba(180, 220, 255, ${dustData[o + 5]})`;
        ctx.beginPath();
        ctx.arc(dustData[o], dustData[o + 1], dustData[o + 4], 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(renderDust);
    };

    animId = requestAnimationFrame(renderDust);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-50 flex flex-col justify-between font-sans select-none text-white overflow-hidden bg-black"
    >
      {/* =====================================================================
          WARSTWA 1: BAZOWE TŁO MAGAZYNU (ZDJĘCIE PRZESŁANE PRZEZ UŻYTKOWNIKA)
      ===================================================================== */}
      <div 
        className="absolute inset-0 bg-cover bg-center pointer-events-none transition-transform duration-300 ease-out"
        style={{ 
          backgroundImage: `url(${userWarehouseBackdrop})`,
          filter: isLoading ? 'brightness(0.6) blur(2px)' : 'brightness(1.0)',
          transform: `scale(1.04) translate3d(${parallaxOffset.x * 0.3}px, ${parallaxOffset.y * 0.3}px, 0)`
        }}
      />

      {/* =====================================================================
          WARSTWA 2: OŻYWIONY OPERATOR VANGUARD (LEWA STRONA - ODDECH I OCZEKIWANIE)
      ===================================================================== */}
      <div 
        className="absolute inset-0 pointer-events-none animate-operator-vanguard transition-transform duration-300 ease-out"
        style={{
          backgroundImage: `url(${userWarehouseBackdrop})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          // Maskowanie wyłącznie lewej postaci operatora SpecOps
          clipPath: 'polygon(0% 12%, 36% 12%, 36% 96%, 0% 96%)',
          transform: `scale(1.04) translate3d(${parallaxOffset.x * 0.7}px, ${parallaxOffset.y * 0.7}px, 0)`,
          filter: selectedTeam === 'VANGUARD' ? 'drop-shadow(0 0 25px rgba(6,182,212,0.6)) brightness(1.04)' : 'brightness(0.98)'
        }}
      />

      {/* =====================================================================
          WARSTWA 3: OŻYWIONY NAJEMNIK SYNDICATE (PRAWA STRONA - ODDECH I OCZEKIWANIE)
      ===================================================================== */}
      <div 
        className="absolute inset-0 pointer-events-none animate-operator-syndicate transition-transform duration-300 ease-out"
        style={{
          backgroundImage: `url(${userWarehouseBackdrop})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          // Maskowanie wyłącznie prawej postaci najemnika Syndicate
          clipPath: 'polygon(64% 15%, 100% 15%, 100% 96%, 64% 96%)',
          transform: `scale(1.04) translate3d(${parallaxOffset.x * 0.7}px, ${parallaxOffset.y * 0.7}px, 0)`,
          filter: selectedTeam === 'SYNDICATE' ? 'drop-shadow(0 0 25px rgba(239,68,68,0.6)) brightness(1.04)' : 'brightness(0.98)'
        }}
      />

      {/* =====================================================================
          WARSTWA 4: WOLUMETRYCZNY PYŁ I REFLEKTORY MAGAZYNU
      ===================================================================== */}
      <canvas 
        ref={dustCanvasRef} 
        className="absolute inset-0 pointer-events-none z-10" 
      />

      {/* Dyskretna winieta kinowa na krawędziach */}
      <div className="absolute inset-0 bg-radial-gradient pointer-events-none opacity-40" />

      {/* =====================================================================
          GÓRNY DYSKRETNY PASEK NARZĘDZIOWY
      ===================================================================== */}
      <div className="relative z-40 flex items-center justify-between px-8 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
          <span className="text-[11px] font-mono tracking-widest text-cyan-200/90 font-bold uppercase drop-shadow">
            LIVE ENGINE VIEWPORT // 60 FPS HDR
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleAction(onOpenGunsmith)}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 border border-amber-500/50 hover:border-amber-400 rounded-lg text-[11px] font-mono font-bold tracking-wider text-amber-300 hover:text-amber-200 transition-all cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.25)] backdrop-blur-md"
          >
            <Settings className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
            <span>RUSZNIKARNIA 3D</span>
          </button>

          <button
            onClick={() => handleAction(onOpenMultiplayer)}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 border border-cyan-500/50 hover:border-cyan-400 rounded-lg text-[11px] font-mono font-bold tracking-wider text-cyan-300 hover:text-cyan-200 transition-all cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.25)] backdrop-blur-md"
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>LOBBY 5v5</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          GŁÓWNY OBSZAR:
          - LEWA FLANKA (KLIKALNA STREFA VANGUARD)
          - CENTRUM: PRISTINE UNIFIED HUD W WOLNEJ PRZESTRZENI
          - PRAWA FLANKA (KLIKALNA STREFA SYNDICATE)
      ===================================================================== */}
      <div className="relative z-40 flex-1 grid grid-cols-12 items-center px-4 md:px-8 my-auto">
        
        {/* LEWA FLANKA: INTERAKCJA Z OPERATOREM VANGUARD */}
        <div className="col-span-12 lg:col-span-3 flex flex-col justify-end items-center lg:items-start h-full pb-8 pointer-events-auto">
          <div 
            onClick={() => handleAction(() => onSelectTeam('VANGUARD'))}
            className={`cursor-pointer p-4 rounded-xl transition-all duration-300 border backdrop-blur-md ${
              selectedTeam === 'VANGUARD'
                ? 'bg-blue-950/50 border-cyan-400 shadow-[0_0_35px_rgba(6,182,212,0.5)] scale-105'
                : 'bg-black/30 border-transparent hover:border-cyan-400/40 hover:bg-black/50'
            }`}
          >
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-cyan-400 font-bold mb-1">
              <Shield className="w-3.5 h-3.5" />
              <span>DEFENDERS // SECTOR SECURITY</span>
              {selectedTeam === 'VANGUARD' && (
                <span className="px-1.5 py-0.2 bg-cyan-400 text-black font-black text-[9px] rounded shadow-[0_0_8px_#22d3ee]">
                  WYBRANO
                </span>
              )}
            </div>
            <div className="text-2xl md:text-3xl font-black tracking-widest text-white uppercase drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
              VANGUARD
            </div>
            <p className="text-[11px] text-zinc-300 mt-1 max-w-xs leading-snug drop-shadow">
              SpecOps w pełnym pancerzu. M4A1 Tactical z celownikiem, tłumikiem i zestawem Defuse Kit.
            </p>
          </div>
        </div>

        {/* CENTRUM: UNIESIONY PÓŁPRZEZROCZYSTY HUD POD LOGO SILNIKA */}
        <div className="col-span-12 lg:col-span-6 flex flex-col items-center justify-center my-auto">
          <div className="w-full max-w-[430px] bg-zinc-950/85 border-2 border-cyan-400/90 rounded-2xl shadow-[0_0_45px_rgba(6,182,212,0.4)] backdrop-blur-xl p-4 flex flex-col gap-3 font-mono">
            
            {/* 1. MAP PREVIEW */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] tracking-wider text-cyan-300 font-bold">
                <span className="flex items-center gap-1.5 uppercase">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  MAP PREVIEW
                </span>
                <button
                  onClick={handleCycleMap}
                  className="text-[10px] text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  ZMIEŃ MAPĘ ↻
                </button>
              </div>

              {/* Karta schematu taktycznego */}
              <div 
                onClick={handleCycleMap}
                className="group relative h-20 rounded-xl border border-cyan-500/60 overflow-hidden cursor-pointer bg-zinc-900/90 shadow-inner flex flex-col justify-end p-2"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-cyan-950/40" />
                
                {/* Schemat radaru taktycznego */}
                <div className="absolute inset-0 flex items-center justify-center opacity-25 group-hover:opacity-40 transition-opacity">
                  <div className="w-24 h-14 border border-cyan-400/80 grid grid-cols-3 grid-rows-2 gap-1 p-1">
                    <div className="bg-cyan-400/30 rounded-sm" />
                    <div className="bg-cyan-400/50 rounded-sm" />
                    <div className="bg-cyan-400/20 rounded-sm" />
                    <div className="bg-cyan-400/40 rounded-sm" />
                    <div className="bg-cyan-400/10 rounded-sm" />
                    <div className="bg-cyan-400/60 rounded-sm" />
                  </div>
                </div>

                <div className="relative z-10">
                  <span className="text-xs font-black tracking-wider text-white uppercase block leading-tight">
                    {activeMapInfo.name}
                  </span>
                  <span className="text-[9px] text-cyan-400 block">
                    SEKTOR: {activeMapInfo.sector}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. GAME MODES (4 KAFLE TAKTYCZNE) */}
            <div className="flex flex-col gap-1">
              <div className="text-[10px] tracking-wider text-cyan-300 font-bold uppercase">
                GAME MODES
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {/* CONQUEST */}
                <button
                  onClick={() => handleAction(() => setActiveMode('CONQUEST'))}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border transition-all cursor-pointer ${
                    activeMode === 'CONQUEST'
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.45)] font-bold'
                      : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5 mb-0.5" />
                  <span className="text-[9px] tracking-wider">CONQUEST</span>
                  {activeMode === 'CONQUEST' && (
                    <span className="text-[7px] text-cyan-300 font-black">ACTIVE</span>
                  )}
                </button>

                {/* TDM */}
                <button
                  onClick={() => handleAction(() => setActiveMode('TDM'))}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border transition-all cursor-pointer ${
                    activeMode === 'TDM'
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.45)] font-bold'
                      : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Swords className="w-3.5 h-3.5 mb-0.5" />
                  <span className="text-[9px] tracking-wider">TDM</span>
                  {activeMode === 'TDM' && (
                    <span className="text-[7px] text-cyan-300 font-black">ACTIVE</span>
                  )}
                </button>

                {/* SIEGE */}
                <button
                  onClick={() => handleAction(() => setActiveMode('SIEGE'))}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border transition-all cursor-pointer ${
                    activeMode === 'SIEGE'
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.45)] font-bold'
                      : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 mb-0.5" />
                  <span className="text-[9px] tracking-wider">SIEGE</span>
                  {activeMode === 'SIEGE' && (
                    <span className="text-[7px] text-cyan-300 font-black">ACTIVE</span>
                  )}
                </button>

                {/* RUSH */}
                <button
                  onClick={() => handleAction(() => setActiveMode('RUSH'))}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border transition-all cursor-pointer ${
                    activeMode === 'RUSH'
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.45)] font-bold'
                      : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Timer className="w-3.5 h-3.5 mb-0.5" />
                  <span className="text-[9px] tracking-wider">RUSH</span>
                  {activeMode === 'RUSH' && (
                    <span className="text-[7px] text-cyan-300 font-black">ACTIVE</span>
                  )}
                </button>
              </div>
            </div>

            {/* 3. VIDEO SETTINGS */}
            <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/80">
              <div className="text-[10px] tracking-wider text-cyan-300 font-bold uppercase">
                VIDEO SETTINGS
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-zinc-900/70 p-2 rounded-xl border border-zinc-800">
                <div 
                  onClick={handleCycleQuality}
                  className="cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <span className="text-zinc-400 block text-[9px]">QUALITY:</span>
                  <span className="font-bold text-cyan-400">{QualityTier[qualityTier]}</span>
                </div>

                <div 
                  onClick={() => handleAction(() => setResolutionIndex((r) => (r + 1) % resolutions.length))}
                  className="cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <span className="text-zinc-400 block text-[9px]">RESOLUTION:</span>
                  <span className="font-bold text-zinc-200">{resolutions[resolutionIndex]}</span>
                </div>

                <div 
                  onClick={() => handleAction(() => setVsyncEnabled((v) => !v))}
                  className="cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <span className="text-zinc-400 block text-[9px]">VSYNC:</span>
                  <span className={`font-bold ${vsyncEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {vsyncEnabled ? 'ON' : 'OFF'}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-400 block text-[9px]">HDR POTOK:</span>
                  <span className="font-bold text-cyan-400">ACES FILMIC</span>
                </div>
              </div>
            </div>

            {/* 4. OPERATOR STATUS */}
            <div className="flex items-center justify-between text-[10px] px-2.5 py-1 bg-cyan-950/40 border border-cyan-500/40 rounded-lg text-zinc-300">
              <div>
                <span className="text-zinc-500">OPERATOR: </span>
                <span className="font-bold text-cyan-300 uppercase">{selectedTeam} // GHOST</span>
              </div>
              <div>
                <span className="text-zinc-500">RANK: </span>
                <span className="font-bold text-amber-300">LEVEL 24 - MAJOR</span>
              </div>
            </div>

            {/* 5. GŁÓWNY PRZYCISK: BEGIN DEPLOYMENT */}
            {isLoading ? (
              <div className="flex flex-col gap-1 pt-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-cyan-400 font-bold uppercase">{loadingStageText}</span>
                  <span className="text-white font-black">{Math.round(loadingProgress)}%</span>
                </div>
                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    style={{ width: `${loadingProgress}%` }}
                    className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-400 transition-all duration-150 shadow-[0_0_15px_rgba(6,182,212,0.8)]"
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleAction(onStartGame)}
                className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-400 hover:from-cyan-400 hover:to-blue-400 text-black font-black tracking-[0.2em] text-sm md:text-base uppercase cursor-pointer border border-cyan-200 shadow-[0_0_30px_rgba(6,182,212,0.7)] transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>BEGIN DEPLOYMENT</span>
              </button>
            )}
          </div>
        </div>

        {/* PRAWA FLANKA: INTERAKCJA Z NAJEMNIKIEM SYNDICATE */}
        <div className="col-span-12 lg:col-span-3 flex flex-col justify-end items-center lg:items-end h-full pb-8 pointer-events-auto">
          <div 
            onClick={() => handleAction(() => onSelectTeam('SYNDICATE'))}
            className={`cursor-pointer p-4 rounded-xl transition-all duration-300 border text-right backdrop-blur-md ${
              selectedTeam === 'SYNDICATE'
                ? 'bg-red-950/50 border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.5)] scale-105'
                : 'bg-black/30 border-transparent hover:border-red-500/40 hover:bg-black/50'
            }`}
          >
            <div className="flex items-center justify-end gap-2 text-[10px] font-mono tracking-widest text-red-400 font-bold mb-1">
              {selectedTeam === 'SYNDICATE' && (
                <span className="px-1.5 py-0.2 bg-red-500 text-black font-black text-[9px] rounded shadow-[0_0_8px_#ef4444]">
                  WYBRANO
                </span>
              )}
              <span>ATTACKERS // PMC MERCENARIES</span>
              <Shield className="w-3.5 h-3.5" />
            </div>
            <div className="text-2xl md:text-3xl font-black tracking-widest text-white uppercase drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
              SYNDICATE
            </div>
            <p className="text-[11px] text-zinc-300 mt-1 max-w-xs leading-snug drop-shadow">
              Najemnik PMC w masce. Karabin AK z potężnym odrzutem i ładunkiem detonacyjnym C4.
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          DOLNY PASEK STATUSU
      ===================================================================== */}
      <div className="relative z-40 flex items-center justify-between px-8 py-2 bg-black/80 border-t border-zinc-800/80 text-[10px] font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]" />
          <span className="text-emerald-400 font-bold">ALL ENGINE MODULES ONLINE - READY FOR DEPLOYMENT</span>
        </div>
        <div className="flex items-center gap-4">
          <span>FRAKCJA: <strong className={selectedTeam === 'VANGUARD' ? 'text-cyan-400' : 'text-red-400'}>{selectedTeam}</strong></span>
          <span>TRYB: <strong className="text-cyan-300">{activeMode}</strong></span>
          <span>JAKOŚĆ: <strong className="text-amber-400">{QualityTier[qualityTier]}</strong></span>
        </div>
      </div>
    </div>
  );
};
