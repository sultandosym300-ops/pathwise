import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { UniversityImage } from "../components/UniversityImage";
import {
  academicError,
  brandName,
  detError,
  emptyProfile,
  formatLocation,
  ieltsErrors,
  ieltsOverall,
  isAcademicsValid,
  isProfileComplete,
  majors,
  numericText,
  satErrors,
  satTotal,
  sanitizeProfile,
  activityErrors,
  honorErrors,
  experienceErrors,
  scaleBounds,
  toeflErrors,
  toeflTotal,
  type AchievementLevel,
  type Activity,
  type Candidate,
  type Experience,
  type Grade,
  type Honor,
  type Recommendation,
  type Scale,
  type StudentProfile,
  type UniversityResearch,
} from "../lib/admissions";
import { buildLens } from "../lib/analysis/lens";
import { findRecommendations, researchUniversity, resolveUniversity } from "../lib/research";
import { emptyState, loadAppState, saveAppState } from "../lib/state";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useLocale, type Translate } from "../lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pathwise — start with your dream university" },
      {
        name: "description",
        content: "Pick a dream university, tell Pathwise where you stand, and get a real study roadmap built around your scores and your free time.",
      },
      { property: "og:title", content: "Pathwise — start with your dream university" },
      { property: "og:description", content: "A profile-first admissions strategy workspace with a roadmap generated from your real scores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Step = "dream" | "reveal" | "values" | "where" | "academics" | "evidence" | "analysis";
type ActivityField = keyof Omit<Activity, "id">;
type ExperienceField = keyof Omit<Experience, "id">;
type HonorField = keyof Omit<Honor, "id">;

const grades: Grade[] = ["Grade 9", "Grade 10", "Grade 11", "Grade 12", "Gap year", "Other"];
const scales: Scale[] = ["5-point scale", "4.0 GPA", "Percentage", "IB", "A-levels", "Other"];
const achievementLevels: AchievementLevel[] = ["School", "City", "Regional", "National", "International"];
const preferenceOptions = [
  "Financial aid",
  "USA",
  "Europe",
  "Asia",
  "Anywhere",
  "Research opportunities",
  "Urban campus",
  "Strong engineering",
  "English-taught programs",
];
const analysisStageKeys = ["onboarding.stage.profile", "onboarding.stage.gaps", "onboarding.stage.search", "onboarding.stage.verify", "onboarding.stage.score"];

/** Stable ids keep stored data language-independent; only labels are localized. */
function optionKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const TOTAL_STEPS = 3;

function Index() {
  const { t } = useLocale();
  const [step, setStep] = useState<Step>("dream");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dream, setDream] = useState<UniversityResearch | null>(null);
  const [profile, setProfile] = useState<StudentProfile>(() => emptyProfile());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [majorQuery, setMajorQuery] = useState("");
  const [analysisIndex, setAnalysisIndex] = useState(0);
  const [analysisDetail, setAnalysisDetail] = useState("");
  const [hasWorkspace, setHasWorkspace] = useState(false);
  const analysisStarted = useRef(false);

  useEffect(() => {
    setHasWorkspace(loadAppState().onboardingCompleted);
  }, []);

  const filteredMajors = useMemo(() => {
    const value = majorQuery.trim().toLowerCase();
    if (!value) return majors;
    return majors.filter((major) => major.toLowerCase().includes(value) || t(`major.${optionKey(major)}`).toLowerCase().includes(value));
  }, [majorQuery, t]);

  const sat = satErrors(profile);
  const ielts = ieltsErrors(profile);
  const toefl = toeflErrors(profile);
  const academicsReady = isAcademicsValid(profile);
  const whereReady = Boolean(profile.grade && profile.major);

  /** Only the four strongest signals are previewed before the questionnaire. */
  const previewPriorities = useMemo(() => (dream ? buildLens(emptyProfile(), dream).priorities.slice(0, 4) : []), [dream]);

  useEffect(() => {
    if (step !== "analysis" || analysisStarted.current || !dream) return;
    analysisStarted.current = true;
    void (async () => {
      setAnalysisIndex(1);
      let recommendations: Recommendation[] = [];
      setAnalysisIndex(2);
      try {
        recommendations = await findRecommendations(profile, dream, (message) => {
          setAnalysisDetail(message);
          if (/validating/i.test(message)) setAnalysisIndex(3);
          if (/researching/i.test(message)) setAnalysisIndex(4);
        });
      } catch {
        recommendations = [];
      }
      setAnalysisIndex(analysisStageKeys.length - 1);
      const clean = sanitizeProfile(profile);
      saveAppState({
        ...emptyState(),
        onboardingCompleted: true,
        studentProfile: clean,
        dreamUniversity: dream,
        recommendations,
        recommendationsStatus: "done",
        compareSelection: [dream.id, recommendations[0]?.id ?? null],
        roadmapTarget: { name: dream.name, program: profile.major, universityId: dream.id },
        // A roadmap never exists before the student sets availability.
        roadmapStatus: isProfileComplete(clean) ? "ready_to_build" : "not_ready",
      });
      window.location.assign("/app");
    })();
  }, [dream, profile, step]);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setNotice("");
    setCandidates([]);
    try {
      const results = await resolveUniversity(value);
      if (!results.length) setNotice(t("onboarding.noMatch"));
      else if (results.length === 1) await chooseCandidate(results[0]!);
      else setCandidates(results);
    } catch {
      setNotice(t("onboarding.searchUnavailable"));
    } finally {
      setLoading(false);
    }
  }

  async function chooseCandidate(candidate: Candidate) {
    setLoading(true);
    setNotice("");
    try {
      const researched = await researchUniversity(candidate);
      setDream(researched);
      setCandidates([]);
      setStep("reveal");
    } catch {
      setNotice(t("onboarding.notVerified"));
    } finally {
      setLoading(false);
    }
  }

  /** Nothing incomplete is ever analysed: finish an entry or remove it. */
  const invalidEntries =
    profile.honors.filter((item) => Object.values(honorErrors(item)).some(Boolean)).length +
    profile.activities.filter((item) => Object.values(activityErrors(item)).some(Boolean)).length +
    profile.experiences.filter((item) => Object.values(experienceErrors(item)).some(Boolean)).length;

  function updateProfile(next: Partial<StudentProfile>) {
    setProfile((previous) => ({ ...previous, ...next }));
  }

  function updateHonor(id: string, field: HonorField, value: string) {
    setProfile((previous) => ({ ...previous, honors: previous.honors.map((honor) => (honor.id === id ? { ...honor, [field]: value } : honor)) }));
  }

  function updateActivity(id: string, field: ActivityField, value: string) {
    setProfile((previous) => ({ ...previous, activities: previous.activities.map((activity) => (activity.id === id ? { ...activity, [field]: value } : activity)) }));
  }

  function updateExperience(id: string, field: ExperienceField, value: string) {
    setProfile((previous) => ({ ...previous, experiences: previous.experiences.map((experience) => (experience.id === id ? { ...experience, [field]: value } : experience)) }));
  }

  function setPreference(option: string) {
    setProfile((previous) => ({
      ...previous,
      preferences: previous.preferences.includes(option) ? previous.preferences.filter((item) => item !== option) : [...previous.preferences, option],
    }));
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-topbar">
        <LanguageSwitcher />
      </div>

      {step === "dream" ? (
        <section className="dream-screen">
          <div className="dream-mark">{brandName}</div>
          <form className="dream-card" onSubmit={handleSearch}>
            <h1>{t("onboarding.dreamTitle")}</h1>
            <div className="entity-search">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("onboarding.dreamPlaceholder")}
                aria-label={t("onboarding.dreamTitle")}
                autoFocus
              />
              <button className="btn-primary" disabled={loading || !query.trim()} type="submit">
                {loading ? t("onboarding.searching") : t("onboarding.find")}
              </button>
            </div>
            {notice ? <p className="form-error spacious">{notice}</p> : null}
            {candidates.length ? (
              <div className="candidate-list" aria-label={t("onboarding.pickOne")}>
                <p className="field-label">{t("onboarding.pickOne")}</p>
                {candidates.map((candidate) => (
                  <button key={candidate.id} type="button" className="candidate-row" disabled={loading} onClick={() => void chooseCandidate(candidate)}>
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>{[candidate.location, hostname(candidate.officialWebsite)].filter(Boolean).join(" · ")}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </form>
          {hasWorkspace ? (
            <a className="resume-link" href="/app">
              {t("onboarding.openWorkspace")}
            </a>
          ) : null}
        </section>
      ) : null}

      {step === "reveal" && dream ? (
        <section className="reveal-screen">
          <UniversityImage university={dream} className="reveal-media" />
          <div className="reveal-copy">
            <p className="eyebrow">{t("onboarding.yourTarget")}</p>
            <h1>{dream.name}</h1>
            {formatLocation(dream) ? <p className="supporting">{formatLocation(dream)}</p> : null}
            <p className="reveal-message">{t("onboarding.revealMessage", { university: dream.name })}</p>
            {dream.fact ? (
              <blockquote>
                {dream.fact.value}
                <a href={dream.fact.sourceUrl} target="_blank" rel="noreferrer">
                  {dream.fact.sourceTitle}
                </a>
              </blockquote>
            ) : (
              <p className="quiet-note">{t("onboarding.noFact")}</p>
            )}
            <button className="btn-primary wide" type="button" onClick={() => setStep("values")}>
              {t("onboarding.buildProfile")}
            </button>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setStep("dream");
                setDream(null);
              }}
            >
              {t("onboarding.chooseAnother")}
            </button>
          </div>
        </section>
      ) : null}

      {step === "values" && dream ? (
        <section className="values-screen">
          <div className="values-head">
            <p className="eyebrow">{t("onboarding.yourTarget")}</p>
            <h1>{t("matches.valuesTitle", { university: dream.name })}</h1>
            <p className="supporting small">{t("onboarding.valuesSupport")}</p>
          </div>
          {previewPriorities.length ? (
            <ul className="values-preview">
              {previewPriorities.map((priority) => (
                <li key={priority.id}>
                  <strong>{t(`priority.${priority.id}.label`)}</strong>
                  <p>{t(`priority.${priority.id}.desc`)}</p>
                  <span className={priority.interpretationType === "documented" ? "tag documented" : "tag interpreted"}>
                    {priority.interpretationType === "documented" ? t("matches.documentedEmphasis") : t("matches.pathwiseInterpretation")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet-note">{t("matches.valuesEmpty")}</p>
          )}
          <div className="step-actions">
            <button className="btn-secondary" type="button" onClick={() => setStep("reveal")}>
              {t("onboarding.back")}
            </button>
            <button className="btn-primary" type="button" onClick={() => setStep("where")}>
              {t("onboarding.buildProfile")}
            </button>
          </div>
        </section>
      ) : null}

      {step === "where" ? (
        <StepFrame stepNumber={1} t={t} title={t("onboarding.whereTitle")} support={t("onboarding.whereSupport")}>
          <div className="choice-grid grade-grid">
            {grades.map((grade) => (
              <button key={grade} type="button" className={`choice-card ${profile.grade === grade ? "selected" : ""}`} onClick={() => updateProfile({ grade })}>
                {t(`grade.${optionKey(grade)}`)}
              </button>
            ))}
          </div>
          <div className="field-picker">
            <p className="field-label">{t("onboarding.intendedField")}</p>
            <input value={majorQuery} onChange={(event) => setMajorQuery(event.target.value)} placeholder={t("onboarding.fieldPlaceholder")} aria-label={t("onboarding.intendedField")} />
            <div className="major-list">
              {filteredMajors.map((major) => (
                <button key={major} type="button" className={profile.major === major ? "selected" : ""} onClick={() => updateProfile({ major })}>
                  {t(`major.${optionKey(major)}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="step-actions">
            <button className="btn-secondary" type="button" onClick={() => setStep("values")}>
              {t("onboarding.back")}
            </button>
            <button className="btn-primary" disabled={!whereReady} type="button" onClick={() => setStep("academics")}>
              {t("onboarding.continue")}
            </button>
          </div>
        </StepFrame>
      ) : null}

      {step === "academics" ? (
        <StepFrame stepNumber={2} t={t} title={t("onboarding.academicsTitle")} support={t("onboarding.academicsSupport")}>
          <div className="academics-layout">
            <section className="form-panel">
              <h2>{t("onboarding.schoolGrading")}</h2>
              <div className="segmented">
                {scales.map((scale) => (
                  <button key={scale} type="button" className={profile.scale === scale ? "selected" : ""} onClick={() => updateProfile({ scale, gpa: "" })}>
                    {t(`scale.${optionKey(scale)}`)}
                  </button>
                ))}
              </div>
              <NumberField
                label={t("onboarding.currentScore")}
                value={profile.gpa}
                min={scaleBounds(profile.scale).min}
                max={scaleBounds(profile.scale).max}
                step={scaleBounds(profile.scale).step}
                error={academicError(profile)}
                onChange={(value) => updateProfile({ gpa: numericText(value) })}
              />
            </section>

            <section className="form-panel">
              <h2>{t("onboarding.sat")}</h2>
              <div className="segmented">
                {(["Not taken", "Planning", "Taken"] as const).map((status) => (
                  <button key={status} type="button" className={profile.sat.status === status ? "selected" : ""} onClick={() => updateProfile({ sat: { status, math: "", verbal: "" } })}>
                    {t(`testStatus.${optionKey(status)}`)}
                  </button>
                ))}
              </div>
              {profile.sat.status === "Taken" ? (
                <div className="score-grid">
                  <NumberField
                    label={t("onboarding.math")}
                    value={profile.sat.math}
                    min={200}
                    max={800}
                    step={10}
                    error={sat.math}
                    onChange={(value) => updateProfile({ sat: { ...profile.sat, math: numericText(value, false) } })}
                  />
                  <NumberField
                    label={t("onboarding.verbal")}
                    value={profile.sat.verbal}
                    min={200}
                    max={800}
                    step={10}
                    error={sat.verbal}
                    onChange={(value) => updateProfile({ sat: { ...profile.sat, verbal: numericText(value, false) } })}
                  />
                  <ReadOnlyTotal label={t("onboarding.satTotal")} value={satTotal(profile)?.toString() ?? "—"} hint={t("onboarding.calculated")} />
                </div>
              ) : null}
            </section>

            <section className="form-panel wide-panel">
              <h2>{t("onboarding.englishTest")}</h2>
              <div className="segmented">
                {(["IELTS", "TOEFL", "Duolingo English Test", "Not taken"] as const).map((test) => (
                  <button key={test} type="button" className={profile.englishTest === test ? "selected" : ""} onClick={() => updateProfile({ englishTest: test })}>
                    {test === "Not taken" ? t("testStatus.not-taken") : test}
                  </button>
                ))}
              </div>
              {profile.englishTest === "IELTS" ? (
                <div className="score-grid four">
                  {(["listening", "reading", "writing", "speaking"] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={t(`section.${key}`)}
                      value={profile.ielts[key]}
                      min={0}
                      max={9}
                      step={0.5}
                      error={ielts[key]}
                      onChange={(value) => updateProfile({ ielts: { ...profile.ielts, [key]: numericText(value) } })}
                    />
                  ))}
                  <ReadOnlyTotal label={t("onboarding.ieltsOverall")} value={ieltsOverall(profile)?.toString() ?? "—"} hint={t("onboarding.calculated")} />
                </div>
              ) : null}
              {profile.englishTest === "TOEFL" ? (
                <div className="score-grid four">
                  {(["reading", "listening", "speaking", "writing"] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={t(`section.${key}`)}
                      value={profile.toefl[key]}
                      min={0}
                      max={30}
                      step={1}
                      error={toefl[key]}
                      onChange={(value) => updateProfile({ toefl: { ...profile.toefl, [key]: numericText(value, false) } })}
                    />
                  ))}
                  <ReadOnlyTotal label={t("onboarding.toeflTotal")} value={toeflTotal(profile)?.toString() ?? "—"} hint={t("onboarding.calculated")} />
                </div>
              ) : null}
              {profile.englishTest === "Duolingo English Test" ? (
                <NumberField
                  label={t("onboarding.detScore")}
                  value={profile.det.score}
                  min={10}
                  max={160}
                  step={5}
                  error={detError(profile)}
                  onChange={(value) => updateProfile({ det: { score: numericText(value, false) } })}
                />
              ) : null}
            </section>
          </div>
          <div className="step-actions">
            <button className="btn-secondary" type="button" onClick={() => setStep("where")}>
              {t("onboarding.back")}
            </button>
            <button className="btn-primary" disabled={!academicsReady} type="button" onClick={() => setStep("evidence")}>
              {t("onboarding.continue")}
            </button>
          </div>
        </StepFrame>
      ) : null}

      {step === "evidence" ? (
        <StepFrame stepNumber={3} t={t} title={t("onboarding.achievementsTitle")} support={t("onboarding.achievementsSupport")}>
          <div className="achievement-columns">
            <AchievementBlock
              title={t("onboarding.honors")}
              emptyText={t("onboarding.noHonors")}
              action={t("onboarding.addHonor")}
              count={profile.honors.length}
              onAdd={() => updateProfile({ honors: [...profile.honors, { id: cryptoId(), title: "", level: "School", year: "", result: "" }] })}
            >
              {profile.honors.map((honor) => (
                <div className="entry-card" key={honor.id}>
                  <input value={honor.title} onChange={(event) => updateHonor(honor.id, "title", event.target.value)} placeholder={t("onboarding.honorTitle")} />
                  <div className="entry-row">
                    <select value={honor.level} aria-label={t("onboarding.level")} onChange={(event) => updateHonor(honor.id, "level", event.target.value)}>
                      {achievementLevels.map((level) => (
                        <option key={level} value={level}>
                          {t(`level.${optionKey(level)}`)}
                        </option>
                      ))}
                    </select>
                    <input
                      value={honor.year}
                      onChange={(event) => updateHonor(honor.id, "year", numericText(event.target.value, false).slice(0, 4))}
                      placeholder={t("onboarding.year")}
                      inputMode="numeric"
                    />
                  </div>
                  <input value={honor.result} onChange={(event) => updateHonor(honor.id, "result", event.target.value)} placeholder={t("onboarding.result")} />
                  <button type="button" className="remove-entry" onClick={() => updateProfile({ honors: profile.honors.filter((item) => item.id !== honor.id) })}>
                    {t("onboarding.remove")}
                  </button>
                </div>
              ))}
            </AchievementBlock>

            <AchievementBlock
              title={t("onboarding.activities")}
              emptyText={t("onboarding.noActivities")}
              action={t("onboarding.addActivity")}
              count={profile.activities.length}
              onAdd={() =>
                updateProfile({
                  activities: [
                    ...profile.activities,
                    { id: cryptoId(), name: "", role: "", start: "", end: "", current: false, work: "", impact: "", field: "", teamSize: "", audience: "", iterations: "", validation: "" },
                  ],
                })
              }
            >
              {profile.activities.map((activity) => (
                <div className="entry-card" key={activity.id}>
                  <input value={activity.name} onChange={(event) => updateActivity(activity.id, "name", event.target.value)} placeholder={t("onboarding.activityName")} />
                  <input value={activity.field ?? ""} onChange={(event) => updateActivity(activity.id, "field", event.target.value)} placeholder={t("onboarding.activityField")} />
                  <input value={activity.role} onChange={(event) => updateActivity(activity.id, "role", event.target.value)} placeholder={t("onboarding.role")} />
                  <div className="entry-row">
                    <input type="month" value={activity.start} aria-label={t("onboarding.startMonth")} onChange={(event) => updateActivity(activity.id, "start", event.target.value)} />
                    <input
                      type="month"
                      value={activity.end}
                      aria-label={t("onboarding.present")}
                      disabled={activity.current}
                      onChange={(event) => updateActivity(activity.id, "end", event.target.value)}
                    />
                  </div>
                  <small className="entry-hint">{durationLabel(activity.start, activity.end, t)}</small>
                  <textarea value={activity.work} onChange={(event) => updateActivity(activity.id, "work", event.target.value)} placeholder={t("onboarding.work")} />
                  <input value={activity.impact} onChange={(event) => updateActivity(activity.id, "impact", event.target.value)} placeholder={t("onboarding.impact")} />
                  <div className="entry-row">
                    <input
                      value={activity.teamSize ?? ""}
                      inputMode="numeric"
                      onChange={(event) => updateActivity(activity.id, "teamSize", numericText(event.target.value, false).slice(0, 4))}
                      placeholder={t("onboarding.teamSize")}
                    />
                    <input value={activity.audience ?? ""} onChange={(event) => updateActivity(activity.id, "audience", event.target.value)} placeholder={t("onboarding.audience")} />
                  </div>
                  <div className="entry-row">
                    <input value={activity.iterations ?? ""} onChange={(event) => updateActivity(activity.id, "iterations", event.target.value)} placeholder={t("onboarding.iterations")} />
                    <input value={activity.validation ?? ""} onChange={(event) => updateActivity(activity.id, "validation", event.target.value)} placeholder={t("onboarding.validation")} />
                  </div>
                  <button type="button" className="remove-entry" onClick={() => updateProfile({ activities: profile.activities.filter((item) => item.id !== activity.id) })}>
                    {t("onboarding.remove")}
                  </button>
                </div>
              ))}
            </AchievementBlock>

            <AchievementBlock
              title={t("onboarding.experiences")}
              emptyText={t("onboarding.optional")}
              action={t("onboarding.addExperience")}
              count={profile.experiences.length}
              onAdd={() => updateProfile({ experiences: [...profile.experiences, { id: cryptoId(), name: "", role: "", contribution: "", result: "" }] })}
            >
              {profile.experiences.map((experience) => (
                <div className="entry-card" key={experience.id}>
                  <input value={experience.name} onChange={(event) => updateExperience(experience.id, "name", event.target.value)} placeholder={t("onboarding.organization")} />
                  <input value={experience.role} onChange={(event) => updateExperience(experience.id, "role", event.target.value)} placeholder={t("onboarding.role")} />
                  <textarea value={experience.contribution} onChange={(event) => updateExperience(experience.id, "contribution", event.target.value)} placeholder={t("onboarding.contribution")} />
                  <input value={experience.result} onChange={(event) => updateExperience(experience.id, "result", event.target.value)} placeholder={t("onboarding.resultShort")} />
                  <button type="button" className="remove-entry" onClick={() => updateProfile({ experiences: profile.experiences.filter((item) => item.id !== experience.id) })}>
                    {t("onboarding.remove")}
                  </button>
                </div>
              ))}
            </AchievementBlock>
          </div>

          <div className="preference-section">
            <p className="field-label">{t("onboarding.preferences")}</p>
            <div className="preference-strip">
              {preferenceOptions.map((option) => (
                <button key={option} className={profile.preferences.includes(option) ? "selected" : ""} type="button" onClick={() => setPreference(option)}>
                  {t(`pref.${optionKey(option)}`)}
                </button>
              ))}
            </div>
          </div>

          {invalidEntries ? <p className="form-error">{t("onboarding.fixEntries", { count: invalidEntries, plural: invalidEntries > 1 ? "ies" : "y" })}</p> : null}
          <div className="step-actions">
            <button className="btn-secondary" type="button" onClick={() => setStep("academics")}>
              {t("onboarding.back")}
            </button>
            <button className="btn-primary" type="button" disabled={invalidEntries > 0} onClick={() => setStep("analysis")}>
              {t("onboarding.analyze")}
            </button>
          </div>
        </StepFrame>
      ) : null}

      {step === "analysis" && dream ? (
        <section className="analysis-screen">
          <div>
            <h1>{t("onboarding.analysisTitle", { university: dream.name })}</h1>
            <p className="supporting">{t("onboarding.analysisSupport")}</p>
          </div>
          <div className="analysis-stages">
            {analysisStageKeys.map((key, index) => (
              <div key={key} className={index <= analysisIndex ? "complete" : ""}>
                <span>{index < analysisIndex ? "✓" : index === analysisIndex ? "•" : ""}</span>
                <b>
                  {t(key)}
                  {index === analysisIndex && analysisDetail ? <small>{analysisDetail}</small> : null}
                </b>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function StepFrame({ stepNumber, title, support, t, children }: { stepNumber: number; title: string; support: string; t: Translate; children: React.ReactNode }) {
  return (
    <section className="step-screen">
      <div className="step-header">
        <p className="eyebrow">{t("onboarding.step", { current: stepNumber, total: TOTAL_STEPS })}</p>
        <h1>{title}</h1>
        <p className="supporting small">{support}</p>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  error,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  error?: string;
  onChange: (value: string) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={handleChange} inputMode="decimal" aria-invalid={Boolean(error && value)} />
      {error && value ? (
        <small className="form-error">{error}</small>
      ) : (
        <small className="field-hint">
          {min}–{max}
        </small>
      )}
    </label>
  );
}

/** Totals are derived, never typed: sections and total can never disagree. */
function ReadOnlyTotal({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <label className="number-field readonly-total">
      <span>{label}</span>
      <output>{value}</output>
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

function AchievementBlock({
  title,
  emptyText,
  action,
  count,
  onAdd,
  children,
}: {
  title: string;
  emptyText: string;
  action: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`achievement-block ${count ? "expanded" : "collapsed"}`}>
      <div className="block-title-row">
        <h2>{title}</h2>
        {count ? (
          <button type="button" onClick={onAdd}>
            + {action}
          </button>
        ) : null}
      </div>
      {count ? (
        <div className="entry-list">{children}</div>
      ) : (
        <div className="block-empty">
          <p>{emptyText}</p>
          <button type="button" onClick={onAdd}>
            + {action}
          </button>
        </div>
      )}
    </section>
  );
}

export function durationLabel(start: string, end: string, t: Translate) {
  const format = (value: string) => {
    if (!value) return "";
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return value;
    return new Date(year, month - 1, 1).toLocaleString("en", { month: "short", year: "numeric" });
  };
  if (!start && !end) return t("onboarding.startMonth");
  return `${format(start) || "…"} – ${end ? format(end) : t("onboarding.present")}`;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
