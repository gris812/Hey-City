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

/** Canonical guide surfaces:
 * Compact Arthur portrait: ArturSelection.png (900x900, intact face).
 * Approved Arthur v3.0 full profile: ArthurFullProfile.png (1122x1402).
 * The full-profile image must render with contain on Settings and Explore.
 * Keep legacy Artur.png in repository history; do not map it to live surfaces.
 */
export const guideFullProfileImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/ArthurFullProfile.png'),
};
