import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { WeaponStats, WeaponAttachmentConfig } from '../types/game';
import { WEAPON_REGISTRY, DEFAULT_ATTACHMENTS, WeaponModelBuilder } from '../engine/weapons';
import { WeaponAttachmentSystem, AttachmentSlotKey, AttachmentDefinition, WeaponCategory } from '../engine/combat/WeaponAttachmentSystem';
import { GunsmithModifier, EffectiveWeaponStats, GunsmithStatDeltas } from '../engine/combat/GunsmithModifier';
import { Sound } from '../engine/audio';
import {
  Crosshair,
  Shield,
  Sliders,
  Check,
  X,
  RotateCcw,
  Volume2,
  VolumeX,
  Weight,
  Timer,
  Zap,
  Target,
  ChevronRight,
  Eye,
  Disc,
  Layers,
  Sparkles
} from 'lucide-react';

/**
 * ============================================================================
 * PROJEKT VANGUARD — INTERFEJS WARSZTATU UZBROJENIA (GUNSMITH UI)
 * ============================================================================
 * Komponent: GunsmithUI
 * Standard: AAA Tactical HUD & 3D Interactive Turntable
 * 
 * Funkcjonalności:
 * 1. Interaktywny podgląd 3D uzbrojenia w czasie rzeczywistym (Three.js):
 *    - Obrót myszą (Orbit Drag), zoom (Mouse Wheel), automatyczna rotacja w bezczynności.
 *    - Trójpunktowe studyjne oświetlenie HDR (Key, Rim, Ambient, Ground Grid).
 *    - Natychmiastowe przebudowywanie geometrii 3D przy zmianie akcesoriów.
 * 2. Przeliczanie statystyk w locie za pomocą GunsmithModifier (Zero-GC):
 *    - Zasięg, Szybkostrzelność, Celność, Mobilność, Kontrola Odrzutu.
 *    - Wskaźniki delty (+/- zielone/czerwone) względem konfiguracji fabrycznej.
 * 3. Szczegółowy wykaz taktyczny (Zalety / Wady) dla każdego komponentu.
 * 4. Płytka telemetryczna masy, prędkości ADS i sygnatury akustycznej.
 * ============================================================================
 */

export interface GunsmithUIProps {
  currentWeapon: WeaponStats;
  currentAttachments: WeaponAttachmentConfig;
  onApplyAttachments: (attachments: WeaponAttachmentConfig, effectiveStats: EffectiveWeaponStats) => void;
  onClose: () => void;
  onSelectWeapon?: (weaponId: string) => void;
  availableWeapons?: WeaponStats[];
}

export const GunsmithUI: React.FC<GunsmithUIProps> = ({
  currentWeapon: initialWeapon,
  currentAttachments: initialAttachments,
  onApplyAttachments,
  onClose,
  onSelectWeapon,
  availableWeapons = Object.values(WEAPON_REGISTRY),
}) => {
  // Wybrana platforma broni
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponStats>(initialWeapon);

  // Kopia robocza konfiguracji akcesoriów
  const [attachments, setAttachments] = useState<WeaponAttachmentConfig>({ ...initialAttachments });

  // Aktywny slot modyfikacji
  const [activeSlot, setActiveSlot] = useState<AttachmentSlotKey>('sight');

  // Status zapisania
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Referencje do kontenera Three.js i pętli renderowania
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const weaponMeshRef = useRef<THREE.Group | null>(null);

  // Kontrola interaktywnego obrotu myszką
  const isDraggingRef = useRef<boolean>(false);
  const prevMouseXRef = useRef<number>(0);
  const rotYRef = useRef<number>(0);
  const targetRotYRef = useRef<number>(0);
  const cameraDistRef = useRef<number>(0.85);

  // Efektywne statystyki wyliczone przez GunsmithModifier (Zero-GC)
  const effectiveStats = useMemo(() => {
    return GunsmithModifier.calculateEffectiveStats(selectedWeapon, attachments);
  }, [selectedWeapon, attachments]);

  // Delty statystyk względem fabrycznej broni
  const deltas: GunsmithStatDeltas = useMemo(() => {
    return GunsmithModifier.calculateDeltas(selectedWeapon, effectiveStats);
  }, [selectedWeapon, effectiveStats]);

  // Lista kompatybilnych akcesoriów dla aktywnego slotu i kategorii wybranej broni
  const compatibleAttachments: AttachmentDefinition[] = useMemo(() => {
    return WeaponAttachmentSystem.getAvailableAttachments(activeSlot, selectedWeapon.category as WeaponCategory);
  }, [activeSlot, selectedWeapon.category]);

  // Inicjalizacja Three.js Turntable Preview
  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d12);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 50);
    camera.position.set(0, 0.12, cameraDistRef.current);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Studyjny Rig Oświetleniowy Gunsmith AAA
    // 1. Światło kluczowe (Key Light - ciepły blask militarnego reflektora)
    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.8);
    keyLight.position.set(3.5, 4.0, 3.5);
    scene.add(keyLight);

    // 2. Światło kontrowe (Rim Light - lodowaty błękit podkreślający krawędzie stali)
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 2.2);
    rimLight.position.set(-3.5, -1.0, -3.0);
    scene.add(rimLight);

    // 3. Delikatne światło od spodu (Under-fill)
    const underLight = new THREE.DirectionalLight(0x1e293b, 1.2);
    underLight.position.set(0, -3.0, 1.0);
    scene.add(underLight);

    // 4. Światło otoczenia (Ambient)
    const ambLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambLight);

    // 5. Podłoże z siatką taktyczną
    const gridHelper = new THREE.GridHelper(4, 32, 0x0284c7, 0x1e293b);
    gridHelper.position.y = -0.22;
    scene.add(gridHelper);

    // Zbudowanie pierwszego modelu broni
    const weaponGroup = WeaponModelBuilder.buildProceduralWeapon(selectedWeapon.id, attachments, false);
    weaponGroup.position.set(0, -0.02, 0);
    scene.add(weaponGroup);
    weaponMeshRef.current = weaponGroup;

    // Pętla animacji 3D z płynną bezwładnością obrotu
    let animId = 0;
    const animate = () => {
      if (!isDraggingRef.current) {
        // Delikatny automatyczny obrót, gdy użytkownik nie przeciąga
        targetRotYRef.current += 0.0025;
      }

      rotYRef.current = THREE.MathUtils.lerp(rotYRef.current, targetRotYRef.current, 0.1);

      if (weaponMeshRef.current) {
        weaponMeshRef.current.rotation.y = rotYRef.current;
      }

      if (cameraRef.current) {
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, cameraDistRef.current, 0.1);
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animate();

    // Obsługa zmiany rozmiaru okna
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [selectedWeapon.id]);

  // Przebudowa modelu 3D broni przy jakiejkolwiek zmianie konfiguracji akcesoriów
  useEffect(() => {
    if (!sceneRef.current) return;

    if (weaponMeshRef.current) {
      sceneRef.current.remove(weaponMeshRef.current);
      weaponMeshRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
        }
      });
    }

    const newGroup = WeaponModelBuilder.buildProceduralWeapon(selectedWeapon.id, attachments, false);
    newGroup.position.set(0, -0.02, 0);
    newGroup.rotation.y = rotYRef.current;
    sceneRef.current.add(newGroup);
    weaponMeshRef.current = newGroup;

    setIsSaved(false);
  }, [attachments, selectedWeapon.id]);

  // Obsługa przeciągania myszą dla obrotu 3D
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMouseXRef.current = e.clientX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - prevMouseXRef.current;
    prevMouseXRef.current = e.clientX;
    targetRotYRef.current += deltaX * 0.012;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    cameraDistRef.current = THREE.MathUtils.clamp(
      cameraDistRef.current + (e.deltaY > 0 ? 0.06 : -0.06),
      0.45,
      1.35
    );
  };

  // Wybór akcesorium
  const handleSelectAttachment = (slot: AttachmentSlotKey, id: string) => {
    Sound.playUI('click');
    setAttachments((prev) => ({
      ...prev,
      [slot]: id,
    }));
  };

  // Reset do domyślnych
  const handleResetToDefault = () => {
    Sound.playUI('click');
    setAttachments({ ...DEFAULT_ATTACHMENTS });
  };

  // Zapis konfiguracji
  const handleSave = () => {
    Sound.playUI('purchase');
    setIsSaved(true);
    onApplyAttachments(attachments, effectiveStats);
  };

  // Zmiana platformy broni
  const handleSwitchWeapon = (w: WeaponStats) => {
    Sound.playUI('click');
    setSelectedWeapon(w);
    // Dostosowanie akcesoriów do nowej platformy
    const sanitized = WeaponAttachmentSystem.validateAndSanitize(w.category as WeaponCategory, attachments);
    setAttachments(sanitized);
    if (onSelectWeapon) onSelectWeapon(w.id);
  };

  // Etykiety i ikony slotów
  const slotTabs: Array<{ key: AttachmentSlotKey; label: string; icon: React.ReactNode }> = [
    { key: 'sight', label: 'CELOWNIK', icon: <Eye className="w-4 h-4" /> },
    { key: 'barrel', label: 'WYLOT LUFY', icon: <Volume2 className="w-4 h-4" /> },
    { key: 'magazine', label: 'MAGAZYNEK', icon: <Layers className="w-4 h-4" /> },
    { key: 'grip', label: 'PODLUFOWE', icon: <Target className="w-4 h-4" /> },
    { key: 'stock', label: 'KOLBA', icon: <Sliders className="w-4 h-4" /> },
    { key: 'camo', label: 'KAMUFLAŻ', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md select-none font-mono">
      {/* Główny kontener warsztatu */}
      <div className="relative w-full h-full max-w-7xl max-h-[96vh] flex flex-col bg-[#0c1017] border border-cyan-500/30 rounded-xl overflow-hidden shadow-2xl shadow-cyan-950/40">
        
        {/* NAGŁÓWEK TAKTYCZNY */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-[#080c12] border-b border-cyan-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-6 bg-cyan-400 rounded-xs animate-pulse" />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
                  VANGUARD ARMORY // GUNSMITH MODIFICATION SUITE
                </span>
                <span className="px-2 py-0.5 text-[10px] bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 rounded font-semibold">
                  REV 4.2-ZERO-GC
                </span>
              </div>
              <h1 className="text-xl font-black tracking-wider text-white uppercase flex items-center gap-2">
                {selectedWeapon.name}
                <span className="text-xs font-normal text-slate-400 tracking-normal capitalize">
                  [{selectedWeapon.category}]
                </span>
              </h1>
            </div>
          </div>

          {/* Selektor platformy broni */}
          <div className="hidden lg:flex items-center space-x-1.5 bg-[#06090e] p-1 border border-slate-800 rounded-lg">
            {availableWeapons.map((w) => (
              <button
                key={w.id}
                onClick={() => handleSwitchWeapon(w)}
                className={`px-3 py-1.5 text-xs font-bold rounded tracking-wider transition-all ${
                  selectedWeapon.id === w.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-sm shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                {w.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Przycisk zamknięcia */}
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/40 border border-transparent rounded-lg transition-colors"
            title="Zamknij warsztat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* OBSZAR ROBOCZY: PODGLĄD 3D + PANELE MODYFIKACJI */}
        <div className="relative flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* LEWA STRONA / ŚRODEK: TRÓJWYMIAROWA INTERAKTYWNA SCENA BRONI */}
          <div
            className="relative flex-1 h-[42vh] lg:h-full bg-radial from-[#121926] via-[#090d14] to-[#05070a] cursor-grab active:cursor-grabbing overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <div ref={mountRef} className="w-full h-full" />

            {/* Wskazówki sterowania obrotem 3D */}
            <div className="absolute top-4 left-4 pointer-events-none flex flex-col space-y-1">
              <span className="text-[10px] tracking-wider text-cyan-400/80 font-bold uppercase flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" /> OBRÓT 3D: PRZECIĄGNIJ MYSZĄ // ZOOM: KÓŁKO MYSZY
              </span>
              <span className="text-[9px] text-slate-400">
                STANOWISKO SERWISOWE VANGUARD • OŚWIETLENIE STUDYJNE HDR
              </span>
            </div>

            {/* Pływający wskaźnik tłumika dźwięku */}
            <div className="absolute top-4 right-4 pointer-events-none flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/50">
              {effectiveStats.isSuppressed ? (
                <>
                  <VolumeX className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    TŁUMIK AKTYWNY ({effectiveStats.acousticSignatureRadiusMeters} M)
                  </span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    GŁOŚNY ({effectiveStats.acousticSignatureRadiusMeters} M)
                  </span>
                </>
              )}
            </div>

            {/* DOLNY PASEK WYKRESÓW STATYSTYK W CZASIE RZECZYWISTYM */}
            <div className="absolute bottom-4 left-4 right-4 pointer-events-auto bg-[#0a0f18]/90 backdrop-blur-md border border-cyan-500/25 rounded-xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-200 tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" /> WYKRES PARAMETRÓW BALISTYCZNYCH I ERGONOMII
                </span>
                <span className="text-[11px] text-slate-400">
                  MASA: <strong className="text-white">{effectiveStats.totalWeightKg} KG</strong>{' '}
                  <span className={deltas.weightDeltaKg > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    ({deltas.weightDeltaKg > 0 ? `+${deltas.weightDeltaKg}` : deltas.weightDeltaKg} kg)
                  </span>
                </span>
              </div>

              {/* 5 Słupków Wydajności */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                <StatMetricBar
                  label="OBRAŻENIA & ZASIĘG"
                  value={effectiveStats.scoreDamage}
                  delta={deltas.damageDelta}
                  unit={`${effectiveStats.damage} DP`}
                />
                <StatMetricBar
                  label="SZYBKOSTRZELNOŚĆ"
                  value={effectiveStats.scoreFireRate}
                  delta={deltas.fireRateDelta}
                  unit={`${effectiveStats.fireRateRPM} RPM`}
                />
                <StatMetricBar
                  label="CELNOŚĆ (ADS)"
                  value={effectiveStats.scoreAccuracy}
                  delta={deltas.accuracyDelta}
                  unit={`${(effectiveStats.spreadAds * 1000).toFixed(1)} mrad`}
                />
                <StatMetricBar
                  label="MOBILNOŚĆ & ADS"
                  value={effectiveStats.scoreMobility}
                  delta={deltas.mobilityDelta}
                  unit={`${Math.round(effectiveStats.adsTransitionTimeSec * 1000)} ms`}
                />
                <StatMetricBar
                  label="KONTROLA ODRZUTU"
                  value={effectiveStats.scoreRecoilControl}
                  delta={deltas.recoilControlDelta}
                  unit={`${(effectiveStats.recoilVerticalMultiplier * 100).toFixed(0)}%`}
                />
              </div>
            </div>
          </div>

          {/* PRAWA STRONA: MODUŁY WYBORU AKCESORIÓW */}
          <div className="w-full lg:w-[460px] h-[58vh] lg:h-full bg-[#080c14] border-t lg:border-t-0 lg:border-l border-cyan-500/20 flex flex-col">
            
            {/* ZAKŁADKI SLOTÓW */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-2 bg-[#06080e] border-b border-slate-800">
              {slotTabs.map((tab) => {
                const isActive = activeSlot === tab.key;
                const currentAttachmentId = attachments[tab.key];
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      Sound.playUI('click');
                      setActiveSlot(tab.key);
                    }}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-[10px] font-bold tracking-wider transition-all border ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-sm shadow-cyan-500/30'
                        : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <div className="mb-1">{tab.icon}</div>
                    <span className="truncate w-full text-center">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* LISTA AKCESORIÓW W AKTYWNYM SLOCIE */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-slate-800">
                <span className="uppercase font-bold tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5" /> DOSTĘPNE WYPOSAŻENIE: {activeSlot.toUpperCase()}
                </span>
                <span className="text-[11px] text-slate-400">
                  {compatibleAttachments.length} MODUŁÓW
                </span>
              </div>

              {compatibleAttachments.map((att) => {
                const isEquipped = attachments[activeSlot] === att.id;

                return (
                  <div
                    key={att.id}
                    onClick={() => handleSelectAttachment(activeSlot, att.id)}
                    className={`group relative p-3.5 rounded-lg border transition-all cursor-pointer ${
                      isEquipped
                        ? 'bg-gradient-to-r from-cyan-950/60 via-slate-900/80 to-[#0e1726] border-cyan-400 shadow-md shadow-cyan-950/50'
                        : 'bg-[#0b101a] border-slate-800 hover:border-slate-600 hover:bg-[#0e1422]'
                    }`}
                  >
                    {/* Wskaźnik zamontowania */}
                    {isEquipped && (
                      <div className="absolute top-3 right-3 flex items-center space-x-1 px-2 py-0.5 bg-cyan-500 text-black text-[10px] font-black rounded uppercase tracking-wider">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>ZAMONTOWANO</span>
                      </div>
                    )}

                    {/* Nagłówek akcesorium */}
                    <div className="pr-24">
                      <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                        {att.name}
                      </h3>
                      <p className="text-[11px] text-cyan-400/80 font-mono tracking-wide mt-0.5">
                        {att.militaryDesignation}
                      </p>
                    </div>

                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      {att.description}
                    </p>

                    {/* Waga modułu */}
                    <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Weight className="w-3.5 h-3.5 text-slate-400" />
                      <span>MASA MODUŁU: <strong>{att.weightKg > 0 ? `+${att.weightKg} kg` : '0 kg'}</strong></span>
                    </div>

                    {/* Zalety i Wady */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 grid grid-cols-1 gap-1 text-[11px]">
                      {att.pros.map((pro, idx) => (
                        <div key={idx} className="flex items-center space-x-1.5 text-emerald-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span>{pro}</span>
                        </div>
                      ))}
                      {att.cons.map((con, idx) => (
                        <div key={idx} className="flex items-center space-x-1.5 text-rose-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                          <span>{con}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DOLNE PRZYCISKI ZAPISU I POWROTU */}
            <div className="p-4 bg-[#06080e] border-t border-slate-800 flex items-center justify-between space-x-3">
              <button
                onClick={handleResetToDefault}
                className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
                title="Przywróć domyślną konfigurację fabryczną"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>FABRYCZNE</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSave}
                  className={`flex items-center space-x-2 px-4 py-2 text-xs font-black rounded-lg uppercase tracking-wider transition-all shadow-lg ${
                    isSaved
                      ? 'bg-emerald-500 text-black border border-emerald-400 shadow-emerald-950/40'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-black border border-cyan-300 shadow-cyan-950/40 active:scale-95'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSaved ? 'KONFIGURACJA ZAPISANA' : 'ZAPISZ KONFIGURACJĘ'}</span>
                </button>

                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg uppercase tracking-wider transition-colors"
                >
                  POWRÓT
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

/**
 * Pomocniczy komponent pojedynczego paska statystyki z dynamiczną deltą
 */
interface StatMetricBarProps {
  label: string;
  value: number; // 0 - 100
  delta: number;
  unit: string;
}

const StatMetricBar: React.FC<StatMetricBarProps> = ({ label, value, delta, unit }) => {
  const isPositive = delta > 0;
  const isNegative = delta < 0;

  return (
    <div className="flex flex-col space-y-1">
      <div className="flex items-center justify-between text-[10px] tracking-wide">
        <span className="text-slate-400 font-bold uppercase truncate">{label}</span>
        <div className="flex items-center space-x-1.5">
          <span className="text-slate-200 font-mono font-bold">{unit}</span>
          {delta !== 0 && (
            <span
              className={`text-[9px] font-black font-mono px-1 rounded ${
                isPositive ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/80 text-rose-400 border border-rose-500/30'
              }`}
            >
              {isPositive ? `+${delta}` : delta}
            </span>
          )}
        </div>
      </div>

      {/* Pasek postępu */}
      <div className="relative w-full h-2 bg-slate-900 rounded overflow-hidden border border-slate-800">
        <div
          className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-cyan-600 to-cyan-400 rounded transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
        {/* Wskaźnik siatki 25% 50% 75% */}
        <div className="absolute inset-0 grid grid-cols-4 pointer-events-none opacity-20">
          <div className="border-r border-white" />
          <div className="border-r border-white" />
          <div className="border-r border-white" />
          <div />
        </div>
      </div>
    </div>
  );
};
