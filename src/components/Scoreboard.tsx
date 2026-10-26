import React from 'react';
import { Combatant, Team } from '../types/game';
import { Star, Shield, Skull, Target, DollarSign } from 'lucide-react';

interface ScoreboardProps {
  combatants: Combatant[];
  scoreVanguard: number;
  scoreSyndicate: number;
  roundNumber: number;
  onClose?: () => void;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  combatants,
  scoreVanguard,
  scoreSyndicate,
  roundNumber,
}) => {
  const vanguardTeam = combatants.filter((c) => c.team === 'VANGUARD');
  const syndicateTeam = combatants.filter((c) => c.team === 'SYNDICATE');

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-md font-sans text-white p-6 pointer-events-none select-none">
      <div className="w-full max-w-5xl bg-zinc-950/95 border border-zinc-800 rounded-xl shadow-2xl p-6 flex flex-col gap-6">
        {/* Match Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-black tracking-widest text-white uppercase">
              TABELA WYNIKÓW MECZU 5v5
            </h2>
            <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
              PROJECT VANGUARD • SERWER AUTORYTATYWNY • RUNDA {roundNumber}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-blue-400">VANGUARD</span>
              <span className="text-3xl font-black text-blue-400 tabular-nums bg-blue-950/60 px-3 py-1 rounded border border-blue-500/30">
                {scoreVanguard}
              </span>
            </div>
            <span className="text-xl font-bold text-zinc-600">:</span>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black text-red-400 tabular-nums bg-red-950/60 px-3 py-1 rounded border border-red-500/30">
                {scoreSyndicate}
              </span>
              <span className="text-sm font-black text-red-400">SYNDICATE</span>
            </div>
          </div>
        </div>

        {/* 1. Vanguard (Blue) Team */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-4 py-1.5 bg-blue-950/40 border-l-4 border-blue-500 text-xs font-black text-blue-300 tracking-wider">
            <span>DRUŻYNA VANGUARD (OBROŃCY)</span>
            <div className="flex items-center gap-8 text-[11px] text-zinc-400 pr-4">
              <span className="w-12 text-center">ZABÓJSTWA</span>
              <span className="w-12 text-center">ZGONY</span>
              <span className="w-12 text-center">ASYSTY</span>
              <span className="w-14 text-center">OBRAŻENIA</span>
              <span className="w-16 text-center">FUNDUSZE</span>
              <span className="w-12 text-center">MVP</span>
            </div>
          </div>

          {vanguardTeam.map((c) => (
            <PlayerRow key={c.id} combatant={c} isBlue={true} />
          ))}
        </div>

        {/* 2. Syndicate (Red) Team */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-4 py-1.5 bg-red-950/40 border-l-4 border-red-500 text-xs font-black text-red-300 tracking-wider">
            <span>DRUŻYNA SYNDICATE (ATAKUJĄCY)</span>
            <div className="flex items-center gap-8 text-[11px] text-zinc-400 pr-4">
              <span className="w-12 text-center">ZABÓJSTWA</span>
              <span className="w-12 text-center">ZGONY</span>
              <span className="w-12 text-center">ASYSTY</span>
              <span className="w-14 text-center">OBRAŻENIA</span>
              <span className="w-16 text-center">FUNDUSZE</span>
              <span className="w-12 text-center">MVP</span>
            </div>
          </div>

          {syndicateTeam.map((c) => (
            <PlayerRow key={c.id} combatant={c} isBlue={false} />
          ))}
        </div>

        <div className="text-[11px] text-zinc-500 text-center font-mono">
          Naciśnij [TAB] aby zamknąć lub ukryć tabelę
        </div>
      </div>
    </div>
  );
};

const PlayerRow: React.FC<{ combatant: Combatant; isBlue: boolean }> = ({ combatant, isBlue }) => {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2 rounded-lg border text-sm transition-colors ${
        combatant.isPlayer
          ? 'bg-zinc-800/80 border-amber-500/60 font-bold'
          : 'bg-zinc-900/40 border-zinc-800/50'
      } ${!combatant.isAlive ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-2 h-2 rounded-full ${
            combatant.isAlive ? (isBlue ? 'bg-blue-400' : 'bg-red-400') : 'bg-zinc-600'
          }`}
        />
        <span className={`font-black tracking-wide ${combatant.isPlayer ? 'text-amber-400' : 'text-white'}`}>
          {combatant.name} {combatant.isPlayer && '(TY)'}
        </span>
        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono uppercase">
          {combatant.weapon.name}
        </span>
      </div>

      <div className="flex items-center gap-8 text-xs tabular-nums text-zinc-200 pr-4">
        <span className="w-12 text-center font-bold text-white">{combatant.kills}</span>
        <span className="w-12 text-center text-zinc-400">{combatant.deaths}</span>
        <span className="w-12 text-center text-zinc-400">{combatant.assists}</span>
        <span className="w-14 text-center text-zinc-300">{Math.round(combatant.damageDealt)}</span>
        <span className="w-16 text-center text-emerald-400 font-bold">${combatant.cash}</span>
        <span className="w-12 text-center flex items-center justify-center gap-0.5 text-amber-400">
          {combatant.mvpStars > 0 ? (
            <>
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>{combatant.mvpStars}</span>
            </>
          ) : (
            '-'
          )}
        </span>
      </div>
    </div>
  );
};
