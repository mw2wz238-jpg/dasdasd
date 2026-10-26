import * as THREE from 'three';
import { SimulationEngine } from '../simulation';

/**
 * ============================================================================
 * KONTROLER AI BOTÓW (COMBAT AI CONTROLLER)
 * ============================================================================
 * FSM: Patrol, Combat, Cover, Attack.
 * Integracja z Rapier3D dla Line of Sight (LoS).
 */

enum AIState { PATROL, COMBAT, COVER, ATTACK }

export class CombatAIController {
  private state: AIState = AIState.PATROL;
  private botId: string;
  private sim: SimulationEngine;
  
  // Pre-alokowane wektory
  private readonly direction = new THREE.Vector3();
  private readonly toPlayer = new THREE.Vector3();

  constructor(botId: string, sim: SimulationEngine) {
    this.botId = botId;
    this.sim = sim;
  }

  public update(dt: number, playerPos: THREE.Vector3) {
    const bot = this.sim.combatants.get(this.botId);
    if (!bot || !bot.isAlive) return;

    this.toPlayer.set(playerPos.x - bot.pos.x, 0, playerPos.z - bot.pos.z);
    const distToPlayer = this.toPlayer.length();
    
    // Line of Sight check
    const isVisible = this.checkLineOfSight(bot.pos, playerPos);

    switch (this.state) {
      case AIState.PATROL:
        if (isVisible && distToPlayer < 40) this.state = AIState.COMBAT;
        break;
      case AIState.COMBAT:
        if (!isVisible) this.state = AIState.COVER;
        else if (distToPlayer < 20) this.state = AIState.ATTACK;
        break;
      case AIState.COVER:
        // Logika szukania osłony
        if (isVisible) this.state = AIState.COMBAT;
        break;
      case AIState.ATTACK:
        // Logika strzelania
        break;
    }
  }

  private checkLineOfSight(start: {x:number, y:number, z:number}, end: THREE.Vector3): boolean {
    // Implementacja raycastu Rapier3D przez SimulationEngine
    return true; // Uproszczone
  }
}
