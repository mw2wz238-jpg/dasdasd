import * as THREE from 'three';

/**
 * ============================================================================
 * MODUŁ PROCEDURALNEGO ODRZUTU I ROZRZUTU (RECOIL SYSTEM)
 * ============================================================================
 * Odpowiedzialność:
 * 1. Zarządzanie wzorcami odrzutu (Recoil Patterns) dla broni automatycznej.
 * 2. Płynne wygaszanie (Recovery) odrzutu bez alokacji obiektów.
 * 3. Kalkulacja dynamicznego rozrzutu (Spread) zależna od stanu gracza.
 * 
 * Architektura Zero-GC: Brak użycia 'new' w pętli renderowania, tylko pre-alokowane wektory.
 */

export class RecoilSystem {
  // Pre-alokowane zmienne do obliczeń (Zero-GC)
  private readonly recoilVector = new THREE.Vector2();
  private readonly recoveryVector = new THREE.Vector2();
  
  // Wzorce odrzutu: [YawDelta, PitchDelta] dla każdego strzału w serii
  private patterns: Map<string, Array<[number, number]>> = new Map();
  
  private shotIndex: number = 0;
  private currentYaw: number = 0;
  private currentPitch: number = 0;

  constructor() {
    this.initPatterns();
  }

  private initPatterns() {
    // Przykład dla karabinu typu M4A1
    this.patterns.set('m4a1', [
      [0.0, 0.2], [0.05, 0.25], [0.08, 0.3], [0.1, 0.35], [0.12, 0.35],
      [0.1, 0.32], [0.05, 0.3], [0.0, 0.28], [-0.05, 0.28], [-0.1, 0.3],
      [-0.12, 0.35], [-0.1, 0.35], [-0.05, 0.32], [0.0, 0.3], [0.05, 0.28],
      [0.08, 0.28], [0.1, 0.3], [0.12, 0.32], [0.15, 0.35], [0.18, 0.4]
    ]);
  }

  public getRecoilForShot(weaponId: string): THREE.Vector2 {
    const pattern = this.patterns.get(weaponId);
    if (!pattern || this.shotIndex >= pattern.length) {
      this.recoilVector.set(0, 0);
      return this.recoilVector;
    }

    const [yaw, pitch] = pattern[this.shotIndex];
    this.currentYaw += yaw;
    this.currentPitch += pitch;
    this.shotIndex++;
    
    this.recoilVector.set(yaw, pitch);
    return this.recoilVector;
  }

  public updateRecovery(dt: number, isFiring: boolean) {
    if (isFiring) return;

    // Płynny powrót do bazy (interpolacja liniowa bez alokacji)
    const recoverySpeed = 12.0;
    this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, 0, dt * recoverySpeed);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, 0, dt * recoverySpeed);
    
    if (Math.abs(this.currentYaw) < 0.001 && Math.abs(this.currentPitch) < 0.001) {
      this.shotIndex = 0;
      this.currentYaw = 0;
      this.currentPitch = 0;
    }
  }

  public calculateSpread(baseSpread: number, isAds: boolean, isMoving: boolean, isCrouching: boolean): number {
    let spread = baseSpread;
    if (isAds) spread *= 0.3;
    if (isMoving) spread *= 2.0;
    if (isCrouching) spread *= 0.7;
    return spread;
  }
}
