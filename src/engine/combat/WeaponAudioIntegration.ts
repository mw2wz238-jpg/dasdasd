import * as THREE from 'three';
import { SpatialAudioManager } from '../audio/SpatialAudioManager';
import { WeaponInventorySystem, WeaponSwitchState, WeaponSlotType } from './WeaponInventorySystem';
import { ReloadSystem, ReloadPhase } from './ReloadSystem';
import { SimulationEngine } from '../simulation';

/**
 * ============================================================================
 * PROJEKT VANGUARD — INTEGRACJA DŹWIĘKÓW UZBROJENIA I SPATIAL AUDIO
 * ============================================================================
 * Klasa: WeaponAudioIntegration
 * Architektura: Zero-GC (Zero Garbage Collection) w pętli renderowania/logiki.
 * 
 * Odpowiedzialność:
 * 1. Synchronizacja stanów WeaponInventorySystem i ReloadSystem z silnikiem audio.
 * 2. Unikalna proceduralna synteza i buforowanie odgłosów mechaniki broni:
 *    - Dobywanie / chowanie broni (Equip / Unequip)
 *    - Przełącznik trybu ognia (Fire Selector Switch: Auto / Semi)
 *    - Kliknięcie iglicy w pustą komorę (Dry Fire)
 *    - Wielofazowe przeładowanie: Odłączenie magazynka (Mag Out), Wsunięcie (Mag In),
 *      Zwolnienie zamka / bolt-catch (Bolt Catch / Slide Release).
 * 3. Akustyka środowiskowa i okluzja przestrzenna (Spatial Raycast Occlusion):
 *    - Raycasting ścian magazynów i przeszkód betonowych w SimulationEngine.
 *    - Dynamiczny filtr dolnoprzepustowy (Low-Pass Filter) przy braku linii słuchu (LoS).
 *    - Separacja kanału gracza FPP (Direct Clean Stereo) od dźwięków przestrzennych botów 3D.
 * ============================================================================
 */

export type FireMode = 'auto' | 'semi' | 'burst';

export class WeaponAudioIntegration {
  private spatialManager: SpatialAudioManager | null = null;
  private sim: SimulationEngine | null = null;
  private inventory: WeaponInventorySystem | null = null;
  private reloadSystem: ReloadSystem | null = null;

  // Kontekst Web Audio API
  private audioCtx: AudioContext | null = null;
  private masterSFXGain: GainNode | null = null;

  // Wstępnie wygenerowane bufory audio (Pre-allocated Sound Bank - Zero GC)
  private bufferEquip: AudioBuffer | null = null;
  private bufferUnequip: AudioBuffer | null = null;
  private bufferDryFire: AudioBuffer | null = null;
  private bufferSelector: AudioBuffer | null = null;
  private bufferMagOut: AudioBuffer | null = null;
  private bufferMagIn: AudioBuffer | null = null;
  private bufferBoltRelease: AudioBuffer | null = null;

  // Śledzenie poprzednich stanów w celu wykrywania krawędzi zmian (Edge Triggering)
  private lastSwitchState: WeaponSwitchState = WeaponSwitchState.IDLE;
  private lastActiveSlot: WeaponSlotType = WeaponSlotType.PRIMARY;
  private lastReloadPhase: ReloadPhase = ReloadPhase.INACTIVE;

  // Bieżący tryb ognia aktywnej broni
  private currentFireMode: FireMode = 'auto';

  // Pre-alokowane wektory dla Zero-GC raycastingu okluzji
  private readonly _vSoundPos = new THREE.Vector3();
  private readonly _vListenerPos = new THREE.Vector3();
  private readonly _vRayDir = new THREE.Vector3();

  constructor() {
    this.initAudioContext();
    this.synthesizeSoundBuffers();
  }

  /**
   * Inicjalizacja instancji Web Audio API i węzła wzmocnienia
   */
  private initAudioContext(): void {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return;

    this.audioCtx = new AudioCtxClass();
    this.masterSFXGain = this.audioCtx.createGain();
    this.masterSFXGain.gain.setValueAtTime(0.85, this.audioCtx.currentTime);
    this.masterSFXGain.connect(this.audioCtx.destination);
  }

  /**
   * Proceduralna synteza mechanicznych dźwięków broni do trwałych buforów pamięci.
   * Eliminuje konieczność ładowania zewnętrznych plików wav/mp3 oraz brak opóźnień sieciowych.
   */
  private synthesizeSoundBuffers(): void {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const sampleRate = ctx.sampleRate;

    // 1. Dobycie broni (Equip - szelest kamizelki, odbezpieczenie, metaliczny klik)
    {
      const len = Math.floor(sampleRate * 0.28);
      const buf = ctx.createBuffer(1, len, sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 22);
        const click1 = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-Math.abs(t - 0.05) * 80);
        const click2 = Math.sin(2 * Math.PI * 900 * t) * Math.exp(-Math.abs(t - 0.14) * 60);
        ch[i] = noise * 0.25 + click1 * 0.35 + click2 * 0.2;
      }
      this.bufferEquip = buf;
    }

    // 2. Chowanie broni (Unequip - miękki ruch w kaburze)
    {
      const len = Math.floor(sampleRate * 0.22);
      const buf = ctx.createBuffer(1, len, sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 18);
        const rustle = Math.sin(2 * Math.PI * 450 * t) * Math.exp(-t * 14);
        ch[i] = (noise * 0.3 + rustle * 0.4) * 0.6;
      }
      this.bufferUnequip = buf;
    }

    // 3. Suchy strzał (Dry Fire - ostre uderzenie iglicy o pustą komorę)
    {
      const len = Math.floor(sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const transient = Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 120);
        const resonance = Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-t * 50);
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 90);
        ch[i] = transient * 0.65 + resonance * 0.25 + noise * 0.15;
      }
      this.bufferDryFire = buf;
    }

    // 4. Selektor ognia (Fire Selector Click - metaliczny przełącznik)
    {
      const len = Math.floor(sampleRate * 0.09);
      const buf = ctx.createBuffer(1, len, sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const snap = Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t * 150);
        const sub = Math.sin(2 * Math.PI * 850 * t) * Math.exp(-t * 80);
        ch[i] = (snap * 0.7 + sub * 0.3) * 0.75;
      }
      this.bufferSelector = buf;
    }

    // 5. Odłączenie magazynka (Mag Out - kliknięcie zatrzasku i wysunięcie)
    {
      const len = Math.floor(sampleRate * 0.32);
      const buf = ctx.createBuffer(1, len, sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        // Kliknięcie zatrzasku na początku (t ~ 0.02)
        const latch = Math.sin(2 * Math.PI * 2200 * t) * Math.exp(-Math.abs(t - 0.02) * 110);
        // Tarcie prowadnicy magazynka
        const friction = (Math.random() * 2 - 1) * Math.exp(-t * 12) * Math.sin(2 * Math.PI * 650 * t);
        ch[i] = latch * 0.55 + friction * 0.35;
      }
      this.bufferMagOut = buf;
    }

    // 6. Wsunięcie magazynka (Mag In - głęboki impakt zatrzaśnięcia)
    {
      const len = Math.floor(sampleRate * 0.28);
      const buf = ctx.createBuffer(1, len, sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const bodyThud = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 30);
        const metalLock = Math.sin(2 * Math.PI * 1650 * t) * Math.exp(-Math.abs(t - 0.04) * 90);
        const noiseCrack = (Math.random() * 2 - 1) * Math.exp(-t * 40);
        ch[i] = bodyThud * 0.6 + metalLock * 0.45 + noiseCrack * 0.2;
      }
      this.bufferMagIn = buf;
    }

    // 7. Zwolnienie zamka / Bolt Catch (ciężkie uderzenie suwadła do przodu)
    {
      const len = Math.floor(sampleRate * 0.25);
      const buf = ctx.createBuffer(1, len, sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const slamBass = Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t * 35);
        const metalChack = Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-Math.abs(t - 0.03) * 100);
        const slapNoise = (Math.random() * 2 - 1) * Math.exp(-t * 60);
        ch[i] = slamBass * 0.55 + metalChack * 0.5 + slapNoise * 0.25;
      }
      this.bufferBoltRelease = buf;
    }
  }

  /**
   * Rejestracja systemów nadrzędnych
   */
  public connect(
    inventory: WeaponInventorySystem,
    reloadSystem: ReloadSystem,
    sim: SimulationEngine,
    spatialManager?: SpatialAudioManager
  ): void {
    this.inventory = inventory;
    this.reloadSystem = reloadSystem;
    this.sim = sim;
    if (spatialManager) {
      this.spatialManager = spatialManager;
    }
  }

  /**
   * Główny cykl aktualizacji synchronizujący dźwięki ze zmianami stanów (Zero-GC)
   */
  public update(dt: number, listenerPos: THREE.Vector3): void {
    if (!this.inventory || !this.reloadSystem) return;

    // 1. Detekcja zmian stanu wymiany broni (Equip / Unequip)
    const uiState = this.inventory.getUIState();
    const curSwitchState = uiState.switchState;
    const curActiveSlot = uiState.activeSlot;

    if (curSwitchState !== this.lastSwitchState || curActiveSlot !== this.lastActiveSlot) {
      if (curSwitchState === WeaponSwitchState.HOLSTERING) {
        this.playUnequip(true);
      } else if (curSwitchState === WeaponSwitchState.DRAWING) {
        this.playEquip(true);
      }
      this.lastSwitchState = curSwitchState;
      this.lastActiveSlot = curActiveSlot;
    }

    // 2. Detekcja faz przeładowania (ReloadSystem FSM Edge Detection)
    const reloadStatus = this.reloadSystem.getStatus();
    const curReloadPhase = reloadStatus.phase;

    if (curReloadPhase !== this.lastReloadPhase) {
      if (curReloadPhase === ReloadPhase.MAG_DROP) {
        this.playMagOut(true);
      } else if (curReloadPhase === ReloadPhase.MAG_INSERT) {
        this.playMagIn(true);
      } else if (curReloadPhase === ReloadPhase.BOLT_ACTION) {
        this.playBoltRelease(true);
      }
      this.lastReloadPhase = curReloadPhase;
    }
  }

  /**
   * Oblicza okluzję akustyczną pomiędzy źródłem dźwięku a słuchaczem przy użyciu raycastingu ścian
   */
  public calculateOcclusion(soundPos: THREE.Vector3, listenerPos: THREE.Vector3): { isOccluded: boolean; filterCutoff: number; volumeScale: number } {
    if (!this.sim) {
      return { isOccluded: false, filterCutoff: 18000, volumeScale: 1.0 };
    }

    this._vSoundPos.copy(soundPos);
    this._vListenerPos.copy(listenerPos);
    this._vRayDir.subVectors(this._vSoundPos, this._vListenerPos);
    const dist = this._vRayDir.length();

    if (dist < 0.1) {
      return { isOccluded: false, filterCutoff: 18000, volumeScale: 1.0 };
    }

    this._vRayDir.normalize();

    // Sprawdzenie czy promień dźwiękowy przecina ściany magazynu/beton
    const { closestWallDist, closestCollider } = this.sim.raycastWalls(this._vListenerPos, this._vRayDir, dist);

    if (closestWallDist < dist && closestCollider) {
      const resistance = closestCollider.penetrationResistance ?? 0.8;
      // Ściana betonowa odcina wysokie tony (Low-Pass 380 - 650 Hz) i tłumi głośność
      const cutoff = THREE.MathUtils.lerp(800, 320, resistance);
      const vol = THREE.MathUtils.lerp(0.55, 0.22, resistance);
      return { isOccluded: true, filterCutoff: cutoff, volumeScale: vol };
    }

    return { isOccluded: false, filterCutoff: 18000, volumeScale: 1.0 };
  }

  /**
   * Odtwarzanie dźwięku buforowego z adaptacyjną okluzją i obsługą trybu przestrzennego (3D Positional)
   */
  private playBuffer(
    buffer: AudioBuffer | null,
    isLocalPlayer: boolean,
    soundPos?: THREE.Vector3,
    listenerPos?: THREE.Vector3,
    baseGain: number = 1.0
  ): void {
    if (!buffer || !this.audioCtx || !this.masterSFXGain) return;
    const ctx = this.audioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Obliczenie okluzji jeśli dźwięk pochodzi z zewnętrznego punktu w świecie
    let filterCutoff = 18000;
    let volumeScale = 1.0;

    if (!isLocalPlayer && soundPos && listenerPos) {
      const occ = this.calculateOcclusion(soundPos, listenerPos);
      filterCutoff = occ.filterCutoff;
      volumeScale = occ.volumeScale;
    }

    // Filtr dolnoprzepustowy (Low-Pass Filter dla okluzji ścian)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterCutoff, t);
    filter.Q.setValueAtTime(filterCutoff < 5000 ? 1.8 : 0.7, t);

    // Kontrola głośności
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(baseGain * volumeScale, t);

    if (isLocalPlayer) {
      // Gracz lokalny (czyste stereo bezpośrednie)
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.masterSFXGain);
    } else if (soundPos && listenerPos) {
      // Dźwięk przestrzenny 3D z użyciem PannerNode
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1.5;
      panner.maxDistance = 80;
      panner.rolloffFactor = 1.2;
      panner.positionX.setValueAtTime(soundPos.x, t);
      panner.positionY.setValueAtTime(soundPos.y, t);
      panner.positionZ.setValueAtTime(soundPos.z, t);

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gainNode);
      gainNode.connect(this.masterSFXGain);
    } else {
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.masterSFXGain);
    }

    source.start(t);
  }

  // --- API PUBLICZNE ODGŁOSÓW BRONI ---

  public playEquip(isLocalPlayer: boolean = true, soundPos?: THREE.Vector3, listenerPos?: THREE.Vector3): void {
    this.playBuffer(this.bufferEquip, isLocalPlayer, soundPos, listenerPos, 0.85);
  }

  public playUnequip(isLocalPlayer: boolean = true, soundPos?: THREE.Vector3, listenerPos?: THREE.Vector3): void {
    this.playBuffer(this.bufferUnequip, isLocalPlayer, soundPos, listenerPos, 0.7);
  }

  public playDryFire(isLocalPlayer: boolean = true, soundPos?: THREE.Vector3, listenerPos?: THREE.Vector3): void {
    this.playBuffer(this.bufferDryFire, isLocalPlayer, soundPos, listenerPos, 1.0);
  }

  public playMagOut(isLocalPlayer: boolean = true, soundPos?: THREE.Vector3, listenerPos?: THREE.Vector3): void {
    this.playBuffer(this.bufferMagOut, isLocalPlayer, soundPos, listenerPos, 0.9);
  }

  public playMagIn(isLocalPlayer: boolean = true, soundPos?: THREE.Vector3, listenerPos?: THREE.Vector3): void {
    this.playBuffer(this.bufferMagIn, isLocalPlayer, soundPos, listenerPos, 1.0);
  }

  public playBoltRelease(isLocalPlayer: boolean = true, soundPos?: THREE.Vector3, listenerPos?: THREE.Vector3): void {
    this.playBuffer(this.bufferBoltRelease, isLocalPlayer, soundPos, listenerPos, 1.05);
  }

  public toggleFireMode(): FireMode {
    this.currentFireMode = this.currentFireMode === 'auto' ? 'semi' : 'auto';
    this.playBuffer(this.bufferSelector, true, undefined, undefined, 0.8);
    return this.currentFireMode;
  }

  public getFireMode(): FireMode {
    return this.currentFireMode;
  }

  public setFireMode(mode: FireMode): void {
    if (this.currentFireMode !== mode) {
      this.currentFireMode = mode;
      this.playBuffer(this.bufferSelector, true, undefined, undefined, 0.8);
    }
  }
}
