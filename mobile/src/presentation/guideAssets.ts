import type { ImageSourcePropType } from 'react-native';
import type { GuidePreference } from '../localization/preferences';

/**
 * Canonical mobile portrait pair. All guide-selection/profile surfaces use
 * this mapping so Dana and Arthur cannot drift into different asset formats.
 */
export const canonicalGuideImages: Record<GuidePreference, ImageSourcePropType> = {
  dana: require('../../assets/Guides/Dana.png'),
  arthur: require('../../assets/Guides/Artur.png'),
};
