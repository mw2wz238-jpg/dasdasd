import React, { useMemo } from 'react';
import { Combatant, Team } from '../types/game';
import { WeaponInventoryUIState, WeaponSlotType } from '../engine/combat/WeaponInventorySystem';
import { MatchSummaryData, MatchState } from '../engine/modes/GameModeManager';
import { Shield, Heart, Crosshair, Zap, AlertTriangle, Eye, Flame, Disc } from 'lucide-react';

/**
 * ============================================================================
 * PROJEKT VANGUARD — ZAAWANSOWANY HUD TAKTYCZNY I INTERFEJS GRACZA (AAA)
 * ============================================================================
 * Komponent: TacticalHUD
 * Architektura: Zero-GC / Płaski odczyt stanów (Flat State Read).
 * 
 * Odpowiedzialność:
 * 1. Dedykowany wskaźnik uzbrojenia:
 *    - Selekcja slotów: 1 - Primary (Główna), 2 - Secondary (Boczna), 3 - Tactical (Granaty)
 *    - Duży cyfrowy wskaźnik amunicji (Magazynek / Rezerwa) z paskiem pojemności
 *    - Selektor trybu ognia (Auto / Semi / Burst)
 *    - Ostrzeżenie o niskim stanie amunicji oraz wskaźnik procedury przeładowania
 * 2. Dynamiczny celownik (Dynamic Reticle / Crosshair):
 *    - Płynne skalowanie rozwarcia na podstawie parametru rozrzutu (Spread)
 *    - Optyczny celownik snajperski Mil-Dot z podziałką dalmierczą w trybie ADS (AWP)
 * 3. Wskaźnik otrzymanych obrażeń (Directional Damage Indicator):
 *    - Czerwone łuki radialne wskazujące wektor nadlatującego pocisku
 * 4. Pasek statusu meczu (Match Status & Scoreboard):
 *    - Czas rundy, faza meczu, wyniki drużyn Vanguard vs Syndicate oraz stan żywych operatorów
 * ============================================================================
 */

export interface TacticalHUDProps {
  player: Combatant | null;
  inventoryState?: WeaponInventoryUIState;
  matchSummary?: MatchSummaryData;
  fireMode?: 'auto' | 'semi' | 'burst';
  spread?: number;
  damageDirection?: number | null; // Kąt w radianach względem kamery gracza
  isAds?: boolean;
  hitmarker?: { active: boolean; isHeadshot: boolean } | null;
  zoneName?: string;
  spectatorTarget?: Combatant | null;
  onOpenBuyMenu?: () => void;
  onOpenGunsmith?: () => void;
  onInspectWeapon?: () => void;
  onToggleFireMode?: () => void;
  onSwitchSlot?: (slot: WeaponSlotType) => void;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  player,
  inventoryState,
  matchSummary,
  fireMode = 'auto',
  spread = 0.024,
  damageDirection = null,
  isAds = false,
  hitmarker = null,
  zoneName = 'SEKTOR 04 // STREFA PRZEMYSŁOWA',
  spectatorTarget = null,
  onOpenBuyMenu,
  onOpenGunsmith,
  onInspectWeapon,
  onToggleFireMode,
  onSwitchSlot,
}) => {
  const isAlive = player?.isAlive ?? false;
  const isSniperScope = isAds && (player?.weapon.category === 'sniper' || player?.weapon.id === 'awp');

  // Formatowanie czasu rundy
  const timeRemaining = matchSummary?.timeRemainingSec ?? 115;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  const formattedTimer = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Parametry aktywnej broni i slotu
  const currentMag = inventoryState?.ammoInMag ?? player?.currentMag ?? 30;
  const reserveAmmo = inventoryState?.reserveAmmo ?? player?.reserveAmmo ?? 90;
  const maxMagSize = inventoryState?.maxMagSize ?? player?.weapon.magSize ?? 30;
  const activeSlot = inventoryState?.activeSlot ?? WeaponSlotType.PRIMARY;
  const weaponName = inventoryState?.weaponName ?? player?.weapon.name ?? 'M4A1 TACTICAL';
  const isSwitching = inventoryState?.switchProgress !== undefined && inventoryState.switchProgress > 0 && inventoryState.switchProgress < 1;

  // Obliczenie rozwarcia dynamicznego celownika (Dynamic Reticle Spread)
  const crosshairGap = useMemo(() => {
    const baseGap = isAds ? 3 : 10;
    const dynamicOffset = Math.min(65, Math.max(0, spread * 600));
    return Math.round(baseGap + dynamicOffset);
  }, [spread, isAds]);

  // Procent napełnienia magazynka
  const magPercentage = Math.max(0, Math.min(100, (currentMag / Math.max(1, maxMagSize)) * 100));

  // Etykieta i kolorystyka fazy meczu
  const phaseInfo = useMemo(() => {
    const state = matchSummary?.state ?? MatchState.IN_PROGRESS;
    switch (state) {
      case MatchState.WARMUP:
        return { text: 'ROZGRZEWKA TAKTYCZNA', color: 'text-amber-400', badge: 'bg-amber-950/80 border-amber-500/40' };
      case MatchState.ROUND_START:
        return { text: 'FAZA ZAKUPÓW I PRZYGOTOWANIA', color: 'text-cyan-400', badge: 'bg-cyan-950/80 border-cyan-500/40' };
      case MatchState.IN_PROGRESS:
        return { text: 'WALKA O SEKTOR PRZEMYSŁOWY', color: 'text-red-400', badge: 'bg-red-950/80 border-red-500/40' };
      case MatchState.ROUND_END:
        return { text: 'RUNDA ZAKOŃCZONA', color: 'text-emerald-400', badge: 'bg-emerald-950/80 border-emerald-500/40' };
      case MatchState.MATCH_OVER:
        return { text: 'MECZ ZAKOŃCZONY', color: 'text-yellow-400', badge: 'bg-yellow-950/80 border-yellow-500/40' };
    }
  }, [matchSummary?.state]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden font-sans">
      {/* =====================================================================
          1. GÓRNY PASEK MECZU: WYNIK, ZEGAR, STAN ŻYWYCH OPERATORÓW
      ===================================================================== */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-4 bg-zinc-950/90 border border-zinc-800/90 px-6 py-2 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-md">
          {/* Drużyna VANGUARD (Niebiescy) */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black tracking-widest text-blue-400 uppercase">VANGUARD</span>
              <div className="flex items-center gap-1 mt-0.5">
                {Array.from({ length: matchSummary?.vanguardTotalCount ?? 5 }).map((_, i) => (
                  <div
                    key={`vg_${i}`}
                    className={`w-2.5 h-2.5 rounded-sm transition-colors ${
                      i < (matchSummary?.vanguardAliveCount ?? 5)
                        ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]'
                        : 'bg-zinc-800 border border-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>
            <span className="text-3xl font-black tabular-nums text-blue-400">
              {matchSummary?.scoreVanguard ?? 0}
            </span>
          </div>

          {/* Centralny zegar i runda */}
          <div className="flex flex-col items-center px-4 border-x border-zinc-800">
            <span className="text-[9px] font-bold text-zinc-400 tracking-wider">
              RUNDA {matchSummary?.roundNumber ?? 1} / {matchSummary?.maxRounds ?? 17}
            </span>
            <span className={`text-2xl font-black tabular-nums tracking-tight ${timeRemaining < 15 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {formattedTimer}
            </span>
          </div>

          {/* Drużyna SYNDICATE (Czerwoni) */}
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black tabular-nums text-red-400">
              {matchSummary?.scoreSyndicate ?? 0}
            </span>
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-black tracking-widest text-red-400 uppercase">SYNDICATE</span>
              <div className="flex items-center gap-1 mt-0.5">
                {Array.from({ length: matchSummary?.syndicateTotalCount ?? 5 }).map((_, i) => (
                  <div
                    key={`sy_${i}`}
                    className={`w-2.5 h-2.5 rounded-sm transition-colors ${
                      i < (matchSummary?.syndicateAliveCount ?? 5)
                        ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
                        : 'bg-zinc-800 border border-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Etykieta strefy i fazy */}
        <div className={`px-4 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${phaseInfo.badge}`}>
          <span className={phaseInfo.color}>{phaseInfo.text}</span>
          <span className="text-zinc-500 mx-1.5">•</span>
          <span className="text-zinc-300">{zoneName}</span>
        </div>
      </div>

      {/* =====================================================================
          2. DYNAMICZNY CELOWNIK (RETICLE) / CELOWNIK SNIPER MIL-DOT
      ===================================================================== */}
      {isAlive && !isSniperScope && !isAds && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Kropka centralna */}
          <div className="w-1 h-1 bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.8)]" />

          {/* Ramiona celownika rozszerzające się z wartością spread */}
          {/* Góra */}
          <div
            style={{ transform: `translateY(-${crosshairGap}px)` }}
            className="absolute w-[2px] h-[9px] bg-emerald-400/90 shadow-[0_0_2px_#000]"
          />
          {/* Dół */}
          <div
            style={{ transform: `translateY(${crosshairGap}px)` }}
            className="absolute w-[2px] h-[9px] bg-emerald-400/90 shadow-[0_0_2px_#000]"
          />
          {/* Lewo */}
          <div
            style={{ transform: `translateX(-${crosshairGap}px)` }}
            className="absolute h-[2px] w-[9px] bg-emerald-400/90 shadow-[0_0_2px_#000]"
          />
          {/* Prawo */}
          <div
            style={{ transform: `translateX(${crosshairGap}px)` }}
            className="absolute h-[2px] w-[9px] bg-emerald-400/90 shadow-[0_0_2px_#000]"
          />
        </div>
      )}

      {/* Pełny celownik snajperski Mil-Dot (ADS ze snajperką) */}
      {isAlive && isSniperScope && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
          {/* Winieta tubusu lunety */}
          <div className="w-[88vmin] h-[88vmin] rounded-full border-[100vmax] border-zinc-950 relative shadow-[inset_0_0_80px_rgba(0,0,0,1)]">
            {/* Oś pionowa */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1px] bg-black/80" />
            {/* Oś pozioma */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-black/80" />
            {/* Centralna kropka celownicza */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-red-600 rounded-full shadow-[0_0_6px_red]" />
          </div>
        </div>
      )}

      {/* =====================================================================
          3. HITMARKER
      ===================================================================== */}
      {hitmarker?.active && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-ping">
          <div
            className={`w-7 h-7 border-2 rotate-45 ${
              hitmarker.isHeadshot
                ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,1)]'
                : 'border-white shadow-[0_0_8px_rgba(255,255,255,1)]'
            }`}
          />
        </div>
      )}

      {/* =====================================================================
          4. WSKAŹNIK OTRZYMANYCH OBRAŻEŃ (DIRECTIONAL DAMAGE INDICATOR)
      ===================================================================== */}
      {damageDirection !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            style={{ transform: `rotate(${damageDirection}rad) translateY(-160px)` }}
            className="w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-b-[32px] border-b-red-600 shadow-[0_0_30px_rgba(239,68,68,1)] animate-pulse"
          />
        </div>
      )}

      {/* =====================================================================
          5. LEWY DOLNY RÓG: ZDROWIE, PANCERZ I STAN FIZYCZNY
      ===================================================================== */}
      {isAlive && (
        <div className="absolute bottom-6 left-6 flex items-end gap-4 pointer-events-auto">
          {/* Zdrowie */}
          <div className="flex items-center gap-3 bg-zinc-950/85 border border-zinc-800/90 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md">
            <Heart className="w-6 h-6 text-red-500 fill-red-500/20" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-zinc-400 tracking-wider">ZDROWIE</span>
              <span className="text-2xl font-black tabular-nums text-white">
                {Math.max(0, Math.round(player?.hp ?? 100))}
              </span>
            </div>
          </div>

          {/* Kamizelka kuloodporna */}
          <div className="flex items-center gap-3 bg-zinc-950/85 border border-zinc-800/90 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md">
            <Shield className="w-6 h-6 text-blue-400 fill-blue-400/20" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-zinc-400 tracking-wider">KAMIZELKA</span>
              <span className="text-2xl font-black tabular-nums text-blue-300">
                {Math.max(0, Math.round(player?.armor ?? 100))}
              </span>
            </div>
          </div>

          {/* Przycisk Sklepu Broni [B] w fazie zakupu */}
          {matchSummary?.state === MatchState.ROUND_START && onOpenBuyMenu && (
            <button
              onClick={onOpenBuyMenu}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-wider text-xs rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.5)] transition-all cursor-pointer uppercase border border-amber-300"
            >
              SKLEP BRONI [B]
            </button>
          )}

          {/* Przycisk Warsztatu Uzbrojenia GUNSMITH */}
          {onOpenGunsmith && (
            <button
              onClick={onOpenGunsmith}
              className="px-3.5 py-2.5 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 hover:text-white font-bold tracking-wider text-xs rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all cursor-pointer uppercase border border-cyan-500/40 flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>GUNSMITH [G]</span>
            </button>
          )}
        </div>
      )}

      {/* =====================================================================
          6. PRAWY DOLNY RÓG: ZAAWANSOWANY WSKAŹNIK UZBROJENIA I AMUNICJI
      ===================================================================== */}
      {isAlive && (
        <div className="absolute bottom-6 right-6 flex items-end gap-5 pointer-events-auto">
          {/* Przełącznik slotów 1, 2, 3 */}
          <div className="flex flex-col gap-1.5">
            {/* Slot 1: Primary */}
            <button
              onClick={() => onSwitchSlot && onSwitchSlot(WeaponSlotType.PRIMARY)}
              className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                activeSlot === WeaponSlotType.PRIMARY
                  ? 'bg-zinc-800/95 border-amber-500/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-zinc-950/75 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono bg-zinc-900 px-1 py-0.5 rounded text-zinc-300">[1]</span>
                <span className="text-[11px] uppercase tracking-wider">GŁÓWNA</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {inventoryState ? `${inventoryState.primaryAmmoInMag}` : '30'}
              </span>
            </button>

            {/* Slot 2: Secondary */}
            <button
              onClick={() => onSwitchSlot && onSwitchSlot(WeaponSlotType.SECONDARY)}
              className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                activeSlot === WeaponSlotType.SECONDARY
                  ? 'bg-zinc-800/95 border-amber-500/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-zinc-950/75 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono bg-zinc-900 px-1 py-0.5 rounded text-zinc-300">[2]</span>
                <span className="text-[11px] uppercase tracking-wider">BOCZNA</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {inventoryState ? `${inventoryState.secondaryAmmoInMag}` : '7'}
              </span>
            </button>

            {/* Slot 3: Tactical */}
            <button
              onClick={() => onSwitchSlot && onSwitchSlot(WeaponSlotType.TACTICAL)}
              className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                activeSlot === WeaponSlotType.TACTICAL
                  ? 'bg-zinc-800/95 border-amber-500/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-zinc-950/75 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono bg-zinc-900 px-1 py-0.5 rounded text-zinc-300">[3]</span>
                <span className="text-[11px] uppercase tracking-wider">GRANAT</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {inventoryState?.tacticalCount ?? 2}
              </span>
            </button>
          </div>

          {/* Główny blok aktywnej broni i amunicji */}
          <div className="flex flex-col items-end bg-zinc-950/90 border border-zinc-800/95 px-6 py-3 rounded-xl shadow-[0_0_35px_rgba(0,0,0,0.85)] backdrop-blur-md min-w-[210px]">
            {/* Nazwa broni i status przełączania */}
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-black tracking-widest text-zinc-200 uppercase">
                {weaponName}
              </span>
              {/* Przełącznik trybu ognia */}
              <button
                onClick={onToggleFireMode}
                className="px-1.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded text-[9px] font-black uppercase text-amber-400 tracking-wider cursor-pointer transition-colors"
                title="Przełącz tryb ognia"
              >
                [{fireMode.toUpperCase()}]
              </button>
            </div>

            {/* Licznik amunicji Magazynek / Rezerwa */}
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-5xl font-black tabular-nums tracking-tighter ${currentMag === 0 ? 'text-red-500 animate-pulse' : currentMag <= 5 ? 'text-amber-400' : 'text-white'}`}>
                {currentMag}
              </span>
              <span className="text-2xl font-bold tabular-nums text-zinc-500">
                / {reserveAmmo}
              </span>
            </div>

            {/* Pasek graficzny pojemności magazynka */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2 border border-zinc-700/50">
              <div
                style={{ width: `${magPercentage}%` }}
                className={`h-full transition-all duration-100 ${
                  currentMag === 0
                    ? 'bg-red-600'
                    : currentMag <= 5
                    ? 'bg-amber-500'
                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                }`}
              />
            </div>

            {/* Sygnalizator statusu przeładowania / inspekcji */}
            <div className="flex items-center justify-between w-full mt-2">
              <span className="text-[9px] font-black text-emerald-400 tracking-wider uppercase">
                {isSwitching ? 'ZMIANA BRONI...' : currentMag === 0 ? 'PRZEŁADUJ [R]' : 'BOJOWO GOTOWY'}
              </span>

              {onInspectWeapon && (
                <button
                  onClick={onInspectWeapon}
                  className="text-[9px] font-bold text-zinc-400 hover:text-amber-300 uppercase cursor-pointer"
                >
                  [Y] INSPEKCJA
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          7. TRYB OBSERWATORA PO ŚMIERCI
      ===================================================================== */}
      {!isAlive && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
          <div className="flex items-center gap-3 bg-red-950/90 border border-red-500/70 rounded-xl px-6 py-3 shadow-[0_0_35px_rgba(239,68,68,0.5)] backdrop-blur-md">
            <Eye className="w-5 h-5 text-red-400 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-widest text-red-300 uppercase">
                POLEGŁEŚ W AKCJI • OBSERWACJA SOJUSZNIKÓW
              </span>
              <span className="text-sm font-bold text-white">
                Kolejna runda za: {Math.max(0, Math.round(matchSummary?.timeRemainingSec ?? 0))}s
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
