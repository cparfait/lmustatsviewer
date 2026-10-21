import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import fr from "./fr";
import en from "./en";
import de from "./de";
import es from "./es";
import it from "./it";
import lab from "./lab";

/**
 * Fonction de traduction (typage léger pour les helpers/sous-composants qui
 * reçoivent `t` en prop). Le `t` de react-i18next y est assignable.
 */
export type Tr = (key: string, opts?: Record<string, unknown>) => string;

// i18next v26: init() is always async even with inline resources.
// We export the promise so main.tsx can defer rendering until translations are ready.
export const i18nReady = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: { ...fr, lab: lab.fr } },
      en: { translation: { ...en, lab: lab.en } },
      de: { translation: { ...de, lab: lab.de } },
      es: { translation: { ...es, lab: lab.es } },
      it: { translation: { ...it, lab: lab.it } },
    },
    // Anglais par défaut : la langue du système est détectée en premier (un
    // Windows français ouvre l'app en français), mais toute langue hors des
    // cinq supportées retombe sur l'anglais — pas sur le français, qui
    // n'aurait aucun sens pour le public international.
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

export default i18n;
