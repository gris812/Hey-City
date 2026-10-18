import type { ImageSourcePropType } from 'react-native';
import type { GuidePreference } from '../localization/preferences';

/**
 * Canonical guide assets are surface-specific. "Consistent" means consistent
 * layout and identity, not forcing one crop onto every UI surface.
 */
export const guideAvatarImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/Dana.png'),
  // Field photos show Artur.png as headless when used in round avatar. Use portrait.
  arthur: require('../../assets/Guides/ArturSelection.png'),
};

export const guideSelectionImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/ArturSelection.png'),
};

/** Arthur full profile is an explicitly unresolved canonical asset dependency.
 * The current portrait below is a temporary fallback, not an approved full-body
 * source. Never substitute the headless Artur.png or generate a new character.
 */
export const guideFullProfileImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/ArturSelection.png'),
};
