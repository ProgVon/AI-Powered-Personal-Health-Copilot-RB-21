import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import hi from "./hi.json";
import te from "./te.json";

export const LANGS = { en: "English", hi: "हिन्दी", te: "తెలుగు" } as const;
export type Lang = keyof typeof LANGS;

const saved = (() => { try { return localStorage.getItem("lang"); } catch { return null; } })();
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, te: { translation: te } },
  lng: saved && saved in LANGS ? saved : "en", fallbackLng: "en", interpolation: { escapeValue: false },
});
export default i18n;
