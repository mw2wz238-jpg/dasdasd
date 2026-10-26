import { WeaponAttachmentConfig } from '../../types/game';

/**
 * ============================================================================
 * PROJEKT VANGUARD — ZAAWANSOWANY SYSTEM MODYFIKACJI BRONI (GUNSMITH)
 * ============================================================================
 * Klasa: WeaponAttachmentSystem
 * Architektura: 100% Zero-GC, pre-alokowane słowniki i struktury modyfikatorów.
 * 
 * Odpowiedzialność:
 * 1. Zarządzanie bazą akcesoriów i slotów montażowych:
 *    - Optic / Sight: Iron Sights, Reflex Sight (Red Dot 1x), Holographic, ACOG (4x), Sniper Scope (8x Mil-Dot).
 *    - Muzzle: Tłumik płomienia A2, Tłumik dźwięku (Suppressor), Kompensator, Hamulec wylotowy.
 *    - Magazine: Standard (30), Magazynek Powiększony (Extended 45), Szybki Magazynek (Fast Mag), Bębnowy (Drum 60).
 *    - Underbarrel: Pionowy chwyt taktyczny (Vertical), Chwyt kątowy (Angled AFG), Dwójnóg (Bipod), Brak.
 *    - Stock: Kolba taktyczna (Tactical), Kolba ciężka (Heavy PRS), Kolba szkieletowa (Lightweight).
 *    - Camo: Wojskowy czarny mat, Piaskowy kamuflaż pustynny, Arktyczny, Złoty elitarny karbon, Cyfrowy MARPAT.
 * 2. Zgodność platform uzbrojenia (Compatibility Filtering) na podstawie kategorii broni.
 * 3. Przeliczanie wag, cech taktycznych (Zalety / Wady) oraz konfiguracji ADS / FOV.
 * ============================================================================
 */

export type AttachmentSlotKey = 'sight' | 'barrel' | 'magazine' | 'grip' | 'stock' | 'camo';

export type WeaponCategory = 'rifle' | 'sniper' | 'smg' | 'shotgun' | 'pistol';

/**
 * Numeryczne modyfikatory wpływające na zachowanie broni w pętli gry
 */
export interface AttachmentStatModifiers {
  // ADS i Ergonomia
  adsSpeedMultiplier: number;          // < 1.0 = wolniej (np. 0.85), > 1.0 = szybciej (np. 1.18)
  adsFov: number;                      // Kąt FOV kamery przy celowaniu (np. 14, 28, 52, 58, 65)
  weaponSwayMultiplier: number;        // < 1.0 = mniejsze kołysanie (np. 0.70)
  moveSpeedMultiplier: number;         // Wpływ na prędkość poruszania się operatora
  
  // Odrzut i stabilność
  recoilVerticalMultiplier: number;    // < 1.0 = mniejszy odrzut pionowy
  recoilHorizontalMultiplier: number;  // < 1.0 = mniejszy odrzut boczny / "snake recoil"
  spreadAdsMultiplier: number;         // Precyzja strzału z celownika
  spreadHipMultiplier: number;         // Celność strzału z biodra
  
  // Balistyka i prędkość wylotowa
  muzzleVelocityMultiplier: number;    // np. 0.95 dla tłumika (-5%), 1.08 dla długiej lufy
  effectiveRangeMultiplier: number;    // Skalowanie dystansu spadku obrażeń
  damageMultiplier: number;            // Mnożnik obrażeń bazowych
  
  // Pojemność i obsługa magazynka
  magCapacityDelta: number;            // Zmiana pojemności (np. +15 dla extended, -5 dla fast_mag)
  reloadTimeMultiplier: number;        // < 1.0 = szybsze przeładowanie (np. 0.75 dla fast mag)
  
  // Sygnatury taktyczne
  isSuppressed: boolean;               // Wyciszenie audio i eliminacja rozbłysku
  acousticRadiusMultiplier: number;    // Skala promienia wykrycia przez wrogie boty (0.2 dla suppressora)
  muzzleFlashMultiplier: number;       // Skala światła wylotowego
}

/**
 * Pełna definicja akcesorium taktycznego
 */
export interface AttachmentDefinition {
  id: string;
  slot: AttachmentSlotKey;
  name: string;
  militaryDesignation: string;
  weightKg: number;
  description: string;
  pros: string[];
  cons: string[];
  modifiers: AttachmentStatModifiers;
  compatibleCategories: WeaponCategory[];
  reticleType?: 'iron' | 'red_dot' | 'holo_ring' | 'acog_bdc' | 'sniper_mildot';
}

export class WeaponAttachmentSystem {
  // Słowniki akcesoriów zorganizowane według slotów
  private static readonly ATTACHMENTS: Record<AttachmentSlotKey, Record<string, AttachmentDefinition>> = {
    sight: {
      ironsight: {
        id: 'ironsight',
        slot: 'sight',
        name: 'Przyrządy Mechaniczne A2',
        militaryDesignation: 'A2 Front Post & Dual Aperture Rear',
        weightKg: 0.0,
        description: 'Standardowe stalowe przyrządy celownicze. Maksymalna szybkość podniesienia broni bez żadnego dodatkowego obciążenia.',
        pros: ['Brak dodatkowej masy (0 kg)', 'Błyskawiczne przejście w ADS', 'Brak zakłóceń szklanych odbić'],
        cons: ['Standardowe powiększenie 1.0x', 'Ograniczona widoczność celów na dystansie powyżej 50 m'],
        modifiers: {
          adsSpeedMultiplier: 1.05,
          adsFov: 65,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
        reticleType: 'iron',
      },
      reddot: {
        id: 'reddot',
        slot: 'sight',
        name: 'Celownik Kolimatorowy Reflex',
        militaryDesignation: 'Aimpoint Micro T-1 Reflex 2 MOA',
        weightKg: 0.12,
        description: 'Lekki kolimator tubusowy z czerwoną kropką 2 MOA o wysokiej jasności. Zaprojektowany do błyskawicznego namierzania celów w zwarciu CQB.',
        pros: ['Czyste pole widzenia bez przysłaniania peryferiów', 'Precyzyjny punkt celowniczy 2 MOA', 'Płynna kropka w ruchu'],
        cons: ['Brak powiększenia dystansowego', 'Wymaga wolnej szyny Picatinny'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 58,
          weaponSwayMultiplier: 0.98,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 0.95,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'smg', 'shotgun', 'pistol'],
        reticleType: 'red_dot',
      },
      holographic: {
        id: 'holographic',
        slot: 'sight',
        name: 'Celownik Holograficzny EOTech',
        militaryDesignation: 'EOTech EXPS3-0 Holographic Weapon Sight',
        weightKg: 0.25,
        description: 'Wojskowy celownik holograficzny z pierścieniem 68 MOA i centralnym punktem 1 MOA. Zapewnia doskonałą kontrolę rozrzutu w ogniu ciągłym.',
        pros: ['Pierścień 68 MOA ułatwia kontrolowanie serii', 'Brak błędu paralaksy', 'Podwyższona precyzja przy ogniu ciągłym'],
        cons: ['Lekki spadek prędkości wejścia w ADS (-4%)', 'Większy obrys w widoku kamery'],
        modifiers: {
          adsSpeedMultiplier: 0.96,
          adsFov: 52,
          weaponSwayMultiplier: 0.95,
          moveSpeedMultiplier: 0.99,
          recoilVerticalMultiplier: 0.98,
          recoilHorizontalMultiplier: 0.98,
          spreadAdsMultiplier: 0.92,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'smg', 'shotgun'],
        reticleType: 'holo_ring',
      },
      acog_scope: {
        id: 'acog_scope',
        slot: 'sight',
        name: 'Celownik Optyczny ACOG 4x',
        militaryDesignation: 'Trijicon ACOG TA31RCO 4x32 Dual-Illuminated',
        weightKg: 0.42,
        description: 'Powiększenie 4x z siatką balistyczną BDC (Bullet Drop Compensator) i światłowodowym podświetleniem. Niezastąpiony w walkach średniodystansowych.',
        pros: ['Powiększenie 4.0x do walki na średnim dystansie', 'Kompensacja opadu pocisku BDC', 'Wysoka precyzja strzału'],
        cons: ['Wyraźnie wolniejsze wejście w ADS (-14%)', 'Większe kołysanie w ruchu', 'Wąskie pole widzenia w zwarciu'],
        modifiers: {
          adsSpeedMultiplier: 0.86,
          adsFov: 28,
          weaponSwayMultiplier: 1.25,
          moveSpeedMultiplier: 0.96,
          recoilVerticalMultiplier: 1.05,
          recoilHorizontalMultiplier: 1.02,
          spreadAdsMultiplier: 0.78,
          spreadHipMultiplier: 1.1,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.15,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper'],
        reticleType: 'acog_bdc',
      },
      sniper_scope: {
        id: 'sniper_scope',
        slot: 'sight',
        name: 'Luneta Snajperska 8x Mil-Dot',
        militaryDesignation: 'Schmidt & Bender 8x56 PM II Tactical',
        weightKg: 0.78,
        description: 'Wysokiej klasy luneta precyzyjna 8x z wytrawioną siatką Mil-Dot i wieżyczkami regulacji paralaksy. Ekstremalny zasięg i precyzja głowy.',
        pros: ['Maksymalne powiększenie 8.0x', 'Siatka Mil-Dot z podziałką odległości', 'Maksymalny zasięg efektywny (+25%)'],
        cons: ['Drastyczny spadek prędkości ADS (-24%)', 'Znaczna masa optyki', 'Silny efekt tunelu w CQB'],
        modifiers: {
          adsSpeedMultiplier: 0.76,
          adsFov: 14,
          weaponSwayMultiplier: 1.45,
          moveSpeedMultiplier: 0.92,
          recoilVerticalMultiplier: 1.12,
          recoilHorizontalMultiplier: 1.05,
          spreadAdsMultiplier: 0.65,
          spreadHipMultiplier: 1.35,
          muzzleVelocityMultiplier: 1.02,
          effectiveRangeMultiplier: 1.25,
          damageMultiplier: 1.05,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['sniper', 'rifle'],
        reticleType: 'sniper_mildot',
      },
    },

    barrel: {
      standard: {
        id: 'standard',
        slot: 'barrel',
        name: 'Standardowy Tłumik Płomienia A2',
        militaryDesignation: 'Mil-Spec A2 Birdcage Flash Suppressor',
        weightKg: 0.08,
        description: 'Fabryczne urządzenie wylotowe. Redukuje oślepiający błysk wystrzału w nocy bez wpływu na balistykę i prędkość wylotową.',
        pros: ['Brak kar do prędkości pocisku', 'Minimalna masa', 'Optymalne zbalansowanie lufy'],
        cons: ['Pełna głośność wystrzału (85 m promień)', 'Brak dodatkowej redukcji odrzutu'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
      },
      suppressed: {
        id: 'suppressed',
        slot: 'barrel',
        name: 'Tłumik Dźwięku AAC M4-2000',
        militaryDesignation: 'Advanced Armament M4-2000 Quick-Detach Silencer',
        weightKg: 0.48,
        description: 'Wielokomorowy tłumik dźwięku ze stali Inconel. Drastycznie wycisza sygnaturę akustyczną, redukuje odrzut pionowy o 12% i likwiduje płomień wylotowy.',
        pros: [
          'Wyciszenie akustyczne: promień wykrycia spada z 85m do 18m',
          'Spadek odrzutu pionowego o 12%',
          'Całkowita eliminacja błysku lufy (Muzzle Flash)'
        ],
        cons: [
          'Spadek prędkości początkowej pocisku o 5%',
          'Nieznaczny spadek czasu wejścia w ADS (-6%) z powodu dociążenia lufy'
        ],
        modifiers: {
          adsSpeedMultiplier: 0.94,
          adsFov: 0,
          weaponSwayMultiplier: 1.08,
          moveSpeedMultiplier: 0.98,
          recoilVerticalMultiplier: 0.88,
          recoilHorizontalMultiplier: 0.96,
          spreadAdsMultiplier: 0.96,
          spreadHipMultiplier: 1.04,
          muzzleVelocityMultiplier: 0.95, // -5% prędkości początkowej zgodnie z dyrektywą
          effectiveRangeMultiplier: 0.96,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: true,
          acousticRadiusMultiplier: 0.21,
          muzzleFlashMultiplier: 0.05,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'pistol'],
      },
      compensator: {
        id: 'compensator',
        slot: 'barrel',
        name: 'Kompensator Podrzutu Lantac Dragon',
        militaryDesignation: 'Lantac Dragon Ultra-High Efficiency Compensator',
        weightKg: 0.16,
        description: 'Zaawansowany kompensator z pionowymi kanałami gazowymi. Redukuje podrzut pionowy lufy aż o 18% kosztem zwiększonego błysku.',
        pros: ['Redukcja odrzutu pionowego o 18%', 'Redukcja odrzutu poziomego o 8%', 'Lepsza kontrola ognia ciągłego'],
        cons: ['Zwiększony rozbłysk wylotowy (+25%)', 'Głośniejsza sygnatura dźwiękowa'],
        modifiers: {
          adsSpeedMultiplier: 0.98,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 0.99,
          recoilVerticalMultiplier: 0.82,
          recoilHorizontalMultiplier: 0.92,
          spreadAdsMultiplier: 0.94,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.02,
          effectiveRangeMultiplier: 1.02,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.15,
          muzzleFlashMultiplier: 1.25,
        },
        compatibleCategories: ['rifle', 'smg', 'shotgun', 'pistol'],
      },
      heavy_long: {
        id: 'heavy_long',
        slot: 'barrel',
        name: 'Hamulec Wylotowy SureFire PROCOMP',
        militaryDesignation: 'SureFire PROCOMP 556 Muzzle Brake',
        weightKg: 0.22,
        description: 'Dwuportowy hamulec wylotowy eliminujący boczne odchylenie lufy (horizontal recoil). Maksymalizuje stabilność osiową.',
        pros: ['Redukcja odrzutu bocznego o 22%', 'Redukcja odrzutu pionowego o 10%', 'Szybsza stabilizacja przy strzałach pojedynczych'],
        cons: ['Brak wyciszenia', 'Nieznacznie wolniejszy ADS (-4%)'],
        modifiers: {
          adsSpeedMultiplier: 0.96,
          adsFov: 0,
          weaponSwayMultiplier: 1.02,
          moveSpeedMultiplier: 0.99,
          recoilVerticalMultiplier: 0.90,
          recoilHorizontalMultiplier: 0.78,
          spreadAdsMultiplier: 0.92,
          spreadHipMultiplier: 1.02,
          muzzleVelocityMultiplier: 1.04,
          effectiveRangeMultiplier: 1.06,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.1,
          muzzleFlashMultiplier: 1.15,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg'],
      },
    },

    magazine: {
      standard: {
        id: 'standard',
        slot: 'magazine',
        name: 'Standardowy Magazynek STANAG',
        militaryDesignation: 'STANAG 30-Round 5.56 NATO Aluminum',
        weightKg: 0.45,
        description: 'Standardowa pojemność fabryczna (30 naboi). Optymalny czas przeładowania i wyważenie masy broni.',
        pros: ['Fabryczny czas przeładowania (100%)', 'Idealne wyważenie broni', 'Brak kar do mobilności'],
        cons: ['Ograniczona pojemność przy starciach z wieloma celami'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
      },
      extended: {
        id: 'extended',
        slot: 'magazine',
        name: 'Powiększony Magazynek Magpul 45',
        militaryDesignation: 'Magpul PMAG 40/45 AR/M4 GEN M3',
        weightKg: 0.78,
        description: 'Powiększony magazynek polimerowy o pojemności 45 naboi (+15 naboi). Pozwala prowadzić dłuższy ogień zaporowy.',
        pros: ['+15 naboi w magazynku (45 naboi łącznie)', 'Mniej przerw na przeładowanie w intensywnym starciu'],
        cons: ['Wydłużony czas przeładowania o 15%', 'Wyższa masa (+0.33 kg), wolniejszy ADS (-7%)'],
        modifiers: {
          adsSpeedMultiplier: 0.93,
          adsFov: 0,
          weaponSwayMultiplier: 1.1,
          moveSpeedMultiplier: 0.97,
          recoilVerticalMultiplier: 0.97, // Dodatkowa masa nieznacznie tłumi odrzut
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.06,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 15,
          reloadTimeMultiplier: 1.15, // +15% czasu przeładowania zgodnie z dyrektywą
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'smg', 'pistol'],
      },
      fast_mag: {
        id: 'fast_mag',
        slot: 'magazine',
        name: 'Szybki Magazynek Taktyczny Magpul',
        militaryDesignation: 'PMAG Ranger-Plate Quick-Pull 25-Round',
        weightKg: 0.36,
        description: 'Lekki magazynek z gumowym uchwytem Ranger Plate. Zmniejsza czas przeładowania aż o 25% przy nieco mniejszej pojemności.',
        pros: [
          'Krótszy czas przeładowania o 25%',
          'Szybsze dobycie broni i wejście w ADS (+6%)',
          'Niższa waga broni'
        ],
        cons: ['Zmniejszona pojemność magazynka (-5 naboi)'],
        modifiers: {
          adsSpeedMultiplier: 1.06,
          adsFov: 0,
          weaponSwayMultiplier: 0.94,
          moveSpeedMultiplier: 1.02,
          recoilVerticalMultiplier: 1.02,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 0.98,
          spreadHipMultiplier: 0.96,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: -5,
          reloadTimeMultiplier: 0.75, // -25% czasu przeładowania zgodnie z dyrektywą
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'smg', 'pistol'],
      },
      drum: {
        id: 'drum',
        slot: 'magazine',
        name: 'Magazynek Bębnowy Beta C-Mag 60',
        militaryDesignation: 'Beta C-Mag Dual-Drum 60-Round System',
        weightKg: 1.35,
        description: 'Podwójny bęben o pojemności 60 naboi. Maksymalny ogień ciągły do obrony stref detonacji C4 kosztem mobilności.',
        pros: ['+30 naboi w magazynku (60 naboi)', 'Drastyczna przewaga ogniowa w starciach zespołowych'],
        cons: ['Czas przeładowania dłuższy o 35%', 'Wyraźnie wolniejszy ruch (-8%) i wejście w ADS (-16%)'],
        modifiers: {
          adsSpeedMultiplier: 0.84,
          adsFov: 0,
          weaponSwayMultiplier: 1.3,
          moveSpeedMultiplier: 0.92,
          recoilVerticalMultiplier: 0.92,
          recoilHorizontalMultiplier: 1.05,
          spreadAdsMultiplier: 1.05,
          spreadHipMultiplier: 1.2,
          muzzleVelocityMultiplier: 0.99,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 30,
          reloadTimeMultiplier: 1.35,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'smg'],
      },
    },

    grip: {
      none: {
        id: 'none',
        slot: 'grip',
        name: 'Brak Chwytu Podlufowego',
        militaryDesignation: 'Naked Picatinny Lower Rail',
        weightKg: 0.0,
        description: 'Fabryczne łoże broni bez żadnych dodatkowych chwytów. Brak kar do wagi.',
        pros: ['Zero dodatkowej wagi', 'Naturalny chwyt karabinu'],
        cons: ['Brak wspomagania kontroli odrzutu'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
      },
      vertical: {
        id: 'vertical',
        slot: 'grip',
        name: 'Pionowy Chwyt Taktyczny KAC',
        militaryDesignation: 'Knights Armament Vertical Foregrip (VFG)',
        weightKg: 0.15,
        description: 'Klasyczny pionowy chwyt z polimeru zbrojonego. Tłumi poziome wężykowanie broni ("snake recoil") o 25% i redukuje odrzut pionowy o 10%.',
        pros: [
          'Redukcja odrzutu poziomego ("snake recoil") o 25%',
          'Redukcja odrzutu pionowego o 10%',
          'Wysoka stabilność przy prowadzeniu ognia ciągłego'
        ],
        cons: ['Lekki wzrost czasu przejścia w ADS (+5%)'],
        modifiers: {
          adsSpeedMultiplier: 0.95,
          adsFov: 0,
          weaponSwayMultiplier: 0.88,
          moveSpeedMultiplier: 0.99,
          recoilVerticalMultiplier: 0.90,
          recoilHorizontalMultiplier: 0.75, // -25% odrzutu poziomego zgodnie z dyrektywą
          spreadAdsMultiplier: 0.92,
          spreadHipMultiplier: 0.95,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'smg', 'shotgun'],
      },
      angled: {
        id: 'angled',
        slot: 'grip',
        name: 'Chwyt Kątowy Magpul AFG',
        militaryDesignation: 'Magpul AFG-2 Angled Foregrip Ergonomic',
        weightKg: 0.11,
        description: 'Ergonomiczny chwyt kątowy wymuszający chwyt typu "C-Clamp". Drastycznie przyspiesza wejście w tryb celowania ADS (+18%).',
        pros: [
          'Szybsze wejście w tryb ADS o 18%',
          'Płynniejsza bezwładność widoku przy dynamicznych zwrotach',
          'Lepsza mobilność podczas biegu'
        ],
        cons: ['Mniejsza redukcja odrzutu pionowego niż w chwycie pionowym'],
        modifiers: {
          adsSpeedMultiplier: 1.18, // +18% szybszy ADS zgodnie z dyrektywą
          adsFov: 0,
          weaponSwayMultiplier: 0.92,
          moveSpeedMultiplier: 1.02,
          recoilVerticalMultiplier: 0.96,
          recoilHorizontalMultiplier: 0.92,
          spreadAdsMultiplier: 0.94,
          spreadHipMultiplier: 0.92,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'smg', 'shotgun'],
      },
      bipod: {
        id: 'bipod',
        slot: 'grip',
        name: 'Dwójnóg Snajperski Harris',
        militaryDesignation: 'Harris Ultralight Series S Bipod',
        weightKg: 0.38,
        description: 'Rozkładany dwójnóg sprężynowy. W pozycji kucznej redukuje odrzut broni o ponad 45%, kosztem dodatkowej wagi z przodu broni.',
        pros: ['Redukcja odrzutu w pozycji kucznej o 45%', 'Perfekcyjne ustabilizowanie siatki dalmierczej'],
        cons: ['Wolniejsze wejście w ADS (-12%)', 'Zwiększona masa lufy (+0.38 kg)'],
        modifiers: {
          adsSpeedMultiplier: 0.88,
          adsFov: 0,
          weaponSwayMultiplier: 0.65,
          moveSpeedMultiplier: 0.95,
          recoilVerticalMultiplier: 0.80,
          recoilHorizontalMultiplier: 0.80,
          spreadAdsMultiplier: 0.80,
          spreadHipMultiplier: 1.15,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.05,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['sniper', 'rifle'],
      },
    },

    stock: {
      tactical: {
        id: 'tactical',
        slot: 'stock',
        name: 'Kolba Taktyczna Magpul CTR',
        militaryDesignation: 'Magpul CTR Carbine Mil-Spec Stock',
        weightKg: 0.26,
        description: 'Zbalansowana, regulowana kolba polimerowa z gumową stopką amortyzującą. Uniwersalne zastosowanie bojowe.',
        pros: ['Świetny balans między masą a stabilnością', '+10% do prędkości poruszania się w ADS'],
        cons: ['Brak skrajnych bonusów specjalistycznych'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 0.95,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 0.97,
          recoilHorizontalMultiplier: 0.97,
          spreadAdsMultiplier: 0.98,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun'],
      },
      heavy: {
        id: 'heavy',
        slot: 'stock',
        name: 'Precyzyjna Kolba Wyborowa PRS',
        militaryDesignation: 'Magpul PRS GEN3 Precision Adjustable Stock',
        weightKg: 0.75,
        description: 'Ciężka kolba wyczynowa z regulowaną baką policzkową. Drastycznie tłumi kołysanie celownika (Weapon Sway) o 35%.',
        pros: [
          'Redukcja kołysania lufy (Weapon Sway) o 35%',
          'Poprawa stabilności przy strzałach precyzyjnych',
          'Tłumienie wstrząsów odrzutu'
        ],
        cons: ['Wolniejszy czas ADS (-10%)', 'Zmniejszona prędkość biegu operatora (-4%)'],
        modifiers: {
          adsSpeedMultiplier: 0.90,
          adsFov: 0,
          weaponSwayMultiplier: 0.65, // -35% kołysania
          moveSpeedMultiplier: 0.96,
          recoilVerticalMultiplier: 0.88,
          recoilHorizontalMultiplier: 0.90,
          spreadAdsMultiplier: 0.85,
          spreadHipMultiplier: 1.1,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.02,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper'],
      },
      lightweight: {
        id: 'lightweight',
        slot: 'stock',
        name: 'Szkieletowa Kolba Ultralekka',
        militaryDesignation: 'Battlelink Minimalist Lightweight Stock',
        weightKg: 0.16,
        description: 'Ażurowa konstrukcja szkieletowa z aluminium lotniczego. Pozwala na błyskawiczne manewrowanie bronią w korytarzach.',
        pros: ['+15% do prędkości wejścia w ADS', '+5% do ogólnej mobilności'],
        cons: ['Zwiększony odrzut (+10%) z powodu braku amortyzacji masywnej kolby'],
        modifiers: {
          adsSpeedMultiplier: 1.15,
          adsFov: 0,
          weaponSwayMultiplier: 1.15,
          moveSpeedMultiplier: 1.05,
          recoilVerticalMultiplier: 1.10,
          recoilHorizontalMultiplier: 1.08,
          spreadAdsMultiplier: 1.02,
          spreadHipMultiplier: 0.94,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 0.98,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'smg', 'shotgun'],
      },
    },

    camo: {
      military_black: {
        id: 'military_black',
        slot: 'camo',
        name: 'Matowy Azotkowy Czarny',
        militaryDesignation: 'Mil-DTL-13924 Black Oxide Nitride',
        weightKg: 0.0,
        description: 'Standardowe wykończenie wojskowe ze stali azotowanej. Matowa, antyrefleksyjna powierzchnia.',
        pros: ['Fabryczny wygląd taktyczny', 'Brak odblasków słonecznych'],
        cons: ['Standardowe maskowanie'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
      },
      desert_tan: {
        id: 'desert_tan',
        slot: 'camo',
        name: 'Piaskowy Cerakote FDE',
        militaryDesignation: 'Flat Dark Earth Ceramic Cerakote',
        weightKg: 0.0,
        description: 'Odporna na zarysowania ceramiczna powłoka w odcieniu pustynnym Flat Dark Earth.',
        pros: ['Doskonały kamuflaż w strefie przemysłowej i magazynach', 'Odporność termiczna'],
        cons: ['Wyróżnia się w środowisku zimowym'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
      },
      arctic_snow: {
        id: 'arctic_snow',
        slot: 'camo',
        name: 'Zimowy Kamuflaż Arktyczny',
        militaryDesignation: 'Alpine Snow Kryptek Camouflage',
        weightKg: 0.0,
        description: 'Biało-szary kamuflaż mikrowzorowy zoptymalizowany pod operacje zimowe (Winter Village).',
        pros: ['Kamuflaż śnieżny', 'Estetyka operatorów sił specjalnych'],
        cons: ['Wysoki kontrast na nocnych dokach'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
      },
      carbon_gold: {
        id: 'carbon_gold',
        slot: 'camo',
        name: 'Karbon & Złoto Elitarne',
        militaryDesignation: 'Woven Carbon Fiber & 24K Gold Elite Accents',
        weightKg: 0.0,
        description: 'Ekskluzywne wykończenie z włókna węglowego i elementów galwanizowanych 24-karatowym złotem dla weteranów Vanguard.',
        pros: ['Status weterana dywizji', 'Wyjątkowy połysk w świetle reflektorów'],
        cons: ['Wyraźny błysk metaliczny w nocy'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
      },
      digital_camo: {
        id: 'digital_camo',
        slot: 'camo',
        name: 'Cyfrowy MARPAT Urban',
        militaryDesignation: 'Urban Digital Pixellated Disruptive Pattern',
        weightKg: 0.0,
        description: 'Cyfrowy kamuflaż pikselowy sił piechoty morskiej do działań w terenie zurbanizowanym i dokach morskich.',
        pros: ['Rozbija sylwetkę broni w cieniu kontenerów', 'Uniwersalna ochrona wizualna'],
        cons: ['Brak bonusów numerycznych'],
        modifiers: {
          adsSpeedMultiplier: 1.0,
          adsFov: 0,
          weaponSwayMultiplier: 1.0,
          moveSpeedMultiplier: 1.0,
          recoilVerticalMultiplier: 1.0,
          recoilHorizontalMultiplier: 1.0,
          spreadAdsMultiplier: 1.0,
          spreadHipMultiplier: 1.0,
          muzzleVelocityMultiplier: 1.0,
          effectiveRangeMultiplier: 1.0,
          damageMultiplier: 1.0,
          magCapacityDelta: 0,
          reloadTimeMultiplier: 1.0,
          isSuppressed: false,
          acousticRadiusMultiplier: 1.0,
          muzzleFlashMultiplier: 1.0,
        },
        compatibleCategories: ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'],
      },
    },
  };

  // Pre-alokowane tablice dla Zero-GC filtrowania
  private static readonly _filteredList: AttachmentDefinition[] = [];

  /**
   * Zwraca listę akcesoriów pasujących do danego slotu oraz kategorii broni (Zero-GC)
   */
  public static getAvailableAttachments(slot: AttachmentSlotKey, category: WeaponCategory): AttachmentDefinition[] {
    const slotDict = this.ATTACHMENTS[slot];
    if (!slotDict) return [];

    this._filteredList.length = 0;
    for (const key in slotDict) {
      const att = slotDict[key];
      if (att.compatibleCategories.includes(category)) {
        this._filteredList.push(att);
      }
    }
    return this._filteredList;
  }

  /**
   * Zwraca definicję akcesorium o danym ID (lub domyślne, jeśli nie znaleziono)
   */
  public static getAttachment(slot: AttachmentSlotKey, id: string): AttachmentDefinition {
    const slotDict = this.ATTACHMENTS[slot];
    if (slotDict && slotDict[id]) {
      return slotDict[id];
    }
    // Fallback na pierwszy element w slocie
    const firstKey = Object.keys(slotDict)[0];
    return slotDict[firstKey];
  }

  /**
   * Weryfikuje i oczyszcza konfigurację pod kątem kompatybilności z daną kategorią broni (Zero-GC)
   */
  public static validateAndSanitize(category: WeaponCategory, config: WeaponAttachmentConfig): WeaponAttachmentConfig {
    const result: WeaponAttachmentConfig = { ...config };

    // Optic
    const opticDef = this.ATTACHMENTS.sight[result.sight];
    if (!opticDef || !opticDef.compatibleCategories.includes(category)) {
      result.sight = 'ironsight';
    }

    // Barrel
    const barrelDef = this.ATTACHMENTS.barrel[result.barrel];
    if (!barrelDef || !barrelDef.compatibleCategories.includes(category)) {
      result.barrel = 'standard';
    }

    // Magazine
    const magDef = this.ATTACHMENTS.magazine[result.magazine];
    if (!magDef || !magDef.compatibleCategories.includes(category)) {
      result.magazine = 'standard';
    }

    // Grip
    const gripDef = this.ATTACHMENTS.grip[result.grip];
    if (!gripDef || !gripDef.compatibleCategories.includes(category)) {
      result.grip = 'none';
    }

    // Stock
    const stockDef = this.ATTACHMENTS.stock[result.stock];
    if (!stockDef || !stockDef.compatibleCategories.includes(category)) {
      result.stock = 'tactical';
    }

    return result;
  }

  /**
   * Zwraca listę wszystkich dostępnych slotów
   */
  public static getAllSlots(): AttachmentSlotKey[] {
    return ['sight', 'barrel', 'magazine', 'grip', 'stock', 'camo'];
  }
}
