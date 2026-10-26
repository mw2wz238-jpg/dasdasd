import { MapId } from './game';

/**
 * ============================================================================
 * TYPY I DANE MULTIPLAYER DLA SILNIKA FPS (AAA STANDARD)
 * ============================================================================
 */

export type MultiplayerTeam = 'vanguard' | 'syndicate' | 'spectator';

export interface RoomPlayer {
  id: string;
  name: string;
  team: MultiplayerTeam;
  isReady: boolean;
  isHost: boolean;
  ping: number;
  rank: string;
  kills: number;
  deaths: number;
  score: number;
  isBot?: boolean;
}

export type GameModeId = 'DEFUSAL_5V5' | 'TACTICAL_DEATHMATCH';

export interface MultiplayerRoom {
  id: string;
  name: string;
  map: MapId;
  gameMode: GameModeId;
  maxPlayers: number;
  players: RoomPlayer[];
  status: 'LOBBY' | 'STARTING' | 'IN_GAME';
  countdown?: number;
  password?: string;
  isPrivate: boolean;
  fillBots: boolean;
  region: string;
  tickRate: number;
  roundLimit: number;
  createdAt: number;
}

export interface LobbyChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team: MultiplayerTeam;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export type MatchmakingStatus = 'IDLE' | 'SEARCHING' | 'MATCH_FOUND' | 'CONNECTING' | 'IN_ROOM';

export interface MatchmakingFilter {
  preferredMap: MapId | 'all';
  gameMode: GameModeId;
  maxPing: number;
}
