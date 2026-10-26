import React, { useState } from 'react';
import { WeaponStats } from '../types/game';
import { WEAPON_REGISTRY } from '../engine/weapons';
import { DollarSign, Shield, X, Crosshair, Zap } from 'lucide-react';

interface BuyMenuProps {
  cash: number;
  remainingTime: number;
  onBuyWeapon: (weapon: WeaponStats) => void;
  onBuyArmor: () => void;
  onBuyDefuseKit?: () => void;
  onBuyFlashbang?: () => void;
  onBuyClaymore?: () => void;
  hasDefuseKit?: boolean;
  flashbangs?: number;
  claymores?: number;
  onClose: () => void;
}

export const BuyMenu: React.FC<BuyMenuProps> = ({
  cash,
  remainingTime,
  onBuyWeapon,
  onBuyArmor,
  onBuyDefuseKit,
  onBuyFlashbang,
  onBuyClaymore,
  hasDefuseKit = false,
  flashbangs = 0,
  claymores = 0,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<'rifles' | 'smg' | 'heavy' | 'pistols' | 'gear'>('rifles');

  const categories = [
    { id: 'rifles', label: 'KARABINY' },
    { id: 'smg', label: 'PISTOLETY MASZYNOWE' },
    { id: 'heavy', label: 'STRZELBY & SNIPER' },
    { id: 'pistols', label: 'PISTOLETY BOCZNE' },
    { id: 'gear', label: 'KAMIZELKA & OBRONA' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md font-sans text-white p-6">
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-4">
            <span className="text-xl font-black tracking-widest text-white uppercase">
              MENU ZAKUPÓW UZBROJENIA
            </span>
            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2.5 py-1 rounded font-black tracking-wider">
              POZOSTAŁO: {Math.max(0, Math.round(remainingTime))}s
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/40 px-4 py-1.5 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <span className="text-xl font-black text-emerald-400 tabular-nums">
                ${cash.toLocaleString()}
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 min-h-[460px]">
          {/* Left Category Sidebar */}
          <div className="w-56 border-r border-zinc-800/80 bg-zinc-900/30 p-3 flex flex-col gap-1.5">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id as any)}
                className={`text-left px-4 py-3 rounded-lg text-xs font-black tracking-wider transition-all cursor-pointer ${
                  activeCategory === c.id
                    ? 'bg-amber-500 text-zinc-950 shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Right Product Grid */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeCategory === 'rifles' && (
              <div className="grid grid-cols-2 gap-4">
                <WeaponCard
                  weapon={WEAPON_REGISTRY.m4a1}
                  canAfford={cash >= WEAPON_REGISTRY.m4a1.price}
                  desc="Wszechstronny karabin szturmowy kalibru 5.56mm. Optymalna celność i stabilność ognia."
                  onBuy={() => onBuyWeapon(WEAPON_REGISTRY.m4a1)}
                />
                <WeaponCard
                  weapon={WEAPON_REGISTRY.awp}
                  canAfford={cash >= WEAPON_REGISTRY.awp.price}
                  desc="Ciężki karabin snajperski L115A .338 Lapua. Śmiertelny jednym strzałem w tułów lub głowę."
                  onBuy={() => onBuyWeapon(WEAPON_REGISTRY.awp)}
                />
              </div>
            )}

            {activeCategory === 'smg' && (
              <div className="grid grid-cols-2 gap-4">
                <WeaponCard
                  weapon={WEAPON_REGISTRY.mp5}
                  canAfford={cash >= WEAPON_REGISTRY.mp5.price}
                  desc="Wytłumiony pistolet maszynowy MP5-SD 9mm. Wysoka szybkostrzelność do walki w pomieszczeniach."
                  onBuy={() => onBuyWeapon(WEAPON_REGISTRY.mp5)}
                />
              </div>
            )}

            {activeCategory === 'heavy' && (
              <div className="grid grid-cols-2 gap-4">
                <WeaponCard
                  weapon={WEAPON_REGISTRY.shotgun}
                  canAfford={cash >= WEAPON_REGISTRY.shotgun.price}
                  desc="Strzelba bojowa SPAS-12 kaliber 12 gauge. Ekstremalna dewastacja w bliskim kontakcie."
                  onBuy={() => onBuyWeapon(WEAPON_REGISTRY.shotgun)}
                />
                <WeaponCard
                  weapon={WEAPON_REGISTRY.awp}
                  canAfford={cash >= WEAPON_REGISTRY.awp.price}
                  desc="Snajperka AWP ze zintegrowanym celownikiem optycznym 4x/10x."
                  onBuy={() => onBuyWeapon(WEAPON_REGISTRY.awp)}
                />
              </div>
            )}

            {activeCategory === 'pistols' && (
              <div className="grid grid-cols-2 gap-4">
                <WeaponCard
                  weapon={WEAPON_REGISTRY.deagle}
                  canAfford={cash >= WEAPON_REGISTRY.deagle.price}
                  desc="Pistolet Desert Eagle .50 Action Express. Ogromna penetracja pancerza i siła obalająca."
                  onBuy={() => onBuyWeapon(WEAPON_REGISTRY.deagle)}
                />
                <WeaponCard
                  weapon={WEAPON_REGISTRY.p250}
                  canAfford={cash >= WEAPON_REGISTRY.p250.price}
                  desc="Standardowy pistolet boczny P250. Tani i niezawodny magazynek 13 naboi."
                  onBuy={() => onBuyWeapon(WEAPON_REGISTRY.p250)}
                />
              </div>
            )}

            {activeCategory === 'gear' && (
              <div className="grid grid-cols-2 gap-4">
                {/* Kevlar Vest + Helmet */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-lg text-white">KAMIZELKA KEVLAR + HEŁM</span>
                      <span className="font-black text-emerald-400 text-lg">$1,000</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Zapewnia 100 punktów pancerza balistycznego. Redukuje obrażenia od kul o 35% oraz chroni przed natychmiastową śmiercią od pocisków pistoletowych.
                    </p>
                  </div>
                  <button
                    disabled={cash < 1000}
                    onClick={onBuyArmor}
                    className={`mt-4 w-full py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                      cash >= 1000
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    {cash >= 1000 ? 'KUP PANCERZ ($1,000)' : 'BRAK ŚRODKÓW'}
                  </button>
                </div>

                {/* Defuse Kit */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-lg text-white">ZESTAW ROZBRAJANIA (DEFUSE KIT)</span>
                      <span className="font-black text-emerald-400 text-lg">$400</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Skraca czas rozbrojenia ładunku C4 o 50% (z 5.0 sekund do zaledwie 2.5 sekundy). Kluczowe wyposażenie do obrony stref A i B.
                    </p>
                  </div>
                  <button
                    disabled={cash < 400 || hasDefuseKit}
                    onClick={onBuyDefuseKit}
                    className={`mt-4 w-full py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                      hasDefuseKit
                        ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 cursor-default'
                        : cash >= 400
                        ? 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-md'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    {hasDefuseKit ? 'POSIADASZ ZESTAW' : cash >= 400 ? 'KUP ZESTAW ($400)' : 'BRAK ŚRODKÓW'}
                  </button>
                </div>

                {/* Flashbang M84 */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-lg text-white">GRANAT BŁYSKOWY M84</span>
                      <span className="font-black text-emerald-400 text-lg">$200</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Wybucha po 1.8s fuse, oślepiając wrogów w zasięgu wzroku na okres do 4.0 sekund oraz wywołując pisk uszny i dezorientację AI. Klawisz [Z].
                    </p>
                  </div>
                  <button
                    disabled={cash < 200 || flashbangs >= 2}
                    onClick={onBuyFlashbang}
                    className={`mt-4 w-full py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                      flashbangs >= 2
                        ? 'bg-zinc-800 text-zinc-500 cursor-default'
                        : cash >= 200
                        ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    {flashbangs >= 2 ? 'MAKSYMALNA ILOŚĆ (2)' : cash >= 200 ? 'KUP FLASHBANG ($200)' : 'BRAK ŚRODKÓW'}
                  </button>
                </div>

                {/* Claymore Mine */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-lg text-white">MINA KIERUNKOWA CLAYMORE</span>
                      <span className="font-black text-emerald-400 text-lg">$400</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Rozstawiana mina przeciwpiechotna z dwoma wiązkami laserowymi. Detonuje w 60° stożku zadając 140 pkt obrażeń odłamkowych. Klawisz [X].
                    </p>
                  </div>
                  <button
                    disabled={cash < 400 || claymores >= 2}
                    onClick={onBuyClaymore}
                    className={`mt-4 w-full py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                      claymores >= 2
                        ? 'bg-zinc-800 text-zinc-500 cursor-default'
                        : cash >= 400
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    {claymores >= 2 ? 'MAKSYMALNA ILOŚĆ (2)' : cash >= 400 ? 'KUP CLAYMORE ($400)' : 'BRAK ŚRODKÓW'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Hint */}
        <div className="px-6 py-3 border-t border-zinc-800/80 bg-zinc-900/30 text-xs text-zinc-500 flex justify-between items-center">
          <span>Klawisz [B] lub [ESC] aby zamknąć</span>
          <span className="text-zinc-400 font-mono">AUTORYTATYWNA WALIDACJA TRANSAKCJI</span>
        </div>
      </div>
    </div>
  );
};

const WeaponCard: React.FC<{
  weapon: WeaponStats;
  canAfford: boolean;
  desc: string;
  onBuy: () => void;
}> = ({ weapon, canAfford, desc, onBuy }) => {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition-all">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-black text-lg text-white uppercase">{weapon.name}</span>
          <span className="font-black text-emerald-400 text-lg">${weapon.price.toLocaleString()}</span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed mb-4">{desc}</p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400 mb-4 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/40">
          <div>Obrażenia: <span className="font-bold text-white">{weapon.damage}</span></div>
          <div>Szybkostrzelność: <span className="font-bold text-white">{weapon.fireRateRPM} RPM</span></div>
          <div>Magazynek: <span className="font-bold text-white">{weapon.magSize}</span></div>
          <div>Zasięg: <span className="font-bold text-white">{weapon.rangeMeters}m</span></div>
        </div>
      </div>

      <button
        disabled={!canAfford}
        onClick={onBuy}
        className={`w-full py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
          canAfford
            ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md'
            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
        }`}
      >
        {canAfford ? `KUP BROŃ ($${weapon.price})` : 'BRAK ŚRODKÓW'}
      </button>
    </div>
  );
};
