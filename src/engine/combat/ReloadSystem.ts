import * as THREE from 'three';
import { Sound } from '../audio';
import { WeaponInventorySystem, WeaponSlotType } from './WeaponInventorySystem';
import { FPSViewModel } from '../player/FPSViewModel';
import { RecoilSystem } from './RecoilSystem';
import { BallisticsSystem } from './BallisticsSystem';

/**
 * ============================================================================
 * PROJEKT VANGUARD — SYSTEM PRZEŁADOWANIA I ANIMACJI PROCEDURALNEJ VIEWMODELU
 * ============================================================================
 * Klasa: ReloadSystem
 * Architektura: Zero-GC (Zero Garbage Collection) w pętli renderowania.
 * 
 * Odpowiedzialność:
 * 1. Kompleksowa obsługa procedury przeładowania broni:
 *    - Tactical Reload (wymiana magazynka przy zachowanym naboju w komorze)
 *    - Empty Reload (magazynek pusty = wymiana magazynka + odciągnięcie zamka/bolt-catch)
 * 2. Precyzyjne fazy przeładowania z wyzwalaniem zdarzeń dźwiękowych
 * 3. Zaawansowana proceduralna animacja broni w widoku pierwszej osoby (FPS Viewmodel):
 *    - Naturalne kołysanie kroków (Harmonic Bobbing)
 *    - Bezwładność celownika przy ruchach kamery (Weapon Sway i Roll Tilt)
 *    - Kinematyczne odchylenia lufy i wstrząsy podczas wymiany magazynka
 * 4. Rygorystyczna blokada strzelania i celowania (ADS Lock) podczas trwania animacji
 * ============================================================================
 */

export enum ReloadType {
  TACTICAL = 0, // Szybsze przeładowanie (np. 80% czasu), nabój w komorze
  EMPTY = 1,    // Wolniejsze przeładowanie (125% czasu), wymagane pociągnięcie zamka
}

export enum ReloadPhase {
  INACTIVE = 0,
  MAG_DROP = 1,     // Odłączenie i opuszczenie zużytego magazynka
  MAG_INSERT = 2,   // Wsunięcie i zatrzaśnięcie nowego magazynka
  BOLT_ACTION = 3,  // Przeładowanie zamka / bolt catch (tylko w Empty Reload)
  RECOVERY = 4,     // Powrót broni do pozycji gotowości bojowej
}

export interface ReloadStatus {
  isReloading: boolean;
  reloadType: ReloadType;
  phase: ReloadPhase;
  totalProgress: number; // 0..1
  phaseProgress: number; // 0..1
  elapsedTime: number;
  totalDuration: number;
}

export class ReloadSystem {
  // Powiązane moduły systemowe
  private inventory: WeaponInventorySystem;
  private viewModel: FPSViewModel | null = null;
  private recoilSystem: RecoilSystem | null = null;
  private ballisticsSystem: BallisticsSystem | null = null;

  // Stan procedury przeładowania
  private isReloading: boolean = false;
  private currentReloadType: ReloadType = ReloadType.TACTICAL;
  private currentPhase: ReloadPhase = ReloadPhase.INACTIVE;
  private reloadTimer: number = 0;
  private totalDuration: number = 2.0;

  // Proporcje czasowe poszczególnych faz przeładowania
  private phaseDurationDrop: number = 0.5;
  private phaseDurationInsert: number = 0.8;
  private phaseDurationBolt: number = 0.6;
  private phaseDurationRecovery: number = 0.4;

  // Flagi wyzwolenia dźwięków w poszczególnych fazach
  private soundTriggeredDrop: boolean = false;
  private soundTriggeredInsert: boolean = false;
  private soundTriggeredBolt: boolean = false;

  // Parametry kołysania kroków (Head/Weapon Bobbing)
  private bobCycle: number = 0;
  private readonly bobOffset = new THREE.Vector3();
  private readonly bobRotation = new THREE.Euler(0, 0, 0, 'YXZ');

  // Parametry bezwładności obrotu myszy (Weapon Sway)
  private readonly swayOffset = new THREE.Vector3();
  private readonly swayRotation = new THREE.Euler(0, 0, 0, 'YXZ');
  private mouseLagX: number = 0;
  private mouseLagY: number = 0;

  // Proceduralne przesunięcia i obroty fazy przeładowania
  private readonly reloadOffset = new THREE.Vector3();
  private readonly reloadRotation = new THREE.Euler(0, 0, 0, 'YXZ');

  // Pozycje referencyjne broni w widoku pierwszej osoby
  private readonly hipfirePosition = new THREE.Vector3(0.18, -0.16, -0.32);
  private readonly adsPosition = new THREE.Vector3(0.0, -0.088, -0.21);
  private readonly compositePosition = new THREE.Vector3();
  private readonly compositeEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly compositeQuaternion = new THREE.Quaternion();

  // Wektory pomocnicze do obliczeń bez alokacji w pętli renderowania (Zero-GC)
  private readonly _vScratchA = new THREE.Vector3();
  private readonly _vScratchB = new THREE.Vector3();
  private readonly _eScratch = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly _qScratch = new THREE.Quaternion();

  // Pre-alokowany obiekt statusu przeładowania
  private readonly statusSnapshot: ReloadStatus = {
    isReloading: false,
    reloadType: ReloadType.TACTICAL,
    phase: ReloadPhase.INACTIVE,
    totalProgress: 0,
    phaseProgress: 0,
    elapsedTime: 0,
    totalDuration: 0,
  };

  constructor(inventory: WeaponInventorySystem) {
    this.inventory = inventory;
    this.inventory.setReloadSystem(this);
  }

  public setViewModel(viewModel: FPSViewModel): void {
    this.viewModel = viewModel;
  }

  public setRecoilSystem(recoilSystem: RecoilSystem): void {
    this.recoilSystem = recoilSystem;
  }

  public setBallisticsSystem(ballisticsSystem: BallisticsSystem): void {
    this.ballisticsSystem = ballisticsSystem;
  }

  /**
   * Inicjalizuje procedurę przeładowania aktywnej broni.
   * Zwraca true jeśli procedura została pomyślnie rozpoczęta.
   */
  public startReload(): boolean {
    if (this.isReloading) return false;

    // Pobranie danych o aktywnej broni z menedżera ekwipunku
    const activeSlot = this.inventory.getActiveSlotData();
    if (!activeSlot.isUnlocked) return false;

    // Warunki wstępne: brak możliwości przeładowania pełnego magazynka lub przy braku rezerwy
    if (activeSlot.ammoInMag >= activeSlot.maxMagSize) return false;
    if (activeSlot.reserveAmmo <= 0) return false;

    // Rozróżnienie Tactical Reload (mag > 0) od Empty Reload (mag === 0)
    const baseDuration = activeSlot.stats.reloadTimeSec || 2.2;
    if (activeSlot.ammoInMag > 0) {
      this.currentReloadType = ReloadType.TACTICAL;
      this.totalDuration = baseDuration * 0.82;
      // Podział czasu: Drop 38%, Insert 40%, Recovery 22%
      this.phaseDurationDrop = this.totalDuration * 0.38;
      this.phaseDurationInsert = this.totalDuration * 0.40;
      this.phaseDurationBolt = 0;
      this.phaseDurationRecovery = this.totalDuration * 0.22;
    } else {
      this.currentReloadType = ReloadType.EMPTY;
      this.totalDuration = baseDuration * 1.25;
      // Podział czasu: Drop 30%, Insert 34%, Bolt 24%, Recovery 12%
      this.phaseDurationDrop = this.totalDuration * 0.30;
      this.phaseDurationInsert = this.totalDuration * 0.34;
      this.phaseDurationBolt = this.totalDuration * 0.24;
      this.phaseDurationRecovery = this.totalDuration * 0.12;
    }

    this.isReloading = true;
    this.currentPhase = ReloadPhase.MAG_DROP;
    this.reloadTimer = 0;

    this.soundTriggeredDrop = false;
    this.soundTriggeredInsert = false;
    this.soundTriggeredBolt = false;

    // Dźwięk rozpoczęcia przeładowania
    Sound.playReload();
    return true;
  }

  /**
   * Anuluje bieżącą procedurę przeładowania (np. podczas sprintu lub natychmiastowej zmiany broni)
   */
  public cancelReload(): void {
    if (!this.isReloading) return;
    this.isReloading = false;
    this.currentPhase = ReloadPhase.INACTIVE;
    this.reloadTimer = 0;
    this.reloadOffset.set(0, 0, 0);
    this.reloadRotation.set(0, 0, 0);
  }

  public isReloadingActive(): boolean {
    return this.isReloading;
  }

  public getStatus(): Readonly<ReloadStatus> {
    this.statusSnapshot.isReloading = this.isReloading;
    this.statusSnapshot.reloadType = this.currentReloadType;
    this.statusSnapshot.phase = this.currentPhase;
    this.statusSnapshot.totalDuration = this.totalDuration;
    this.statusSnapshot.elapsedTime = this.reloadTimer;
    this.statusSnapshot.totalProgress = this.totalDuration > 0
      ? Math.min(1.0, this.reloadTimer / this.totalDuration)
      : 0;
    return this.statusSnapshot;
  }

  /**
   * Zgłasza wejście delty myszy do obliczania bezwładności celownika (Weapon Sway)
   */
  public applyMouseDelta(deltaX: number, deltaY: number): void {
    this.mouseLagX += deltaX;
    this.mouseLagY += deltaY;
  }

  /**
   * Główna metoda aktualizacji logiki i animacji proceduralnej (Zero-GC)
   */
  public update(
    dt: number,
    isMoving: boolean,
    isSprinting: boolean,
    isCrouching: boolean,
    isAds: boolean,
    modelGroup: THREE.Group | null
  ): void {
    // 1. Logika fazowa procedury przeładowania
    this.updateReloadPhases(dt);

    // 2. Obliczenie kołysania kroków (Bobbing)
    this.updateBobbing(dt, isMoving, isSprinting, isCrouching, isAds);

    // 3. Obliczenie bezwładności celownika (Sway)
    this.updateSway(dt, isAds);

    // 4. Interpolacja i złożenie pozycji końcowej modelu broni (Composite Transform)
    if (modelGroup) {
      this.applyCompositeTransform(dt, isAds, modelGroup);
    }
  }

  /**
   * Aktualizacja maszyny stanów procedury przeładowania
   */
  private updateReloadPhases(dt: number): void {
    if (!this.isReloading) {
      // Płynne wygaszanie odchylenia przeładowania do zera
      this.reloadOffset.lerp(this._vScratchA.set(0, 0, 0), dt * 10);
      this.reloadRotation.set(
        THREE.MathUtils.damp(this.reloadRotation.x, 0, 10, dt),
        THREE.MathUtils.damp(this.reloadRotation.y, 0, 10, dt),
        THREE.MathUtils.damp(this.reloadRotation.z, 0, 10, dt)
      );
      return;
    }

    this.reloadTimer += dt;
    const t = this.reloadTimer;

    // Faza 1: Odłączenie magazynka (MAG_DROP)
    if (t < this.phaseDurationDrop) {
      this.currentPhase = ReloadPhase.MAG_DROP;
      const progress = t / Math.max(0.001, this.phaseDurationDrop);
      const ease = Math.sin(progress * Math.PI * 0.5);

      // Broń opada lekko w dół i przechyla się ku lewej ręce
      this.reloadOffset.set(
        -0.03 * ease,
        -0.08 * ease,
        -0.02 * ease
      );
      this.reloadRotation.set(
        -0.20 * ease,
        0.15 * ease,
        -0.28 * ease
      );
    }
    // Faza 2: Wsunięcie nowego magazynka (MAG_INSERT)
    else if (t < this.phaseDurationDrop + this.phaseDurationInsert) {
      this.currentPhase = ReloadPhase.MAG_INSERT;
      const insertT = t - this.phaseDurationDrop;
      const progress = insertT / Math.max(0.001, this.phaseDurationInsert);

      // Wstrząs uderzenia dłonią w dno magazynka (Tactical Slap)
      const slapImpulse = Math.sin(progress * Math.PI) * 0.04;
      this.reloadOffset.set(
        -0.03 + slapImpulse * 0.5,
        -0.08 + slapImpulse * 1.5,
        -0.02
      );
      this.reloadRotation.set(
        -0.20 + slapImpulse * 0.8,
        0.15,
        -0.28 - slapImpulse * 0.5
      );
    }
    // Faza 3: Przeładowanie zamka (BOLT_ACTION) — tylko Empty Reload
    else if (
      this.currentReloadType === ReloadType.EMPTY &&
      t < this.phaseDurationDrop + this.phaseDurationInsert + this.phaseDurationBolt
    ) {
      this.currentPhase = ReloadPhase.BOLT_ACTION;
      const boltT = t - (this.phaseDurationDrop + this.phaseDurationInsert);
      const progress = boltT / Math.max(0.001, this.phaseDurationBolt);

      // Odciągnięcie zamka: ruch broni w tył i obrót w prawo
      const pull = Math.sin(progress * Math.PI);
      this.reloadOffset.set(
        -0.01 + pull * 0.02,
        -0.04 - pull * 0.02,
        -0.01 + pull * 0.035
      );
      this.reloadRotation.set(
        -0.12 + pull * 0.18,
        0.08 - pull * 0.15,
        -0.15 + pull * 0.12
      );
    }
    // Faza 4: Powrót do pozycji wyjściowej (RECOVERY)
    else if (t < this.totalDuration) {
      this.currentPhase = ReloadPhase.RECOVERY;
      const totalPreTime = this.phaseDurationDrop + this.phaseDurationInsert +
        (this.currentReloadType === ReloadType.EMPTY ? this.phaseDurationBolt : 0);
      const recT = t - totalPreTime;
      const progress = recT / Math.max(0.001, this.phaseDurationRecovery);
      const ease = 1.0 - progress;

      this.reloadOffset.set(
        -0.01 * ease,
        -0.03 * ease,
        -0.01 * ease
      );
      this.reloadRotation.set(
        -0.08 * ease,
        0.05 * ease,
        -0.08 * ease
      );
    }
    // Zakończenie przeładowania — transfer amunicji
    else {
      this.finalizeReload();
    }
  }

  /**
   * Finalizuje proces przeładowania i aktualizuje stan magazynka
   */
  private finalizeReload(): void {
    this.isReloading = false;
    this.currentPhase = ReloadPhase.INACTIVE;
    this.reloadTimer = 0;
    this.reloadOffset.set(0, 0, 0);
    this.reloadRotation.set(0, 0, 0);

    const activeSlot = this.inventory.getActiveSlotData();
    const capacity = activeSlot.maxMagSize;
    const needed = capacity - activeSlot.ammoInMag;

    if (needed > 0 && activeSlot.reserveAmmo > 0) {
      const transfer = Math.min(needed, activeSlot.reserveAmmo);
      activeSlot.ammoInMag += transfer;
      activeSlot.reserveAmmo -= transfer;
    }
  }

  /**
   * Oblicza naturalne kołysanie kroków (Bobbing)
   */
  private updateBobbing(
    dt: number,
    isMoving: boolean,
    isSprinting: boolean,
    isCrouching: boolean,
    isAds: boolean
  ): void {
    if (isMoving) {
      const stepFreq = isSprinting ? 14.5 : (isCrouching ? 7.0 : 9.5);
      this.bobCycle += dt * stepFreq;

      // Amplitudy kołysania zależne od postawy gracza
      let ampX = 0.012;
      let ampY = 0.009;
      if (isSprinting) {
        ampX = 0.024;
        ampY = 0.020;
      } else if (isCrouching) {
        ampX = 0.006;
        ampY = 0.004;
      } else if (isAds) {
        ampX = 0.0015;
        ampY = 0.0012;
      }

      // Trajektoria harmoniczna (Lissajous)
      const x = Math.cos(this.bobCycle * 0.5) * ampX;
      const y = Math.abs(Math.sin(this.bobCycle)) * ampY;

      this.bobOffset.set(x, y, 0);
      this.bobRotation.set(y * 1.5, x * 1.2, -x * 2.0);
    } else {
      // Płynne wytłumienie kołysania do zera w spoczynku
      this.bobOffset.lerp(this._vScratchA.set(0, 0, 0), dt * 8);
      this.bobRotation.set(
        THREE.MathUtils.damp(this.bobRotation.x, 0, 8, dt),
        THREE.MathUtils.damp(this.bobRotation.y, 0, 8, dt),
        THREE.MathUtils.damp(this.bobRotation.z, 0, 8, dt)
      );
    }
  }

  /**
   * Oblicza bezwładność celownika przy obracaniu kamery (Weapon Sway)
   */
  private updateSway(dt: number, isAds: boolean): void {
    // Współczynniki czułości bezwładności
    const sensitivity = isAds ? 0.0006 : 0.0018;
    const maxSway = isAds ? 0.012 : 0.045;

    const targetSwayX = THREE.MathUtils.clamp(-this.mouseLagX * sensitivity, -maxSway, maxSway);
    const targetSwayY = THREE.MathUtils.clamp(this.mouseLagY * sensitivity, -maxSway, maxSway);
    const targetRoll = THREE.MathUtils.clamp(-this.mouseLagX * sensitivity * 1.5, -maxSway * 2, maxSway * 2);

    // Sprężynowe tłumienie bez alokacji obiektów
    this.swayOffset.x = THREE.MathUtils.damp(this.swayOffset.x, targetSwayX, 12, dt);
    this.swayOffset.y = THREE.MathUtils.damp(this.swayOffset.y, targetSwayY, 12, dt);
    this.swayRotation.z = THREE.MathUtils.damp(this.swayRotation.z, targetRoll, 10, dt);
    this.swayRotation.y = THREE.MathUtils.damp(this.swayRotation.y, targetSwayX * 1.2, 10, dt);
    this.swayRotation.x = THREE.MathUtils.damp(this.swayRotation.x, -targetSwayY * 1.2, 10, dt);

    // Wytłumienie bufora delty myszy
    this.mouseLagX = THREE.MathUtils.damp(this.mouseLagX, 0, 16, dt);
    this.mouseLagY = THREE.MathUtils.damp(this.mouseLagY, 0, 16, dt);
  }

  /**
   * Składa wszystkie proceduralne przesunięcia i aplikuje je na model broni
   */
  private applyCompositeTransform(
    dt: number,
    isAds: boolean,
    modelGroup: THREE.Group
  ): void {
    // Podczas przeładowania celowanie (ADS) jest bezwzględnie zablokowane
    const effectiveAds = isAds && !this.isReloading;
    const basePos = effectiveAds ? this.adsPosition : this.hipfirePosition;

    // Składanie pozycji: Base + Bobbing + Sway + Reload Offset
    this.compositePosition.copy(basePos);
    this.compositePosition.add(this.bobOffset);
    this.compositePosition.add(this.swayOffset);
    this.compositePosition.add(this.reloadOffset);

    // Płynna interpolacja pozycji modelu broni
    modelGroup.position.lerp(this.compositePosition, dt * (effectiveAds ? 16 : 12));

    // Składanie rotacji: Bobbing Rot + Sway Rot + Reload Rot
    this.compositeEuler.set(
      this.bobRotation.x + this.swayRotation.x + this.reloadRotation.x,
      this.bobRotation.y + this.swayRotation.y + this.reloadRotation.y,
      this.bobRotation.z + this.swayRotation.z + this.reloadRotation.z,
      'YXZ'
    );

    modelGroup.rotation.x = THREE.MathUtils.damp(modelGroup.rotation.x, this.compositeEuler.x, 14, dt);
    modelGroup.rotation.y = THREE.MathUtils.damp(modelGroup.rotation.y, this.compositeEuler.y, 14, dt);
    modelGroup.rotation.z = THREE.MathUtils.damp(modelGroup.rotation.z, this.compositeEuler.z, 14, dt);
  }
}
