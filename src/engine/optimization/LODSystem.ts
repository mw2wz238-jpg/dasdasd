import * as THREE from 'three';
import { Combatant } from '../../types/game';
import { CombatAIController } from '../ai/CombatAIController';

/**
 * ============================================================================
 * PROJEKT VANGUARD — SYSTEM POZIOMÓW DETALU LOD I GEOMETRII (ZERO-GC)
 * ============================================================================
 * Klasa: LODSystem
 * Architektura: Zero-GC w pętli renderowania i tickach logiki.
 * 
 * Odpowiedzialność:
 * 1. Dystansowy menedżer LOD dla obiektów środowiska i geometrii:
 *    - High [0 - 25m]: Pełne cienie (castShadow & receiveShadow), pełna geometria PBR.
 *    - Medium [25 - 75m]: Uproszczone cienie, wyłączenie drobnych detali, tańsze materiały.
 *    - Low [75 - 150m]: Całkowite wyłączenie rzucania cieni (castShadow = false), redukcja Draw Calls.
 *    - Culled [> 150m]: Całkowite ukrycie drobnych obiektów poza zasięgiem taktycznym.
 * 2. Adaptacyjne skalowanie częstotliwości aktualizacji AI i animacji botów (AI Tick Rate Scaling):
 *    - Blisko gracza (< 25m): 60 Hz tick (co 1 klatkę) — natychmiastowa reakcja i płynny ruch.
 *    - Średni dystans (25 - 75m): 30 Hz tick (co 2 klatki) — interpolacja pozycji.
 *    - Daleki dystans (75 - 150m): 15 Hz tick (co 4 klatki) — odciążenie głównego wątku procesora.
 *    - Bardzo daleki (> 150m): 7.5 Hz tick (co 8 klatek).
 * ============================================================================
 */

export enum LODLevel {
  HIGH = 0,   // 0 - 25m
  MEDIUM = 1, // 25 - 75m
  LOW = 2,    // 75 - 150m
  CULLED = 3, // > 150m
}

export interface LODObjectItem {
  id: string;
  root: THREE.Object3D;
  meshHigh?: THREE.Object3D;
  meshMedium?: THREE.Object3D;
  meshLow?: THREE.Object3D;
  position: THREE.Vector3;
  currentLevel: LODLevel;
  originalCastShadow: boolean;
  originalReceiveShadow: boolean;
}

export interface BotLODAgent {
  botId: string;
  combatant: Combatant;
  aiController?: CombatAIController;
  currentLevel: LODLevel;
  frameModulo: number;
  lastTickTime: number;
}

export interface LODSystemStats {
  totalObjects: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  culledCount: number;
  activeBotAgents: number;
  botsFullRate: number;
  botsReducedRate: number;
}

export class LODSystem {
  private static instance: LODSystem | null = null;

  // Rejestr obiektów środowiskowych LOD
  private readonly objects: LODObjectItem[] = [];
  private readonly maxObjects: number = 1024;

  // Rejestr botów podlegających AI Tick Rate Scaling
  private readonly botAgents: Map<string, BotLODAgent> = new Map();

  // Progi dystansowe podniesione do kwadratu dla szybkiego porównania bez Math.sqrt (Zwiększone dla pełnego pokrycia mapy 260x260)
  private readonly DIST_HIGH_SQ = 90.0 * 90.0;     // 8100 m^2 (0 - 90m)
  private readonly DIST_MEDIUM_SQ = 220.0 * 220.0; // 48400 m^2 (90 - 220m)
  private readonly DIST_LOW_SQ = 450.0 * 450.0;    // 202500 m^2 (220 - 450m)

  // Reużywalne wektory pomocnicze (Zero-GC)
  private readonly _vCamPos = new THREE.Vector3();
  private readonly _vDiff = new THREE.Vector3();

  // Licznik klatek dla modulacji ticku
  private frameCounter: number = 0;

  // Pre-alokowany obiekt statystyk (Zero-GC)
  private readonly stats: LODSystemStats = {
    totalObjects: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    culledCount: 0,
    activeBotAgents: 0,
    botsFullRate: 0,
    botsReducedRate: 0,
  };

  constructor() {}

  public static getInstance(): LODSystem {
    if (!LODSystem.instance) {
      LODSystem.instance = new LODSystem();
    }
    return LODSystem.instance;
  }

  /**
   * Rejestruje obiekt środowiska (np. suwnica, kontener, palety) w systemie LOD
   */
  public registerObject(
    id: string,
    root: THREE.Object3D,
    meshHigh?: THREE.Object3D,
    meshMedium?: THREE.Object3D,
    meshLow?: THREE.Object3D
  ): void {
    if (this.objects.length >= this.maxObjects) return;

    const pos = new THREE.Vector3();
    root.getWorldPosition(pos);

    let castShadow = true;
    let receiveShadow = true;
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        castShadow = child.castShadow;
        receiveShadow = child.receiveShadow;
      }
    });

    this.objects.push({
      id,
      root,
      meshHigh: meshHigh ?? root,
      meshMedium,
      meshLow,
      position: pos,
      currentLevel: LODLevel.HIGH,
      originalCastShadow: castShadow,
      originalReceiveShadow: receiveShadow,
    });
  }

  /**
   * Rejestruje bota w systemie skalowania częstotliwości AI i animacji
   */
  public registerBot(combatant: Combatant, aiController?: CombatAIController): void {
    this.botAgents.set(combatant.id, {
      botId: combatant.id,
      combatant,
      aiController,
      currentLevel: LODLevel.HIGH,
      frameModulo: 1,
      lastTickTime: 0,
    });
  }

  public unregisterBot(botId: string): void {
    this.botAgents.delete(botId);
  }

  /**
   * Główna pętla aktualizacji poziomów detalu LOD (Zero-GC)
   */
  public update(cameraPosition: THREE.Vector3, dt: number): void {
    this.frameCounter++;
    this._vCamPos.copy(cameraPosition);

    // Reset statystyk
    this.stats.totalObjects = this.objects.length;
    this.stats.highCount = 0;
    this.stats.mediumCount = 0;
    this.stats.lowCount = 0;
    this.stats.culledCount = 0;
    this.stats.activeBotAgents = this.botAgents.size;
    this.stats.botsFullRate = 0;
    this.stats.botsReducedRate = 0;

    // 1. Aktualizacja obiektów środowiskowych (Meshes & Shadows)
    const objCount = this.objects.length;
    for (let i = 0; i < objCount; i++) {
      const item = this.objects[i];

      // Kwadrat odległości od kamery do obiektu
      const dx = this._vCamPos.x - item.position.x;
      const dy = this._vCamPos.y - item.position.y;
      const dz = this._vCamPos.z - item.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      let targetLevel: LODLevel = LODLevel.CULLED;
      if (distSq <= this.DIST_HIGH_SQ) {
        targetLevel = LODLevel.HIGH;
        this.stats.highCount++;
      } else if (distSq <= this.DIST_MEDIUM_SQ) {
        targetLevel = LODLevel.MEDIUM;
        this.stats.mediumCount++;
      } else if (distSq <= this.DIST_LOW_SQ) {
        targetLevel = LODLevel.LOW;
        this.stats.lowCount++;
      } else {
        targetLevel = LODLevel.CULLED;
        this.stats.culledCount++;
      }

      // Jeśli poziom uległ zmianie, przełączamy widoczność wariantów geometrii i cienie
      if (item.currentLevel !== targetLevel) {
        item.currentLevel = targetLevel;
        this.applyObjectLOD(item, targetLevel);
      }
    }

    // 2. Aktualizacja skalowania częstotliwości AI i animacji botów (AI Tick Rate Scaling)
    for (const agent of this.botAgents.values()) {
      if (!agent.combatant.isAlive) continue;

      const bx = agent.combatant.pos.x;
      const by = agent.combatant.pos.y;
      const bz = agent.combatant.pos.z;
      const dx = this._vCamPos.x - bx;
      const dy = this._vCamPos.y - by;
      const dz = this._vCamPos.z - bz;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= this.DIST_HIGH_SQ) {
        agent.currentLevel = LODLevel.HIGH;
        agent.frameModulo = 1; // 60 Hz tick co klatkę
        this.stats.botsFullRate++;
      } else if (distSq <= this.DIST_MEDIUM_SQ) {
        agent.currentLevel = LODLevel.MEDIUM;
        agent.frameModulo = 2; // 30 Hz tick co 2 klatki
        this.stats.botsReducedRate++;
      } else if (distSq <= this.DIST_LOW_SQ) {
        agent.currentLevel = LODLevel.LOW;
        agent.frameModulo = 4; // 15 Hz tick co 4 klatki
        this.stats.botsReducedRate++;
      } else {
        agent.currentLevel = LODLevel.CULLED;
        agent.frameModulo = 8; // 7.5 Hz tick co 8 klatek
        this.stats.botsReducedRate++;
      }
    }
  }

  /**
   * Sprawdza czy dany bot powinien wykonać tick logiki AI w bieżącej klatce
   */
  public shouldUpdateBot(botId: string): boolean {
    const agent = this.botAgents.get(botId);
    if (!agent) return true;
    return (this.frameCounter % agent.frameModulo === 0);
  }

  /**
   * Pobiera efektywny mnożnik czasu (dt multiplier) z uwzględnieniem pominiętych klatek
   */
  public getBotEffectiveDt(botId: string, baseDt: number): number {
    const agent = this.botAgents.get(botId);
    if (!agent) return baseDt;
    return baseDt * agent.frameModulo;
  }

  /**
   * Aplikuje konfigurację renderowania dla danego poziomu LOD
   */
  private applyObjectLOD(item: LODObjectItem, level: LODLevel): void {
    if (level === LODLevel.CULLED) {
      item.root.visible = false;
      return;
    }

    item.root.visible = true;

    // Przełączanie wariantów geometrii jeśli zostały zarejestrowane
    if (item.meshHigh && item.meshMedium) {
      item.meshHigh.visible = (level === LODLevel.HIGH);
      item.meshMedium.visible = (level === LODLevel.MEDIUM);
      if (item.meshLow) {
        item.meshLow.visible = (level === LODLevel.LOW);
      }
    }

    // Degradacja cieni zależna od odległości (Zero Draw Call dla cieni w Low LOD)
    const shouldCastShadow = (level === LODLevel.HIGH && item.originalCastShadow);
    item.root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = shouldCastShadow;
      }
    });
  }

  public getStats(): Readonly<LODSystemStats> {
    return this.stats;
  }

  public clear(): void {
    this.objects.length = 0;
    this.botAgents.clear();
  }
}
