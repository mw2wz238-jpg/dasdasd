import * as THREE from 'three';
import { WeaponStats, WeaponAttachmentConfig, Combatant } from '../types/game';
import { WeaponModelBuilder, DEFAULT_ATTACHMENTS } from './weapons';
import { SimulationEngine } from './simulation';
import { Sound } from './audio';
import { KinematicPhysicsBridge } from './physics';

/**
 * Zaawansowany Kontroler Postaci Kinematycznej FPS (Zero-GC Architecture)
 * Obsługuje:
 * 1. Płynny ruch z kinematycznym step-offsetem (schodki, krawężniki) i zsuwaniem po ścianach.
 * 2. Ślizg taktyczny (Slide), sprint, kucanie oraz celowanie przez przyrządy (ADS).
 * 3. Proceduralną animację odrzutu kamery (Recoil Spring), kołysanie bronią (Sway) oraz inspekcję broni.
 * 4. Pule obiektów wektorowych zapobiegające alokacji pamięci w każdej klatce.
 */

// Statyczne obiekty pomocnicze - brak alokacji na stercie w pętli renderowania
const _forward = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _moveVector = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _quat = new THREE.Quaternion();
const _camDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public sim: SimulationEngine;
  public physicsBridge: KinematicPhysicsBridge;

  public pos: THREE.Vector3 = new THREE.Vector3(0, 1.75, 48);
  public vel: THREE.Vector3 = new THREE.Vector3();
  public yaw: number = 0;
  public pitch: number = 0;

  public isGrounded: boolean = true;
  public isSprinting: boolean = false;
  public isCrouching: boolean = false;
  public isSliding: boolean = false;
  public slideTimer: number = 0;
  public isAds: boolean = false;
  public isReloading: boolean = false;
  public reloadProgress: number = 0;

  // Inspekcja broni (Weapon Inspect Showcase)
  public isInspecting: boolean = false;
  public inspectTimer: number = 0;
  public inspectDuration: number = 3.2;

  public stamina: number = 100;
  public maxStamina: number = 100;

  // Odrzut broni i powrót sprężynowy
  public recoilPitch: number = 0;
  public recoilYaw: number = 0;

  // Model broni pierwszoosobowej
  public weaponRoot: THREE.Group | null = null;
  public currentAttachments: WeaponAttachmentConfig = { ...DEFAULT_ATTACHMENTS };

  // Tryb obserwatora
  public spectatorIndex: number = 0;

  // Stan wciśniętych klawiszy
  public keys: Record<string, boolean> = {};

  // Cykl kołysania kroków (Head bobbing)
  private bobTimer: number = 0;

  constructor(camera: THREE.PerspectiveCamera, sim: SimulationEngine) {
    this.camera = camera;
    this.sim = sim;
    this.physicsBridge = new KinematicPhysicsBridge();
    this.setupWeaponModel();
  }

  public setupWeaponModel() {
    if (this.weaponRoot) {
      this.camera.remove(this.weaponRoot);
    }

    const playerCombatant = this.sim.playerRef;
    const wpnId = playerCombatant ? playerCombatant.weapon.id : 'm4a1';

    this.weaponRoot = WeaponModelBuilder.buildProceduralWeapon(wpnId, this.currentAttachments, true);
    this.weaponRoot.position.set(0.18, -0.16, -0.32);
    this.weaponRoot.rotation.set(0, 0, 0);
    this.camera.add(this.weaponRoot);
  }

  public triggerInspect() {
    if (this.isReloading || this.isAds) return;
    this.isInspecting = true;
    this.inspectTimer = 0;
    Sound.playInspectWeapon();
  }

  public onMouseMove(dx: number, dy: number, sensitivity: number = 0.0022) {
    if (!this.sim.playerRef?.isAlive) {
      this.yaw -= dx * sensitivity;
      this.pitch -= dy * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
      return;
    }

    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  public shoot(): boolean {
    const player = this.sim.playerRef;
    if (!player || !player.isAlive || this.isReloading) return false;

    if (this.isInspecting) {
      this.isInspecting = false;
    }

    if (player.currentMag <= 0) {
      this.startReload();
      return false;
    }

    // Wyznaczenie wektora kierunkowego z uwzględnieniem odrzutu
    _euler.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ');
    _forward.set(0, 0, -1).applyEuler(_euler).normalize();

    _origin.copy(this.pos);
    _origin.y += this.isCrouching ? 0.95 : 1.65;

    const isFlashed = (player.isFlashedUntil ?? 0) > Date.now();
    const spread = (this.isAds ? player.weapon.spreadAds : player.weapon.spreadNormal * (this.isSprinting ? 2.0 : 1.0)) * (isFlashed ? 2.4 : 1.0);

    const result = this.sim.validateAndExecuteShot(player.id, _origin, _forward, spread);

    // Fizyczny impuls odrzutu broni
    this.recoilPitch += player.weapon.recoilVertical * (this.isAds ? 0.6 : 1.0);
    this.recoilYaw += (Math.random() - 0.5) * player.weapon.recoilHorizontal;

    // Kopnięcie wizualne modelu broni
    if (this.weaponRoot) {
      this.weaponRoot.position.z += 0.035;
      this.weaponRoot.rotation.x += 0.08;
    }

    // Odtworzenie wystrzału
    const isSuppressed = this.currentAttachments.barrel === 'suppressed';
    Sound.playGunshot(player.weapon.category, isSuppressed);

    return result.hit;
  }

  public startReload() {
    const player = this.sim.playerRef;
    if (!player || !player.isAlive || this.isReloading) return;
    if (player.currentMag >= player.weapon.magSize || player.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.reloadProgress = 0;
    this.sim.triggerCallout(player, 'reloading', `${player.name}: Przeładowuję magazynek!`);
    Sound.playReload();
  }

  public cycleSpectatorTarget() {
    const aliveAllies = Array.from(this.sim.combatants.values()).filter((c) => c.isAlive && c.team === 'VANGUARD');
    if (aliveAllies.length > 0) {
      this.spectatorIndex = (this.spectatorIndex + 1) % aliveAllies.length;
    }
  }

  public update(dt: number) {
    const player = this.sim.playerRef;
    if (!player) return;

    // 1. Tryb obserwatora po śmierci gracza
    if (!player.isAlive) {
      if (this.weaponRoot) this.weaponRoot.visible = false;

      const aliveAllies = Array.from(this.sim.combatants.values()).filter((c) => c.isAlive && c.team === 'VANGUARD');
      if (aliveAllies.length > 0) {
        const ally = aliveAllies[this.spectatorIndex % aliveAllies.length];
        _targetPos.set(ally.pos.x, 2.2, ally.pos.z + 3.2);
        this.camera.position.lerp(_targetPos, dt * 5);
        this.camera.lookAt(ally.pos.x, 1.4, ally.pos.z);
      } else {
        _euler.set(this.pitch, this.yaw, 0, 'YXZ');
        _camDir.set(0, 0, -1).applyEuler(_euler);
        this.camera.position.addScaledVector(_camDir, 8 * dt);
        this.camera.quaternion.setFromEuler(_euler);
      }
      return;
    }

    if (this.weaponRoot) this.weaponRoot.visible = true;

    // 2. Klawisze ruchu
    let moveX = 0;
    let moveZ = 0;
    if (this.keys['KeyW']) moveZ -= 1;
    if (this.keys['KeyS']) moveZ += 1;
    if (this.keys['KeyA']) moveX -= 1;
    if (this.keys['KeyD']) moveX += 1;

    // Obsługa wślizgu (Tactical Slide)
    if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    // Zużycie i regeneracja staminy sprinterskiej
    if (this.isSprinting && (moveX !== 0 || moveZ !== 0) && !this.isAds) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
      if (this.stamina <= 0) this.isSprinting = false;
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 20 * dt);
    }

    // Prędkość poruszania się
    let speed = 5.2;
    if (this.isSliding) speed = 12.0;
    else if (this.isSprinting && !this.isAds) speed = 8.5;
    else if (this.isCrouching) speed = 2.8;
    else if (this.isAds) speed = 3.1;

    // Transformacja wektora ruchu do przestrzeni kamery
    _moveVector.set(moveX, 0, moveZ);
    if (_moveVector.lengthSq() > 0) {
      _moveVector.normalize();
      _moveVector.applyAxisAngle(_up, this.yaw);

      this.vel.x = _moveVector.x * speed;
      this.vel.z = _moveVector.z * speed;

      // Dźwięki kroków
      this.bobTimer += dt * (this.isSprinting ? 14 : 9);
      if (Math.sin(this.bobTimer) > 0.95 && this.isGrounded) {
        Sound.playFootstep('concrete');
      }
    } else {
      // Damping poziomej prędkości
      this.vel.x = THREE.MathUtils.damp(this.vel.x, 0, 12, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, 0, 12, dt);
    }

    // Grawitacja
    this.vel.y -= 24 * dt;

    // Rozwiązanie kolizji kapsułowej z wykorzystaniem mostka kinematycznego
    const capsuleHeight = this.isCrouching || this.isSliding
      ? KinematicPhysicsBridge.CAPSULE_HEIGHT_CROUCH
      : KinematicPhysicsBridge.CAPSULE_HEIGHT_STAND;

    const colResult = this.physicsBridge.resolveCapsuleCollision(
      this.pos,
      this.vel,
      capsuleHeight,
      KinematicPhysicsBridge.CAPSULE_RADIUS,
      this.sim.colliders,
      dt
    );

    this.isGrounded = colResult.isGrounded;

    // Synchronizacja pozycji obiektu gracza
    player.pos = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    player.yaw = this.yaw;
    player.pitch = this.pitch;

    // 3. Pozycja i kołysanie kamery
    const eyeHeight = this.isCrouching || this.isSliding ? 1.05 : 1.75;
    const bobOffset = _moveVector.lengthSq() > 0 ? Math.sin(this.bobTimer) * 0.035 : 0;
    this.camera.position.set(this.pos.x, this.pos.y - 1.75 + eyeHeight + bobOffset, this.pos.z);

    // Sprężynowe wytłumienie odrzutu kamery
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 8, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 8, dt);

    const rollAngle = this.isSliding ? 0.08 : 0;
    _euler.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, rollAngle, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    // 4. Płynne przejście FOV przy celowaniu przez przyrządy (ADS)
    let adsFov = 55;
    if (this.currentAttachments.sight === 'sniper_scope') adsFov = 14;
    else if (this.currentAttachments.sight === 'acog_scope') adsFov = 28;
    else if (this.currentAttachments.sight === 'holographic') adsFov = 52;
    else if (this.currentAttachments.sight === 'reddot') adsFov = 58;
    else if (this.currentAttachments.sight === 'ironsight') adsFov = 65;
    const targetFov = this.isAds ? adsFov : 75;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
    this.camera.updateProjectionMatrix();

    if (this.isAds) {
      this.isInspecting = false;
    }

    // 5. Pozycjonowanie modelu broni w widoku FPP
    if (this.weaponRoot) {
      if (this.isAds) {
        _targetPos.set(0, -0.088, -0.21);
        this.weaponRoot.position.lerp(_targetPos, dt * 14);
        this.weaponRoot.rotation.set(0, 0, 0);
      } else if (this.isInspecting && !this.isReloading) {
        this.inspectTimer += dt;
        const t = this.inspectTimer / this.inspectDuration;
        if (t >= 1.0) {
          this.isInspecting = false;
          this.inspectTimer = 0;
        } else if (t < 0.4) {
          const p = t / 0.4;
          const ease = Math.sin(p * Math.PI * 0.5);
          _targetPos.set(0.08, -0.11, -0.26);
          this.weaponRoot.position.lerp(_targetPos, ease);
          this.weaponRoot.rotation.set(0.25 * ease, 0.65 * ease, -0.45 * ease);
        } else if (t < 0.8) {
          const p = (t - 0.4) / 0.4;
          const ease = Math.sin(p * Math.PI);
          _targetPos.set(-0.06, -0.13, -0.25);
          this.weaponRoot.position.lerp(_targetPos, 0.2);
          this.weaponRoot.rotation.set(-0.28 * ease, -0.72 * ease, 0.48 * ease);
        } else {
          const p = (t - 0.8) / 0.2;
          _targetPos.set(0.18, -0.16, -0.32);
          this.weaponRoot.position.lerp(_targetPos, p);
          this.weaponRoot.rotation.set(0, 0, 0);
        }
      } else {
        _targetPos.set(0.18, -0.16, -0.32);
        this.weaponRoot.position.lerp(_targetPos, dt * 14);

        const sway = _moveVector.lengthSq() > 0 ? Math.cos(this.bobTimer * 0.5) * 0.012 : 0;
        this.weaponRoot.position.x += sway;
        this.weaponRoot.rotation.z = -sway * 2;
        this.weaponRoot.rotation.x = THREE.MathUtils.damp(this.weaponRoot.rotation.x, 0, 8, dt);
        this.weaponRoot.rotation.y = THREE.MathUtils.damp(this.weaponRoot.rotation.y, 0, 8, dt);
      }
    }

    // 6. Interakcja klawiszem E (Podkładanie / Rozbrajanie Spike'a)
    if (this.keys['KeyE']) {
      if (this.sim.roundState === 'BOMB_PLANTED' && this.sim.plantedBomb) {
        const bPos = this.sim.plantedBomb.position;
        const dist = Math.hypot(this.pos.x - bPos.x, this.pos.z - bPos.z);
        if (dist <= 3.5) {
          this.sim.startDefusing('player_0');
        }
      } else if (this.sim.roundState === 'LIVE_COMBAT' && !this.sim.plantedBomb) {
        const siteA = this.sim.bombSiteA;
        const siteB = this.sim.bombSiteB;
        const distA = Math.hypot(this.pos.x - siteA.position.x, this.pos.z - siteA.position.z);
        const distB = Math.hypot(this.pos.x - siteB.position.x, this.pos.z - siteB.position.z);
        if (distA <= siteA.radius) {
          this.sim.startPlanting('player_0', 'A');
        } else if (distB <= siteB.radius) {
          this.sim.startPlanting('player_0', 'B');
        }
      }
    } else {
      if (this.sim.defusingCombatantId === 'player_0') {
        this.sim.cancelDefusing();
      }
      if (this.sim.plantingCombatantId === 'player_0') {
        this.sim.cancelPlanting();
      }
    }

    // 7. Przeładowanie magazynka
    if (this.isReloading) {
      this.reloadProgress += dt / player.weapon.reloadTimeSec;
      if (this.weaponRoot) {
        const reloadDip = Math.sin(this.reloadProgress * Math.PI) * 0.14;
        this.weaponRoot.position.y -= reloadDip;
      }
      if (this.reloadProgress >= 1.0) {
        this.isReloading = false;
        this.reloadProgress = 0;
        const needed = player.weapon.magSize - player.currentMag;
        const available = Math.min(needed, player.reserveAmmo);
        player.currentMag += available;
        player.reserveAmmo -= available;
      }
    }
  }
}
