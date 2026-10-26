import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { MapId, RoundState, WeaponStats, WeaponAttachmentConfig, Combatant, RadioCallout, Team } from './types/game';
import { Materials } from './engine/materials';
import { EnvironmentBuilder } from './engine/environment';
import { ParticleSystem } from './engine/particles';
import { SimulationEngine } from './engine/simulation';
import { PlayerController } from './engine/player';
import { Sound } from './engine/audio';
import { WEAPON_REGISTRY, DEFAULT_ATTACHMENTS } from './engine/weapons';
import { EngineRenderer } from './engine/renderer';
import { LevelBuilder } from './engine/LevelBuilder';
import { WeatherSystem } from './engine/rendering/WeatherSystem';

// Nowo zaimplementowane podsystemy architektury silnika Vanguard
import { GameModeManager, MatchState, MatchSummaryData } from './engine/modes/GameModeManager';
import { EngineProfiler, QualityTier, ProfilerMetricsSnapshot } from './engine/optimization/EngineProfiler';
import { FrustumOcclusionManager } from './engine/optimization/FrustumOcclusionManager';
import { LODSystem } from './engine/optimization/LODSystem';
import { WeaponInventorySystem, WeaponSlotType, WeaponInventoryUIState } from './engine/combat/WeaponInventorySystem';
import { ReloadSystem } from './engine/combat/ReloadSystem';
import { WeaponAudioIntegration, FireMode } from './engine/combat/WeaponAudioIntegration';
import { ParticleBufferPool } from './engine/vfx/ParticleBufferPool';
import { ImpactVFXManager } from './engine/vfx/ImpactVFXManager';

// Komponenty interfejsu użytkownika
import { MainMenuUI } from './components/MainMenuUI';
import { MatchSummaryUI } from './components/MatchSummaryUI';
import { TacticalHUD } from './components/TacticalHUD';
import { BuyMenu } from './components/BuyMenu';
import { Scoreboard } from './components/Scoreboard';
import { GunsmithModal } from './components/GunsmithModal';
import { GunsmithUI } from './components/GunsmithUI';
import { MapSelectModal } from './components/MapSelectModal';
import { MultiplayerLobbyModal } from './components/MultiplayerLobbyModal';
import { MultiplayerTeam } from './types/multiplayer';

export type AppFlowState = 'MENU' | 'LOADING' | 'IN_GAME' | 'MATCH_SUMMARY';

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);

  // Maszyna stanów aplikacji
  const [appState, setAppState] = useState<AppFlowState>('MENU');
  const appStateRef = useRef<AppFlowState>('MENU');
  appStateRef.current = appState;

  // Wybór mapy i frakcji
  const [currentMap, setCurrentMap] = useState<MapId>('industrial');
  const [selectedTeam, setSelectedTeam] = useState<Team>('VANGUARD');
  const [qualityTier, setQualityTier] = useState<QualityTier>(QualityTier.ULTRA);

  // Stan ładowania
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingStageText, setLoadingStageText] = useState<string>('Inicjalizacja silnika...');

  // Modale taktyczne
  const [isBuyMenuOpen, setIsBuyMenuOpen] = useState<boolean>(false);
  const [isScoreboardOpen, setIsScoreboardOpen] = useState<boolean>(false);
  const [isGunsmithOpen, setIsGunsmithOpen] = useState<boolean>(false);
  const [isMapSelectOpen, setIsMapSelectOpen] = useState<boolean>(false);
  const [isMultiplayerLobbyOpen, setIsMultiplayerLobbyOpen] = useState<boolean>(false);

  // Stan walki dla HUD i podsumowania
  const [playerCombatant, setPlayerCombatant] = useState<Combatant | null>(null);
  const [combatantsList, setCombatantsList] = useState<Combatant[]>([]);
  const [isAds, setIsAds] = useState<boolean>(false);
  const [hitmarker, setHitmarker] = useState<{ active: boolean; isHeadshot: boolean } | null>(null);
  const [damageDirection, setDamageDirection] = useState<number | null>(null);
  const [spectatorTarget, setSpectatorTarget] = useState<Combatant | null>(null);

  // Snapshoty telemetryczne i ekwipunku (Zero-GC)
  const [inventoryUIState, setInventoryUIState] = useState<WeaponInventoryUIState | undefined>(undefined);
  const [matchSummaryState, setMatchSummaryState] = useState<MatchSummaryData | undefined>(undefined);
  const [profilerSnapshot, setProfilerSnapshot] = useState<ProfilerMetricsSnapshot | undefined>(undefined);
  const [currentFireMode, setCurrentFireMode] = useState<FireMode>('auto');

  // Konfiguracja wyposażenia
  const [customAttachments, setCustomAttachments] = useState<WeaponAttachmentConfig>({ ...DEFAULT_ATTACHMENTS });
  const [bloomStrength, setBloomStrength] = useState<number>(0.45);
  const bloomStrengthRef = useRef<number>(0.45);
  bloomStrengthRef.current = bloomStrength;

  // Trwałe referencje do instancji modułów silnika
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const engineRendererRef = useRef<EngineRenderer | null>(null);
  const simRef = useRef<SimulationEngine | null>(null);
  const playerRef = useRef<PlayerController | null>(null);
  const envBuilderRef = useRef<EnvironmentBuilder>(new EnvironmentBuilder());
  const particlesRef = useRef<ParticleSystem | null>(null);
  const weatherMeshRef = useRef<THREE.Points | null>(null);

  const spawnsVanguardRef = useRef<THREE.Vector3[]>([]);
  const spawnsSyndicateRef = useRef<THREE.Vector3[]>([]);

  // Referencje do nowych menedżerów (Zero-GC)
  const gameModeManagerRef = useRef<GameModeManager | null>(null);
  const profilerRef = useRef<EngineProfiler | null>(null);
  const occlusionManagerRef = useRef<FrustumOcclusionManager | null>(null);
  const lodSystemRef = useRef<LODSystem | null>(null);
  const inventoryRef = useRef<WeaponInventorySystem | null>(null);
  const reloadSystemRef = useRef<ReloadSystem | null>(null);
  const audioIntegrationRef = useRef<WeaponAudioIntegration | null>(null);
  const particleBufferPoolRef = useRef<ParticleBufferPool | null>(null);
  const impactVFXManagerRef = useRef<ImpactVFXManager | null>(null);

  // Bezpieczna zmiana stanu aplikacji
  const setAppStateSafe = useCallback((state: AppFlowState) => {
    appStateRef.current = state;
    setAppState(state);
  }, []);

  // Inicjalizacja Three.js, silnika fizycznego i modułów optymalizacji
  useEffect(() => {
    if (!canvasRef.current) return;

    // Asynchroniczna inicjalizacja WebAssembly fizyki Rapier3D
    LevelBuilder.initRapierWasm();

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    cameraRef.current = camera;
    scene.add(camera);

    // Inicjalizacja dedykowanego silnika renderowania AAA
    const engineRenderer = new EngineRenderer(scene, camera, canvasRef.current);
    engineRendererRef.current = engineRenderer;

    // System cząsteczek
    const particles = new ParticleSystem(scene);
    particlesRef.current = particles;

    // Silnik symulacji meczu
    const sim = new SimulationEngine(scene, particles);
    simRef.current = sim;

    // Budowa środowiska taktycznego
    WeatherSystem.getInstance().setMapEnvironment(currentMap);
    const envData = envBuilderRef.current.buildMap(scene, currentMap);
    weatherMeshRef.current = envData.weatherMesh;
    sim.colliders = envData.colliders;
    sim.bombSiteA = envData.bombSiteA;
    sim.bombSiteB = envData.bombSiteB;
    spawnsVanguardRef.current = envData.spawnPointsVanguard;
    spawnsSyndicateRef.current = envData.spawnPointsSyndicate;

    // Kontroler gracza
    const playerCtrl = new PlayerController(camera, sim);
    playerRef.current = playerCtrl;

    // Inicjalizacja nowych systemów optymalizacji i mechaniki broni
    const occlusionMgr = new FrustumOcclusionManager();
    occlusionManagerRef.current = occlusionMgr;

    const lodSys = new LODSystem();
    lodSystemRef.current = lodSys;

    const profiler = new EngineProfiler(engineRenderer);
    profilerRef.current = profiler;

    const gameModeMgr = new GameModeManager(sim);
    gameModeManagerRef.current = gameModeMgr;

    const inventorySys = new WeaponInventorySystem();
    inventoryRef.current = inventorySys;

    const reloadSys = new ReloadSystem(inventorySys);
    reloadSystemRef.current = reloadSys;

    const audioIntegration = new WeaponAudioIntegration();
    audioIntegration.connect(inventorySys, reloadSys, sim);
    audioIntegrationRef.current = audioIntegration;

    // Inicjalizacja puli cząsteczek Zero-GC i menedżera uderzeń VFX
    const particlePool = new ParticleBufferPool(scene);
    particleBufferPoolRef.current = particlePool;

    const impactVFX = new ImpactVFXManager(scene, particlePool);
    impactVFXManagerRef.current = impactVFX;
    sim.setImpactVFXManager(impactVFX);

    // Rejestracja collidables w systemie okluzji
    for (let i = 0; i < envData.colliders.length; i++) {
      const c = envData.colliders[i];
      if (c.mesh) {
        occlusionMgr.registerObject(`collider_${i}`, c.mesh, 2000);
        lodSys.registerObject(`collider_${i}`, c.mesh);
      }
    }

    // Callbacks z silnika symulacji
    sim.onStateChange = (state) => {
      if (state === 'MATCH_END') {
        setAppStateSafe('MATCH_SUMMARY');
        document.exitPointerLock?.();
      }
    };

    sim.onHitConfirmed = (isHeadshot) => {
      setHitmarker({ active: true, isHeadshot });
      setTimeout(() => setHitmarker(null), 180);
    };

    sim.onPlayerDamaged = (hp, attackerPos) => {
      if (cameraRef.current) {
        const toAttacker = attackerPos.clone().sub(cameraRef.current.position);
        toAttacker.y = 0;
        toAttacker.normalize();
        const camDir = new THREE.Vector3();
        cameraRef.current.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        const angle = Math.atan2(
          toAttacker.x * camDir.z - toAttacker.z * camDir.x,
          toAttacker.x * camDir.x + toAttacker.z * camDir.z
        );
        setDamageDirection(angle);
        setTimeout(() => setDamageDirection(null), 600);
      }
    };

    // Główna pętla gry 60fps AAA (Zero-GC)
    let animId = 0;
    let lastTime = performance.now();
    let titleAngle = 0;
    const UI_SYNC_INTERVAL = 1 / 30;
    let uiSyncAccumulator = 0;

    const gameLoop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      profiler.beginCpu();

      if (simRef.current && playerRef.current) {
        if (appStateRef.current === 'IN_GAME') {
          // Aktualizacja symulacji i menedżera trybu gry
          simRef.current.update(dt);
          playerRef.current.update(dt);
          gameModeMgr.update(dt);

          // Aktualizacja systemów uzbrojenia, przeładowania i audio
          inventorySys.update(dt);
          reloadSys.update(
            dt,
            playerRef.current.vel.lengthSq() > 0.1,
            playerRef.current.isSprinting,
            playerRef.current.isCrouching,
            playerRef.current.isAds,
            inventorySys.getActiveModelGroup()
          );
          audioIntegration.update(dt, playerRef.current.pos);

          // Optymalizacja: LOD & Occlusion Culling
          occlusionMgr.update(camera);
          lodSys.update(playerRef.current.pos, dt);

          // Aktualizacja pogody
          envBuilderRef.current.updateWeather(weatherMeshRef.current, dt, currentMap);

          uiSyncAccumulator += dt;
          if (uiSyncAccumulator >= UI_SYNC_INTERVAL) {
            uiSyncAccumulator = 0;

            if (simRef.current.playerRef) {
              setPlayerCombatant({ ...simRef.current.playerRef });
            }
            setCombatantsList(Array.from(simRef.current.combatants.values()));
            setInventoryUIState({ ...inventorySys.getUIState() });
            setMatchSummaryState({ ...gameModeMgr.getSummary() });
            setProfilerSnapshot({ ...profiler.getSnapshot() });
            setCurrentFireMode(audioIntegration.getFireMode());

            // Sprawdzenie zakończenia meczu w GameModeManager
            if (gameModeMgr.getCurrentState() === MatchState.MATCH_OVER) {
              setAppStateSafe('MATCH_SUMMARY');
              document.exitPointerLock?.();
            }
          }
        } else if (appStateRef.current === 'MENU' || appStateRef.current === 'LOADING') {
          // Kinowa panorama kamery w tle menu
          titleAngle += dt * 0.12;
          camera.position.set(Math.cos(titleAngle) * 58, 16, Math.sin(titleAngle) * 58);
          camera.lookAt(0, 4, 0);
        }

        particles.update(dt);
        particlePool.update(dt);
        impactVFX.update(dt);
      }

      // Aktualizacja materiałów i pogody
      WeatherSystem.getInstance().update(dt);
      Materials.updateTime(dt);

      profiler.endCpu();

      // Renderowanie klatki GPU
      profiler.beginGpu();

      const isDead = Boolean(simRef.current?.playerRef && !simRef.current.playerRef.isAlive);
      const isSprinting = Boolean(playerRef.current?.isSprinting);
      const flashRemaining = Math.max(0, ((simRef.current?.playerRef?.isFlashedUntil ?? 0) - Date.now()) / 3500);

      engineRenderer.render(
        dt,
        {
          bloomEnabled: true,
          bloomStrength: bloomStrengthRef.current,
          chromaticAberration: isSprinting ? 0.0035 : damageDirection !== null ? 0.007 : 0.0012,
          vignetteStrength: isDead ? 0.65 : 0.36,
          filmGrain: 0.07,
          motionBlurStrength: 0.85,
          flirThermalMode: false,
          flashIntensity: flashRemaining,
          ssaoEnabled: true,
          ssaoRadius: 0.9,
          ssaoIntensity: 1.6,
        },
        playerRef.current?.yaw ?? 0,
        playerRef.current?.pitch ?? 0
      );

      profiler.endGpu();
      profiler.update(dt);

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animId);
      engineRenderer.dispose();
      inventorySys.dispose();
      occlusionMgr.dispose();
      particlePool.dispose();
      impactVFX.dispose();
      if (canvasRef.current && engineRenderer.renderer.domElement) {
        canvasRef.current.removeChild(engineRenderer.renderer.domElement);
      }
    };
  }, []);

  // Przełączanie jakości grafiki w locie
  const handleSelectQuality = useCallback((tier: QualityTier) => {
    setQualityTier(tier);
    if (profilerRef.current) {
      profilerRef.current.setQualityTier(tier);
    }
  }, []);

  // Sekwencja procedury ładowania zasobów i startu meczu
  const handleStartOperation = useCallback(() => {
    Sound.init();
    setAppStateSafe('LOADING');
    setLoadingProgress(10);
    setLoadingStageText('Ładowanie jądra fizyki Rapier3D (WebAssembly)...');

    setTimeout(() => {
      setLoadingProgress(40);
      setLoadingStageText('Kompilacja shaderów WGSL i potoku PBR HDR...');

      setTimeout(() => {
        setLoadingProgress(75);
        setLoadingStageText('Generowanie struktur okluzji Frustum & LOD...');

        setTimeout(() => {
          setLoadingProgress(100);
          setLoadingStageText('Operatorzy na pozycjach taktycznych!');

          setTimeout(() => {
            // Rozpoczęcie meczu
            if (simRef.current && sceneRef.current) {
              const spawns = selectedTeam === 'VANGUARD'
                ? spawnsVanguardRef.current
                : spawnsSyndicateRef.current;

              simRef.current.initMatch(
                currentMap,
                spawnsVanguardRef.current,
                spawnsSyndicateRef.current,
                selectedTeam
              );

              if (playerRef.current) {
                const pSpawn = spawns[2] || (selectedTeam === 'VANGUARD' ? new THREE.Vector3(0, 1.75, 48) : new THREE.Vector3(0, 1.75, -48));
                playerRef.current.pos.copy(pSpawn);
                playerRef.current.vel.set(0, 0, 0);
                playerRef.current.yaw = selectedTeam === 'VANGUARD' ? 0 : Math.PI;
                playerRef.current.pitch = 0;
                playerRef.current.isGrounded = true;
                playerRef.current.setupWeaponModel();

                if (cameraRef.current) {
                  cameraRef.current.position.copy(pSpawn);
                  cameraRef.current.quaternion.set(0, 0, 0, 1);
                }
              }

              if (gameModeManagerRef.current) {
                gameModeManagerRef.current.resetMatch();
              }
            }

            setAppStateSafe('IN_GAME');
            canvasRef.current?.requestPointerLock();
          }, 350);
        }, 350);
      }, 400);
    }, 350);
  }, [currentMap, selectedTeam, setAppStateSafe]);

  // Restart / Reangażowanie
  const handleRematch = useCallback(() => {
    if (gameModeManagerRef.current) {
      gameModeManagerRef.current.resetMatch();
    }
    handleStartOperation();
  }, [handleStartOperation]);

  // Powrót do menu głównego
  const handleReturnToMenu = useCallback(() => {
    document.exitPointerLock?.();
    setAppStateSafe('MENU');
  }, [setAppStateSafe]);

  // Obsługa wejść klawiatury i myszy
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setIsScoreboardOpen((prev) => !prev);
        return;
      }

      if (e.code === 'KeyB') {
        if (appStateRef.current === 'IN_GAME') {
          setIsBuyMenuOpen((prev) => !prev);
          if (!isBuyMenuOpen) document.exitPointerLock?.();
          return;
        }
      }

      if (e.code === 'KeyG') {
        if (appStateRef.current === 'IN_GAME') {
          setIsGunsmithOpen((prev) => !prev);
          if (!isGunsmithOpen) document.exitPointerLock?.();
          return;
        }
      }

      if (e.code === 'Escape') {
        if (isBuyMenuOpen) {
          setIsBuyMenuOpen(false);
          return;
        }
        if (isGunsmithOpen) {
          setIsGunsmithOpen(false);
          return;
        }
        if (isMapSelectOpen) {
          setIsMapSelectOpen(false);
          return;
        }
        if (isMultiplayerLobbyOpen) {
          setIsMultiplayerLobbyOpen(false);
          return;
        }
        if (appStateRef.current === 'IN_GAME') {
          document.exitPointerLock?.();
          setAppStateSafe('MENU');
          return;
        }
      }

      if (appStateRef.current !== 'IN_GAME') return;

      if (playerRef.current) {
        playerRef.current.keys[e.code] = true;

        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          playerRef.current.isSprinting = true;
        }
        if (e.code === 'KeyC' || e.code === 'ControlLeft') {
          if (playerRef.current.isSprinting && playerRef.current.isGrounded) {
            playerRef.current.isSliding = true;
            playerRef.current.slideTimer = 0.85;
          } else {
            playerRef.current.isCrouching = !playerRef.current.isCrouching;
          }
        }
        if (e.code === 'Space') {
          if (playerCombatant?.isAlive) {
            if (playerRef.current.isGrounded) {
              playerRef.current.vel.y = 8.5;
              playerRef.current.isGrounded = false;
              Sound.playFootstep('concrete');
            }
          } else {
            playerRef.current.cycleSpectatorTarget();
          }
        }
        if (e.code === 'KeyR') {
          if (reloadSystemRef.current) {
            reloadSystemRef.current.startReload();
          } else {
            playerRef.current.startReload();
          }
        }
        if (e.code === 'KeyY' || e.code === 'KeyI') {
          playerRef.current.triggerInspect();
        }

        // Przełączanie slotów broni 1, 2, 3
        if (e.code === 'Digit1') {
          inventoryRef.current?.switchToSlot(WeaponSlotType.PRIMARY);
        } else if (e.code === 'Digit2') {
          inventoryRef.current?.switchToSlot(WeaponSlotType.SECONDARY);
        } else if (e.code === 'Digit3') {
          inventoryRef.current?.switchToSlot(WeaponSlotType.TACTICAL);
        }

        // Przełącznik trybu ognia [V]
        if (e.code === 'KeyV') {
          const newMode = audioIntegrationRef.current?.toggleFireMode();
          if (newMode) setCurrentFireMode(newMode);
        }

        // Granaty
        if (e.code === 'KeyG') {
          if (cameraRef.current && simRef.current && playerRef.current) {
            const dir = new THREE.Vector3();
            cameraRef.current.getWorldDirection(dir);
            simRef.current.throwGrenade(
              playerRef.current.sim.playerRef?.id ?? 'player_0',
              'frag',
              playerRef.current.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
              dir
            );
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (playerRef.current) {
        playerRef.current.keys[e.code] = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          playerRef.current.isSprinting = false;
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement && playerRef.current) {
        playerRef.current.onMouseMove(e.movementX, e.movementY);
        reloadSystemRef.current?.applyMouseDelta(e.movementX, e.movementY);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (appStateRef.current !== 'IN_GAME') return;

      if (!document.pointerLockElement) {
        if (!isBuyMenuOpen && !isGunsmithOpen && !isMapSelectOpen) {
          canvasRef.current?.requestPointerLock();
        }
        return;
      }

      if (e.button === 0) {
        if (inventoryRef.current && !inventoryRef.current.canFire()) {
          audioIntegrationRef.current?.playDryFire(true);
          return;
        }
        const didFire = playerRef.current?.shoot();
        if (didFire) {
          inventoryRef.current?.consumeAmmo(1);
        }
      } else if (e.button === 2) {
        if (inventoryRef.current && !inventoryRef.current.canAim()) return;
        if (playerRef.current) {
          playerRef.current.isAds = true;
          setIsAds(true);
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        if (playerRef.current) {
          playerRef.current.isAds = false;
          setIsAds(false);
        }
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, [isBuyMenuOpen, isGunsmithOpen, isMapSelectOpen, isMultiplayerLobbyOpen, playerCombatant?.isAlive]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* 1. Kontener renderera 3D WebGPU/WebGL */}
      <div ref={canvasRef} className="absolute inset-0 cursor-crosshair" />

      {/* 2. Menu Główne i Ekran Ładowania */}
      {(appState === 'MENU' || appState === 'LOADING') && (
        <MainMenuUI
          currentMap={currentMap}
          onSelectMap={setCurrentMap}
          selectedTeam={selectedTeam}
          onSelectTeam={setSelectedTeam}
          qualityTier={qualityTier}
          onSelectQuality={handleSelectQuality}
          isLoading={appState === 'LOADING'}
          loadingProgress={loadingProgress}
          loadingStageText={loadingStageText}
          onStartGame={handleStartOperation}
          onOpenGunsmith={() => setIsGunsmithOpen(true)}
          onOpenMultiplayer={() => setIsMultiplayerLobbyOpen(true)}
        />
      )}

      {/* 3. Zaawansowany HUD Taktyczny (Podczas gry LIVE) */}
      {appState === 'IN_GAME' && (
        <TacticalHUD
          player={playerCombatant}
          inventoryState={inventoryUIState}
          matchSummary={matchSummaryState}
          fireMode={currentFireMode}
          spread={playerCombatant ? (isAds ? playerCombatant.weapon.spreadAds : playerCombatant.weapon.spreadNormal) : 0.024}
          damageDirection={damageDirection}
          isAds={isAds}
          hitmarker={hitmarker}
          zoneName="SEKTOR 04 // STREFA PRZEMYSŁOWA"
          spectatorTarget={spectatorTarget}
          onOpenBuyMenu={() => {
            setIsBuyMenuOpen(true);
            document.exitPointerLock?.();
          }}
          onOpenGunsmith={() => {
            setIsGunsmithOpen(true);
            document.exitPointerLock?.();
          }}
          onInspectWeapon={() => playerRef.current?.triggerInspect()}
          onToggleFireMode={() => {
            const next = audioIntegrationRef.current?.toggleFireMode();
            if (next) setCurrentFireMode(next);
          }}
          onSwitchSlot={(slot) => inventoryRef.current?.switchToSlot(slot)}
        />
      )}

      {/* 4. Ekran Końcowy Meczu (Podsumowanie) */}
      {appState === 'MATCH_SUMMARY' && (
        <MatchSummaryUI
          winnerTeam={matchSummaryState?.roundWinnerTeam ?? 'VANGUARD'}
          playerTeam={selectedTeam}
          scoreVanguard={matchSummaryState?.scoreVanguard ?? 9}
          scoreSyndicate={matchSummaryState?.scoreSyndicate ?? 4}
          combatants={combatantsList}
          player={playerCombatant}
          mvp={simRef.current?.mvpCombatant ?? null}
          profilerSnapshot={profilerSnapshot}
          onRematch={handleRematch}
          onReturnToMenu={handleReturnToMenu}
        />
      )}

      {/* 5. Modale pomocnicze */}
      {isBuyMenuOpen && (
        <BuyMenu
          cash={playerCombatant?.cash ?? 1000}
          remainingTime={matchSummaryState?.timeRemainingSec ?? 15}
          onBuyWeapon={(w) => {
            inventoryRef.current?.setWeapon(WeaponSlotType.PRIMARY, w.id);
            if (playerCombatant) playerCombatant.weapon = w;
          }}
          onBuyArmor={() => {
            if (playerCombatant) playerCombatant.armor = 100;
          }}
          onBuyDefuseKit={() => {
            if (playerCombatant) playerCombatant.hasDefuseKit = true;
          }}
          onBuyFlashbang={() => {
            if (playerCombatant) playerCombatant.flashbangs++;
          }}
          onBuyClaymore={() => {
            if (playerCombatant) playerCombatant.claymores++;
          }}
          hasDefuseKit={playerCombatant?.hasDefuseKit}
          flashbangs={playerCombatant?.flashbangs}
          claymores={playerCombatant?.claymores}
          onClose={() => {
            setIsBuyMenuOpen(false);
            if (appStateRef.current === 'IN_GAME') canvasRef.current?.requestPointerLock();
          }}
        />
      )}

      {isScoreboardOpen && (
        <Scoreboard
          combatants={combatantsList}
          scoreVanguard={matchSummaryState?.scoreVanguard ?? 0}
          scoreSyndicate={matchSummaryState?.scoreSyndicate ?? 0}
          roundNumber={matchSummaryState?.roundNumber ?? 1}
        />
      )}

      {isGunsmithOpen && (
        <GunsmithUI
          currentWeapon={playerCombatant?.weapon ?? WEAPON_REGISTRY.m4a1}
          currentAttachments={customAttachments}
          onApplyAttachments={(att, effectiveStats) => {
            setCustomAttachments(att);
            if (playerRef.current) {
              playerRef.current.currentAttachments = att;
              if (effectiveStats && playerCombatant) {
                playerCombatant.weapon.magSize = effectiveStats.magSize;
                playerCombatant.weapon.reloadTimeSec = effectiveStats.reloadTimeSec;
                playerCombatant.weapon.bulletSpeed = effectiveStats.bulletSpeed;
                playerCombatant.weapon.rangeMeters = effectiveStats.rangeMeters;
                playerCombatant.weapon.recoilVertical = effectiveStats.recoilVertical;
                playerCombatant.weapon.recoilHorizontal = effectiveStats.recoilHorizontal;
                playerCombatant.weapon.spreadAds = effectiveStats.spreadAds;
                playerCombatant.weapon.spreadNormal = effectiveStats.spreadNormal;
              }
            }
            if (inventoryRef.current) {
              const activeData = inventoryRef.current.getActiveSlotData();
              inventoryRef.current.setWeapon(activeData.slotType, activeData.weaponId, att);
            }
          }}
          onClose={() => {
            setIsGunsmithOpen(false);
            if (appStateRef.current === 'IN_GAME') canvasRef.current?.requestPointerLock();
          }}
          availableWeapons={Object.values(WEAPON_REGISTRY)}
        />
      )}

      {isMultiplayerLobbyOpen && (
        <MultiplayerLobbyModal
          isOpen={isMultiplayerLobbyOpen}
          onClose={() => setIsMultiplayerLobbyOpen(false)}
          onStartMatch={(mapId: MapId, team: MultiplayerTeam) => {
            setIsMultiplayerLobbyOpen(false);
            setCurrentMap(mapId);
            setSelectedTeam(team === 'syndicate' ? 'SYNDICATE' : 'VANGUARD');
            handleStartOperation();
          }}
        />
      )}
    </div>
  );
}
