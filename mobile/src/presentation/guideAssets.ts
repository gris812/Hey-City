import type { ImageSourcePropType } from 'react-native';
import type { GuidePreference } from '../localization/preferences';

/**
 * Canonical guide assets are surface-specific. "Consistent" means consistent
 * layout and identity, not forcing one crop onto every UI surface.
 */
export const guideAvatarImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/Dana.png'),
  arthur: require('../../assets/Guides/Artur.png'),
};

export const guideSelectionImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/ArturSelection.png'),
};

export const guideFullProfileImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/ArturSelection.png'),
};
