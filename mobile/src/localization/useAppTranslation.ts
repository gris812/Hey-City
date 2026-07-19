import { translate, type TranslationKey } from './translations';
import { useAuth } from '../context/AuthContext';

export function useAppTranslation() {
  const { preferences } = useAuth();

  return {
    locale: preferences.appLanguage,
    t: (key: TranslationKey) => translate(preferences.appLanguage, key),
  };
}
