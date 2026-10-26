import * as THREE from 'three';

/**
 * ============================================================================
 * MENEDŻER PRZESTRZENNEGO AUDIO 3D (SPATIAL AUDIO MANAGER)
 * ============================================================================
 * Odpowiedzialność:
 * 1. Zarządzanie pulą obiektów dźwiękowych (PositionalAudio) dla Zero-GC.
 * 2. Akustyka środowiskowa: Raycasting dla detekcji okluzji dźwięku (Low-Pass Filter).
 */

export class SpatialAudioManager {
  private listener: THREE.AudioListener;
  private audioLoader: THREE.AudioLoader;
  private soundPool: THREE.PositionalAudio[] = [];
  private poolSize: number = 32;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.audioLoader = new THREE.AudioLoader();

    for (let i = 0; i < this.poolSize; i++) {
      const sound = new THREE.PositionalAudio(this.listener);
      this.soundPool.push(sound);
    }
  }

  public playSound(buffer: any, position: THREE.Vector3, isOccluded: boolean) {
    for (const sound of this.soundPool) {
      if (!sound.isPlaying) {
        sound.setBuffer(buffer);
        sound.setRefDistance(1);
        sound.setMaxDistance(100);
        sound.position.copy(position);
        
        // Akustyka: Filtr dolnoprzepustowy przy okluzji
        if (isOccluded) {
          const filter = sound.context.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 400;
          sound.setFilter(filter);
          sound.setVolume(0.3);
        } else {
          sound.setFilter(null as any);
          sound.setVolume(1.0);
        }

        sound.play();
        this.scene.add(sound);
        break;
      }
    }
  }
}
