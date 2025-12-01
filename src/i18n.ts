import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 1. DYNAMIC IMPORT: Use Vite's import.meta.glob to find all .json files in /locales
// { eager: true } means they are bundled immediately (like standard imports) 
// rather than lazy-loaded (which would require async/await).
const modules = import.meta.glob('./locales/*.json', { eager: true });

// 2. BUILD RESOURCES: Transform the glob result into the format i18next expects
const resources: Record<string, { translation: any }> = {};

export const SUPPORTED_LANGUAGES: string[] = [];

for (const path in modules) {
  // Extract language code from filename (e.g., "./locales/en.json" -> "en")
  const match = path.match(/\/([\w-]+)\.json$/);
  if (match) {
    const lang = match[1];
    resources[lang] = {
      // @ts-ignore - Vite glob types can be tricky, but we know this structure matches
      translation: modules[path].default || modules[path]
    };
    SUPPORTED_LANGUAGES.push(lang);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;