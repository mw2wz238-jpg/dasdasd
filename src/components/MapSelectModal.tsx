import React from 'react';
import { MapId } from '../types/game';
import { X, MapPin, Sun, Snowflake, Moon } from 'lucide-react';

interface MapSelectModalProps {
  currentMap: MapId;
  onSelectMap: (mapId: MapId) => void;
  onClose: () => void;
}

export const MapSelectModal: React.FC<MapSelectModalProps> = ({
  currentMap,
  onSelectMap,
  onClose,
}) => {
  const maps = [
    {
      id: 'industrial' as MapId,
      name: 'SEKTOR 04 — STREFA PRZEMYSŁOWA (MP_INDUSTRIAL_SECTOR_04)',
      desc: 'Taktyczny blueprint CAD: Train Depot z torowiskiem i wagonami, skład kontenerów CQB, wrak zwiadowcy, hala Warehouse Main z Office Block, suwnice i kładki +3.5m.',
      icon: Sun,
      tag: 'BLUEPRINT CAD • PBR / HDR / CSM',
      accent: 'border-amber-500/60 bg-amber-950/20',
    },
    {
      id: 'winter_village' as MapId,
      name: 'MAPA 2 — GÓRSKA WIOSKA (ZIMA)',
      desc: 'Ośnieżona górska kotlina z drewnianymi schroniskami, kamiennym mostem chokepoint i gęstym lasem sosnowym pokrytym śniegiem.',
      icon: Snowflake,
      tag: 'ŚNIEŻNY KLIMAT • SNIPER OVERWATCH',
      accent: 'border-blue-500/60 bg-blue-950/20',
    },
    {
      id: 'night_docks' as MapId,
      name: 'SCENA — DOKI NOC / DESZCZ',
      desc: 'Mokry asfalt z lustrzanymi kałużami, kontrastowe reflektory halogenowe sodowo-niebieskie, nocna atmosfera taktyczna.',
      icon: Moon,
      tag: 'NOC / MOKRE REFLEKSY • CQB',
      accent: 'border-indigo-500/60 bg-indigo-950/20',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md font-sans text-white p-6">
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-black tracking-widest text-white uppercase">
              WYBÓR TEATRU DZIAŁAŃ BOJOWYCH
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {maps.map((m) => {
            const Icon = m.icon;
            const isSelected = currentMap === m.id;
            return (
              <div
                key={m.id}
                onClick={() => {
                  onSelectMap(m.id);
                  onClose();
                }}
                className={`flex flex-col justify-between p-5 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? `${m.accent} border-amber-500 shadow-xl`
                    : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Icon className={`w-6 h-6 ${isSelected ? 'text-amber-400' : 'text-zinc-400'}`} />
                    <span className="text-[10px] font-black tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                      {m.tag}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2">
                    {m.name}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                    {m.desc}
                  </p>
                </div>

                <button
                  className={`w-full py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-zinc-950 shadow-md'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {isSelected ? 'AKTYWNY TEATR' : 'WYBIERZ MAPĘ'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
