import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Shield,
  Swords,
  Radio,
  Play,
  Plus,
  RefreshCw,
  Lock,
  Globe,
  Wifi,
  CheckCircle,
  XCircle,
  Send,
  MessageSquare,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { MapId } from '../types/game';
import { MultiplayerManager } from '../engine/multiplayer/MultiplayerManager';
import { MultiplayerRoom, MultiplayerTeam } from '../types/multiplayer';

interface MultiplayerLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartMatch: (mapId: MapId, team: MultiplayerTeam, room: MultiplayerRoom) => void;
}

export const MultiplayerLobbyModal: React.FC<MultiplayerLobbyModalProps> = ({
  isOpen,
  onClose,
  onStartMatch,
}) => {
  const net = MultiplayerManager.getInstance();
  const [, setTick] = useState(0);

  // Tabs: 'MATCHMAKING' | 'BROWSER' | 'CREATE' | 'ROOM'
  const [activeTab, setActiveTab] = useState<'MATCHMAKING' | 'BROWSER' | 'CREATE' | 'ROOM'>('MATCHMAKING');

  // Input states
  const [playerNameInput, setPlayerNameInput] = useState(net.localPlayerName);
  const [roomNameInput, setRoomNameInput] = useState('OPERACJA SPECJALNA');
  const [selectedMap, setSelectedMap] = useState<MapId>('industrial');
  const [chatInput, setChatInput] = useState('');
  const [roomPasswordInput, setRoomPasswordInput] = useState('');
  const [fillBotsOption, setFillBotsOption] = useState(true);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Synchronizacja z MultiplayerManagerem
  useEffect(() => {
    const unsub = net.subscribe(() => {
      setTick((t) => t + 1);
      if (net.currentRoom && activeTab !== 'ROOM') {
        setActiveTab('ROOM');
      }
    });
    return unsub;
  }, [net, activeTab]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [net.chatMessages]);

  if (!isOpen) return null;

  const currentRoom = net.currentRoom;
  const localPlayer = currentRoom?.players.find((p) => p.id === net.localPlayerId);

  const mapDisplayNames: Record<MapId, string> = {
    industrial: 'Sektor 04: Strefa Przemysłowa (Dzień)',
    winter_village: 'Górska Wioska (Zima)',
    night_docks: 'Doki (Noc / Deszcz)',
  };

  const handleStartMatchmaking = () => {
    net.startMatchmaking({ preferredMap: selectedMap }, (room) => {
      setActiveTab('ROOM');
    });
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const room = net.createRoom(roomNameInput, selectedMap, 'DEFUSAL_5V5', fillBotsOption, roomPasswordInput || undefined);
    setActiveTab('ROOM');
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      net.sendChatMessage(chatInput);
      setChatInput('');
    }
  };

  const handleLaunchGameFromRoom = () => {
    if (!currentRoom || !localPlayer) return;
    net.forceStartMatch((room) => {
      onStartMatch(room.map, localPlayer.team, room);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl select-none font-sans text-white">
      <div className="relative w-full max-w-5xl h-[92vh] max-h-[820px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* 1. TOP HEADER & NETWORK STATUS */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Globe className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-widest text-white uppercase">
                  MULTIPLAYER WAR-ROOM
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  ONLINE 5v5
                </span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Wifi className="w-3.5 h-3.5" /> 64 TICK
                </span>
                <span>•</span>
                <span>REGION: EU-CENTRAL (WARSAW)</span>
                <span>•</span>
                <span>PING: ~16ms</span>
              </div>
            </div>
          </div>

          {/* Player Identity Input */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">TWÓJ KOD OPERATORA</span>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => {
                  setPlayerNameInput(e.target.value);
                  net.setPlayerName(e.target.value);
                }}
                className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-xs font-bold text-amber-400 focus:outline-none focus:border-amber-400 w-36 text-right"
                placeholder="Operator-1"
                maxLength={16}
              />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 2. NAVIGATION TABS (Gdy nie jesteśmy w pokoju) */}
        {!currentRoom && (
          <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-6 shrink-0">
            <button
              onClick={() => setActiveTab('MATCHMAKING')}
              className={`flex items-center gap-2 px-6 py-3.5 text-xs font-black tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
                activeTab === 'MATCHMAKING'
                  ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Radio className="w-4 h-4" />
              SZYBKI MECZ (MATCHMAKING)
            </button>
            <button
              onClick={() => setActiveTab('BROWSER')}
              className={`flex items-center gap-2 px-6 py-3.5 text-xs font-black tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
                activeTab === 'BROWSER'
                  ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Users className="w-4 h-4" />
              PRZEGLĄDARKA SERWERÓW ({net.roomsList.length})
            </button>
            <button
              onClick={() => setActiveTab('CREATE')}
              className={`flex items-center gap-2 px-6 py-3.5 text-xs font-black tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
                activeTab === 'CREATE'
                  ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Plus className="w-4 h-4" />
              STWÓRZ WŁASNY POKÓJ
            </button>
          </div>
        )}

        {/* 3. MAIN CONTENT CONTAINER */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          
          {/* TAB 1: SZYBKI MATCHMAKING */}
          {!currentRoom && activeTab === 'MATCHMAKING' && (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center gap-6">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <div
                  className={`absolute inset-0 rounded-full border border-amber-500/20 ${
                    net.matchmakingStatus === 'SEARCHING' ? 'animate-ping' : ''
                  }`}
                />
                <div className="absolute inset-2 rounded-full border border-dashed border-amber-500/40 animate-spin-slow" />
                <div className="w-28 h-28 rounded-full bg-amber-500/10 border-2 border-amber-500/60 flex flex-col items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.2)]">
                  <Swords className="w-10 h-10 text-amber-400 mb-1" />
                  <span className="text-[10px] font-black tracking-widest text-amber-400 uppercase">
                    5v5 TACTICAL
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-black uppercase text-white tracking-tight">
                  {net.matchmakingStatus === 'SEARCHING'
                    ? 'POSZUKIWANIE MECZU WIELOOSOBOWEGO...'
                    : net.matchmakingStatus === 'MATCH_FOUND'
                    ? 'ZNALEZIONO MECZ! PRZYPISYWANIE SERWERA...'
                    : net.matchmakingStatus === 'CONNECTING'
                    ? 'ŁĄCZENIE Z POKOJEM...'
                    : 'DOBIERANIE GRACZY 5v5 (SEARCH & DESTROY)'}
                </h3>
                <p className="text-xs text-zinc-400 max-w-md mt-1">
                  Automatyczne dobieranie graczy wg pingu (EU-Central &lt; 25ms), autorytatywny cykl rund z bombą C4 i pełna synchronizacja wieloosobowa.
                </p>
              </div>

              {/* Map Selection for Matchmaking */}
              <div className="flex flex-col gap-2 w-full">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider text-left">
                  PREFEROWANA MAPA TAKTYCZNA:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(['industrial', 'winter_village', 'night_docks'] as MapId[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMap(m)}
                      className={`p-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                        selectedMap === m
                          ? 'border-amber-500 bg-amber-500/15 text-amber-400 shadow-md'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {mapDisplayNames[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              {net.matchmakingStatus === 'SEARCHING' ? (
                <div className="flex flex-col items-center gap-3">
                  <span className="font-mono text-amber-400 text-lg font-black tabular-nums">
                    CZAS W KOLEJCE: {net.matchmakingTimer}s
                  </span>
                  <button
                    onClick={() => net.cancelMatchmaking()}
                    className="px-6 py-2.5 bg-red-950/80 hover:bg-red-900 border border-red-500/60 text-red-300 font-bold text-xs rounded-xl transition-all cursor-pointer uppercase"
                  >
                    ANULUJ WYSZUKIWANIE
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStartMatchmaking}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-widest text-sm rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.6)] transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5 fill-current" />
                  SZUKAJ MECZU WIELOOSOBOWEGO
                </button>
              )}
            </div>
          )}

          {/* TAB 2: PRZEGLĄDARKA POKOI */}
          {!currentRoom && activeTab === 'BROWSER' && (
            <div className="h-full flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  AKTYWNE SERWERY SPOŁECZNOŚCIOWE
                </span>
                <button
                  onClick={() => setTick((t) => t + 1)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-bold text-zinc-300 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> ODŚWIEŻ
                </button>
              </div>

              <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950/60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[10px] text-zinc-400 font-black tracking-wider uppercase">
                      <th className="p-3">NAZWA POKOJU</th>
                      <th className="p-3">MAPA</th>
                      <th className="p-3">TRYB</th>
                      <th className="p-3">GRACZE</th>
                      <th className="p-3">REGION / PING</th>
                      <th className="p-3 text-right">AKCJA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {net.roomsList.map((room) => (
                      <tr
                        key={room.id}
                        className="border-b border-zinc-800/60 hover:bg-zinc-900/50 transition-colors"
                      >
                        <td className="p-3 font-bold text-white flex items-center gap-2">
                          {room.isPrivate && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                          <span>{room.name}</span>
                        </td>
                        <td className="p-3 text-zinc-300">{mapDisplayNames[room.map]}</td>
                        <td className="p-3 text-zinc-400 font-mono">5v5 S&D</td>
                        <td className="p-3 font-mono font-bold text-amber-400">
                          {room.players.length} / {room.maxPlayers}
                        </td>
                        <td className="p-3 font-mono text-emerald-400">
                          {room.region} (~18ms)
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              net.joinRoom(room.id);
                              setActiveTab('ROOM');
                            }}
                            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-wider rounded text-[11px] uppercase cursor-pointer transition-transform transform active:scale-95"
                          >
                            DOŁĄCZ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: STWÓRZ POKÓJ */}
          {!currentRoom && activeTab === 'CREATE' && (
            <form onSubmit={handleCreateRoom} className="max-w-xl mx-auto w-full flex flex-col gap-5 py-4">
              <div>
                <h3 className="text-xl font-black uppercase text-white">STWÓRZ NOWY POKÓJ TAKTYCZNY</h3>
                <p className="text-xs text-zinc-400">Skonfiguruj serwer dedykowany i zaproś innych graczy lub walcz z botami.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  NAZWA POKOJU
                </label>
                <input
                  type="text"
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  WYBÓR TEATRU DZIAŁAŃ (MAPA)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['industrial', 'winter_village', 'night_docks'] as MapId[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMap(m)}
                      className={`p-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                        selectedMap === m
                          ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {mapDisplayNames[m]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-white block">DOPEŁNIENIE BOTAMI AI (5v5)</span>
                  <span className="text-[11px] text-zinc-400">Automatycznie uzupełnia wolne miejsca taktycznymi botami</span>
                </div>
                <input
                  type="checkbox"
                  checked={fillBotsOption}
                  onChange={(e) => setFillBotsOption(e.target.checked)}
                  className="w-5 h-5 accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  HASŁO POKOJU (OPCJONALNE)
                </label>
                <input
                  type="password"
                  value={roomPasswordInput}
                  onChange={(e) => setRoomPasswordInput(e.target.value)}
                  placeholder="Pozostaw puste dla pokoju publicznego"
                  className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-widest text-sm rounded-xl shadow-lg transition-transform transform active:scale-95 cursor-pointer uppercase mt-2"
              >
                UTWÓRZ POKÓJ I WEJDŹ DO LOBBY
              </button>
            </form>
          )}

          {/* TAB 4: WIDOK AKTYWNEGO POKOJU / POCZEKALNIA (ROOM LOBBY) */}
          {currentRoom && (
            <div className="h-full flex flex-col gap-4">
              {/* Room Top Banner */}
              <div className="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black uppercase text-white tracking-wide">
                      {currentRoom.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                      MAPA: {mapDisplayNames[currentRoom.map]}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    TRYB: SEARCH & DESTROY 5v5 • {currentRoom.region} • {currentRoom.players.length} / 10 OPERATORÓW
                  </span>
                </div>

                {/* Countdown banner if starting */}
                {currentRoom.status === 'STARTING' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-zinc-950 rounded-lg font-black text-sm animate-pulse">
                    <Sparkles className="w-4 h-4" />
                    <span>START ZA: {currentRoom.countdown}S</span>
                  </div>
                )}

                <button
                  onClick={() => net.leaveRoom()}
                  className="px-4 py-2 bg-red-950/80 hover:bg-red-900 border border-red-500/50 text-red-300 font-bold text-xs rounded-lg transition-colors cursor-pointer uppercase"
                >
                  OPUŚĆ POKÓJ
                </button>
              </div>

              {/* Teams & Roster 5v5 Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
                
                {/* TEAM VANGUARD (NIEBIESCY) */}
                <div className="flex flex-col bg-blue-950/20 border border-blue-500/30 rounded-xl p-4 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-blue-500/30 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-black tracking-widest text-blue-300 uppercase">
                        TEAM VANGUARD (OBROŃCY)
                      </span>
                    </div>
                    {localPlayer?.team !== 'vanguard' && (
                      <button
                        onClick={() => net.switchTeam('vanguard')}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-black uppercase cursor-pointer"
                      >
                        DOŁĄCZ DO VANGUARD
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                    {currentRoom.players
                      .filter((p) => p.team === 'vanguard')
                      .map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                            p.id === net.localPlayerId
                              ? 'bg-blue-500/20 border-blue-400'
                              : 'bg-zinc-900/60 border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                            <div className="flex flex-col">
                              <span className="font-black text-white">
                                {p.name} {p.isHost && '👑'} {p.id === net.localPlayerId && '(TY)'}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400">{p.rank}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-zinc-400">{p.ping}ms</span>
                            {p.isReady ? (
                              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase">
                                <CheckCircle className="w-3.5 h-3.5" /> GOTOWY
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] font-black text-zinc-500 uppercase">
                                <XCircle className="w-3.5 h-3.5" /> CZEKA
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* TEAM SYNDICATE (CZERWONI) */}
                <div className="flex flex-col bg-red-950/20 border border-red-500/30 rounded-xl p-4 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-red-500/30 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Swords className="w-4 h-4 text-red-400" />
                      <span className="text-xs font-black tracking-widest text-red-300 uppercase">
                        TEAM SYNDICATE (ATAKUJĄCY)
                      </span>
                    </div>
                    {localPlayer?.team !== 'syndicate' && (
                      <button
                        onClick={() => net.switchTeam('syndicate')}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-black uppercase cursor-pointer"
                      >
                        DOŁĄCZ DO SYNDICATE
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                    {currentRoom.players
                      .filter((p) => p.team === 'syndicate')
                      .map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                            p.id === net.localPlayerId
                              ? 'bg-red-500/20 border-red-400'
                              : 'bg-zinc-900/60 border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full bg-red-400" />
                            <div className="flex flex-col">
                              <span className="font-black text-white">
                                {p.name} {p.isHost && '👑'} {p.id === net.localPlayerId && '(TY)'}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400">{p.rank}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-zinc-400">{p.ping}ms</span>
                            {p.isReady ? (
                              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase">
                                <CheckCircle className="w-3.5 h-3.5" /> GOTOWY
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] font-black text-zinc-500 uppercase">
                                <XCircle className="w-3.5 h-3.5" /> CZEKA
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Bottom Bar: Live Chat + Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-36">
                
                {/* Live Chat Box */}
                <div className="md:col-span-2 bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col">
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto flex flex-col gap-1 text-xs">
                    {net.chatMessages.map((msg) => (
                      <div key={msg.id} className="flex items-baseline gap-2">
                        <span className="text-[10px] font-mono text-zinc-500">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.isSystem ? (
                          <span className="text-[11px] font-bold text-amber-400 italic">
                            [SYSTEM] {msg.text}
                          </span>
                        ) : (
                          <span>
                            <span
                              className={`font-black uppercase text-[10px] mr-1 ${
                                msg.team === 'vanguard'
                                  ? 'text-blue-400'
                                  : msg.team === 'syndicate'
                                  ? 'text-red-400'
                                  : 'text-zinc-400'
                              }`}
                            >
                              {msg.senderName}:
                            </span>
                            <span className="text-zinc-200">{msg.text}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleSendMessage} className="flex gap-2 mt-2 pt-2 border-t border-zinc-800">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Napisz na czacie taktycznym..."
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-bold cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>

                {/* Right Action Panel */}
                <div className="flex flex-col justify-between bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
                  <button
                    onClick={() => net.toggleReady()}
                    className={`w-full py-2.5 rounded-xl font-black text-xs tracking-wider uppercase transition-all cursor-pointer border ${
                      localPlayer?.isReady
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-600'
                    }`}
                  >
                    {localPlayer?.isReady ? '✓ STATUS: GOTOWY DO WALKI' : 'PRZEŁĄCZ: JESTEM GOTOWY'}
                  </button>

                  <button
                    onClick={handleLaunchGameFromRoom}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-widest text-xs rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.5)] transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    WEJDŹ DO GRY 3D
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
