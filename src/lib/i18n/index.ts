import { createContext, useContext } from "react";

import { en, type Dictionary, type MessageKey } from "./en";
import { ru } from "./ru";
import { kk } from "./kk";
import { taskText } from "./tasks";

export type Locale = "en" | "ru" | "kk";

export const locales: Locale[] = ["en", "ru", "kk"];
export const localeShort: Record<Locale, string> = { en: "EN", ru: "RU", kk: "KZ" };
export const localeName: Record<Locale, string> = { en: "English", ru: "Русский", kk: "Қазақша" };
export const localeCookie = "pathwise-locale";

const dictionaries: Record<Locale, Dictionary> = { en, ru, kk };

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "ru" || value === "kk";
}

export type Translate = (key: MessageKey | string, params?: Record<string, string | number>) => string;

export function translator(locale: Locale): Translate {
  const dictionary = dictionaries[locale];
  return (key, params) => {
    const raw = dictionary[key] ?? en[key as MessageKey] ?? String(key);
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) => (params[name] === undefined ? match : String(params[name])));
  };
}

/** Localized roadmap task text, falling back to the stored English copy. */
export function localizedTask(locale: Locale, templateKey: string, field: "title" | "instructions" | "goal" | "deliverable", fallback: string) {
  return taskText(locale, templateKey, field) ?? fallback;
}

export type LocaleContextValue = { locale: Locale; t: Translate; setLocale: (locale: Locale) => void };

export const LocaleContext = createContext<LocaleContextValue>({ locale: "en", t: translator("en"), setLocale: () => undefined });

export function useLocale() {
  return useContext(LocaleContext);
}

/** Read the persisted locale without touching the DOM before hydration. */
export function readLocaleFromCookieString(cookie: string | undefined | null): Locale {
  if (!cookie) return "en";
  const match = cookie.match(new RegExp(`(?:^|; )${localeCookie}=([^;]+)`));
  const value = match?.[1];
  return isLocale(value) ? value : "en";
}

export function persistLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `${localeCookie}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
