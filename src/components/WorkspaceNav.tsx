import { Link } from "@tanstack/react-router";

import { LanguageSwitcher } from "./LanguageSwitcher";
import { brandName } from "../lib/admissions";
import { useLocale } from "../lib/i18n";

/** Root app sections. Nested elements never change nav state — only these ids do. */
export const rootSections = ["matches", "compare", "roadmap-preview", "profile"] as const;
export type RootSection = (typeof rootSections)[number];

const labelKey: Record<RootSection, string> = {
  matches: "nav.matches",
  compare: "nav.compare",
  "roadmap-preview": "nav.roadmap",
  profile: "nav.profile",
};

export function WorkspaceNav({
  active,
  onNavigate,
}: {
  /** Active root section, or "roadmap" when the dedicated planner page is open. */
  active: RootSection | "roadmap-page";
  onNavigate?: (id: RootSection) => void;
}) {
  const { t } = useLocale();
  const onPlannerPage = active === "roadmap-page";
  return (
    <nav className="workspace-nav compact">
      {onPlannerPage ? (
        <Link className="brand-text" to="/app">{brandName}</Link>
      ) : (
        <button className="brand-text" type="button" onClick={() => onNavigate?.("matches")}>{brandName}</button>
      )}
      <div className="nav-sections">
        {rootSections.map((id) =>
          id === "roadmap-preview" ? (
            onPlannerPage ? (
              <span key={id} className="active" aria-current="page">{t(labelKey[id])}</span>
            ) : (
              <button key={id} type="button" className={active === id ? "active" : ""} onClick={() => onNavigate?.(id)}>{t(labelKey[id])}</button>
            )
          ) : onPlannerPage ? (
            <Link key={id} to="/app" hash={id}>{t(labelKey[id])}</Link>
          ) : (
            <button key={id} type="button" className={active === id ? "active" : ""} onClick={() => onNavigate?.(id)}>{t(labelKey[id])}</button>
          ),
        )}
      </div>
      <LanguageSwitcher />
    </nav>
  );
}
