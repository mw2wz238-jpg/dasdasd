import * as THREE from 'three';
import { MapId } from '../../types/game';
import { Materials } from '../materials';
import { PBRMaterialSystem } from './PBRMaterialSystem';

/**
 * ============================================================================
 * SYSTEM POGODOWY I WILGOCI POWIERZCHNIOWEJ (WEATHER SYSTEM)
 * ============================================================================
 * Odpowiedzialność:
 * 1. Zarządzanie warunkami pogodowymi w zależności od wybranej mapy (currentMap).
 * 2. Aktualizacja proceduralnych shaderów wilgoci, deszczu, kałuż oraz śniegu w czasie rzeczywistym.
 * 3. Architektura Zero-GC: brak alokacji obiektów w pętli aktualizacji.
 */

export type WeatherType = 'rain_heavy' | 'rain_light' | 'snow' | 'clear';

export interface WeatherConfig {
  type: WeatherType;
  wetnessFactor: number;
  puddleAccumulation: number;
  snowCover: number;
  windSpeed: THREE.Vector2;
}

export class WeatherSystem {
  private static instance: WeatherSystem | null = null;
  public config: WeatherConfig;
  private pbr: PBRMaterialSystem;
  private timeElapsed: number = 0;

  constructor() {
    this.pbr = PBRMaterialSystem.getInstance();
    this.config = {
      type: 'rain_heavy',
      wetnessFactor: 0.85,
      puddleAccumulation: 0.75,
      snowCover: 0.0,
      windSpeed: new THREE.Vector2(1.2, 0.4),
    };
  }

  public static getInstance(): WeatherSystem {
    if (!WeatherSystem.instance) {
      WeatherSystem.instance = new WeatherSystem();
    }
    return WeatherSystem.instance;
  }

  /**
   * Konfiguruje parametry pogody w oparciu o aktualną mapę gry
   */
  public setMapEnvironment(mapId: MapId): void {
    if (mapId === 'industrial') {
      this.config = {
        type: 'rain_heavy',
        wetnessFactor: 0.9,
        puddleAccumulation: 0.85,
        snowCover: 0.0,
        windSpeed: new THREE.Vector2(1.5, 0.5),
      };
    } else if (mapId === 'winter_village') {
      this.config = {
        type: 'snow',
        wetnessFactor: 0.1,
        puddleAccumulation: 0.0,
        snowCover: 1.0,
        windSpeed: new THREE.Vector2(2.5, 1.2),
      };
    } else if (mapId === 'night_docks') {
      this.config = {
        type: 'rain_light',
        wetnessFactor: 0.95,
        puddleAccumulation: 0.9,
        snowCover: 0.0,
        windSpeed: new THREE.Vector2(0.8, 0.3),
      };
    } else {
      this.config = {
        type: 'clear',
        wetnessFactor: 0.2,
        puddleAccumulation: 0.1,
        snowCover: 0.0,
        windSpeed: new THREE.Vector2(0.5, 0.1),
      };
    }
  }

  /**
   * Aktualizuje proceduralne shadery wilgoci i kałuż (Zero-GC)
   */
  public update(dt: number): void {
    this.timeElapsed += dt;
    Materials.updateTime(dt);

    // Dynamiczna modulacja parametrów wilgoci w PBR
    if (this.config.type === 'rain_heavy' || this.config.type === 'rain_light') {
      const rippleMod = Math.sin(this.timeElapsed * 2.5) * 0.05 + 0.95;
      this.config.puddleAccumulation = Math.min(1.0, Math.max(0.0, this.config.puddleAccumulation * rippleMod));
    }
  }
}
