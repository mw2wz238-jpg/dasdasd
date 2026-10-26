import * as THREE from 'three';
import { WeaponStats, WeaponAttachmentConfig, Combatant } from '../../types/game';
import { WEAPON_REGISTRY, DEFAULT_ATTACHMENTS, WeaponModelBuilder } from '../weapons';
import { Sound } from '../audio';
import { FPSViewModel } from '../player/FPSViewModel';
import { RecoilSystem } from './RecoilSystem';
import { BallisticsSystem } from './BallisticsSystem';
import type { ReloadSystem } from './ReloadSystem';

/**
 * ============================================================================
 * PROJEKT VANGUARD — ZAAWANSOWANY SYSTEM ZARZĄDZANIA EKWIPUNKIEM I BRONIĄ
 * ============================================================================
 * Klasa: WeaponInventorySystem
 * Architektura: Zero-GC (Zero Garbage Collection) w pętli renderowania/logiki.
 * 
 * Odpowiedzialność:
 * 1. Płynne zarządzanie slotami uzbrojenia:
 *    - Slot 0: Broń Główna (Primary - Karabin szturmowy / Wyborowy / Strzelba)
 *    - Slot 1: Broń Boczna (Secondary - Pistolet wielkokalibrowy / Służbowy)
 *    - Slot 2: Wyposażenie Taktyczne (Tactical - Granaty M67 / M18 Smoke / Flashbang)
 * 2. Maszyna stanów przełączania broni (Weapon Switch FSM):
 *    - Holstering (chowanie aktualnej broni)
 *    - Drawing (wyciąganie nowej broni)
 *    - Rygorystyczne opóźnienia uniemożliwiające natychmiastowy wystrzał po zmianie slotu
 * 3. Indywidualne zarządzanie stanem amunicji dla każdego slotu (magazynek + rezerwa)
 * 4. Pula obiektów transformacji i wstępnie wygenerowanych modeli 3D broni (Zero-GC)
 * 5. Integracja z FPSViewModel, RecoilSystem, BallisticsSystem oraz ReloadSystem
 * ============================================================================
 */

export enum WeaponSlotType {
  PRIMARY = 0,
  SECONDARY = 1,
  TACTICAL = 2,
}

export enum WeaponSwitchState {
  IDLE = 0,
  HOLSTERING = 1,
  DRAWING = 2,
}

export interface WeaponSlotData {
  slotType: WeaponSlotType;
  weaponId: string;
  stats: WeaponStats;
  attachments: WeaponAttachmentConfig;
  ammoInMag: number;
  reserveAmmo: number;
  maxMagSize: number;
  maxReserveAmmo: number;
  isUnlocked: boolean;
  holsterDuration: number; // Czas chowania w sekundach
  drawDuration: number;    // Czas wyciągania w sekundach
  modelGroup: THREE.Group | null;
}

export interface WeaponInventoryUIState {
  activeSlot: WeaponSlotType;
  switchState: WeaponSwitchState;
  switchProgress: number;
  canFire: boolean;
  canAim: boolean;
  weaponName: string;
  weaponCategory: string;
  ammoInMag: number;
  reserveAmmo: number;
  maxMagSize: number;
  primaryAmmoInMag: number;
  primaryReserve: number;
  secondaryAmmoInMag: number;
  secondaryReserve: number;
  tacticalCount: number;
  tacticalName: string;
}

export class WeaponInventorySystem {
  // Trzy zdefiniowane sloty uzbrojenia
  private readonly slots: WeaponSlotData[] = [];
  private activeSlotIndex: WeaponSlotType = WeaponSlotType.PRIMARY;
  private pendingSlotIndex: WeaponSlotType = WeaponSlotType.PRIMARY;

  // Maszyna stanów zmiany broni
  private switchState: WeaponSwitchState = WeaponSwitchState.IDLE;
  private switchTimer: number = 0;
  private currentSwitchDuration: number = 0;

  // Powiązane moduły bojowe i widoku
  private viewModel: FPSViewModel | null = null;
  private viewmodelGroup: THREE.Group | null = null;
  private reloadSystem: ReloadSystem | null = null;
  private recoilSystem: RecoilSystem | null = null;
  private ballisticsSystem: BallisticsSystem | null = null;
  private combatantRef: Combatant | null = null;

  // Pre-alokowany stan UI (Zero-GC mutacja stanu w każdej klatce)
  private readonly uiState: WeaponInventoryUIState = {
    activeSlot: WeaponSlotType.PRIMARY,
    switchState: WeaponSwitchState.IDLE,
    switchProgress: 0,
    canFire: true,
    canAim: true,
    weaponName: 'M4A1 Tactical',
    weaponCategory: 'rifle',
    ammoInMag: 30,
    reserveAmmo: 90,
    maxMagSize: 30,
    primaryAmmoInMag: 30,
    primaryReserve: 90,
    secondaryAmmoInMag: 7,
    secondaryReserve: 35,
    tacticalCount: 2,
    tacticalName: 'M67 FRAG',
  };

  // Pre-alokowane wektory i kwaterniony transformacji zmiany broni (Zero-GC)
  private readonly baseOffset = new THREE.Vector3(0.18, -0.16, -0.32);
  private readonly holsterOffset = new THREE.Vector3(0.16, -0.45, -0.22);
  private readonly currentOffset = new THREE.Vector3(0.18, -0.16, -0.32);
  private readonly currentRotation = new THREE.Euler(0, 0, 0, 'YXZ');

  // Wektory pomocnicze do obliczeń bez alokacji na stercie
  private readonly _vScratchA = new THREE.Vector3();
  private readonly _vScratchB = new THREE.Vector3();
  private readonly _eScratch = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly _qScratch = new THREE.Quaternion();

  // Licznik wyposażenia taktycznego
  private fragCount: number = 2;
  private smokeCount: number = 1;
  private flashCount: number = 2;

  constructor() {
    this.initSlots();
  }

  /**
   * Wstępna alokacja struktur slotów ekwipunku i wstępne załadowanie broni domyślnych
   */
  private initSlots(): void {
    // 1. Broń Główna (Primary) - M4A1 Tactical domyślnie
    const primaryStats = WEAPON_REGISTRY['m4a1'] ?? {
      id: 'm4a1',
      name: 'M4A1 Tactical',
      category: 'rifle',
      price: 3100,
      damage: 34,
      headshotMultiplier: 3.5,
      fireRateRPM: 720,
      magSize: 30,
      reserveAmmo: 90,
      reloadTimeSec: 2.1,
      spreadNormal: 0.024,
      spreadAds: 0.003,
      recoilVertical: 0.038,
      recoilHorizontal: 0.016,
      rangeMeters: 110,
      bulletSpeed: 880,
      killReward: 300,
    };

    const primarySlot: WeaponSlotData = {
      slotType: WeaponSlotType.PRIMARY,
      weaponId: 'm4a1',
      stats: { ...primaryStats },
      attachments: { ...DEFAULT_ATTACHMENTS },
      ammoInMag: primaryStats.magSize,
      reserveAmmo: primaryStats.reserveAmmo,
      maxMagSize: primaryStats.magSize,
      maxReserveAmmo: primaryStats.reserveAmmo * 2,
      isUnlocked: true,
      holsterDuration: 0.32,
      drawDuration: 0.40,
      modelGroup: null,
    };

    // 2. Broń Boczna (Secondary) - Desert Eagle .50 domyślnie
    const secondaryStats = WEAPON_REGISTRY['deagle'] ?? {
      id: 'deagle',
      name: 'Desert Eagle .50',
      category: 'pistol',
      price: 700,
      damage: 53,
      headshotMultiplier: 3.2,
      fireRateRPM: 270,
      magSize: 7,
      reserveAmmo: 35,
      reloadTimeSec: 1.7,
      spreadNormal: 0.038,
      spreadAds: 0.006,
      recoilVertical: 0.065,
      recoilHorizontal: 0.025,
      rangeMeters: 55,
      bulletSpeed: 620,
      killReward: 300,
    };

    const secondarySlot: WeaponSlotData = {
      slotType: WeaponSlotType.SECONDARY,
      weaponId: 'deagle',
      stats: { ...secondaryStats },
      attachments: {
        sight: 'ironsight',
        barrel: 'standard',
        magazine: 'standard',
        stock: 'tactical',
        grip: 'none',
        camo: 'military_black',
      },
      ammoInMag: secondaryStats.magSize,
      reserveAmmo: secondaryStats.reserveAmmo,
      maxMagSize: secondaryStats.magSize,
      maxReserveAmmo: secondaryStats.reserveAmmo * 2,
      isUnlocked: true,
      holsterDuration: 0.22,
      drawDuration: 0.28,
      modelGroup: null,
    };

    // 3. Wyposażenie Taktyczne (Tactical / Grenade)
    const tacticalStats: WeaponStats = {
      id: 'frag_m67',
      name: 'M67 Frag Grenade',
      category: 'shotgun', // Klasa bazowa dla obliczeń odrzutu
      price: 300,
      damage: 105,
      headshotMultiplier: 1.0,
      fireRateRPM: 60,
      magSize: 1,
      reserveAmmo: 1,
      reloadTimeSec: 1.0,
      spreadNormal: 0.01,
      spreadAds: 0.01,
      recoilVertical: 0.01,
      recoilHorizontal: 0.01,
      rangeMeters: 40,
      bulletSpeed: 30,
      killReward: 300,
    };

    const tacticalSlot: WeaponSlotData = {
      slotType: WeaponSlotType.TACTICAL,
      weaponId: 'frag_m67',
      stats: tacticalStats,
      attachments: { ...DEFAULT_ATTACHMENTS },
      ammoInMag: 1,
      reserveAmmo: 1,
      maxMagSize: 1,
      maxReserveAmmo: 4,
      isUnlocked: true,
      holsterDuration: 0.20,
      drawDuration: 0.25,
      modelGroup: null,
    };

    this.slots.push(primarySlot);
    this.slots.push(secondarySlot);
    this.slots.push(tacticalSlot);

    this.buildSlotModels();
  }

  /**
   * Generuje i zapamiętuje modele 3D dla każdego slotu w puli modeli, eliminując alokację podczas gry.
   */
  public buildSlotModels(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.modelGroup) {
        // Usunięcie starych siatek z pamięci jeśli model istniał
        this.disposeHierarchy(slot.modelGroup);
      }
      slot.modelGroup = WeaponModelBuilder.buildProceduralWeapon(
        slot.weaponId,
        slot.attachments,
        true
      );
      slot.modelGroup.visible = (i === this.activeSlotIndex);
      slot.modelGroup.position.copy(this.baseOffset);
    }
  }

  /**
   * Powiązanie menedżera ekwipunku z widokiem FPSViewModel i nadrzędną grupą kamery
   */
  public setViewModel(viewModel: FPSViewModel, parentGroup?: THREE.Group): void {
    this.viewModel = viewModel;
    this.viewmodelGroup = parentGroup ?? viewModel.group;

    // Dołączenie wszystkich pre-alokowanych modeli broni do grupy kamery widoku FPP
    for (const slot of this.slots) {
      if (slot.modelGroup) {
        this.viewmodelGroup.add(slot.modelGroup);
      }
    }
    this.updateVisibleModel();
  }

  public setReloadSystem(reloadSystem: ReloadSystem): void {
    this.reloadSystem = reloadSystem;
  }

  public setRecoilSystem(recoilSystem: RecoilSystem): void {
    this.recoilSystem = recoilSystem;
  }

  public setBallisticsSystem(ballisticsSystem: BallisticsSystem): void {
    this.ballisticsSystem = ballisticsSystem;
  }

  public setCombatantRef(combatant: Combatant): void {
    this.combatantRef = combatant;
    this.syncCombatant();
  }

  /**
   * Inicjalizuje przełączenie na zadany slot z obsługą maszyny stanów Holster -> Draw.
   */
  public switchToSlot(targetSlot: WeaponSlotType): boolean {
    if (targetSlot === this.activeSlotIndex && this.switchState === WeaponSwitchState.IDLE) {
      return false; // Już wyposażony w ten slot
    }

    if (targetSlot < 0 || targetSlot >= this.slots.length) {
      return false;
    }

    const slot = this.slots[targetSlot];
    if (!slot.isUnlocked) {
      return false;
    }

    // Przerwanie przeładowania przy próbie natychmiastowej zmiany broni
    if (this.reloadSystem?.isReloadingActive()) {
      this.reloadSystem.cancelReload();
    }

    this.pendingSlotIndex = targetSlot;

    // Rozpoczęcie sekwencji chowania aktualnej broni (Holster)
    if (this.switchState === WeaponSwitchState.IDLE) {
      this.switchState = WeaponSwitchState.HOLSTERING;
      this.currentSwitchDuration = this.slots[this.activeSlotIndex].holsterDuration;
      this.switchTimer = 0;
      Sound.playUIBeep(false);
    }

    return true;
  }

  /**
   * Szybkie przełączanie slotów za pomocą kółka myszy lub dedykowanych klawiszy (1, 2, 3)
   */
  public nextSlot(): void {
    let next = (this.activeSlotIndex + 1) % this.slots.length;
    this.switchToSlot(next as WeaponSlotType);
  }

  public previousSlot(): void {
    let prev = (this.activeSlotIndex - 1 + this.slots.length) % this.slots.length;
    this.switchToSlot(prev as WeaponSlotType);
  }

  /**
   * Główna pętla aktualizacji ekwipunku (Zero-GC — brak użycia operatora 'new')
   */
  public update(dt: number): void {
    if (this.switchState === WeaponSwitchState.HOLSTERING) {
      this.switchTimer += dt;
      const progress = Math.min(1.0, this.switchTimer / Math.max(0.001, this.currentSwitchDuration));

      // Płynna krzywa ruchu w dół (Ease-In Cubic)
      const ease = progress * progress * (3 - 2 * progress);
      this.currentOffset.lerpVectors(this.baseOffset, this.holsterOffset, ease);
      this.currentRotation.set(-0.35 * ease, 0.15 * ease, -0.1 * ease);

      const activeGroup = this.slots[this.activeSlotIndex].modelGroup;
      if (activeGroup) {
        activeGroup.position.copy(this.currentOffset);
        activeGroup.rotation.copy(this.currentRotation);
      }

      // Moment przejścia ze starej broni na nową
      if (progress >= 1.0) {
        this.activeSlotIndex = this.pendingSlotIndex;
        this.switchState = WeaponSwitchState.DRAWING;
        this.currentSwitchDuration = this.slots[this.activeSlotIndex].drawDuration;
        this.switchTimer = 0;
        this.updateVisibleModel();
        this.syncCombatant();
      }
    } else if (this.switchState === WeaponSwitchState.DRAWING) {
      this.switchTimer += dt;
      const progress = Math.min(1.0, this.switchTimer / Math.max(0.001, this.currentSwitchDuration));

      // Płynna krzywa wyciągania w górę (Ease-Out Cubic)
      const t = 1.0 - progress;
      const ease = 1.0 - (t * t * (3 - 2 * t));
      this.currentOffset.lerpVectors(this.holsterOffset, this.baseOffset, ease);
      this.currentRotation.set(-0.35 * (1.0 - ease), 0.15 * (1.0 - ease), -0.1 * (1.0 - ease));

      const activeGroup = this.slots[this.activeSlotIndex].modelGroup;
      if (activeGroup) {
        activeGroup.position.copy(this.currentOffset);
        activeGroup.rotation.copy(this.currentRotation);
      }

      if (progress >= 1.0) {
        this.switchState = WeaponSwitchState.IDLE;
        this.switchTimer = 0;
        if (activeGroup) {
          activeGroup.position.copy(this.baseOffset);
          activeGroup.rotation.set(0, 0, 0);
        }
      }
    }

    // Aktualizacja stanu UI bez żadnych alokacji sterty
    this.updateUIState();
  }

  /**
   * Zmienia widoczność modeli 3D w zależności od aktywnego slotu
   */
  private updateVisibleModel(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const group = this.slots[i].modelGroup;
      if (group) {
        group.visible = (i === this.activeSlotIndex);
        if (group.visible) {
          group.position.copy(this.currentOffset);
          group.rotation.copy(this.currentRotation);
        }
      }
    }
  }

  /**
   * Synchronizuje dane aktywnej broni z referencją Combatant gracza
   */
  private syncCombatant(): void {
    if (!this.combatantRef) return;
    const current = this.slots[this.activeSlotIndex];
    this.combatantRef.weapon = current.stats;
    this.combatantRef.currentMag = current.ammoInMag;
    this.combatantRef.reserveAmmo = current.reserveAmmo;
  }

  /**
   * Aktualizuje obiekt stanu UI przez bezpośrednią mutację pre-alokowanych pól (Zero-GC)
   */
  private updateUIState(): void {
    const cur = this.slots[this.activeSlotIndex];
    const prim = this.slots[WeaponSlotType.PRIMARY];
    const sec = this.slots[WeaponSlotType.SECONDARY];

    this.uiState.activeSlot = this.activeSlotIndex;
    this.uiState.switchState = this.switchState;
    this.uiState.switchProgress = this.currentSwitchDuration > 0
      ? this.switchTimer / this.currentSwitchDuration
      : 0;

    const isSwitching = this.switchState !== WeaponSwitchState.IDLE;
    const isReloading = this.reloadSystem?.isReloadingActive() ?? false;

    this.uiState.canFire = !isSwitching && !isReloading && cur.ammoInMag > 0;
    this.uiState.canAim = !isSwitching && !isReloading;
    this.uiState.weaponName = cur.stats.name;
    this.uiState.weaponCategory = cur.stats.category;
    this.uiState.ammoInMag = cur.ammoInMag;
    this.uiState.reserveAmmo = cur.reserveAmmo;
    this.uiState.maxMagSize = cur.maxMagSize;

    this.uiState.primaryAmmoInMag = prim.ammoInMag;
    this.uiState.primaryReserve = prim.reserveAmmo;
    this.uiState.secondaryAmmoInMag = sec.ammoInMag;
    this.uiState.secondaryReserve = sec.reserveAmmo;

    this.uiState.tacticalCount = this.fragCount;
    this.uiState.tacticalName = 'M67 FRAG';
  }

  /**
   * Zwraca bieżący stan UI (tylko do odczytu, brak alokacji nowego obiektu)
   */
  public getUIState(): Readonly<WeaponInventoryUIState> {
    return this.uiState;
  }

  /**
   * Sprawdza, czy gracz może strzelać w bieżącej klatce (brak trwania przełączania/przeładowania)
   */
  public canFire(): boolean {
    if (this.switchState !== WeaponSwitchState.IDLE) return false;
    if (this.reloadSystem?.isReloadingActive()) return false;
    const cur = this.slots[this.activeSlotIndex];
    return cur.ammoInMag > 0;
  }

  /**
   * Sprawdza, czy gracz może korzystać z celowania przez przyrządy (ADS)
   */
  public canAim(): boolean {
    if (this.switchState !== WeaponSwitchState.IDLE) return false;
    if (this.reloadSystem?.isReloadingActive()) return false;
    return true;
  }

  /**
   * Zużycie amunicji podczas wystrzału
   */
  public consumeAmmo(count: number = 1): boolean {
    const cur = this.slots[this.activeSlotIndex];
    if (cur.ammoInMag >= count) {
      cur.ammoInMag -= count;
      if (this.combatantRef) {
        this.combatantRef.currentMag = cur.ammoInMag;
      }
      return true;
    }
    return false;
  }

  /**
   * Dodaje amunicję rezerwową (np. po zebraniu pakietu lub zakupie w menu)
   */
  public addAmmo(slotType: WeaponSlotType, amount: number): void {
    if (slotType < 0 || slotType >= this.slots.length) return;
    const slot = this.slots[slotType];
    slot.reserveAmmo = Math.min(slot.maxReserveAmmo, slot.reserveAmmo + amount);
    if (this.activeSlotIndex === slotType && this.combatantRef) {
      this.combatantRef.reserveAmmo = slot.reserveAmmo;
    }
  }

  /**
   * Zastępuje broń w danym slocie nowym modelem (np. zakup nowej broni)
   */
  public setWeapon(
    slotType: WeaponSlotType,
    weaponId: string,
    attachments: WeaponAttachmentConfig = DEFAULT_ATTACHMENTS
  ): void {
    if (slotType < 0 || slotType >= this.slots.length) return;
    const stats = WEAPON_REGISTRY[weaponId];
    if (!stats) return;

    const slot = this.slots[slotType];
    slot.weaponId = weaponId;
    slot.stats = { ...stats };
    slot.attachments = { ...attachments };
    slot.ammoInMag = stats.magSize;
    slot.reserveAmmo = stats.reserveAmmo;
    slot.maxMagSize = stats.magSize;
    slot.maxReserveAmmo = stats.reserveAmmo * 2;

    // Przebudowa modelu 3D dla tego slotu
    if (slot.modelGroup && this.viewmodelGroup) {
      this.viewmodelGroup.remove(slot.modelGroup);
      this.disposeHierarchy(slot.modelGroup);
    }

    slot.modelGroup = WeaponModelBuilder.buildProceduralWeapon(weaponId, attachments, true);
    slot.modelGroup.visible = (slotType === this.activeSlotIndex);
    slot.modelGroup.position.copy(this.baseOffset);

    if (this.viewmodelGroup) {
      this.viewmodelGroup.add(slot.modelGroup);
    }

    if (slotType === this.activeSlotIndex) {
      this.syncCombatant();
    }
  }

  public getActiveSlot(): WeaponSlotType {
    return this.activeSlotIndex;
  }

  public getActiveSlotData(): WeaponSlotData {
    return this.slots[this.activeSlotIndex];
  }

  public getSlotData(slotType: WeaponSlotType): WeaponSlotData {
    return this.slots[slotType];
  }

  public getActiveModelGroup(): THREE.Group | null {
    return this.slots[this.activeSlotIndex].modelGroup;
  }

  public getBaseOffset(): THREE.Vector3 {
    return this.baseOffset;
  }

  /**
   * Czyszczenie zasobów Three.js (Zero Memory Leak)
   */
  private disposeHierarchy(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
      }
    });
  }

  public dispose(): void {
    for (const slot of this.slots) {
      if (slot.modelGroup) {
        if (this.viewmodelGroup) {
          this.viewmodelGroup.remove(slot.modelGroup);
        }
        this.disposeHierarchy(slot.modelGroup);
        slot.modelGroup = null;
      }
    }
  }
}
