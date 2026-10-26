import React, { useMemo } from 'react';
import { Combatant, Team } from '../types/game';
import { ProfilerMetricsSnapshot } from '../engine/optimization/EngineProfiler';
import { Sound } from '../engine/audio';
import { Trophy, RotateCcw, Home, Award, Crosshair, Cpu, Gauge, Shield, Skull } from 'lucide-react';

/**
 * ============================================================================
 * PROJEKT VANGUARD — EKRAN KOŃCOWY MECZU I PODSUMOWANIE STATYSTYK (AAA)
 * ============================================================================
 * Komponent: MatchSummaryUI
 * 
 * Odpowiedzialność:
 * 1. Prezentacja werdyktu meczu (Zwycięstwo / Porażka) z kinowym podświetleniem
 *    zależnym od wybranej przez gracza frakcji.
 * 2. Pełna 5v5 tabela wyników (Scoreboard):
 *    - Statystyki graczy: Kills, Deaths, Assists, Damage Dealt, K/D Ratio oraz MVP Stars.
 * 3. Zintegrowany raport telemetryczny z profilera silnika (EngineProfiler):
 *    - Średni FPS, 1% Low FPS, CPU Frame Time, GPU Render Time oraz Draw Calls.
 * 4. Płynne przechodzenie do kolejnego meczu lub powrót do Menu Głównego.
 * ============================================================================
 */

export interface MatchSummaryUIProps {
  winnerTeam: Team;
  playerTeam: Team;
  scoreVanguard: number;
  scoreSyndicate: number;
  combatants: Combatant[];
  player: Combatant | null;
  mvp: Combatant | null;
  profilerSnapshot?: ProfilerMetricsSnapshot;
  onRematch: () => void;
  onReturnToMenu: () => void;
}

export const MatchSummaryUI: React.FC<MatchSummaryUIProps> = ({
  winnerTeam,
  playerTeam,
  scoreVanguard,
  scoreSyndicate,
  combatants,
  player,
  mvp,
  profilerSnapshot,
  onRematch,
  onReturnToMenu,
}) => {
  const isVictory = winnerTeam === playerTeam;

  // Podział graczy na drużyny
  const vanguardTeam = useMemo(() => {
    return combatants
      .filter((c) => c.team === 'VANGUARD')
      .sort((a, b) => b.kills * 100 + b.damageDealt - (a.kills * 100 + a.damageDealt));
  }, [combatants]);

  const syndicateTeam = useMemo(() => {
    return combatants
      .filter((c) => c.team === 'SYNDICATE')
      .sort((a, b) => b.kills * 100 + b.damageDealt - (a.kills * 100 + a.damageDealt));
  }, [combatants]);

  const handleAction = (cb: () => void) => {
    Sound.playUIBeep(true);
    cb();
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-between p-8 bg-gradient-to-t from-zinc-950/98 via-zinc-950/90 to-zinc-950/95 backdrop-blur-md font-sans text-white select-none overflow-y-auto">
      {/* =====================================================================
          1. GÓRNY BANER: WERDYKT (VICTORY / DEFEAT) I WYNIK KOŃCOWY
      ===================================================================== */}
      <div className="flex flex-col items-center gap-2 border-b border-zinc-800/80 pb-6">
        <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-zinc-400 uppercase">
          <span>OPERACJA ZAKOŃCZONA</span>
          <span>•</span>
          <span>STREFA PRZEMYSŁOWA DZIEŃ (SEKTOR 04)</span>
        </div>

        {/* Wielki tytuł kinowy */}
        <div className="flex items-center gap-4 mt-1">
          <Trophy
            className={`w-12 h-12 ${
              isVictory
                ? 'text-yellow-400 drop-shadow-[0_0_25px_rgba(250,204,21,0.8)]'
                : 'text-zinc-500'
            }`}
          />
          <span
            className={`text-5xl font-black tracking-widest uppercase drop-shadow-2xl ${
              isVictory
                ? 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500'
                : 'text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-zinc-300 to-red-500'
            }`}
          >
            {isVictory ? 'ZWYCIĘSTWO TAKTYCZNE' : 'PORAŻKA OPERACYJNA'}
          </span>
        </div>

        {/* Tablica punktowa meczu */}
        <div className="flex items-center gap-6 mt-2 bg-zinc-900/80 border border-zinc-800 px-8 py-2 rounded-xl shadow-xl">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-blue-400">VANGUARD</span>
            <span className="text-3xl font-black text-white tabular-nums">{scoreVanguard}</span>
          </div>
          <span className="text-zinc-600 font-bold text-xl">:</span>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black text-white tabular-nums">{scoreSyndicate}</span>
            <span className="text-sm font-black text-red-400">SYNDICATE</span>
          </div>
        </div>

        {/* Wyróżnienie MVP */}
        {mvp && (
          <div className="flex items-center gap-2 px-4 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-xs font-bold text-yellow-300 mt-2">
            <Award className="w-4 h-4 text-yellow-400" />
            <span>MVP MECZU: {mvp.name} ({mvp.kills} ZABÓJSTW • {mvp.damageDealt} DMG)</span>
          </div>
        )}
      </div>

      {/* =====================================================================
          2. CENTRALNY MODUŁ: 5v5 TABELA WYNIKÓW DRUŻYN
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 my-4">
        {/* Drużyna VANGUARD */}
        <div className="flex flex-col bg-zinc-950/80 border border-blue-900/40 rounded-xl overflow-hidden shadow-xl">
          <div className="flex items-center justify-between bg-blue-950/40 px-5 py-3 border-b border-blue-900/50">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-black tracking-wider text-blue-300 uppercase">
                VANGUARD OPERATORS
              </span>
            </div>
            <span className="text-xs font-bold text-blue-400">
              {scoreVanguard > scoreSyndicate ? 'ZWYCIĘZCY' : 'DEFENDERS'}
            </span>
          </div>

          <div className="divide-y divide-zinc-900">
            <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-mono text-zinc-400 uppercase bg-zinc-900/30">
              <span className="col-span-5">OPERATOR</span>
              <span className="col-span-2 text-center">K / D / A</span>
              <span className="col-span-2 text-center">K/D</span>
              <span className="col-span-3 text-right">OBRAŻENIA</span>
            </div>

            {vanguardTeam.map((c) => {
              const kd = (c.kills / Math.max(1, c.deaths)).toFixed(2);
              const isLocal = c.id === player?.id;
              return (
                <div
                  key={c.id}
                  className={`grid grid-cols-12 items-center px-4 py-2.5 text-xs font-bold ${
                    isLocal ? 'bg-blue-950/30 border-l-2 border-blue-400' : 'hover:bg-zinc-900/40'
                  }`}
                >
                  <div className="col-span-5 flex items-center gap-2">
                    <span className={isLocal ? 'text-blue-300 font-black' : 'text-zinc-200'}>
                      {c.name} {isLocal && '(TY)'}
                    </span>
                    {c.mvpStars > 0 && (
                      <span className="text-[10px] text-yellow-400">★{c.mvpStars}</span>
                    )}
                  </div>
                  <span className="col-span-2 text-center font-mono text-zinc-300">
                    {c.kills} / {c.deaths} / {c.assists}
                  </span>
                  <span className="col-span-2 text-center font-mono text-blue-400">{kd}</span>
                  <span className="col-span-3 text-right font-mono text-zinc-400">{c.damageDealt}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Drużyna SYNDICATE */}
        <div className="flex flex-col bg-zinc-950/80 border border-red-900/40 rounded-xl overflow-hidden shadow-xl">
          <div className="flex items-center justify-between bg-red-950/40 px-5 py-3 border-b border-red-900/50">
            <div className="flex items-center gap-2">
              <Skull className="w-4 h-4 text-red-400" />
              <span className="text-xs font-black tracking-wider text-red-300 uppercase">
                SYNDICATE MERCENARIES
              </span>
            </div>
            <span className="text-xs font-bold text-red-400">
              {scoreSyndicate > scoreVanguard ? 'ZWYCIĘZCY' : 'ATTACKERS'}
            </span>
          </div>

          <div className="divide-y divide-zinc-900">
            <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-mono text-zinc-400 uppercase bg-zinc-900/30">
              <span className="col-span-5">OPERATOR</span>
              <span className="col-span-2 text-center">K / D / A</span>
              <span className="col-span-2 text-center">K/D</span>
              <span className="col-span-3 text-right">OBRAŻENIA</span>
            </div>

            {syndicateTeam.map((c) => {
              const kd = (c.kills / Math.max(1, c.deaths)).toFixed(2);
              const isLocal = c.id === player?.id;
              return (
                <div
                  key={c.id}
                  className={`grid grid-cols-12 items-center px-4 py-2.5 text-xs font-bold ${
                    isLocal ? 'bg-red-950/30 border-l-2 border-red-400' : 'hover:bg-zinc-900/40'
                  }`}
                >
                  <div className="col-span-5 flex items-center gap-2">
                    <span className={isLocal ? 'text-red-300 font-black' : 'text-zinc-200'}>
                      {c.name} {isLocal && '(TY)'}
                    </span>
                    {c.mvpStars > 0 && (
                      <span className="text-[10px] text-yellow-400">★{c.mvpStars}</span>
                    )}
                  </div>
                  <span className="col-span-2 text-center font-mono text-zinc-300">
                    {c.kills} / {c.deaths} / {c.assists}
                  </span>
                  <span className="col-span-2 text-center font-mono text-red-400">{kd}</span>
                  <span className="col-span-3 text-right font-mono text-zinc-400">{c.damageDealt}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. MODUŁ DIAGNOSTYKI SILNIKA (PROFILER BENCHMARK RAPORT)
      ===================================================================== */}
      {profilerSnapshot && (
        <div className="flex flex-col gap-2 bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl shadow-lg my-2">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
            <span className="text-[11px] font-black tracking-widest text-emerald-400 uppercase flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              RAPORT TELEMETRII SILNIKA // ENGINE BENCHMARK
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              PROFIL: {profilerSnapshot.qualityTierName}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-1">
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-zinc-500">ŚREDNI FPS</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                {profilerSnapshot.averageFps} FPS
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-zinc-500">1% LOW FPS</span>
              <span className="text-xl font-black text-amber-400 font-mono">
                {profilerSnapshot.onePercentLowFps} FPS
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-zinc-500">CPU FRAME TIME</span>
              <span className="text-xl font-black text-cyan-400 font-mono">
                {profilerSnapshot.cpuFrameTimeMs} ms
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-zinc-500">GPU RENDER TIME</span>
              <span className="text-xl font-black text-purple-400 font-mono">
                {profilerSnapshot.gpuRenderTimeMs} ms
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-zinc-500">DRAW CALLS</span>
              <span className="text-xl font-black text-zinc-300 font-mono">
                {profilerSnapshot.drawCalls}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. DOLNY PASEK AKCJI: REANGAŻUJ / POWRÓT DO MENU GŁÓWNEGO
      ===================================================================== */}
      <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
        <button
          onClick={() => handleAction(onReturnToMenu)}
          className="flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-500 text-zinc-200 hover:text-white font-black tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer uppercase"
        >
          <Home className="w-4 h-4 text-zinc-400" />
          <span>POWRÓT DO MENU GŁÓWNEGO</span>
        </button>

        <button
          onClick={() => handleAction(onRematch)}
          className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black tracking-widest text-sm rounded-xl shadow-[0_0_25px_rgba(59,130,246,0.6)] transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase border border-blue-300"
        >
          <RotateCcw className="w-4 h-4" />
          <span>REANGAŻUJ // NASTĘPNA RUNDA</span>
        </button>
      </div>
    </div>
  );
};
