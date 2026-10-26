import React from 'react';
import { WeaponStats, WeaponAttachmentConfig } from '../types/game';
import { GunsmithUI } from './GunsmithUI';
import { EffectiveWeaponStats } from '../engine/combat/GunsmithModifier';

interface GunsmithModalProps {
  currentWeapon: WeaponStats;
  currentAttachments: WeaponAttachmentConfig;
  onApplyAttachments: (attachments: WeaponAttachmentConfig, effectiveStats?: EffectiveWeaponStats) => void;
  onClose: () => void;
  onSelectWeapon?: (weaponId: string) => void;
  availableWeapons?: WeaponStats[];
}

/**
 * Komponent wrapper GunsmithModal zachowujący pełną kompatybilność wsteczną
 * i delegujący do produkcyjnego komponentu GunsmithUI (AAA Standard).
 */
export const GunsmithModal: React.FC<GunsmithModalProps> = ({
  currentWeapon,
  currentAttachments,
  onApplyAttachments,
  onClose,
  onSelectWeapon,
  availableWeapons,
}) => {
  return (
    <GunsmithUI
      currentWeapon={currentWeapon}
      currentAttachments={currentAttachments}
      onApplyAttachments={onApplyAttachments}
      onClose={onClose}
      onSelectWeapon={onSelectWeapon}
      availableWeapons={availableWeapons}
    />
  );
};
