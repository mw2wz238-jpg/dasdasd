import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Combatant, Team } from '../types/game';
import { Trophy, Star, Target, RotateCcw } from 'lucide-react';

interface GameOverModalProps {
  winner: Team;
  scoreVanguard: number;
  scoreSyndicate: number;
  mvp: Combatant | null;
  player: Combatant | null;
  onRematch: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  scoreVanguard,
  scoreSyndicate,
  mvp,
  player,
  onRematch,
}) => {
  const isPlayerWinner = (winner === 'VANGUARD' && player?.team === 'VANGUARD') || (winner === 'SYNDICATE' && player?.team === 'SYNDICATE');

  useEffect(() => {
    if (isPlayerWinner) {
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {}
    }
  }, [isPlayerWinner]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg font-sans text-white p-6">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center gap-6 animate-scaleUp">
        {/* Banner */}
        <div className="flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 shadow-2xl ${
              isPlayerWinner
                ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/50'
                : 'bg-red-500/20 text-red-400 border-2 border-red-500/50'
            }`}
          >
            <Trophy className="w-8 h-8" />
          </div>

          <h1 className="text-3xl font-black tracking-widest uppercase">
            {winner === 'VANGUARD' ? 'ZWYCIĘSTWO DRUŻYNY VANGUARD' : 'ZWYCIĘSTWO DRUŻYNY SYNDICATE'}
          </h1>
          <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider mt-1">
            MECZ TURNIEJOWY 5v5 ZAKOŃCZONY
          </p>
        </div>

        {/* Score comparison */}
        <div className="flex items-center gap-8 py-3 px-8 bg-zinc-900/60 rounded-xl border border-zinc-800">
          <div className="flex flex-col items-center">
            <span className="text-xs font-black text-blue-400">VANGUARD</span>
            <span className="text-4xl font-black text-blue-400 tabular-nums">{scoreVanguard}</span>
          </div>
          <span className="text-2xl font-bold text-zinc-600">:</span>
          <div className="flex flex-col items-center">
            <span className="text-xs font-black text-red-400">SYNDICATE</span>
            <span className="text-4xl font-black text-red-400 tabular-nums">{scoreSyndicate}</span>
          </div>
        </div>

        {/* MVP Star */}
        {mvp && (
          <div className="w-full bg-amber-950/20 border border-amber-500/40 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
              <div className="text-left">
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                  NAJLEPSZY GRACZ MECZU (MVP)
                </span>
                <div className="text-sm font-black text-white">
                  {mvp.name} {mvp.isPlayer && '(TY)'}
                </div>
              </div>
            </div>
            <div className="text-right text-xs font-bold text-zinc-300">
              {mvp.kills} Zabójstw • {Math.round(mvp.damageDealt)} Obrażeń
            </div>
          </div>
        )}

        {/* Player personal stats */}
        {player && (
          <div className="w-full grid grid-cols-4 gap-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 text-xs">
            <div className="flex flex-col items-center">
              <span className="text-zinc-400 text-[10px] font-bold">TWOJE KILLS</span>
              <span className="text-lg font-black text-white">{player.kills}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-zinc-400 text-[10px] font-bold">ZGONY</span>
              <span className="text-lg font-black text-white">{player.deaths}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-zinc-400 text-[10px] font-bold">OBRAŻENIA</span>
              <span className="text-lg font-black text-white">{Math.round(player.damageDealt)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-zinc-400 text-[10px] font-bold">GWIAZDY MVP</span>
              <span className="text-lg font-black text-amber-400">{player.mvpStars}</span>
            </div>
          </div>
        )}

        <button
          onClick={onRematch}
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-widest text-sm rounded-xl shadow-xl transition-all cursor-pointer uppercase flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-5 h-5" />
          ZAGRAJ REWANŻ (NOWY MECZ)
        </button>
      </div>
    </div>
  );
};
