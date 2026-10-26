import * as THREE from 'three';
import { WeaponStats, WeaponAttachmentConfig } from '../../types/game';
import { WeaponAttachmentSystem, AttachmentDefinition } from './WeaponAttachmentSystem';

/**
 * ============================================================================
 * PROJEKT VANGUARD — MODUŁ PRZELICZNIKA STATYSTYK I BALISTYKI (GUNSMITH MODIFIER)
 * ============================================================================
 * Klasa: GunsmithModifier
 * Architektura: 100% Zero-GC, pre-alokowane struktury wynikowe i wektory pomocnicze.
 * 
 * Odpowiedzialność:
 * 1. Dynamiczne przeliczanie parametrów broni w czasie rzeczywistym na podstawie założonych akcesoriów:
 *    - Waga całkowita broni -> wpływ na bezwładność widoku (Weapon Sway) i czas wejścia w ADS.
 *    - Modyfikacja wzorca odrzutu (RecoilPattern) skalowana przez współczynniki chwytów, kompensatorów i tłumika.
 *    - Modyfikacja trajektorii i prędkości pocisków w BallisticsSystem (np. spadek prędkości początkowej o 5% dla tłumika).
 *    - Automatyczne przekierowanie profilu audio w WeaponAudioIntegration (wyciszenie sygnatury akustycznej do 18m).
 * 2. Wyliczanie znormalizowanych wskaźników wydajności (0-100) dla interfejsu Gunsmith UI:
 *    - Zasięg, Szybkostrzelność, Celność, Mobilność, Kontrola Odrzutu.
 * ============================================================================
 */

export interface EffectiveWeaponStats {
  // Podstawowe dane identyfikacyjne
  weaponId: string;
  name: string;
  category: string;

  // Waga i ergonomia
  baseWeightKg: number;
  totalWeightKg: number;
  adsTransitionTimeSec: number;
  adsFov: number;
  weaponSwayAmplitude: number;
  weaponSwayFrequency: number;
  moveSpeedMultiplier: number;

  // Siła ognia i szybkostrzelność
  damage: number;
  headshotMultiplier: number;
  fireRateRPM: number;
  magSize: number;
  reserveAmmo: number;
  reloadTimeSec: number;

  // Odrzut i stabilizacja
  recoilVertical: number;
  recoilHorizontal: number;
  recoilVerticalMultiplier: number;
  recoilHorizontalMultiplier: number;
  spreadNormal: number;
  spreadAds: number;

  // Balistyka
  bulletSpeed: number; // m/s
  rangeMeters: number;
  damageDropoffStartMeters: number;
  damageDropoffEndMeters: number;
  bulletGravityMultiplier: number;

  // Sygnatura akustyczno-wizualna
  isSuppressed: boolean;
  acousticSignatureRadiusMeters: number; // Promień słyszalności dla wrogich botów AI
  muzzleFlashScale: number;
  reticleType: 'iron' | 'red_dot' | 'holo_ring' | 'acog_bdc' | 'sniper_mildot';

  // Oceny znormalizowane dla wykresów UI (zakres 0 - 100)
  scoreDamage: number;
  scoreRange: number;
  scoreFireRate: number;
  scoreAccuracy: number;
  scoreMobility: number;
  scoreRecoilControl: number;
}

export interface GunsmithStatDeltas {
  damageDelta: number;
  rangeDelta: number;
  fireRateDelta: number;
  accuracyDelta: number;
  mobilityDelta: number;
  recoilControlDelta: number;
  weightDeltaKg: number;
  adsTimeDeltaSec: number;
  reloadTimeDeltaSec: number;
  magCapacityDelta: number;
}

export class GunsmithModifier {
  // Domyślne wagi bazowe szkieletów broni (bez akcesoriów)
  private static readonly BASE_WEIGHTS: Record<string, number> = {
    m4a1: 3.10,    // 3.10 kg (karabinek szturmowy 5.56)
    awp: 6.50,     // 6.50 kg (ciężki karabin wyborowy .338 Lapua)
    mp5: 2.80,     // 2.80 kg (pistolet maszynowy 9x19mm)
    shotgun: 3.80, // 3.80 kg (strzelba gładkolufowa 12 gauge)
    deagle: 1.99,  // 1.99 kg (pistolet wielkokalibrowy .50 AE)
    p250: 0.85,    // 0.85 kg (służbowy pistolet polimerowy)
  };

  // Domyślne czasy wejścia w ADS dla poszczególnych platform (w sekundach)
  private static readonly BASE_ADS_TIMES: Record<string, number> = {
    m4a1: 0.22,
    awp: 0.38,
    mp5: 0.18,
    shotgun: 0.25,
    deagle: 0.19,
    p250: 0.15,
  };

  // Pre-alokowany obiekt roboczy (Zero-GC singleton)
  private static readonly _reusableStats: EffectiveWeaponStats = {
    weaponId: '',
    name: '',
    category: '',
    baseWeightKg: 0,
    totalWeightKg: 0,
    adsTransitionTimeSec: 0,
    adsFov: 75,
    weaponSwayAmplitude: 1.0,
    weaponSwayFrequency: 1.0,
    moveSpeedMultiplier: 1.0,
    damage: 0,
    headshotMultiplier: 1.0,
    fireRateRPM: 0,
    magSize: 0,
    reserveAmmo: 0,
    reloadTimeSec: 0,
    recoilVertical: 0,
    recoilHorizontal: 0,
    recoilVerticalMultiplier: 1.0,
    recoilHorizontalMultiplier: 1.0,
    spreadNormal: 0,
    spreadAds: 0,
    bulletSpeed: 0,
    rangeMeters: 0,
    damageDropoffStartMeters: 0,
    damageDropoffEndMeters: 0,
    bulletGravityMultiplier: 1.0,
    isSuppressed: false,
    acousticSignatureRadiusMeters: 85,
    muzzleFlashScale: 1.0,
    reticleType: 'iron',
    scoreDamage: 0,
    scoreRange: 0,
    scoreFireRate: 0,
    scoreAccuracy: 0,
    scoreMobility: 0,
    scoreRecoilControl: 0,
  };

  // Pre-alokowana struktura delty dla interfejsu (Zero-GC)
  private static readonly _reusableDeltas: GunsmithStatDeltas = {
    damageDelta: 0,
    rangeDelta: 0,
    fireRateDelta: 0,
    accuracyDelta: 0,
    mobilityDelta: 0,
    recoilControlDelta: 0,
    weightDeltaKg: 0,
    adsTimeDeltaSec: 0,
    reloadTimeDeltaSec: 0,
    magCapacityDelta: 0,
  };

  // Pre-alokowany wektor do odrzutu (Zero-GC)
  private static readonly _tempRecoil = new THREE.Vector2();

  /**
   * Główna funkcja wyliczająca kompletne efektywne statystyki broni na podstawie akcesoriów.
   * Zwraca `outStats` jeśli przekazano, w przeciwnym razie wewnętrzną pre-alokowaną instancję (Zero-GC).
   */
  public static calculateEffectiveStats(
    baseStats: WeaponStats,
    attachments: WeaponAttachmentConfig,
    outStats?: EffectiveWeaponStats
  ): EffectiveWeaponStats {
    const target = outStats ?? this._reusableStats;

    // Pobranie definicji wszystkich założonych akcesoriów
    const optic = WeaponAttachmentSystem.getAttachment('sight', attachments.sight);
    const muzzle = WeaponAttachmentSystem.getAttachment('barrel', attachments.barrel);
    const mag = WeaponAttachmentSystem.getAttachment('magazine', attachments.magazine);
    const grip = WeaponAttachmentSystem.getAttachment('grip', attachments.grip);
    const stock = WeaponAttachmentSystem.getAttachment('stock', attachments.stock);
    const camo = WeaponAttachmentSystem.getAttachment('camo', attachments.camo);

    const baseWeight = this.BASE_WEIGHTS[baseStats.id] ?? 3.0;
    const baseAdsTime = this.BASE_ADS_TIMES[baseStats.id] ?? 0.22;

    // 1. Obliczenie masy całkowitej (Total Weight)
    const totalWeight =
      baseWeight +
      optic.weightKg +
      muzzle.weightKg +
      mag.weightKg +
      grip.weightKg +
      stock.weightKg +
      camo.weightKg;

    // 2. Obliczenie czasu wejścia w ADS i ergonomii
    // Iloczyn mnożników szybkości ADS (większy mnożnik = szybszy ADS = mniejszy czas)
    const combinedAdsSpeedMult =
      optic.modifiers.adsSpeedMultiplier *
      muzzle.modifiers.adsSpeedMultiplier *
      mag.modifiers.adsSpeedMultiplier *
      grip.modifiers.adsSpeedMultiplier *
      stock.modifiers.adsSpeedMultiplier;

    // Waga powyżej bazowej nieznacznie spowalnia wejście w ADS
    const weightPenalty = Math.max(0.85, 1.0 - (totalWeight - baseWeight) * 0.06);
    const effectiveAdsTime = Math.max(0.10, (baseAdsTime / combinedAdsSpeedMult) / weightPenalty);

    // Kąt FOV optyki
    const effectiveAdsFov = optic.modifiers.adsFov > 0 ? optic.modifiers.adsFov : 55;

    // Kołysanie broni (Weapon Sway) - cięższa broń z dobrą kolbą ma mniejsze kołysanie,
    // ale lunety powiększające wizualnie potęgują bezwładność
    const swayMultiplier =
      optic.modifiers.weaponSwayMultiplier *
      muzzle.modifiers.weaponSwayMultiplier *
      mag.modifiers.weaponSwayMultiplier *
      grip.modifiers.weaponSwayMultiplier *
      stock.modifiers.weaponSwayMultiplier;

    const effectiveSwayAmp = 0.012 * swayMultiplier;
    const effectiveSwayFreq = 1.2 * (totalWeight / baseWeight);

    // Mnożnik prędkości poruszania się operatora
    const moveSpeedMult =
      optic.modifiers.moveSpeedMultiplier *
      muzzle.modifiers.moveSpeedMultiplier *
      mag.modifiers.moveSpeedMultiplier *
      grip.modifiers.moveSpeedMultiplier *
      stock.modifiers.moveSpeedMultiplier;

    // 3. Mnożniki odrzutu (Recoil Multipliers)
    // - Pionowy odrzut (Vertical Recoil)
    const verticalMultiplier =
      optic.modifiers.recoilVerticalMultiplier *
      muzzle.modifiers.recoilVerticalMultiplier *
      mag.modifiers.recoilVerticalMultiplier *
      grip.modifiers.recoilVerticalMultiplier *
      stock.modifiers.recoilVerticalMultiplier;

    // - Poziomy odrzut ("Snake Recoil" - zbijany głównie przez Vertical Grip i Hamulec SureFire)
    const horizontalMultiplier =
      optic.modifiers.recoilHorizontalMultiplier *
      muzzle.modifiers.recoilHorizontalMultiplier *
      mag.modifiers.recoilHorizontalMultiplier *
      grip.modifiers.recoilHorizontalMultiplier *
      stock.modifiers.recoilHorizontalMultiplier;

    // 4. Balistyka i prędkość wylotowa (Muzzle Velocity)
    const velocityMultiplier =
      optic.modifiers.muzzleVelocityMultiplier *
      muzzle.modifiers.muzzleVelocityMultiplier *
      mag.modifiers.muzzleVelocityMultiplier *
      grip.modifiers.muzzleVelocityMultiplier *
      stock.modifiers.muzzleVelocityMultiplier;

    const rangeMultiplier =
      optic.modifiers.effectiveRangeMultiplier *
      muzzle.modifiers.effectiveRangeMultiplier *
      mag.modifiers.effectiveRangeMultiplier *
      grip.modifiers.effectiveRangeMultiplier *
      stock.modifiers.effectiveRangeMultiplier;

    const damageMultiplier =
      optic.modifiers.damageMultiplier *
      muzzle.modifiers.damageMultiplier *
      mag.modifiers.damageMultiplier *
      grip.modifiers.damageMultiplier *
      stock.modifiers.damageMultiplier;

    const effectiveBulletSpeed = baseStats.bulletSpeed * velocityMultiplier;
    const effectiveRange = baseStats.rangeMeters * rangeMultiplier;
    const effectiveDamage = Math.round(baseStats.damage * damageMultiplier);

    // Grawitacja pocisku (im wolniejszy pocisk np. przez tłumik, tym silniej opada w locie)
    const bulletGravityMult = 1.0 / Math.max(0.5, velocityMultiplier);

    // 5. Pojemność i czas przeładowania
    const magCapacityDelta = mag.modifiers.magCapacityDelta;
    const effectiveMagSize = Math.max(1, baseStats.magSize + magCapacityDelta);

    const reloadMultiplier =
      optic.modifiers.reloadTimeMultiplier *
      muzzle.modifiers.reloadTimeMultiplier *
      mag.modifiers.reloadTimeMultiplier *
      grip.modifiers.reloadTimeMultiplier *
      stock.modifiers.reloadTimeMultiplier;

    const effectiveReloadTime = baseStats.reloadTimeSec * reloadMultiplier;

    // 6. Rozrzut (Spread)
    const spreadAdsMult =
      optic.modifiers.spreadAdsMultiplier *
      muzzle.modifiers.spreadAdsMultiplier *
      mag.modifiers.spreadAdsMultiplier *
      grip.modifiers.spreadAdsMultiplier *
      stock.modifiers.spreadAdsMultiplier;

    const spreadHipMult =
      optic.modifiers.spreadHipMultiplier *
      muzzle.modifiers.spreadHipMultiplier *
      mag.modifiers.spreadHipMultiplier *
      grip.modifiers.spreadHipMultiplier *
      stock.modifiers.spreadHipMultiplier;

    const effectiveSpreadAds = baseStats.spreadAds * spreadAdsMult;
    const effectiveSpreadNormal = baseStats.spreadNormal * spreadHipMult;

    // 7. Sygnatury akustyczne i wizualne
    const isSuppressed = muzzle.modifiers.isSuppressed;
    const baseAcousticRadius = 85.0; // Standardowy huk wystrzału słyszalny z 85 metrów
    const effectiveAcousticRadius = baseAcousticRadius * muzzle.modifiers.acousticRadiusMultiplier;
    const effectiveMuzzleFlashScale = muzzle.modifiers.muzzleFlashMultiplier;

    // 8. Oceny znormalizowane (0 - 100) dla wizualizacji wykresów
    // - Obrażenia: skala względem AWP (115)
    const scoreDamage = Math.min(100, Math.round((effectiveDamage / 115) * 100));

    // - Zasięg: skala względem AWP (350m)
    const scoreRange = Math.min(100, Math.round((effectiveRange / 350) * 100));

    // - Szybkostrzelność: skala względem MP5 (800 RPM)
    const scoreFireRate = Math.min(100, Math.round((baseStats.fireRateRPM / 850) * 100));

    // - Celność: odwrotność rozrzutu ADS
    const accuracyRaw = 1.0 / (effectiveSpreadAds * 1000 + 1.0);
    const scoreAccuracy = Math.min(100, Math.max(10, Math.round(accuracyRaw * 120)));

    // - Mobilność: im mniejszy czas ADS i mniejsza waga, tym wyższy wynik
    const mobilityWeightFactor = Math.max(0.2, (8.0 - totalWeight) / 8.0);
    const mobilityAdsFactor = Math.max(0.2, (0.45 - effectiveAdsTime) / 0.45);
    const scoreMobility = Math.min(100, Math.max(15, Math.round((mobilityWeightFactor * 0.4 + mobilityAdsFactor * 0.6) * 100)));

    // - Kontrola Odrzutu: odwrotność iloczynu składowych odrzutu
    const recoilSum = baseStats.recoilVertical * verticalMultiplier * 2.0 + baseStats.recoilHorizontal * horizontalMultiplier;
    const scoreRecoilControl = Math.min(100, Math.max(10, Math.round(100 - recoilSum * 520)));

    // Wypełnienie pre-alokowanego obiektu target (Zero-GC)
    target.weaponId = baseStats.id;
    target.name = baseStats.name;
    target.category = baseStats.category;

    target.baseWeightKg = baseWeight;
    target.totalWeightKg = parseFloat(totalWeight.toFixed(2));
    target.adsTransitionTimeSec = parseFloat(effectiveAdsTime.toFixed(3));
    target.adsFov = effectiveAdsFov;
    target.weaponSwayAmplitude = effectiveSwayAmp;
    target.weaponSwayFrequency = effectiveSwayFreq;
    target.moveSpeedMultiplier = parseFloat(moveSpeedMult.toFixed(2));

    target.damage = effectiveDamage;
    target.headshotMultiplier = baseStats.headshotMultiplier;
    target.fireRateRPM = baseStats.fireRateRPM;
    target.magSize = effectiveMagSize;
    target.reserveAmmo = baseStats.reserveAmmo;
    target.reloadTimeSec = parseFloat(effectiveReloadTime.toFixed(2));

    target.recoilVertical = baseStats.recoilVertical * verticalMultiplier;
    target.recoilHorizontal = baseStats.recoilHorizontal * horizontalMultiplier;
    target.recoilVerticalMultiplier = parseFloat(verticalMultiplier.toFixed(3));
    target.recoilHorizontalMultiplier = parseFloat(horizontalMultiplier.toFixed(3));
    target.spreadNormal = effectiveSpreadNormal;
    target.spreadAds = effectiveSpreadAds;

    target.bulletSpeed = Math.round(effectiveBulletSpeed);
    target.rangeMeters = Math.round(effectiveRange);
    target.damageDropoffStartMeters = Math.round(effectiveRange * 0.6);
    target.damageDropoffEndMeters = Math.round(effectiveRange * 1.3);
    target.bulletGravityMultiplier = parseFloat(bulletGravityMult.toFixed(2));

    target.isSuppressed = isSuppressed;
    target.acousticSignatureRadiusMeters = Math.round(effectiveAcousticRadius);
    target.muzzleFlashScale = effectiveMuzzleFlashScale;
    target.reticleType = optic.reticleType ?? 'iron';

    target.scoreDamage = scoreDamage;
    target.scoreRange = scoreRange;
    target.scoreFireRate = scoreFireRate;
    target.scoreAccuracy = scoreAccuracy;
    target.scoreMobility = scoreMobility;
    target.scoreRecoilControl = scoreRecoilControl;

    return target;
  }

  /**
   * Wylicza różnice (Delty) parametrów między konfiguracją bazową a zmodyfikowaną (Zero-GC)
   */
  public static calculateDeltas(
    baseStats: WeaponStats,
    effective: EffectiveWeaponStats,
    outDeltas?: GunsmithStatDeltas
  ): GunsmithStatDeltas {
    const d = outDeltas ?? this._reusableDeltas;

    // Przeliczenie bazowych ocen bez modyfikacji
    const baseEffective = this.calculateEffectiveStats(baseStats, {
      sight: 'ironsight',
      barrel: 'standard',
      magazine: 'standard',
      grip: 'none',
      stock: 'tactical',
      camo: 'military_black',
    }, this._reusableStats);

    const baseScoreDamage = baseEffective.scoreDamage;
    const baseScoreRange = baseEffective.scoreRange;
    const baseScoreFireRate = baseEffective.scoreFireRate;
    const baseScoreAccuracy = baseEffective.scoreAccuracy;
    const baseScoreMobility = baseEffective.scoreMobility;
    const baseScoreRecoil = baseEffective.scoreRecoilControl;

    d.damageDelta = effective.scoreDamage - baseScoreDamage;
    d.rangeDelta = effective.scoreRange - baseScoreRange;
    d.fireRateDelta = effective.scoreFireRate - baseScoreFireRate;
    d.accuracyDelta = effective.scoreAccuracy - baseScoreAccuracy;
    d.mobilityDelta = effective.scoreMobility - baseScoreMobility;
    d.recoilControlDelta = effective.scoreRecoilControl - baseScoreRecoil;

    d.weightDeltaKg = parseFloat((effective.totalWeightKg - effective.baseWeightKg).toFixed(2));
    d.adsTimeDeltaSec = parseFloat((effective.adsTransitionTimeSec - (this.BASE_ADS_TIMES[baseStats.id] ?? 0.22)).toFixed(3));
    d.reloadTimeDeltaSec = parseFloat((effective.reloadTimeSec - baseStats.reloadTimeSec).toFixed(2));
    d.magCapacityDelta = effective.magSize - baseStats.magSize;

    return d;
  }

  /**
   * Skaluje impuls odrzutu na podstawie mnożników akcesoriów (Zero-GC)
   */
  public static applyRecoilMultipliers(
    baseRecoil: THREE.Vector2,
    effectiveStats: EffectiveWeaponStats,
    outRecoil?: THREE.Vector2
  ): THREE.Vector2 {
    const res = outRecoil ?? this._tempRecoil;
    res.x = baseRecoil.x * effectiveStats.recoilHorizontalMultiplier;
    res.y = baseRecoil.y * effectiveStats.recoilVerticalMultiplier;
    return res;
  }

  /**
   * Oblicza krok balistyczny pocisku z uwzględnieniem opadu grawitacyjnego (Zero-GC)
   */
  public static stepBulletTrajectory(
    dt: number,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    effectiveStats: EffectiveWeaponStats,
    baseGravity: number = 9.81
  ): void {
    // Skalowana grawitacja dla pocisków o niższej prędkości początkowej (np. amunicja poddźwiękowa / tłumik)
    vel.y -= baseGravity * effectiveStats.bulletGravityMultiplier * dt;
    pos.addScaledVector(vel, dt);
  }

  /**
   * Zwraca parametry audio dla integracji z WeaponAudioIntegration
   */
  public static getAcousticProfile(effectiveStats: EffectiveWeaponStats): {
    isSuppressed: boolean;
    acousticRadius: number;
    volumeMultiplier: number;
    lowPassCutoffHz: number;
  } {
    if (effectiveStats.isSuppressed) {
      return {
        isSuppressed: true,
        acousticRadius: effectiveStats.acousticSignatureRadiusMeters, // 18m
        volumeMultiplier: 0.35,
        lowPassCutoffHz: 1200, // Ciemne, głuche stłumienie wystrzału
      };
    }
    return {
      isSuppressed: false,
      acousticRadius: effectiveStats.acousticSignatureRadiusMeters, // 85m
      volumeMultiplier: 1.0,
      lowPassCutoffHz: 22000, // Pełne pasmo huku wystrzału
    };
  }
}
