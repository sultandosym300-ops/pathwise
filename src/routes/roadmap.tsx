import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { WorkspaceNav } from "../components/WorkspaceNav";
import { isProfileComplete, numericText, priorities, type StudentProfile, type UniversityResearch } from "../lib/admissions";
import { useLocale, localizedTask } from "../lib/i18n";
import {
  availabilityError,
  capacityMinutes,
  currentWeek,
  days,
  defaultSetup,
  enrichWithUniversity,
  formatMinutes,
  generateRoadmap,
  phaseFor,
  planNextWeek,
  todayName,
  updateTask,
  weekAreaMinutes,
  weekEndReached,
  weekStats,
  type Day,
  type Difficulty,
  type Resource,
  type RoadmapSetup,
  type RoadmapTask,
  type Week,
  type WeekReview,
} from "../lib/roadmap";
import { emptyState, loadAppState, saveAppState, type AppState } from "../lib/state";

export const Route = createFileRoute("/roadmap")({
  validateSearch: (search: Record<string, unknown>): { setup?: boolean } =>
    search["setup"] === true || search["setup"] === "true" ? { setup: true } : {},
  head: () => ({
    meta: [
      { title: "Your roadmap — Pathwise" },
      { name: "description", content: "Your weekly admissions plan: exact tasks, verified free resources, progress and weekly adaptation." },
      { property: "og:title", content: "Your Pathwise roadmap" },
      { property: "og:description", content: "Weekly tasks built from your scores, your free time and your target university's documented priorities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoadmapPage,
});

const generationStages = ["Analyzing your biggest gaps", "Balancing your available time", "Choosing the right resources", "Building your first week", "Setting your first milestones"];

function RoadmapPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { setup: wantsSetup } = Route.useSearch();
  const [state, setState] = useState<AppState>(() => emptyState());
  const [loaded, setLoaded] = useState(false);
  const [stage, setStage] = useState(0);
  const [reviewFeeling, setReviewFeeling] = useState<WeekReview["feeling"] | null>(null);
  const [endedEarly, setEndedEarly] = useState(false);

  useEffect(() => {
    setState(loadAppState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveAppState(state);
  }, [state, loaded]);

  useEffect(() => {
    if (loaded && wantsSetup) update((previous) => ({ ...previous, roadmapStatus: "collecting_availability" }));
  }, [loaded, wantsSetup]);

  function update(mutate: (previous: AppState) => AppState) {
    setState((previous) => mutate(previous));
  }

  const profile = state.studentProfile;
  const dream = state.dreamUniversity;

  if (!loaded) return <main className="workspace-loading">{t("common.loading")}</main>;
  if (!profile || !dream) {
    return (
      <main className="workspace-empty">
        <h1>{t("preview.notBuilt")}</h1>
        <a className="btn-primary" href="/">Start onboarding</a>
      </main>
    );
  }

  const target = state.roadmapTarget ?? { name: dream.name, program: profile.major, universityId: dream.id };
  const universe: UniversityResearch[] = [dream, ...state.recommendations.map((item) => item.university), ...state.savedUniversities];
  const targetUniversity = universe.find((item) => item.id === target.universityId) ?? null;
  const setup = state.roadmapSetup ?? defaultSetup();
  const status = state.roadmapStatus;

  function patchSetup(patch: Partial<RoadmapSetup>) {
    update((previous) => ({ ...previous, roadmapSetup: { ...(previous.roadmapSetup ?? defaultSetup()), ...patch } }));
  }

  function patchDay(day: Day, patch: Partial<RoadmapSetup["availability"][Day]>) {
    update((previous) => {
      const current = previous.roadmapSetup ?? defaultSetup();
      return { ...previous, roadmapSetup: { ...current, availability: { ...current.availability, [day]: { ...current.availability[day], ...patch } } } };
    });
  }

  async function generate() {
    if (!profile) return;
    const error = availabilityError(setup);
    if (error) {
      update((previous) => ({ ...previous, roadmapError: error }));
      return;
    }
    update((previous) => ({ ...previous, roadmapStatus: "generating", roadmapError: null }));
    try {
      setStage(0);
      priorities(profile);
      await nextFrame();
      setStage(1);
      capacityMinutes(setup);
      await nextFrame();
      setStage(2);
      const roadmap = generateRoadmap({ profile, target, setup, university: targetUniversity, strategy: { phase: phaseFor(profile, setup) } });
      setStage(3);
      await nextFrame();
      setStage(4);
      await nextFrame();
      update((previous) => ({ ...previous, roadmap, roadmapStatus: "active", roadmapError: null }));
    } catch (error) {
      update((previous) => ({ ...previous, roadmapStatus: "error", roadmapError: error instanceof Error ? error.message : "Roadmap generation failed." }));
    }
  }

  function setTask(taskId: string, change: Partial<Pick<RoadmapTask, "status" | "difficultyFeedback">>) {
    update((previous) => (previous.roadmap ? { ...previous, roadmap: updateTask(previous.roadmap, taskId, change) } : previous));
  }

  async function replan(feeling: WeekReview["feeling"]) {
    if (!profile) return;
    update((previous) => ({ ...previous, roadmapStatus: "replanning" }));
    await nextFrame();
    update((previous) => {
      if (!previous.roadmap) return previous;
      try {
        return { ...previous, roadmap: planNextWeek(previous.roadmap, profile, previous.roadmapSetup ?? defaultSetup(), targetUniversity, feeling), roadmapStatus: "active" };
      } catch (error) {
        return { ...previous, roadmapStatus: "error", roadmapError: error instanceof Error ? error.message : "Replanning failed." };
      }
    });
    setReviewFeeling(null);
    setEndedEarly(false);
  }

  const shell = (children: React.ReactNode) => (
    <main className="workspace-shell roadmap-page">
      <WorkspaceNav active="roadmap-page" />
      <section className="workspace-section roadmap-section">
        <Link className="roadmap-back" to="/app" hash="roadmap-preview">
          ← {t("roadmap.backToPlan")}
        </Link>
        {children}
      </section>
    </main>
  );

  /** One heading per state — the availability step owns its own title. */
  const headingWith = (title: string) => (
    <div className="section-intro">
      <p className="eyebrow">{t("nav.roadmap")}</p>
      <h1>{title}</h1>
      <p className="quiet-note">{t(`roadmap.phase.${phaseFor(profile, setup)}`)}</p>
    </div>
  );
  const heading = headingWith(t("roadmap.title"));

  if (status === "not_ready") {
    return shell(
      <>
        {heading}
        <div className="roadmap-state panel">
          <p className="supporting small">{t("preview.incomplete")}</p>
          <button className="btn-primary dominant" type="button" onClick={() => void navigate({ to: "/app", hash: "profile" })}>
            {t("preview.completeProfile")}
          </button>
        </div>
      </>,
    );
  }

  if (status === "ready_to_build" || status === "error") {
    return shell(
      <>
        {heading}
        <div className="roadmap-ready panel dark-panel">
          <div className="ready-target">
            <p className="eyebrow light">{t("preview.target")}</p>
            <h2>{target.name}</h2>
            <p>{target.program}</p>
          </div>
          {status === "error" && state.roadmapError ? <p className="form-error">{state.roadmapError}</p> : null}
          <div className="ready-cta">
            <button
              className="btn-primary light dominant"
              type="button"
              disabled={!isProfileComplete(profile)}
              onClick={() => update((previous) => ({ ...previous, roadmapStatus: "collecting_availability", roadmapSetup: previous.roadmapSetup ?? defaultSetup(), roadmapError: null }))}
            >
              {t("preview.build")}
            </button>
          </div>
        </div>
      </>,
    );
  }

  if (status === "collecting_availability") {
    const error = availabilityError(setup);
    const weeklyMinutes = capacityMinutes(setup);
    return shell(
      <>
        {headingWith(t("roadmap.availabilityTitle"))}
        <div className="planner-config">
          <div className="planner-head">
            <div>
              <p className="field-label">{t("roadmap.availabilitySupport")}</p>
              <p className="quiet-note">{t("roadmap.availabilityNote")}</p>
            </div>
            <div className="capacity-pill">
              <strong>{formatMinutes(weeklyMinutes)}</strong>
            </div>
          </div>
          <div className="day-grid">
            {days.map((day) => {
              const value = setup.availability[day];
              return (
                <div className={`day-card ${value.enabled ? "" : "rest"}`} key={day}>
                  <div className="day-card-head">
                    <strong>{t(`day.${day}`)}</strong>
                    <div className="mini-segmented">
                      <button type="button" className={value.enabled ? "selected" : ""} onClick={() => patchDay(day, { enabled: true })}>
                        {t("roadmap.available")}
                      </button>
                      <button type="button" className={!value.enabled ? "selected" : ""} onClick={() => patchDay(day, { enabled: false })}>
                        {t("roadmap.restDay")}
                      </button>
                    </div>
                  </div>
                  {value.enabled ? (
                    <div className="day-fields">
                      <label>
                        <span>{t("roadmap.from")}</span>
                        <input type="time" value={value.from} onChange={(event) => patchDay(day, { from: event.target.value })} />
                      </label>
                      <label>
                        <span>{t("roadmap.to")}</span>
                        <input type="time" value={value.to} onChange={(event) => patchDay(day, { to: event.target.value })} />
                      </label>
                      <label>
                        <span>{t("roadmap.maxStudy")}</span>
                        <select value={value.maxHours} onChange={(event) => patchDay(day, { maxHours: Number(event.target.value) })}>
                          {[0.5, 1, 1.5, 2, 2.5, 3, 4].map((hours) => (
                            <option key={hours} value={hours}>
                              {hours}h
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <p className="rest-note">{t("roadmap.restDay")}</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="preferences-grid">
            <div className="pref-block">
              <p className="field-label">{t("roadmap.intensity")}</p>
              <div className="segmented">
                {(["Light", "Balanced", "Intensive", "Custom"] as const).map((option) => (
                  <button type="button" className={setup.intensity === option ? "selected" : ""} key={option} onClick={() => patchSetup({ intensity: option })}>
                    {t(`roadmap.intensity.${option}`)}
                  </button>
                ))}
              </div>
              <label className="toggle-row">
                <input type="checkbox" checked={setup.keepRestDay} onChange={(event) => patchSetup({ keepRestDay: event.target.checked })} /> {t("roadmap.keepRest")}
              </label>
            </div>
            <div className="pref-block">
              <p className="field-label">{t("roadmap.dates")}</p>
              <div className="date-grid">
                <label>
                  <span>{t("roadmap.satDate")}</span>
                  <input type="date" value={setup.satDate ?? ""} onChange={(event) => patchSetup({ satDate: event.target.value })} />
                </label>
                <label>
                  <span>{t("roadmap.englishDate")}</span>
                  <input type="date" value={setup.englishDate ?? ""} onChange={(event) => patchSetup({ englishDate: event.target.value })} />
                </label>
                <label>
                  <span>{t("roadmap.applicationYear")}</span>
                  <input type="number" min={2026} max={2032} value={setup.applicationYear ?? ""} onChange={(event) => patchSetup({ applicationYear: numericText(event.target.value, false).slice(0, 4) })} />
                </label>
              </div>
            </div>
          </div>
          {error || state.roadmapError ? <p className="form-error">{error || state.roadmapError}</p> : null}
          <div className="section-cta">
            <button className="btn-primary dominant" type="button" disabled={Boolean(error)} onClick={() => void generate()}>
              {t("roadmap.generate")}
            </button>
          </div>
        </div>
      </>,
    );
  }

  if (status === "generating" || status === "replanning") {
    return shell(
      <>
        {heading}
        <div className="analysis-screen inline">
          <h2 className="gen-title">{status === "generating" ? t("roadmap.generating") : t("roadmap.replanning")}</h2>
          <div className="analysis-stages">
            {generationStages.map((item, index) => (
              <div key={item} className={index <= stage ? "complete" : ""}>
                <span>{index < stage ? "✓" : index === stage ? "•" : ""}</span>
                <b>{item}</b>
              </div>
            ))}
          </div>
        </div>
      </>,
    );
  }

  const roadmap = state.roadmap;
  if (!roadmap) return shell(heading);
  const week = currentWeek(roadmap);
  const stats = weekStats(week);
  const today = todayName();
  const allocation = weekAreaMinutes(week);
  const reviewOpen = weekEndReached(week, endedEarly);

  return shell(
    <>
      {heading}
      <div className="roadmap-active-head panel dark-panel">
        <div className="active-target">
          <p className="eyebrow light">{t("preview.target")}</p>
          <h2>
            {roadmap.target.name} · {roadmap.target.program}
          </h2>
          <p>{t("roadmap.week", { index: week.index + 1 })}</p>
        </div>
        <div className="active-metrics">
          <Metric value={formatMinutes(week.plannedMinutes)} label={t("preview.thisWeek")} />
          <Metric value={`${stats.tasksDone} / ${stats.tasksTotal}`} label={t("preview.completed")} />
          <Metric value={week.milestone} label={t("preview.nextMilestone")} />
          <Metric value={roadmap.estimate} label={t("roadmap.cycle", { estimate: "" }).replace(":", "").trim()} />
        </div>
        <div className="active-actions">
          <button className="link-button light" type="button" onClick={() => update((previous) => ({ ...previous, roadmapStatus: "collecting_availability" }))}>
            {t("preview.adjust")}
          </button>
          <button
            className="link-button light quiet"
            type="button"
            onClick={() =>
              update((previous) => ({
                ...previous,
                roadmapHistory: previous.roadmap ? [...previous.roadmapHistory, previous.roadmap] : previous.roadmapHistory,
                roadmap: null,
                roadmapStatus: "ready_to_build",
              }))
            }
          >
            {t("roadmap.rebuild")}
          </button>
        </div>
      </div>
      <p className="quiet-note">{t("roadmap.cycleNote")}</p>

      <div className="week-progress">
        <div className="bar">
          <i style={{ width: `${week.plannedMinutes ? (stats.completedMinutes / week.plannedMinutes) * 100 : 0}%` }} />
        </div>
        <span>
          {formatMinutes(stats.completedMinutes)} {t("common.of")} {formatMinutes(week.plannedMinutes)}
        </span>
      </div>

      <div className="section-subhead tight">
        <h2>{t("roadmap.focusTitle")}</h2>
      </div>
      <div className="focus-split">
        {allocation.map((item) => (
          <div key={item.area} className="focus-chip">
            <strong>{formatMinutes(item.minutes)}</strong>
            <span>{item.area}</span>
          </div>
        ))}
      </div>

      <div className="week-days">
        {days.map((day) => {
          const tasks = week.tasks.filter((task) => task.day === day);
          return (
            <div key={day} className={`week-day ${day === today ? "today" : ""} ${tasks.length ? "" : "empty"}`}>
              <div className="week-day-head">
                <strong>{t(`day.${day}`)}</strong>
                <span>{tasks.length ? formatMinutes(tasks.reduce((sum, task) => sum + task.minutes, 0)) : t("roadmap.rest")}</span>
              </div>
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  resource={roadmap.resources[task.resourceId]}
                  onStart={() => setTask(task.id, { status: "in_progress" })}
                  onComplete={() => setTask(task.id, { status: "completed" })}
                  onFeedback={(difficulty) => setTask(task.id, { difficultyFeedback: difficulty })}
                />
              ))}
            </div>
          );
        })}
      </div>

      {reviewOpen ? (
        <WeeklyReview week={week} stats={stats} feeling={reviewFeeling} onFeeling={setReviewFeeling} onPlanNext={() => void replan(reviewFeeling ?? "About right")} />
      ) : (
        <div className="review-locked panel">
          <p className="quiet-note">{t("roadmap.reviewLocked")}</p>
          <button type="button" className="link-button" onClick={() => setEndedEarly(true)}>
            {t("roadmap.endWeekEarly")}
          </button>
        </div>
      )}
    </>,
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/** Collapsed by default: task, time, one instruction, one output, one resource. */
function TaskCard({
  task,
  resource,
  onStart,
  onComplete,
  onFeedback,
}: {
  task: RoadmapTask;
  resource: Resource | undefined;
  onStart: () => void;
  onComplete: () => void;
  onFeedback: (difficulty: Difficulty) => void;
}) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const title = localizedTask(locale, task.templateKey, "title", task.title);
  const instructions = localizedTask(locale, task.templateKey, "instructions", task.instructions);
  const goal = localizedTask(locale, task.templateKey, "goal", task.goal);
  const deliverable = localizedTask(locale, task.templateKey, "deliverable", task.deliverable);

  return (
    <article id={`task-${task.id}`} className={`task-card panel ${task.status}`}>
      <div className="task-top">
        <span>
          {t(`day.${task.day}`)} · {task.minutes} {t("roadmap.minutesShort")}
        </span>
      </div>
      <h3>{title}</h3>
      <p className="task-summary">{instructions.split(". ")[0]}.</p>
      {resource ? (
        <div className="resource compact">
          <a className="link-button" href={resource.url} target="_blank" rel="noreferrer">
            {resource.name} ↗
          </a>
          <small>
            {resource.provider}
            {resource.isFree ? ` · ${t("roadmap.free")}` : ""}
          </small>
        </div>
      ) : null}

      <button type="button" className="link-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? t("roadmap.detailsHide") : t("roadmap.details")}
      </button>
      {open ? (
        <>
          <dl className="task-facts">
            <div>
              <dt>{t("roadmap.what")}</dt>
              <dd>{instructions}</dd>
            </div>
            <div>
              <dt>{t("roadmap.where")}</dt>
              <dd>
                {resource ? (
                  <a href={resource.url} target="_blank" rel="noreferrer">
                    {resource.name} ↗
                  </a>
                ) : (
                  t("roadmap.noResourceNeeded")
                )}
              </dd>
            </div>
            <div>
              <dt>{t("roadmap.output")}</dt>
              <dd>{deliverable}</dd>
            </div>
            <div>
              <dt>{t("roadmap.whyTask")}</dt>
              <dd>{goal}</dd>
            </div>
            {resource ? (
              <div>
                <dt>{t("roadmap.resourceReason")}</dt>
                <dd>{resource.reason}</dd>
              </div>
            ) : null}
          </dl>
        </>
      ) : null}

      {task.status === "planned" ? (
        <div className="task-actions">
          <button type="button" className="btn-primary compact" onClick={onStart}>
            {t("roadmap.startSession")}
          </button>
        </div>
      ) : null}
      {task.status === "in_progress" ? (
        <div className="task-actions">
          <button type="button" className="btn-primary compact" onClick={onComplete}>
            {t("roadmap.markComplete")}
          </button>
        </div>
      ) : null}
      {task.status === "completed" ? (
        <div className="task-actions feedback">
          <strong className="done-label">{t("roadmap.completed")}</strong>
          {!task.difficultyFeedback ? (
            <>
              <span>{t("roadmap.difficulty")}</span>
              {(["Easy", "Okay", "Hard"] as Difficulty[]).map((option) => (
                <button key={option} type="button" onClick={() => onFeedback(option)}>
                  {t(option === "Easy" ? "roadmap.easy" : option === "Okay" ? "roadmap.okay" : "roadmap.hard")}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function WeeklyReview({
  week,
  stats,
  feeling,
  onFeeling,
  onPlanNext,
}: {
  week: Week;
  stats: ReturnType<typeof weekStats>;
  feeling: WeekReview["feeling"] | null;
  onFeeling: (value: WeekReview["feeling"]) => void;
  onPlanNext: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="weekly-review panel">
      <div>
        <p className="eyebrow">{t("roadmap.reviewTitle")}</p>
        <h2>{t("roadmap.reviewHeading", { index: week.index + 1 })}</h2>
      </div>
      <div className="review-grid">
        <Metric value={formatMinutes(week.plannedMinutes)} label={t("roadmap.reviewPlanned")} />
        <Metric value={formatMinutes(stats.completedMinutes)} label={t("roadmap.reviewCompleted")} />
        <Metric value={`${stats.tasksDone} / ${stats.tasksTotal}`} label={t("roadmap.reviewTasks")} />
        <Metric value={stats.tasksDone ? stats.bestArea : "—"} label={t("roadmap.reviewBest")} />
        <Metric value={stats.needsAttention} label={t("roadmap.reviewWorst")} />
      </div>
      <div className="review-feeling">
        <span>{t("roadmap.reviewFeeling")}</span>
        <div className="segmented">
          {(["Too light", "About right", "Too heavy"] as const).map((option) => (
            <button key={option} type="button" className={feeling === option ? "selected" : ""} onClick={() => onFeeling(option)}>
              {t(option === "Too light" ? "roadmap.tooLight" : option === "About right" ? "roadmap.aboutRight" : "roadmap.tooHeavy")}
            </button>
          ))}
        </div>
      </div>
      <div className="section-cta">
        <button className="btn-primary dominant" type="button" disabled={!feeling} onClick={onPlanNext}>
          {t("roadmap.planNext")}
        </button>
      </div>
    </div>
  );
}

function nextFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
