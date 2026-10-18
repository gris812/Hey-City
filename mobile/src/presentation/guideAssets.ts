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

/** Native field comparison:
 * ArturSelection.png is the 900x900 face-visible portrait; Artur.png is a
 * 1135x1989 vertical full-length asset, unsuitable for center-cropped avatars.
 * Render full-length sources with 'contain' (not a face-cutting square cover).
 */
export const guideFullProfileImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/Artur.png'),
};
