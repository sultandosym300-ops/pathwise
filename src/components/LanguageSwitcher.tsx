import { localeShort, locales, useLocale } from "../lib/i18n";

/** Compact EN / RU / KZ selector. The choice is persisted in a cookie. */
export function LanguageSwitcher({ tone = "default" }: { tone?: "default" | "light" }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className={`language-switcher ${tone}`} role="group" aria-label={t("nav.language")}>
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          className={option === locale ? "selected" : ""}
          aria-pressed={option === locale}
          onClick={() => setLocale(option)}
        >
          {localeShort[option]}
        </button>
      ))}
    </div>
  );
}
