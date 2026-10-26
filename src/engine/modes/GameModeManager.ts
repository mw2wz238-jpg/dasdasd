import * as THREE from 'three';
import { SimulationEngine } from '../simulation';
import { Combatant, Team } from '../../types/game';
import { Sound } from '../audio';

/**
 * ============================================================================
 * PROJEKT VANGUARD — MENEDŻER TRYBU GRY I SYSTEM RESPAWNÓW
 * ============================================================================
 * Klasa: GameModeManager
 * Architektura: Zero-GC (Zero Garbage Collection) w pętli renderowania/logiki.
 * 
 * Odpowiedzialność:
 * 1. Maszyna stanów rundy (Match Logic FSM):
 *    - WARMUP: Rozgrzewka, swobodne poruszanie się przed startem meczu
 *    - ROUND_START: Zamrożenie taktyczne (Tactical Buy & Prep, 5s)
 *    - IN_PROGRESS: Główna faza walki (Live Combat, 115s)
 *    - ROUND_END: Podsumowanie rundy, wyłonienie zwycięzcy, naliczenie nagród (5s)
 *    - MATCH_OVER: Zakończenie całego meczu i prezentacja wyników końcowych
 * 2. Inteligentny system odradzania (Safe Spawn Selection) na mapie "STREFA Przemysłowa Dzień":
 *    - Ewaluacja bezpieczeństwa punktu (Threat Scoring):
 *      * Odległość od najbliższych żywych wrogów
 *      * Sprawdzenie widoczności (Line of Sight - LoS Raycast)
 *      * Eliminacja zjawiska Spawn-Campingu i Spawn-Killingu
 * 3. Nadzór nad eliminacją drużyn, czasem rundy oraz resetem stanu graczy i amunicji
 * ============================================================================
 */

export enum MatchState {
  WARMUP = 'WARMUP',
  ROUND_START = 'ROUND_START',
  IN_PROGRESS = 'IN_PROGRESS',
  ROUND_END = 'ROUND_END',
  MATCH_OVER = 'MATCH_OVER',
}

export interface MatchSummaryData {
  state: MatchState;
  roundNumber: number;
  maxRounds: number;
  scoreVanguard: number;
  scoreSyndicate: number;
  timeRemainingSec: number;
  vanguardAliveCount: number;
  vanguardTotalCount: number;
  syndicateAliveCount: number;
  syndicateTotalCount: number;
  roundWinnerTeam: Team | null;
  winReason: string;
}

export class GameModeManager {
  private sim: SimulationEngine;

  // Stan maszyny stanów meczu
  private currentState: MatchState = MatchState.WARMUP;
  private stateTimer: number = 10.0; // Odliczanie fazy
  private roundNumber: number = 1;
  private readonly maxRoundsToWin: number = 9; // Pierwsza drużyna do 9 wygranych rund
  private scoreVanguard: number = 0;
  private scoreSyndicate: number = 0;
  private roundWinnerTeam: Team | null = null;
  private winReason: string = '';

  // Punkty odradzania dla mapy "STREFA Przemysłowa Dzień" (Sektor 04)
  private readonly vanguardSpawnPool: THREE.Vector3[] = [];
  private readonly syndicateSpawnPool: THREE.Vector3[] = [];

  // Reużywalne wektory dla Zero-GC sprawdzania odległości i LoS
  private readonly _vRayOrigin = new THREE.Vector3();
  private readonly _vRayDir = new THREE.Vector3();
  private readonly _vCandidatePos = new THREE.Vector3();

  // Pre-alokowany obiekt podsumowania meczu (Zero-GC)
  private readonly matchSummary: MatchSummaryData = {
    state: MatchState.WARMUP,
    roundNumber: 1,
    maxRounds: 17,
    scoreVanguard: 0,
    scoreSyndicate: 0,
    timeRemainingSec: 10,
    vanguardAliveCount: 5,
    vanguardTotalCount: 5,
    syndicateAliveCount: 5,
    syndicateTotalCount: 5,
    roundWinnerTeam: null,
    winReason: '',
  };

  constructor(sim: SimulationEngine) {
    this.sim = sim;
    this.initIndustrialSpawns();
  }

  /**
   * Rejestracja taktycznych punktów odradzania w Sektorze Przemysłowym 04.
   * Obejmuje główne strefy wyjściowe oraz rezerwowe punkty taktyczne w hangarach i dokach.
   */
  private initIndustrialSpawns(): void {
    // Strefa Vanguard (Południe / Doki / Kontenery przeładunkowe)
    this.vanguardSpawnPool.push(
      new THREE.Vector3(-35, 1.75, 68),
      new THREE.Vector3(-22, 1.75, 72),
      new THREE.Vector3(-10, 1.75, 70),
      new THREE.Vector3(5, 1.75, 72),
      new THREE.Vector3(20, 1.75, 68),
      // Punkty zapasowe / flanki
      new THREE.Vector3(-45, 1.75, 52),
      new THREE.Vector3(32, 1.75, 54),
      new THREE.Vector3(-2, 1.75, 60)
    );

    // Strefa Syndicate (Północ / Skład kolejowy / Hangar maszynowy)
    this.syndicateSpawnPool.push(
      new THREE.Vector3(45, 1.75, -78),
      new THREE.Vector3(54, 1.75, -82),
      new THREE.Vector3(62, 1.75, -76),
      new THREE.Vector3(70, 1.75, -80),
      new THREE.Vector3(58, 1.75, -70),
      // Punkty zapasowe / rampa magazynu
      new THREE.Vector3(28, 1.75, -62),
      new THREE.Vector3(-20, 1.75, -72),
      new THREE.Vector3(12, 1.75, -74)
    );
  }

  /**
   * Główny cykl aktualizacji maszyny stanów meczu (Zero-GC)
   */
  public update(dt: number): void {
    this.stateTimer -= dt;

    switch (this.currentState) {
      case MatchState.WARMUP:
        if (this.stateTimer <= 0) {
          this.transitionTo(MatchState.ROUND_START, 5.0);
          this.prepareNewRound();
        }
        break;

      case MatchState.ROUND_START:
        // Czas przygotowania (Freeze time / Zakupy)
        if (this.stateTimer <= 0) {
          this.transitionTo(MatchState.IN_PROGRESS, 115.0);
          Sound.playRoundStart();
        }
        break;

      case MatchState.IN_PROGRESS:
        this.checkEliminationConditions();
        if (this.stateTimer <= 0) {
          // Koniec czasu rundy — obrońcy (domyślnie Vanguard chroniący cel lub zależnie od podłożenia)
          if (this.sim.roundState === 'BOMB_PLANTED') {
            // Jeśli bomba podłożona, czas regulaminowy to czas wybuchu C4 w SimulationEngine
          } else {
            this.endRound('VANGUARD', 'CZAS RUNDY MINĄŁ — ZWYCIĘSTWO DEFENDERÓW');
          }
        }
        break;

      case MatchState.ROUND_END:
        if (this.stateTimer <= 0) {
          if (this.scoreVanguard >= this.maxRoundsToWin || this.scoreSyndicate >= this.maxRoundsToWin) {
            this.transitionTo(MatchState.MATCH_OVER, 15.0);
          } else {
            this.roundNumber++;
            this.transitionTo(MatchState.ROUND_START, 5.0);
            this.prepareNewRound();
          }
        }
        break;

      case MatchState.MATCH_OVER:
        // Czas oczekiwania na restart całego meczu
        if (this.stateTimer <= 0) {
          this.resetMatch();
        }
        break;
    }

    this.updateMatchSummary();
  }

  /**
   * Zmiana stanu maszyny z ustawieniem nowego timera fazy
   */
  private transitionTo(newState: MatchState, durationSec: number): void {
    this.currentState = newState;
    this.stateTimer = durationSec;
  }

  /**
   * Sprawdza, czy jedna z drużyn została w całości wyeliminowana
   */
  private checkEliminationConditions(): void {
    let vgAlive = 0;
    let syAlive = 0;

    for (const c of this.sim.combatants.values()) {
      if (c.isAlive) {
        if (c.team === 'VANGUARD') vgAlive++;
        else syAlive++;
      }
    }

    if (vgAlive === 0 && syAlive > 0) {
      if (this.sim.roundState === 'BOMB_PLANTED') {
        // Jeśli bomba jest podłożona, Vanguard musi ją rozbroić — brak ludzi oznacza wygraną Syndicate
        this.endRound('SYNDICATE', 'DRUŻYNA VANGUARD WYELIMINOWANA');
      } else {
        this.endRound('SYNDICATE', 'DRUŻYNA VANGUARD WYELIMINOWANA');
      }
    } else if (syAlive === 0 && vgAlive > 0) {
      if (this.sim.roundState === 'BOMB_PLANTED') {
        // Syndicate wyeliminowany, ale bomba wciąż tyka! Vanguard musi jeszcze rozbroić
      } else {
        this.endRound('VANGUARD', 'DRUŻYNA SYNDICATE WYELIMINOWANA');
      }
    } else if (vgAlive === 0 && syAlive === 0) {
      this.endRound('VANGUARD', 'REMIS TAKTYCZNY');
    }
  }

  /**
   * Zakończenie rundy z przyznaniem punktów i odtworzeniem fanfar
   */
  public endRound(winner: Team, reason: string): void {
    if (this.currentState === MatchState.ROUND_END || this.currentState === MatchState.MATCH_OVER) return;

    this.roundWinnerTeam = winner;
    this.winReason = reason;

    if (winner === 'VANGUARD') {
      this.scoreVanguard++;
      Sound.playRoundWon();
    } else {
      this.scoreSyndicate++;
      Sound.playRoundLost();
    }

    this.transitionTo(MatchState.ROUND_END, 5.0);
    this.sim.endRound(winner, reason);
  }

  /**
   * Przygotowuje nową rundę: bezpieczne odrodzenie gracza i botów, reset HP i amunicji
   */
  private prepareNewRound(): void {
    this.roundWinnerTeam = null;
    this.winReason = '';

    // Odrodzenie każdego combatanta na bezpiecznym punkcie respawnu
    for (const combatant of this.sim.combatants.values()) {
      combatant.isAlive = true;
      combatant.hp = combatant.maxHp;
      combatant.armor = 100;

      // Dobór bezpiecznego punktu respawnu
      const safeSpawn = this.selectSafeSpawn(combatant.team);
      combatant.pos.x = safeSpawn.x;
      combatant.pos.y = safeSpawn.y;
      combatant.pos.z = safeSpawn.z;
      combatant.yaw = combatant.team === 'VANGUARD' ? 0 : Math.PI;
      combatant.pitch = 0;

      // Uzupełnienie amunicji do pełna
      combatant.currentMag = combatant.weapon.magSize;
      combatant.reserveAmmo = combatant.weapon.reserveAmmo;
    }

    // Synchronizacja gracza
    if (this.sim.playerRef) {
      const pSpawn = this.selectSafeSpawn(this.sim.playerRef.team);
      this.sim.playerRef.pos = { x: pSpawn.x, y: pSpawn.y, z: pSpawn.z };
      this.sim.playerRef.isAlive = true;
      this.sim.playerRef.hp = 100;
      this.sim.playerRef.armor = 100;
    }
  }

  /**
   * Algorytm wyboru bezpiecznego punktu odradzania (Safe Spawn Selection Algorithm).
   * Sprawdza dystans od żywych wrogów oraz weryfikuje brak bezpośredniej linii strzału (Line of Sight).
   */
  public selectSafeSpawn(team: Team): THREE.Vector3 {
    const pool = team === 'VANGUARD' ? this.vanguardSpawnPool : this.syndicateSpawnPool;
    if (pool.length === 0) {
      return new THREE.Vector3(0, 1.75, 0);
    }

    let bestPoint = pool[0];
    let highestSafetyScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      let minEnemyDist = Infinity;
      let hasEnemyLoS = false;

      // Sprawdzenie odległości i widoczności względem wszystkich aktywnych wrogów
      for (const enemy of this.sim.combatants.values()) {
        if (!enemy.isAlive || enemy.team === team) continue;

        const dx = candidate.x - enemy.pos.x;
        const dz = candidate.z - enemy.pos.z;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);

        if (dist < minEnemyDist) {
          minEnemyDist = dist;
        }

        // Raycasting LoS sprawdzający czy wróg widzi punkt respawnu
        if (dist < 45) {
          this._vRayOrigin.set(enemy.pos.x, enemy.pos.y + 1.6, enemy.pos.z);
          this._vRayDir.set(candidate.x - enemy.pos.x, (candidate.y + 1.6) - (enemy.pos.y + 1.6), candidate.z - enemy.pos.z);
          const rayLen = this._vRayDir.length();
          this._vRayDir.normalize();

          const { closestWallDist } = this.sim.raycastWalls(this._vRayOrigin, this._vRayDir, rayLen);
          if (closestWallDist >= rayLen - 0.2) {
            // Brak ściany pomiędzy wrogiem a punktem odradzania = punkt bezpośrednio widziany!
            hasEnemyLoS = true;
          }
        }
      }

      // Ocena punktu (Safety Scoring):
      // - Wyższa odległość od wrogów to wyższy wynik
      // - Bezpośrednia linia strzału wroga skutkuje drastyczną karą punktową (-500)
      let score = minEnemyDist;
      if (hasEnemyLoS) {
        score -= 500;
      }

      if (score > highestSafetyScore) {
        highestSafetyScore = score;
        bestPoint = candidate;
      }
    }

    return bestPoint;
  }

  /**
   * Resetuje cały stan meczu po wyłonieniu ostatecznego mistrza
   */
  public resetMatch(): void {
    this.scoreVanguard = 0;
    this.scoreSyndicate = 0;
    this.roundNumber = 1;
    this.transitionTo(MatchState.WARMUP, 10.0);
    this.prepareNewRound();
  }

  /**
   * Aktualizuje obiekt podsumowania meczu bez alokacji nowych struktur (Zero-GC)
   */
  private updateMatchSummary(): void {
    let vgAlive = 0;
    let vgTotal = 0;
    let syAlive = 0;
    let syTotal = 0;

    for (const c of this.sim.combatants.values()) {
      if (c.team === 'VANGUARD') {
        vgTotal++;
        if (c.isAlive) vgAlive++;
      } else {
        syTotal++;
        if (c.isAlive) syAlive++;
      }
    }

    this.matchSummary.state = this.currentState;
    this.matchSummary.roundNumber = this.roundNumber;
    this.matchSummary.maxRounds = this.maxRoundsToWin * 2 - 1;
    this.matchSummary.scoreVanguard = this.scoreVanguard;
    this.matchSummary.scoreSyndicate = this.scoreSyndicate;
    this.matchSummary.timeRemainingSec = Math.max(0, this.stateTimer);
    this.matchSummary.vanguardAliveCount = vgAlive;
    this.matchSummary.vanguardTotalCount = vgTotal;
    this.matchSummary.syndicateAliveCount = syAlive;
    this.matchSummary.syndicateTotalCount = syTotal;
    this.matchSummary.roundWinnerTeam = this.roundWinnerTeam;
    this.matchSummary.winReason = this.winReason;
  }

  public getSummary(): Readonly<MatchSummaryData> {
    return this.matchSummary;
  }

  public getCurrentState(): MatchState {
    return this.currentState;
  }

  public getTimeRemaining(): number {
    return this.stateTimer;
  }

  public getScoreVanguard(): number {
    return this.scoreVanguard;
  }

  public getScoreSyndicate(): number {
    return this.scoreSyndicate;
  }
}
