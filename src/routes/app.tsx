import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { UniversityImage } from "../components/UniversityImage";
import { WorkspaceNav, rootSections, type RootSection } from "../components/WorkspaceNav";
import { KeyInsights, PriorityList, ProfileVerdict, StrategyBlock } from "../components/AnalysisViews";
import {
  alignmentFor,
  alignmentInputs,
  brandName,
  formatLocation,
  isProfileComplete,
  numericText,
  scaleBounds,
  testSummary,
  type AlignmentBreakdown,
  type Candidate,
  type Recommendation,
  type StudentProfile,
  type UniversityResearch,
} from "../lib/admissions";
import { compareProfileToUniversity, compareTakeaway, personalFit, type UniversityProfileComparison } from "../lib/analysis/comparison";
import { findRecommendations, researchUniversity, resolveUniversity } from "../lib/research";
import { currentWeek, formatMinutes, weekAreaMinutes, weekStats } from "../lib/roadmap";
import { emptyState, loadAppState, saveAppState, type AppState } from "../lib/state";
import { useLocale } from "../lib/i18n";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Pathwise workspace — what your target university values" },
      {
        name: "description",
        content: "See what your target university appears to value, how your own evidence compares, and the single change that would move you furthest.",
      },
      { property: "og:title", content: "Pathwise workspace" },
      { property: "og:description", content: "University-specific admissions analysis: documented priorities, your evidence, and what to do next." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

function Workspace() {
  const { t } = useLocale();
  const [state, setState] = useState<AppState>(() => emptyState());
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<RootSection>("matches");
  const [researchNote, setResearchNote] = useState("");
  const researchStarted = useRef(false);

  useEffect(() => {
    setState(loadAppState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveAppState(state);
  }, [state, loaded]);

  // Active nav is derived from root sections only; nested elements cannot change it.
  useEffect(() => {
    if (!loaded) return;
    const sections = rootSections
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting && rootSections.includes(entry.target.id as RootSection))
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id as RootSection);
      },
      { rootMargin: "-35% 0px -45% 0px", threshold: [0.15, 0.45, 0.75] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [loaded]);

  const profile = state.studentProfile;
  const dream = state.dreamUniversity;

  useEffect(() => {
    if (!loaded || !profile || !dream || researchStarted.current) return;
    if (state.recommendations.length >= 3) return;
    researchStarted.current = true;
    update((previous) => ({ ...previous, recommendationsStatus: "researching" }));
    void findRecommendations(profile, dream, setResearchNote, (partial) =>
      update((previous) => ({ ...previous, recommendations: mergeRecommendations(previous.recommendations, partial) })),
    )
      .then((results) =>
        update((previous) => ({
          ...previous,
          recommendations: mergeRecommendations(previous.recommendations, results),
          recommendationsStatus: "done",
          compareSelection: [previous.compareSelection[0] ?? dream.id, previous.compareSelection[1] ?? results[0]?.id ?? null],
        })),
      )
      .catch(() => update((previous) => ({ ...previous, recommendationsStatus: "done" })))
      .finally(() => setResearchNote(""));
  }, [loaded, profile, dream, state.recommendations.length]);

  function update(mutate: (previous: AppState) => AppState) {
    setState((previous) => mutate(previous));
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!loaded) return <main className="workspace-loading">{t("common.loading")}</main>;
  if (!profile || !dream) {
    return (
      <main className="workspace-empty">
        <div className="brand-pill">{brandName}</div>
        <h1>Start with a dream university.</h1>
        <p>The workspace unlocks after the short onboarding flow.</p>
        <a className="btn-primary" href="/">Start onboarding</a>
      </main>
    );
  }

  const universe = allUniversities(state);

  return (
    <main className="workspace-shell">
      <WorkspaceNav active={active} onNavigate={scrollTo} />
      <MatchesSection state={state} profile={profile} dream={dream} researchNote={researchNote} onUpdate={update} onNavigate={scrollTo} />
      <CompareSection state={state} profile={profile} dream={dream} universe={universe} onUpdate={update} onNavigate={scrollTo} />
      <RoadmapPreview state={state} profile={profile} dream={dream} onUpdate={update} onNavigate={scrollTo} />
      <ProfileSection
        state={state}
        profile={profile}
        onUpdate={update}
        onNavigate={scrollTo}
        onReanalyze={() => {
          researchStarted.current = false;
        }}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

type SectionProps = {
  state: AppState;
  profile: StudentProfile;
  dream: UniversityResearch;
  onUpdate: (mutate: (previous: AppState) => AppState) => void;
  onNavigate: (id: string) => void;
};

function mergeRecommendations(existing: Recommendation[], incoming: Recommendation[]) {
  const map = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()].slice(0, 3);
}

function allUniversities(state: AppState): UniversityResearch[] {
  const list: UniversityResearch[] = [];
  const seen = new Set<string>();
  const push = (university: UniversityResearch | null | undefined) => {
    if (university && !seen.has(university.id)) {
      seen.add(university.id);
      list.push(university);
    }
  };
  push(state.dreamUniversity);
  state.recommendations.forEach((item) => push(item.university));
  state.savedUniversities.forEach(push);
  return list;
}

/**
 * The planning score only. The explanation of the number lives once, in the
 * "Why this result?" section below — never in a second scoring panel.
 */
function AlignmentBadge({
  breakdown,
  size = "large",
  incomplete = false,
  missingLabel,
  onWhy,
}: {
  breakdown: AlignmentBreakdown;
  size?: "large" | "small";
  /** Too little measured data for a number to mean anything. */
  incomplete?: boolean;
  missingLabel?: string;
  onWhy?: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className={`alignment ${size}`}>
      <div className={`alignment-meter ${incomplete ? "incomplete" : ""}`}>
        <strong>{incomplete ? "—" : breakdown.overall}</strong>
        <span>{incomplete ? t("matches.alignmentIncomplete") : t("matches.alignment")}</span>
      </div>
      <p className="alignment-disclaimer">{t("matches.alignmentDisclaimer")}</p>
      {incomplete && missingLabel ? <p className="quiet-note">{t("matches.alignmentNeeds", { missing: missingLabel })}</p> : null}
      {onWhy ? (
        <button type="button" className="link-button why-link" onClick={onWhy}>
          {t("matches.whyLink")}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches — the main intelligence screen
// ---------------------------------------------------------------------------

function MatchesSection({ state, profile, dream, researchNote, onUpdate, onNavigate }: SectionProps & { researchNote: string }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const comparison = useMemo(() => compareProfileToUniversity(profile, dream, dream.country), [profile, dream]);
  const researching = state.recommendationsStatus === "researching";
  const recommendations = state.recommendations;
  const inputs = alignmentInputs(profile);
  const missingInputs = [
    inputs.missingAcademics ? t("profile.academics") : "",
    inputs.missingTesting ? t("onboarding.sat") : "",
    inputs.missingEnglish ? t("onboarding.englishTest") : "",
    inputs.missingEvidence ? t("profile.activities") : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section id="matches" className="workspace-section matches-section">
      <div className="matches-hero panel dark-panel">
        <div className="matches-hero-media">
          <UniversityImage university={dream} className="hero-media" />
        </div>
        <div className="matches-hero-copy">
          <p className="eyebrow">{t("matches.eyebrow")}</p>
          <h1>{dream.parentName ?? dream.name}</h1>
          <p>{[profile.major, formatLocation(dream)].filter(Boolean).join(" · ")}</p>
          {dream.parentName && dream.schoolName ? <p className="quiet-note light">{dream.schoolName}</p> : null}
          <div className="hero-links">
            {dream.officialWebsite ? (
              <a href={dream.officialWebsite} target="_blank" rel="noreferrer">{t("common.officialWebsite")}</a>
            ) : null}
          </div>
        </div>
        <AlignmentBadge
          breakdown={comparison.alignment}
          size="small"
          incomplete={!inputs.complete}
          missingLabel={missingInputs}
          onWhy={() => onNavigate("alignment-explanation")}
        />
      </div>

      <div className="section-chapter" id="alignment-explanation">
        <p className="eyebrow">{t("matches.whyEyebrow")}</p>
        <h2>{t("matches.whyTitle")}</h2>
        <p className="chapter-lead">{t("matches.whySubtitle")}</p>
      </div>
      <KeyInsights comparison={comparison} />

      <div className="section-chapter">
        <p className="eyebrow">{t("matches.valuesEyebrow")}</p>
        <h2>{t("matches.valuesHeading", { university: dream.parentName ?? dream.name })}</h2>
      </div>
      <PriorityList comparison={comparison} />

      <div className="section-subhead">
        <h2>{t("matches.compareTitle")}</h2>
      </div>
      <ProfileVerdict comparison={comparison} />

      <StrategyBlock comparison={comparison}>
        <div className="card-actions">
          {state.roadmapStatus === "active" ? (
            <Link className="btn-primary dominant" to="/roadmap">{t("matches.openRoadmap")}</Link>
          ) : (
            <button
              className="btn-primary dominant"
              type="button"
              onClick={() => {
                onUpdate((previous) => ({
                  ...previous,
                  roadmapStatus: isProfileComplete(profile) ? "collecting_availability" : "not_ready",
                }));
                void navigate({ to: "/roadmap" });
              }}
            >
              {t("matches.buildFromStrategy")}
            </button>
          )}
          <button className="link-button" type="button" onClick={() => onNavigate("roadmap-preview")}>{t("matches.seeStrategy")}</button>
        </div>
      </StrategyBlock>

      <div className="section-chapter">
        <p className="eyebrow">{t("nav.matches")}</p>
        <h2>{t("matches.othersTitle")}</h2>
        <p className="chapter-lead">{t("matches.othersSubtitle")}</p>
        {researching ? <p className="quiet-note">{`${researchNote || t("matches.researching")}`}</p> : null}
      </div>
      <div className="recommendation-grid">
        {[0, 1, 2].map((index) => {
          const rec = recommendations[index];
          if (rec) {
            return (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                profile={profile}
                dreamComparison={comparison}
                saved={state.savedUniversities.some((item) => item.id === rec.id)}
                onSave={() =>
                  onUpdate((previous) => ({
                    ...previous,
                    savedUniversities: previous.savedUniversities.some((item) => item.id === rec.id)
                      ? previous.savedUniversities.filter((item) => item.id !== rec.id)
                      : [...previous.savedUniversities, rec.university],
                  }))
                }
                onCompare={() => {
                  onUpdate((previous) => ({ ...previous, compareSelection: [dream.id, rec.id] }));
                  onNavigate("compare");
                }}
              />
            );
          }
          return researching ? (
            <SkeletonCard key={index} label={t("matches.researching")} />
          ) : (
            <article key={index} className="recommendation-card panel muted-slot">
              <h3>{t("matches.noOption")}</h3>
              <p>{t("matches.noOptionBody")}</p>
            </article>
          );
        })}
      </div>

      <UniversitySearch state={state} profile={profile} dream={dream} onUpdate={onUpdate} onNavigate={onNavigate} />
    </section>
  );
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <article className="recommendation-card panel skeleton" aria-busy="true">
      <div className="sk-line wide" />
      <div className="sk-line" />
      <div className="sk-block" />
      <div className="sk-line" />
      <p>{label}</p>
    </article>
  );
}

function RecommendationCard({
  recommendation,
  profile,
  dreamComparison,
  saved,
  onSave,
  onCompare,
}: {
  recommendation: Recommendation;
  profile: StudentProfile;
  dreamComparison: UniversityProfileComparison;
  saved: boolean;
  onSave: () => void;
  onCompare: () => void;
}) {
  const { t } = useLocale();
  const { university } = recommendation;
  const comparison = useMemo(
    () => compareProfileToUniversity(profile, university, dreamComparison.lens.universityId ? undefined : undefined),
    [profile, university, dreamComparison],
  );
  const fit = useMemo(() => personalFit(profile, comparison, dreamComparison), [profile, comparison, dreamComparison]);

  return (
    <article className="recommendation-card panel">
      <UniversityImage university={university} className="card-media" />
      <div className="card-head">
        <div>
          <h3>{university.parentName ?? university.name}</h3>
          <p>{[recommendation.program, formatLocation(university)].filter(Boolean).join(" · ")}</p>
          {university.parentName && university.schoolName ? <p className="quiet-note">{university.schoolName}</p> : null}
        </div>
        <AlignmentBadge breakdown={comparison.alignment} size="small" />
      </div>
      <p className="card-why">
        <b>{t("matches.shortlistWhy")}:</b> {t(`fit.${fit.whyItFitsThisStudentId}`, { field: profile.major })}
      </p>
      <dl>
        <dt>{t("matches.mainAdvantage")}</dt>
        <dd>{t(`fit.${fit.mainAdvantageId}`, { field: profile.major })}</dd>
        <dt>{t("matches.mainGap")}</dt>
        <dd>{t(`note.${fit.mainGapId}`, fit.mainGapParams)}</dd>
        <dt>{t("matches.testingContext")}</dt>
        <dd>{t(`fit.${fit.testingContextId}`)}</dd>
        {fit.whatItRewardsId ? (
          <>
            <dt>{t("matches.programFit")}</dt>
            <dd>{t(`priority.${fit.whatItRewardsId}.label`)}</dd>
          </>
        ) : null}
        <dt>{t("matches.financialFit")}</dt>
        <dd>
          {recommendation.cost?.value ?? (
            <a href={university.officialWebsite} target="_blank" rel="noreferrer">
              {t("common.notVerified")} — {t("common.checkOfficial")}
            </a>
          )}
        </dd>
      </dl>
      <div className="card-actions">
        <button type="button" className={saved ? "selected" : ""} onClick={onSave}>
          {saved ? t("common.saved") : t("common.save")}
        </button>
        <button type="button" onClick={onCompare}>{t("common.compare")}</button>
      </div>
    </article>
  );
}

/** University research lives inside Matches — there is no separate Explore destination. */
function UniversitySearch({ state, profile, dream, onUpdate, onNavigate }: SectionProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [result, setResult] = useState<UniversityResearch | null>(null);

  async function search(value: string) {
    if (!value.trim()) return;
    setBusy(true);
    setNotice("");
    setCandidates([]);
    setResult(null);
    try {
      const found = await resolveUniversity(value);
      if (!found.length) setNotice(t("matches.searchNoResult"));
      else if (found.length === 1) await research(found[0]!);
      else setCandidates(found);
    } catch {
      setNotice(t("matches.searchFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function research(candidate: Candidate) {
    setBusy(true);
    setCandidates([]);
    try {
      const researched = await researchUniversity(candidate);
      setResult(researched);
      onUpdate((previous) => ({
        ...previous,
        savedUniversities: previous.savedUniversities.some((item) => item.id === researched.id)
          ? previous.savedUniversities
          : [...previous.savedUniversities, researched],
      }));
    } catch {
      setNotice(t("matches.searchNoResult"));
    } finally {
      setBusy(false);
    }
  }

  const resultAlignment = result ? alignmentFor(profile, result, dream.country) : null;
  const isTarget = result ? state.roadmapTarget?.universityId === result.id : false;

  return (
    <div className="search-block panel">
      <div className="section-subhead tight">
        <h2>{t("matches.searchTitle")}</h2>
      </div>
      <form
        className="workspace-search"
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
      >
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("matches.searchPlaceholder")} aria-label={t("matches.searchPlaceholder")} />
        <button className="btn-primary" type="submit" disabled={busy || !query.trim()}>
          {busy ? t("matches.searchBusy") : t("matches.searchButton")}
        </button>
      </form>
      {notice ? <p className="quiet-note">{notice}</p> : null}
      {candidates.length ? (
        <div className="candidate-list compact">
          {candidates.map((candidate) => (
            <button key={candidate.id} type="button" className="candidate-row" onClick={() => void research(candidate)}>
              <span>
                <strong>{candidate.name}</strong>
                <small>{candidate.location}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {result && resultAlignment ? (
        <article className="explore-result">
          <UniversityImage university={result} className="card-media" />
          <div className="explore-result-body">
            <h3>{result.parentName ?? result.name}</h3>
            {formatLocation(result) ? <p className="quiet-note">{formatLocation(result)}</p> : null}
            <AlignmentBadge breakdown={resultAlignment} size="small" />
            <div className="card-actions">
              <button
                type="button"
                onClick={() => {
                  onUpdate((previous) => ({ ...previous, compareSelection: [dream.id, result.id] }));
                  onNavigate("compare");
                }}
              >
                {t("common.compare")}
              </button>
              {isTarget ? (
                <span className="target-tag">{t("matches.currentTarget")}</span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onUpdate((previous) => ({
                      ...previous,
                      roadmapTarget: { name: result.name, program: profile.major, universityId: result.id },
                      roadmapHistory: previous.roadmap ? [...previous.roadmapHistory, previous.roadmap] : previous.roadmapHistory,
                      roadmap: null,
                      roadmapStatus: isProfileComplete(profile) ? "ready_to_build" : "not_ready",
                    }))
                  }
                >
                  {t("matches.useAsTarget")}
                </button>
              )}
              {result.officialWebsite ? (
                <a className="ghost-link" href={result.officialWebsite} target="_blank" rel="noreferrer">
                  {t("common.officialWebsite")}
                </a>
              ) : null}
            </div>
          </div>
        </article>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare — personal, sectioned, not a giant table
// ---------------------------------------------------------------------------

/** Small helper so each row reads left/right with its explanation attached. */
function pair(left: { value: string; note: string }, right: { value: string; note: string }) {
  return { left: left.value, right: right.value, leftNote: left.note, rightNote: right.note };
}

function CompareSection({ state, profile, dream, universe, onUpdate, onNavigate }: SectionProps & { universe: UniversityResearch[] }) {
  const { t } = useLocale();
  const [confirm, setConfirm] = useState<UniversityResearch | null>(null);
  const leftId = state.compareSelection[0] ?? dream.id;
  const rightId = state.compareSelection[1] ?? state.recommendations[0]?.id ?? null;
  const left = universe.find((item) => item.id === leftId) ?? dream;
  const right = universe.find((item) => item.id === rightId) ?? state.recommendations[0]?.university ?? null;
  const target = state.roadmapTarget;

  const leftComparison = useMemo(() => compareProfileToUniversity(profile, left, dream.country), [profile, left, dream]);
  const rightComparison = useMemo(() => (right ? compareProfileToUniversity(profile, right, dream.country) : null), [profile, right, dream]);
  const takeaway = useMemo(() => (rightComparison ? compareTakeaway(leftComparison, rightComparison) : null), [leftComparison, rightComparison]);

  function setSide(side: 0 | 1, id: string) {
    onUpdate((previous) => {
      const next: [string | null, string | null] = [...previous.compareSelection] as [string | null, string | null];
      next[side] = id;
      return { ...previous, compareSelection: next };
    });
  }

  function switchTarget(university: UniversityResearch) {
    onUpdate((previous) => ({
      ...previous,
      roadmapTarget: { name: university.name, program: profile.major, universityId: university.id },
      // Completed history is kept; only future weeks are regenerated.
      roadmapHistory: previous.roadmap ? [...previous.roadmapHistory, previous.roadmap] : previous.roadmapHistory,
      roadmap: null,
      roadmapStatus: isProfileComplete(profile) ? "ready_to_build" : "not_ready",
      roadmapError: null,
    }));
    setConfirm(null);
    onNavigate("roadmap-preview");
  }

  /** A bare score says nothing to a student: every number gets a verdict word. */
  function scoreCell(score: number, dimension: string) {
    const band = score >= 70 ? "strong" : score >= 45 ? "partial" : "gap";
    return { value: String(score), note: t(`compare.band.${band}`, { dimension }) };
  }

  const sections: Array<{ label: string; left: string; right: string; leftNote?: string; rightNote?: string }> = rightComparison
    ? [
        {
          label: t("compare.academicFit"),
          ...pair(scoreCell(leftComparison.alignment.academics, t("compare.academicFit")), scoreCell(rightComparison.alignment.academics, t("compare.academicFit"))),
        },
        {
          label: t("compare.testingGap"),
          ...pair(scoreCell(leftComparison.alignment.testing, t("compare.testingGap")), scoreCell(rightComparison.alignment.testing, t("compare.testingGap"))),
        },
        {
          label: t("compare.programFit"),
          ...pair(scoreCell(leftComparison.alignment.programFit, t("compare.programFit")), scoreCell(rightComparison.alignment.programFit, t("compare.programFit"))),
        },
        {
          label: t("compare.activityFit"),
          ...pair(scoreCell(leftComparison.alignment.activities, t("compare.activityFit")), scoreCell(rightComparison.alignment.activities, t("compare.activityFit"))),
        },
        {
          label: t("compare.financialFit"),
          left: state.recommendations.find((item) => item.id === left.id)?.cost?.value ?? t("common.notVerified"),
          right: state.recommendations.find((item) => item.id === right?.id)?.cost?.value ?? t("common.notVerified"),
          leftNote: t("compare.costNote"),
          rightNote: t("compare.costNote"),
        },
        {
          label: t("compare.effort"),
          left: t(leftComparison.lens.character === "holistic-private" || leftComparison.lens.character === "ancient-collegiate" ? "compare.effortHigh" : "compare.effortMedium"),
          right: t(rightComparison.lens.character === "holistic-private" || rightComparison.lens.character === "ancient-collegiate" ? "compare.effortHigh" : "compare.effortMedium"),
          leftNote: t("compare.effortNote"),
          rightNote: t("compare.effortNote"),
        },
      ]
    : [];

  return (
    <section id="compare" className="workspace-section compare-section">
      <div className="section-layout narrow">
        <div className="section-intro">
          <p className="eyebrow">{t("nav.compare")}</p>
          <h1>{t("compare.heading")}</h1>
        </div>
        <div className="compare-pickers">
          {[0, 1].map((side) => (
            <label key={side}>
              <span>{side === 0 ? t("compare.left") : t("compare.right")}</span>
              <select value={(side === 0 ? left.id : right?.id) ?? ""} onChange={(event) => setSide(side as 0 | 1, event.target.value)}>
                {universe.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {!right || !rightComparison ? (
          <p className="quiet-note">{t("compare.pickSecond")}</p>
        ) : (
          <>
            <div className="compare-values">
              {[leftComparison, rightComparison].map((comparison, index) => (
                <div className="panel compare-values-column" key={index}>
                  <h3>{comparison.lens.universityName}</h3>
                  <p className="field-label">{t("compare.valuesHere")}</p>
                  <ul>
                    {comparison.lens.priorities.slice(0, 4).map((priority) => (
                      <li key={priority.id}>{t(`priority.${priority.id}.label`)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="compare-sections panel">
              {sections.map((row) => (
                <div className="compare-row" key={row.label}>
                  <span>{row.label}</span>
                  <div className="compare-cell">
                    <b>{row.left}</b>
                    {row.leftNote ? <small>{row.leftNote}</small> : null}
                  </div>
                  <div className="compare-cell">
                    <b>{row.right}</b>
                    {row.rightNote ? <small>{row.rightNote}</small> : null}
                  </div>
                </div>
              ))}
            </div>

            {takeaway ? (
              <div className="takeaway panel">
                <p className="eyebrow">{t("compare.takeaway")}</p>
                <h2>{t(`compare.takeaway.${takeaway.id}`, takeaway.params)}</h2>
              </div>
            ) : null}

            <div className="card-actions">
              {[left, right].map((university) =>
                target?.universityId === university.id ? (
                  <span className="target-tag" key={university.id}>{t("matches.currentTarget")}</span>
                ) : (
                  <button type="button" className="btn-secondary" key={university.id} onClick={() => setConfirm(university)}>
                    {t("matches.useAsTarget")}: {university.name}
                  </button>
                ),
              )}
            </div>
          </>
        )}

        {confirm ? (
          <div className="confirm-bar panel">
            <p>{t("compare.switchTarget", { from: target?.name ?? dream.name, to: confirm.name })}</p>
            <p className="quiet-note">{t("compare.switchKeepsHistory")}</p>
            <div className="card-actions">
              <button type="button" className="btn-primary" onClick={() => switchTarget(confirm)}>
                {t("compare.switchConfirm")}
              </button>
              <button type="button" onClick={() => setConfirm(null)}>{t("common.cancel")}</button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Roadmap preview — concise; the planner itself lives at /roadmap
// ---------------------------------------------------------------------------

function RoadmapPreview({ state, profile, dream, onUpdate, onNavigate }: SectionProps) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const roadmap = state.roadmap;
  const target = state.roadmapTarget ?? { name: dream.name, program: profile.major, universityId: dream.id };

  if (!roadmap || state.roadmapStatus !== "active") {
    return (
      <section id="roadmap-preview" className="workspace-section roadmap-section alt-bg">
        <div className="section-intro">
          <p className="eyebrow">{t("nav.roadmap")}</p>
          <h1>{t("preview.notBuilt")}</h1>
          <p className="supporting small">{state.roadmapStatus === "not_ready" ? t("preview.incomplete") : t("preview.notBuiltBody")}</p>
        </div>
        <div className="card-actions">
          {state.roadmapStatus === "not_ready" ? (
            <button className="btn-primary dominant" type="button" onClick={() => onNavigate("profile")}>
              {t("preview.completeProfile")}
            </button>
          ) : (
            <button
              className="btn-primary dominant"
              type="button"
              onClick={() => {
                onUpdate((previous) => ({ ...previous, roadmapStatus: "collecting_availability" }));
                void navigate({ to: "/roadmap" });
              }}
            >
              {t("preview.build")}
            </button>
          )}
        </div>
      </section>
    );
  }

  const week = currentWeek(roadmap);
  const stats = weekStats(week);
  const focus = weekAreaMinutes(week).slice(0, 2);
  const totalTasks = roadmap.weeks.reduce((sum, item) => sum + item.tasks.length, 0);
  const doneTasks = roadmap.weeks.reduce((sum, item) => sum + item.tasks.filter((task) => task.status === "completed").length, 0);

  return (
    <section id="roadmap-preview" className="workspace-section roadmap-section alt-bg">
      <div className="section-intro">
        <p className="eyebrow">{t("nav.roadmap")}</p>
        <h1>{t("preview.title")}</h1>
      </div>
      <div className="preview-panel panel dark-panel">
        <div className="preview-grid">
          <div>
            <span>{t("preview.target")}</span>
            <strong>
              {target.name} · {target.program}
            </strong>
          </div>
          <div>
            <span>{t("preview.thisWeek")}</span>
            <strong>{t("preview.planned", { time: formatMinutes(week.plannedMinutes) })}</strong>
          </div>
          <div>
            <span>{t("preview.completed")}</span>
            <strong>{t("preview.tasks", { done: stats.tasksDone, total: stats.tasksTotal })}</strong>
          </div>
          <div>
            <span>{t("preview.mainFocus")}</span>
            <strong>{focus.map((item) => item.area).join(" + ") || "—"}</strong>
          </div>
          <div>
            <span>{t("preview.nextMilestone")}</span>
            <strong>{week.milestone}</strong>
          </div>
          <div>
            <span>{t("preview.progress")}</span>
            <strong>{totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0}%</strong>
          </div>
        </div>
        <div className="card-actions">
          <Link className="btn-primary light dominant" to="/roadmap">
            {t("preview.open")}
          </Link>
          <Link className="link-button light" to="/roadmap" search={{ setup: true }}>
            {t("preview.adjust")}
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileSection({ state, profile, onUpdate, onNavigate, onReanalyze }: Omit<SectionProps, "dream"> & { onReanalyze: () => void }) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StudentProfile>(profile);
  useEffect(() => setDraft(profile), [profile]);

  function save() {
    onUpdate((previous) => ({
      ...previous,
      studentProfile: draft,
      roadmapStatus: previous.roadmapStatus === "not_ready" && isProfileComplete(draft) ? "ready_to_build" : previous.roadmapStatus,
    }));
    setEditing(false);
  }

  function reanalyze() {
    onReanalyze();
    onUpdate((previous) => ({ ...previous, recommendations: [], recommendationsStatus: "idle" }));
    onNavigate("matches");
  }

  const tests = testSummary(profile);
  return (
    <section id="profile" className="workspace-section profile-section">
      <div className="profile-header">
        <div>
          <p className="eyebrow">{t("nav.profile")}</p>
          <h1>{t("profile.title")}</h1>
        </div>
        <div className="card-actions">
          {editing ? (
            <button className="btn-primary" type="button" onClick={save}>
              {t("profile.save")}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)}>{t("profile.edit")}</button>
              <button className="btn-primary" type="button" onClick={reanalyze}>
                {t("profile.reanalyze")}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="profile-grid">
        <ProfileGroup title={t("profile.goal")}>
          <ProfileLine label={t("profile.field")} value={draft.major} editing={editing} onChange={(value) => setDraft({ ...draft, major: value })} />
          <ProfileLine label={t("profile.grade")} display={t(`grade.${slug(draft.grade)}`)} value={draft.grade} editing={editing} onChange={(value) => setDraft({ ...draft, grade: value as StudentProfile["grade"] })} />
          <ProfileLine label={t("profile.target")} value={state.roadmapTarget?.name ?? state.dreamUniversity?.name ?? ""} editing={false} onChange={() => undefined} />
        </ProfileGroup>
        <ProfileGroup title={t("profile.academics")}>
          <ProfileLine label={t("profile.scale")} display={t(`scale.${slug(draft.scale)}`)} value={draft.scale} editing={false} onChange={() => undefined} />
          <ProfileLine
            label={t("profile.score")}
            value={draft.gpa}
            editing={editing}
            onChange={(value) => setDraft({ ...draft, gpa: numericText(value) })}
            hint={`${scaleBounds(draft.scale).min}–${scaleBounds(draft.scale).max}`}
          />
        </ProfileGroup>
        <ProfileGroup title={t("profile.tests")}>
          {tests.map((line) => (
            <div key={line.label} className="test-line">
              <div>
                <span>{line.label}</span>
                <strong>{line.value}</strong>
              </div>
              {line.parts.length ? (
                <div className="test-parts">
                  {line.parts.map((part) => (
                    <em key={part}>{part}</em>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {editing && draft.sat.status === "Taken" ? (
            <div className="entry-row">
              <label className="profile-line">
                <span>{t("onboarding.math")}</span>
                <input value={draft.sat.math} inputMode="numeric" onChange={(event) => setDraft({ ...draft, sat: { ...draft.sat, math: numericText(event.target.value, false) } })} />
              </label>
              <label className="profile-line">
                <span>{t("onboarding.verbal")}</span>
                <input value={draft.sat.verbal} inputMode="numeric" onChange={(event) => setDraft({ ...draft, sat: { ...draft.sat, verbal: numericText(event.target.value, false) } })} />
              </label>
            </div>
          ) : null}
          {editing && draft.englishTest === "IELTS" ? (
            <div className="entry-row four">
              {(["listening", "reading", "writing", "speaking"] as const).map((key) => (
                <label key={key} className="profile-line">
                  <span>{key.slice(0, 1).toUpperCase()}</span>
                  <input value={draft.ielts[key]} inputMode="decimal" onChange={(event) => setDraft({ ...draft, ielts: { ...draft.ielts, [key]: numericText(event.target.value) } })} />
                </label>
              ))}
            </div>
          ) : null}
        </ProfileGroup>
        <ProfileGroup title={t("profile.honors")}>
          {profile.honors.length ? (
            profile.honors.map((honor) => (
              <div key={honor.id} className="list-line">
                <strong>{honor.title}</strong>
                <span>{[honor.level, honor.year, honor.result].filter(Boolean).join(" · ")}</span>
              </div>
            ))
          ) : (
            <p>{t("profile.noHonors")}</p>
          )}
        </ProfileGroup>
        <ProfileGroup title={t("profile.activities")}>
          {profile.activities.length ? (
            profile.activities.map((activity) => (
              <div key={activity.id} className="list-line">
                <strong>{activity.name}</strong>
                <span>{[activity.role, durationText(activity.start, activity.end), activity.impact].filter(Boolean).join(" · ")}</span>
              </div>
            ))
          ) : (
            <p>{t("profile.noActivities")}</p>
          )}
          {profile.experiences.map((experience) => (
            <div key={experience.id} className="list-line">
              <strong>{experience.name}</strong>
              <span>{[experience.role, experience.result].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </ProfileGroup>
        <ProfileGroup title={t("profile.preferences")}>
          <div className="chip-row static">
            {profile.preferences.length ? profile.preferences.map((item) => <span key={item}>{item}</span>) : <p>{t("profile.noPreferences")}</p>}
          </div>
        </ProfileGroup>
      </div>
    </section>
  );
}

function ProfileGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="profile-group panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function slug(value: string) {
  return value.toLowerCase().replace(/[.\s]+/g, "-");
}

function ProfileLine({ label, value, display, editing, onChange, hint }: { label: string; value: string; display?: string; editing: boolean; onChange: (value: string) => void; hint?: string }) {
  const { t } = useLocale();
  return (
    <label className="profile-line">
      <span>
        {label}
        {hint ? ` · ${hint}` : ""}
      </span>
      {editing ? <input value={value} onChange={(event) => onChange(event.target.value)} /> : <strong>{display || value || t("profile.notSet")}</strong>}
    </label>
  );
}

function durationText(start: string, end: string) {
  const format = (value: string) => {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return value;
    return new Date(year, month - 1, 1).toLocaleString("en", { month: "short", year: "numeric" });
  };
  if (!start && !end) return "";
  return `${start ? format(start) : "…"} – ${end ? format(end) : "Present"}`;
}
