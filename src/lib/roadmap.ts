import { parseScore, priorities, type Intensity, type RoadmapTarget, type StudentProfile, type UniversityResearch } from "./admissions";

export type RoadmapStatus = "not_ready" | "ready_to_build" | "collecting_availability" | "generating" | "active" | "replanning" | "error";

export const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type Day = (typeof days)[number];

export type DayAvailability = { enabled: boolean; from: string; to: string; maxHours: number };
export type Availability = Record<Day, DayAvailability>;

export type RoadmapSetup = {
  availability: Availability;
  intensity: Intensity;
  keepRestDay: boolean;
  satDate?: string;
  englishDate?: string;
  applicationYear?: string;
};

export type Resource = {
  id: string;
  name: string;
  url: string;
  provider: string;
  isFree: boolean;
  reason: string;
  verifiedAt: string;
  test?: string;
  section?: string;
  topic?: string;
};

export type Phase = "foundation" | "build" | "position" | "execute";

export type Area = "SAT Math" | "SAT Reading & Writing" | "SAT Diagnostic" | "IELTS Writing" | "IELTS Speaking" | "IELTS Reading" | "IELTS Listening" | "TOEFL Writing" | "TOEFL Speaking" | "TOEFL Reading" | "TOEFL Listening" | "Duolingo English Test" | "Project evidence" | "Project depth" | "Field alignment" | "Application story" | "University research";

export type TaskStatus = "planned" | "in_progress" | "completed";
export type Difficulty = "Easy" | "Okay" | "Hard";

export type RoadmapTask = {
  id: string;
  week: number;
  day: Day;
  area: Area;
  title: string;
  minutes: number;
  instructions: string;
  goal: string;
  deliverable: string;
  resourceId: string;
  /** Stable key for localization: "<area>#<template index>". */
  templateKey: string;
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
  difficultyFeedback?: Difficulty;
};

export type WeekReview = {
  plannedMinutes: number;
  completedMinutes: number;
  tasksDone: number;
  tasksTotal: number;
  bestArea: string;
  needsAttention: string;
  feeling: "Too light" | "About right" | "Too heavy";
  reviewedAt: string;
};

export type Week = {
  index: number;
  createdAt: string;
  plannedMinutes: number;
  tasks: RoadmapTask[];
  milestone: string;
  review?: WeekReview;
};

export type Roadmap = {
  target: RoadmapTarget;
  generatedAt: string;
  estimate: string;
  weeks: Week[];
  resources: Record<string, Resource>;
  areaWeights: Partial<Record<Area, number>>;
  weeklyCapacityMinutes: number;
  universityEnriched: boolean;
};

export const intensityMultiplier: Record<Intensity, number> = { Light: 0.6, Balanced: 0.8, Intensive: 1, Custom: 0.8 };

export function defaultAvailability(): Availability {
  return Object.fromEntries(days.map((day) => [day, { enabled: day !== "Sunday", from: day === "Saturday" ? "10:00" : "17:00", to: day === "Saturday" ? "13:00" : "20:00", maxHours: day === "Saturday" ? 2.5 : 1.5 }])) as Availability;
}

export function defaultSetup(): RoadmapSetup {
  return { availability: defaultAvailability(), intensity: "Balanced", keepRestDay: true };
}

export function windowMinutes(day: DayAvailability) {
  const [fromH = 0, fromM = 0] = day.from.split(":").map(Number);
  const [toH = 0, toM = 0] = day.to.split(":").map(Number);
  const span = toH * 60 + toM - (fromH * 60 + fromM);
  return Math.max(0, Math.min(span, Math.round(day.maxHours * 60)));
}

export function availabilityError(setup: RoadmapSetup) {
  const active = days.filter((day) => setup.availability[day].enabled);
  if (!active.length) return "Pick at least one study day.";
  if (active.some((day) => windowMinutes(setup.availability[day]) < 30)) return "Each study day needs at least 30 minutes between From and To.";
  return "";
}

// ---------------------------------------------------------------------------
// Resource catalogue — trusted free providers, URLs verified by request.
// ---------------------------------------------------------------------------
const VERIFIED = "2026-09-18";
const catalogue: Resource[] = [
  { id: "khan-sat-math", name: "Digital SAT Math", url: "https://www.khanacademy.org/test-prep/v2-sat-math", provider: "Khan Academy", isFree: true, reason: "Official College Board partner practice, organised by the exact Math domains the digital SAT tests.", verifiedAt: VERIFIED, test: "SAT", section: "Math" },
  { id: "khan-sat-rw", name: "Digital SAT Reading & Writing", url: "https://www.khanacademy.org/test-prep/v2-sat-reading-and-writing", provider: "Khan Academy", isFree: true, reason: "Skill-by-skill Reading & Writing drills with explanations for every miss.", verifiedAt: VERIFIED, test: "SAT", section: "Reading & Writing" },
  { id: "bluebook", name: "Bluebook practice tests", url: "https://bluebook.collegeboard.org/", provider: "College Board", isFree: true, reason: "The only full-length adaptive practice tests built by the test maker.", verifiedAt: VERIFIED, test: "SAT", section: "Full test" },
  { id: "cb-practice", name: "SAT practice and preparation", url: "https://satsuite.collegeboard.org/sat/practice-preparation", provider: "College Board", isFree: true, reason: "Official guidance on what each section measures and how to review a score report.", verifiedAt: VERIFIED, test: "SAT", section: "Overview" },
  { id: "ielts-samples", name: "Sample test questions", url: "https://ielts.org/take-a-test/preparation-resources/sample-test-questions", provider: "IELTS", isFree: true, reason: "Official sample tasks for all four papers, including Writing Task 1 and 2 prompts with band descriptors.", verifiedAt: VERIFIED, test: "IELTS", section: "All" },
  { id: "ielts-prep", name: "Preparation resources", url: "https://ielts.org/take-a-test/preparation-resources", provider: "IELTS", isFree: true, reason: "Official preparation hub from the test owner with free practice material.", verifiedAt: VERIFIED, test: "IELTS", section: "All" },
  { id: "ets-toefl-tests", name: "Free TOEFL iBT practice tests", url: "https://www.ets.org/toefl/test-takers/ibt/prepare/tests.html", provider: "ETS", isFree: true, reason: "Official practice sets from the test maker, scored like the real exam.", verifiedAt: VERIFIED, test: "TOEFL", section: "All" },
  { id: "ets-toefl-prep", name: "TOEFL iBT preparation", url: "https://www.ets.org/toefl/test-takers/ibt/prepare.html", provider: "ETS", isFree: true, reason: "Official section guides and scoring rubrics for Speaking and Writing.", verifiedAt: VERIFIED, test: "TOEFL", section: "All" },
  { id: "det-practice", name: "Free practice test", url: "https://englishtest.duolingo.com/practice", provider: "Duolingo", isFree: true, reason: "Official adaptive practice that mirrors the real question types.", verifiedAt: VERIFIED, test: "DET", section: "All" },
  { id: "khan-essays", name: "Writing a strong admissions essay", url: "https://www.khanacademy.org/college-careers-more/college-admissions/applying-to-college/admissions-essays/v/writing-a-strong-college-admissions-essay", provider: "Khan Academy", isFree: true, reason: "Free, admissions-officer-led guidance on turning activities into a concrete story.", verifiedAt: VERIFIED, test: "Application", section: "Story" },
  { id: "khan-admissions", name: "College admissions", url: "https://www.khanacademy.org/college-careers-more/college-admissions", provider: "Khan Academy", isFree: true, reason: "Free walkthrough of how applications, activities and evidence are read.", verifiedAt: VERIFIED, test: "Application", section: "Overview" },
  { id: "commonapp-prompts", name: "Essay prompts", url: "https://www.commonapp.org/apply/essay-prompts", provider: "Common App", isFree: true, reason: "The official prompts most English-language applications reuse or adapt.", verifiedAt: VERIFIED, test: "Application", section: "Essay" },
];

function withReason(resource: Resource, reason: string): Resource {
  return { ...resource, reason };
}

export function isValidResourceUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && Boolean(parsed.hostname.includes("."));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Task templates per area. Each area is a sequence, so later weeks progress.
// ---------------------------------------------------------------------------
type Template = { title: string; instructions: string; goal: string; deliverable: string; minutes: number; resource: string; foundation?: boolean };

const templates: Record<Area, Template[]> = {
  "SAT Math": [
    { title: "SAT Math — timed diagnostic module", minutes: 60, instructions: "Complete one timed Math module in Bluebook. Do not pause the clock.", goal: "Get a clean baseline and see which domains lose the most points.", deliverable: "Module score + list of missed question domains.", resource: "bluebook" },
    { title: "SAT Math — Advanced Algebra", minutes: 60, instructions: "Complete 20 targeted advanced-algebra questions (nonlinear equations, systems, functions).", goal: "Identify recurring errors in algebraic manipulation.", deliverable: "20 completed questions + error log with the rule you broke.", resource: "khan-sat-math" },
    { title: "SAT Math — Problem Solving & Data Analysis", minutes: 50, instructions: "Work 15 ratio, percentage and data-table questions. Write the setup before calculating.", goal: "Stop losing points on translation from words to equations.", deliverable: "15 questions + 3 written setup patterns.", resource: "khan-sat-math" },
    { title: "SAT Math — Geometry & Trigonometry", minutes: 50, instructions: "Complete 15 geometry and trig questions. Draw every figure you are not given.", goal: "Close the lowest-volume domain before the next full test.", deliverable: "15 questions + formula sheet in your own words.", resource: "khan-sat-math" },
    { title: "SAT Math — error-log redo", minutes: 45, instructions: "Redo every missed question from this week without notes, then compare to your log.", goal: "Turn corrections into rules you actually apply under time.", deliverable: "Redo score + 5 correction rules.", resource: "khan-sat-math" },
    { title: "SAT Math — full timed section", minutes: 75, instructions: "Take both Math modules back to back in Bluebook, then score and tag every miss.", goal: "Measure real progress against your diagnostic.", deliverable: "Section score + updated error log.", resource: "bluebook" },
    { title: "SAT Math — foundations: linear equations", minutes: 45, instructions: "Work the linear equations and inequalities unit from the start, no skipping.", goal: "Rebuild the base that harder algebra questions depend on.", deliverable: "Unit complete + 10 practice questions.", resource: "khan-sat-math", foundation: true },
  ],
  "SAT Reading & Writing": [
    { title: "SAT R&W — timed diagnostic module", minutes: 45, instructions: "Complete one timed Reading & Writing module in Bluebook.", goal: "See which question types cost you points.", deliverable: "Module score + question-type tally.", resource: "bluebook" },
    { title: "SAT R&W — Standard English Conventions", minutes: 45, instructions: "Complete 20 punctuation and sentence-boundary questions. Name the rule for each answer.", goal: "Make grammar points automatic.", deliverable: "20 questions + rule list.", resource: "khan-sat-rw" },
    { title: "SAT R&W — Craft & Structure", minutes: 45, instructions: "Work 15 words-in-context and text-structure questions. Predict the answer before looking.", goal: "Cut time lost to rereading.", deliverable: "15 questions + prediction accuracy note.", resource: "khan-sat-rw" },
    { title: "SAT R&W — Information & Ideas", minutes: 45, instructions: "Complete 15 command-of-evidence and inference questions.", goal: "Stop picking answers that go beyond the text.", deliverable: "15 questions + error log.", resource: "khan-sat-rw" },
    { title: "SAT R&W — full timed section", minutes: 70, instructions: "Take both R&W modules in Bluebook and score.", goal: "Measure progress against your diagnostic.", deliverable: "Section score + updated tally.", resource: "bluebook" },
    { title: "SAT R&W — foundations: sentence structure", minutes: 40, instructions: "Work the sentence-structure basics unit from the start.", goal: "Rebuild the grammar base.", deliverable: "Unit complete + 10 questions.", resource: "khan-sat-rw", foundation: true },
  ],
  "SAT Diagnostic": [
    { title: "SAT — full Bluebook practice test", minutes: 150, instructions: "Take one full adaptive practice test in Bluebook under real conditions.", goal: "Get a real baseline score before planning section work.", deliverable: "Total score + section scores + list of weakest domains.", resource: "bluebook" },
    { title: "SAT — read your score report", minutes: 40, instructions: "Go through the score report domain by domain and mark your two weakest.", goal: "Turn a number into a plan.", deliverable: "Two named focus domains.", resource: "cb-practice" },
  ],
  "IELTS Writing": [
    { title: "IELTS Writing — Task 2 under time", minutes: 60, instructions: "Write one Task 2 essay in 40 minutes, then mark it against the public band descriptors.", goal: "Find which criterion (task response, coherence, lexis, grammar) caps your band.", deliverable: "One essay + self-band per criterion.", resource: "ielts-samples" },
    { title: "IELTS Writing — Task 1 data description", minutes: 45, instructions: "Describe one chart or process in 20 minutes; then rewrite the overview paragraph twice.", goal: "Nail the overview, the most-missed Task 1 element.", deliverable: "One report + two overview versions.", resource: "ielts-samples" },
    { title: "IELTS Writing — paragraph rebuild", minutes: 45, instructions: "Take your weakest paragraph from this week and rewrite it three times: clearer topic sentence, better linking, more precise verbs.", goal: "Raise coherence and lexical resource.", deliverable: "Three versions + list of upgraded phrases.", resource: "ielts-prep" },
    { title: "IELTS Writing — error-pattern fix", minutes: 40, instructions: "Collect grammar mistakes from your last two essays and write 10 corrected sentences for the top pattern.", goal: "Remove the repeated grammar error.", deliverable: "Error list + 10 corrected sentences.", resource: "ielts-prep" },
    { title: "IELTS Writing — full timed Task 1 + Task 2", minutes: 70, instructions: "Complete both writing tasks in 60 minutes with no breaks.", goal: "Measure progress under real timing.", deliverable: "Two scripts + self-band.", resource: "ielts-samples" },
    { title: "IELTS Writing — foundations: essay structure", minutes: 40, instructions: "Study the Task 2 structure guidance, then outline five essays without writing them.", goal: "Make structure automatic before writing full essays.", deliverable: "Five outlines.", resource: "ielts-prep", foundation: true },
  ],
  "IELTS Speaking": [
    { title: "IELTS Speaking — Part 2 long turn", minutes: 40, instructions: "Record four Part 2 answers (2 minutes each) from sample cue cards. Listen back and note hesitations.", goal: "Sustain fluent speech for the full two minutes.", deliverable: "Four recordings + hesitation notes.", resource: "ielts-samples" },
    { title: "IELTS Speaking — Part 3 depth", minutes: 40, instructions: "Answer eight Part 3 questions; extend each answer with a reason and an example.", goal: "Add depth and range of vocabulary.", deliverable: "Eight recorded answers.", resource: "ielts-samples" },
    { title: "IELTS Speaking — pronunciation pass", minutes: 35, instructions: "Re-record two earlier answers focusing on stress and intonation.", goal: "Lift the pronunciation criterion.", deliverable: "Two improved recordings.", resource: "ielts-prep" },
  ],
  "IELTS Reading": [
    { title: "IELTS Reading — timed passage set", minutes: 60, instructions: "Complete one full Academic Reading test in 60 minutes.", goal: "Fix time allocation across three passages.", deliverable: "Score + time spent per passage.", resource: "ielts-samples" },
    { title: "IELTS Reading — question-type drill", minutes: 40, instructions: "Practise only your weakest question type (True/False/Not Given, matching headings).", goal: "Remove the type that costs most points.", deliverable: "20 questions + technique note.", resource: "ielts-prep" },
  ],
  "IELTS Listening": [
    { title: "IELTS Listening — full timed test", minutes: 40, instructions: "Complete one full Listening test, then replay every missed item.", goal: "Find whether misses come from spelling, speed, or distraction.", deliverable: "Score + miss categories.", resource: "ielts-samples" },
    { title: "IELTS Listening — Section 3 & 4 focus", minutes: 35, instructions: "Practise two academic sections; predict answers from the question stem before audio starts.", goal: "Improve the harder half.", deliverable: "Two sections + prediction notes.", resource: "ielts-prep" },
  ],
  "TOEFL Writing": [
    { title: "TOEFL Writing — integrated task", minutes: 45, instructions: "Complete one integrated writing task with the official timing; check against the rubric.", goal: "Capture lecture points accurately.", deliverable: "One response + rubric self-score.", resource: "ets-toefl-tests" },
    { title: "TOEFL Writing — academic discussion", minutes: 35, instructions: "Write two academic-discussion responses in 10 minutes each.", goal: "Build speed with a clear position.", deliverable: "Two responses.", resource: "ets-toefl-prep" },
  ],
  "TOEFL Speaking": [
    { title: "TOEFL Speaking — tasks 1–4 under time", minutes: 40, instructions: "Record all four speaking tasks with official prep and response times.", goal: "Fit complete answers into 45–60 seconds.", deliverable: "Four recordings + rubric notes.", resource: "ets-toefl-tests" },
  ],
  "TOEFL Reading": [
    { title: "TOEFL Reading — timed passages", minutes: 40, instructions: "Complete two reading passages under time and review every miss.", goal: "Fix pacing and inference errors.", deliverable: "Score + error notes.", resource: "ets-toefl-tests" },
  ],
  "TOEFL Listening": [
    { title: "TOEFL Listening — lecture set", minutes: 40, instructions: "Complete one listening set; take notes with a two-column method.", goal: "Improve note-taking on lectures.", deliverable: "Score + notes page.", resource: "ets-toefl-tests" },
  ],
  "Duolingo English Test": [
    { title: "DET — full practice test", minutes: 60, instructions: "Take the official free practice test in one sitting.", goal: "See your estimated score band and weakest sub-scores.", deliverable: "Estimated score + weakest sub-score.", resource: "det-practice" },
    { title: "DET — writing and speaking samples", minutes: 40, instructions: "Produce three written and three spoken samples on practice prompts.", goal: "Build confidence in the production tasks.", deliverable: "Six samples.", resource: "det-practice" },
  ],
  "Project evidence": [
    { title: "Project — define the measurable result", minutes: 60, instructions: "For your main activity write: who it served, what you built or ran, and one number that changed because of it.", goal: "Turn a vague activity into evidence an admissions reader can weigh.", deliverable: "One-paragraph impact statement with a number.", resource: "khan-admissions" },
    { title: "Project — ship one visible improvement", minutes: 90, instructions: "Spend the block making one concrete improvement to your project and document it (screenshot, link, or photo).", goal: "Create fresh, dated evidence of initiative.", deliverable: "One shareable artefact.", resource: "khan-admissions" },
    { title: "Project — collect proof", minutes: 45, instructions: "Gather links, photos, certificates or messages that prove the result you claimed.", goal: "Back every claim with something checkable.", deliverable: "Proof folder with 3+ items.", resource: "khan-admissions" },
  ],
  "Project depth": [
    { title: "Project depth — take your strongest project one level further", minutes: 75, instructions: "Pick the single strongest project you already have and add one thing it currently lacks: real users, a measurement, an iteration based on feedback, or a second contributor.", goal: "Convert project volume into one piece of deep, checkable evidence.", deliverable: "A dated log of what changed and what it produced.", resource: "khan-admissions" },
    { title: "Project depth — get it in front of real people", minutes: 60, instructions: "Put the project in front of at least five real users or a mentor, collect their reactions and write down what you will change.", goal: "Produce external evidence that the work exists outside your own computer.", deliverable: "Five pieces of feedback + your change list.", resource: "khan-admissions" },
    { title: "Project depth — measure the result", minutes: 50, instructions: "Define one number this project moves (users, time saved, accuracy, money, participants) and measure it before and after your latest change.", goal: "Replace adjectives with a number an admissions reader can weigh.", deliverable: "Before/after number with how you measured it.", resource: "khan-admissions" },
    { title: "Project depth — lead someone else", minutes: 60, instructions: "Bring one more person into the project with a defined responsibility, and run one working session with them.", goal: "Create genuine leadership evidence instead of a claimed role.", deliverable: "Named collaborator + what they own + session notes.", resource: "khan-admissions" },
  ],
  "Field alignment": [
    { title: "Field alignment — start one evidence stream in your intended field", minutes: 60, instructions: "Choose one concrete piece of work that belongs clearly to your intended field and plan it as a multi-week stream, not a one-off.", goal: "Make your intended field visible in what you actually do.", deliverable: "A written plan with a first deliverable and a date.", resource: "khan-admissions" },
    { title: "Field alignment — connect existing work to your field", minutes: 45, instructions: "Take your strongest existing activity and add a component from your intended field to it.", goal: "Reuse momentum instead of starting from zero.", deliverable: "One paragraph describing the new component + first step done.", resource: "khan-admissions" },
    { title: "Field alignment — find one competition or programme in your field", minutes: 45, instructions: "Find one real competition, olympiad, research programme or open-source project in your field, check the entry requirements and register or apply.", goal: "Add external validation inside your field.", deliverable: "Name, deadline and your registration status.", resource: "khan-admissions" },
  ],
  "Application story": [
    { title: "Story — flagship activity in 150 words", minutes: 50, instructions: "Write your strongest activity as: action verb, what you did, for whom, and the result. Cut every adjective.", goal: "Produce the activity description you will actually submit.", deliverable: "150-word description.", resource: "khan-essays" },
    { title: "Story — pick your essay angle", minutes: 45, instructions: "Read the official prompts and outline two possible essays built on real events.", goal: "Choose an angle before drafting.", deliverable: "Two outlines + chosen angle.", resource: "commonapp-prompts" },
    { title: "Story — first draft", minutes: 75, instructions: "Draft the essay in one sitting. No editing until the end.", goal: "Get a full draft to revise.", deliverable: "Complete first draft.", resource: "khan-essays" },
  ],
  "University research": [
    { title: "Target — requirements check", minutes: 45, instructions: "On the official website collect the admission, testing, English, cost and deadline pages for your program.", goal: "Replace assumptions with the university's own numbers.", deliverable: "Five links + the key numbers from each.", resource: "official" },
    { title: "Target — funding and deadlines", minutes: 40, instructions: "Find the official scholarship or financial-aid page and note every deadline that applies to you.", goal: "Know the money and the calendar.", deliverable: "Deadline list + funding options.", resource: "official" },
  ],
};

// ---------------------------------------------------------------------------
// Priority logic: heavier weight to the weakest measured section.
// ---------------------------------------------------------------------------
export function phaseFor(profile: StudentProfile, setup?: RoadmapSetup): Phase {
  const year = Number(setup?.applicationYear ?? "");
  const monthsToApply = Number.isFinite(year) && year > 2000 ? (year - new Date().getFullYear()) * 12 : null;
  if (profile.grade === "Grade 12" || profile.grade === "Gap year" || (monthsToApply !== null && monthsToApply <= 6)) return "execute";
  if (profile.grade === "Grade 11") return "position";
  if (profile.grade === "Grade 10") return "build";
  if (profile.grade === "Grade 9") return "foundation";
  return "build";
}

export type Strategy = { emphasise?: Area[]; phase: Phase };

export function areaWeights(profile: StudentProfile, adjustments: Partial<Record<Area, number>> = {}, strategy?: Strategy): Partial<Record<Area, number>> {
  const weights: Partial<Record<Area, number>> = {};
  const math = parseScore(profile.sat.math);
  const verbal = parseScore(profile.sat.verbal);
  if (profile.sat.status === "Taken" && math !== null && verbal !== null) {
    const mathGap = Math.max(20, 800 - math) ** 1.5;
    const verbalGap = Math.max(20, 800 - verbal) ** 1.5;
    const total = mathGap + verbalGap;
    const testingShare = 0.42 + Math.min(0.15, (1600 - math - verbal) / 4000);
    weights["SAT Math"] = testingShare * (mathGap / total);
    weights["SAT Reading & Writing"] = testingShare * (verbalGap / total);
  } else if (profile.sat.status === "Planning") {
    weights["SAT Diagnostic"] = 0.3;
    weights["SAT Math"] = 0.1;
    weights["SAT Reading & Writing"] = 0.1;
  }
  if (profile.englishTest === "IELTS") {
    const sections = (["writing", "speaking", "reading", "listening"] as const).map((key) => [key, parseScore(profile.ielts[key])] as const);
    const gaps = sections.map(([key, value]) => [key, Math.max(0, 7.5 - (value ?? 6)) + 0.2] as const);
    const total = gaps.reduce((sum, [, gap]) => sum + gap, 0);
    const englishShare = 0.12 + Math.min(0.25, total / 8);
    gaps.forEach(([key, gap]) => {
      const share = englishShare * (gap / total);
      if (share > 0.03) weights[`IELTS ${key.charAt(0).toUpperCase()}${key.slice(1)}` as Area] = share;
    });
  } else if (profile.englishTest === "TOEFL") {
    const sections = (["writing", "speaking", "reading", "listening"] as const).map((key) => [key, parseScore(profile.toefl[key])] as const);
    const gaps = sections.map(([key, value]) => [key, Math.max(0, 27 - (value ?? 20)) + 1] as const);
    const total = gaps.reduce((sum, [, gap]) => sum + gap, 0);
    const englishShare = 0.12 + Math.min(0.25, total / 40);
    gaps.forEach(([key, gap]) => {
      const share = englishShare * (gap / total);
      if (share > 0.03) weights[`TOEFL ${key.charAt(0).toUpperCase()}${key.slice(1)}` as Area] = share;
    });
  } else if (profile.englishTest === "Duolingo English Test") {
    const score = parseScore(profile.det.score) ?? 100;
    weights["Duolingo English Test"] = 0.1 + Math.min(0.25, Math.max(0, 140 - score) / 150);
  }
  const withImpact = profile.activities.filter((activity) => activity.impact.trim()).length;
  weights["Project evidence"] = !profile.activities.length ? 0.2 : withImpact ? 0.08 : 0.15;
  weights["Application story"] = 0.08;
  weights["University research"] = 0.06;

  // Grade awareness: a Grade 9 plan is skill building, a Grade 12 plan is execution.
  const phase = strategy?.phase ?? phaseFor(profile);
  if (phase === "foundation") {
    delete weights["Application story"];
    weights["University research"] = 0.04;
    weights["Project depth"] = profile.activities.length ? 0.16 : 0.1;
    weights["Field alignment"] = 0.12;
    if (profile.sat.status === "Not taken") {
      delete weights["SAT Math"];
      delete weights["SAT Reading & Writing"];
      delete weights["SAT Diagnostic"];
    }
  } else if (phase === "build") {
    weights["Application story"] = 0.04;
    weights["Project depth"] = profile.activities.length ? 0.16 : 0.08;
    weights["Field alignment"] = 0.1;
  } else if (phase === "position") {
    weights["Application story"] = 0.1;
    weights["University research"] = 0.08;
    weights["Project depth"] = profile.activities.length ? 0.14 : 0.08;
  } else {
    weights["Application story"] = 0.26;
    weights["University research"] = 0.14;
    weights["Project depth"] = 0.04;
    delete weights["Field alignment"];
  }
  for (const area of strategy?.emphasise ?? []) {
    weights[area] = (weights[area] ?? 0.08) * 1.8;
  }
  for (const [area, factor] of Object.entries(adjustments) as Array<[Area, number]>) {
    if (weights[area] !== undefined) weights[area] = weights[area]! * factor;
  }
  const total = Object.values(weights).reduce((sum, value) => sum + (value ?? 0), 0);
  for (const key of Object.keys(weights) as Area[]) weights[key] = (weights[key] ?? 0) / total;
  return weights;
}

export function capacityMinutes(setup: RoadmapSetup) {
  const enabledDays = studyDays(setup);
  const raw = enabledDays.reduce((sum, day) => sum + windowMinutes(setup.availability[day]), 0);
  return Math.round(raw * intensityMultiplier[setup.intensity]);
}

export function studyDays(setup: RoadmapSetup): Day[] {
  let enabled = days.filter((day) => setup.availability[day].enabled);
  if (setup.keepRestDay && enabled.length === 7) {
    const smallest = [...enabled].sort((a, b) => windowMinutes(setup.availability[a]) - windowMinutes(setup.availability[b]))[0]!;
    enabled = enabled.filter((day) => day !== smallest);
  }
  return enabled;
}

type GenerateOptions = {
  profile: StudentProfile;
  target: RoadmapTarget;
  setup: RoadmapSetup;
  university: UniversityResearch | null;
  weekIndex?: number;
  previous?: Roadmap;
  adjustments?: Partial<Record<Area, number>>;
  capacityFactor?: number;
  foundationAreas?: Area[];
  strategy?: Strategy;
};

function buildWeek({ profile, target, setup, university, weekIndex = 0, previous, adjustments = {}, capacityFactor = 1, foundationAreas = [], strategy }: GenerateOptions, resources: Record<string, Resource>) {
  const weights = areaWeights(profile, adjustments, strategy ?? { phase: phaseFor(profile, setup) });
  const capacity = Math.round(capacityMinutes(setup) * capacityFactor);
  const dayList = studyDays(setup);
  const dayBudget: Record<string, number> = Object.fromEntries(dayList.map((day) => [day, Math.round(windowMinutes(setup.availability[day]) * intensityMultiplier[setup.intensity] * capacityFactor)]));
  const usedTemplates = new Map<Area, number>();
  previous?.weeks.forEach((week) => week.tasks.forEach((task) => usedTemplates.set(task.area, (usedTemplates.get(task.area) ?? 0) + 1)));
  const areaMinutes = new Map<Area, number>();
  const areaOrder = (Object.entries(weights) as Array<[Area, number]>).sort((a, b) => b[1] - a[1]);
  const tasks: RoadmapTask[] = [];
  const now = new Date().toISOString();
  let dayCursor = 0;
  let guard = 0;
  const remaining = () => capacity - tasks.reduce((sum, task) => sum + task.minutes, 0);

  const nextTemplate = (area: Area) => {
    const list = templates[area];
    if (foundationAreas.includes(area)) {
      const foundationIndex = list.findIndex((item) => item.foundation);
      const foundation = list[foundationIndex];
      if (foundation && !tasks.some((task) => task.area === area && task.title === foundation.title)) {
        return { template: foundation, key: `${area}#${foundationIndex}` };
      }
    }
    const normal = list.filter((item) => !item.foundation);
    const index = ((usedTemplates.get(area) ?? 0) + tasks.filter((task) => task.area === area).length) % normal.length;
    const template = normal[index]!;
    return { template, key: `${area}#${list.indexOf(template)}` };
  };

  while (remaining() >= 30 && guard++ < 40) {
    const area = areaOrder.map(([key, weight]) => ({ key, deficit: weight * capacity - (areaMinutes.get(key) ?? 0) })).sort((a, b) => b.deficit - a.deficit)[0];
    if (!area || area.deficit < 15) break;
    if (area.key === "University research" && !university) {
      areaMinutes.set(area.key, capacity);
      continue;
    }
    const { template, key: templateKey } = nextTemplate(area.key);
    let placed = false;
    for (let attempt = 0; attempt < dayList.length; attempt++) {
      const day = dayList[(dayCursor + attempt) % dayList.length]!;
      const budget = dayBudget[day] ?? 0;
      if (budget < 30) continue;
      const minutes = Math.max(30, Math.min(template.minutes, budget, remaining()));
      const resource = resolveResource(template.resource, area.key, university, resources);
      const task: RoadmapTask = {
        id: `w${weekIndex}-${tasks.length}-${area.key.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        week: weekIndex,
        day,
        area: area.key,
        title: template.title,
        minutes,
        instructions: template.instructions,
        goal: template.goal,
        deliverable: template.deliverable,
        resourceId: resource.id,
        templateKey,
        status: "planned",
      };
      tasks.push(task);
      dayBudget[day] = budget - minutes;
      areaMinutes.set(area.key, (areaMinutes.get(area.key) ?? 0) + minutes);
      dayCursor = (dayCursor + attempt + 1) % dayList.length;
      placed = true;
      break;
    }
    if (!placed) break;
  }
  tasks.sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day));
  const topArea = areaOrder[0]?.[0] ?? "Project evidence";
  const milestone = milestoneFor(topArea, weekIndex);
  const week: Week = { index: weekIndex, createdAt: now, plannedMinutes: tasks.reduce((sum, task) => sum + task.minutes, 0), tasks, milestone };
  return { week, weights, capacity };
}

function milestoneFor(area: Area, weekIndex: number) {
  if (weekIndex === 0) {
    if (area.startsWith("SAT")) return `${area === "SAT Diagnostic" ? "SAT" : area} diagnostic`;
    if (area.startsWith("IELTS") || area.startsWith("TOEFL") || area.startsWith("Duolingo")) return `${area} baseline`;
    return "First measurable project result";
  }
  if (area.startsWith("SAT")) return `${area} timed section, week ${weekIndex + 1}`;
  if (area.startsWith("IELTS") || area.startsWith("TOEFL")) return `${area} timed retest`;
  return "Draft ready for review";
}

function resolveResource(key: string, area: Area, university: UniversityResearch | null, resources: Record<string, Resource>): Resource {
  if (key === "official" && university?.officialWebsite && isValidResourceUrl(university.officialWebsite)) {
    const id = `official-${university.id}`;
    if (!resources[id]) resources[id] = { id, name: "Official website", url: university.officialWebsite, provider: university.name, isFree: true, reason: "Official pages are the only trustworthy source for requirements, cost and deadlines.", verifiedAt: university.researchedAt, test: "University" };
    return resources[id]!;
  }
  const base = catalogue.find((item) => item.id === key) ?? catalogue[0]!;
  const cacheId = `${base.id}:${area}`;
  if (!resources[cacheId]) resources[cacheId] = { ...withReason(base, reasonFor(base, area)), id: cacheId, topic: area };
  return resources[cacheId]!;
}

function reasonFor(resource: Resource, area: Area) {
  if (area === "SAT Math" && resource.id === "khan-sat-math") return "Matches your current Math gap: organised by the exact algebra, data and geometry domains you are losing points on.";
  if (area === "SAT Reading & Writing" && resource.id === "khan-sat-rw") return "Matches your Reading & Writing gap with skill-level drills and explanations.";
  if (resource.id === "bluebook") return "Real adaptive timing is the only way to measure progress in this area.";
  if (area.startsWith("IELTS Writing")) return "Official Task 1 and Task 2 prompts plus band descriptors — the criteria your Writing band is judged on.";
  if (area.startsWith("IELTS")) return `Official ${area.replace("IELTS ", "")} samples from the test owner.`;
  if (area.startsWith("TOEFL")) return `Official ${area.replace("TOEFL ", "")} practice scored like the real exam.`;
  return resource.reason;
}

export function generateRoadmap(options: GenerateOptions): Roadmap {
  const resources: Record<string, Resource> = {};
  const { week, weights, capacity } = buildWeek(options, resources);
  if (!week.tasks.length) throw new Error("Not enough available time to place a single session. Add at least 30 minutes on one day.");
  for (const resource of Object.values(resources)) if (!isValidResourceUrl(resource.url)) throw new Error(`Resource URL failed validation: ${resource.name}`);
  const totalDemand = priorities(options.profile).reduce((sum, item) => sum + item.severity, 0.4) * 900;
  const weeks = Math.max(6, Math.round(totalDemand / Math.max(capacity, 120)));
  const low = Math.max(4, Math.round(weeks * 0.8));
  const high = Math.round(weeks * 1.3);
  return {
    target: options.target,
    generatedAt: new Date().toISOString(),
    estimate: `${low}–${high} weeks`,
    weeks: [week],
    resources,
    areaWeights: weights,
    weeklyCapacityMinutes: capacity,
    universityEnriched: Boolean(options.university),
  };
}

/** Actual planned minutes per area this week — used instead of opaque percentages. */
export function weekAreaMinutes(week: Week): Array<{ area: Area; minutes: number }> {
  const totals = new Map<Area, number>();
  week.tasks.forEach((task) => totals.set(task.area, (totals.get(task.area) ?? 0) + task.minutes));
  return [...totals.entries()].map(([area, minutes]) => ({ area, minutes })).sort((a, b) => b.minutes - a.minutes);
}

/** Has the planned week actually elapsed (or been ended early by the student)? */
export function weekEndReached(week: Week, endedEarly = false) {
  if (endedEarly) return true;
  const created = new Date(week.createdAt).getTime();
  const elapsedDays = (Date.now() - created) / 86400000;
  const stats = weekStats(week);
  return elapsedDays >= 7 || (stats.tasksTotal > 0 && stats.tasksDone === stats.tasksTotal);
}

export function currentWeek(roadmap: Roadmap) {
  return roadmap.weeks[roadmap.weeks.length - 1]!;
}

export function weekStats(week: Week) {
  const completed = week.tasks.filter((task) => task.status === "completed");
  const completedMinutes = completed.reduce((sum, task) => sum + task.minutes, 0);
  const byArea = new Map<Area, { planned: number; done: number }>();
  week.tasks.forEach((task) => {
    const entry = byArea.get(task.area) ?? { planned: 0, done: 0 };
    entry.planned += task.minutes;
    if (task.status === "completed") entry.done += task.minutes;
    byArea.set(task.area, entry);
  });
  const ranked = [...byArea.entries()].map(([area, entry]) => ({ area, ratio: entry.planned ? entry.done / entry.planned : 0, planned: entry.planned }));
  const best = [...ranked].sort((a, b) => b.ratio - a.ratio || b.planned - a.planned)[0];
  const worst = [...ranked].sort((a, b) => a.ratio - b.ratio || b.planned - a.planned)[0];
  return { completedMinutes, tasksDone: completed.length, tasksTotal: week.tasks.length, bestArea: best?.area ?? "—", needsAttention: worst?.area ?? "—" };
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Task lifecycle: planned → in_progress → completed (+ optional difficulty). History is never rewritten. */
export function updateTask(roadmap: Roadmap, taskId: string, change: Partial<Pick<RoadmapTask, "status" | "difficultyFeedback">>): Roadmap {
  const now = new Date().toISOString();
  return {
    ...roadmap,
    weeks: roadmap.weeks.map((week) => ({
      ...week,
      tasks: week.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const next: RoadmapTask = { ...task, ...change };
        if (change.status === "in_progress" && !task.startedAt) next.startedAt = now;
        if (change.status === "completed" && !task.completedAt) next.completedAt = now;
        return next;
      }),
    })),
  };
}

/**
 * Replan: close the current week with a review and generate the next one.
 * Weights and capacity adapt to what actually happened; completed weeks stay untouched.
 */
export function planNextWeek(roadmap: Roadmap, profile: StudentProfile, setup: RoadmapSetup, university: UniversityResearch | null, feeling: WeekReview["feeling"]): Roadmap {
  const week = currentWeek(roadmap);
  const stats = weekStats(week);
  const review: WeekReview = { plannedMinutes: week.plannedMinutes, completedMinutes: stats.completedMinutes, tasksDone: stats.tasksDone, tasksTotal: stats.tasksTotal, bestArea: stats.bestArea, needsAttention: stats.needsAttention, feeling, reviewedAt: new Date().toISOString() };
  const adjustments: Partial<Record<Area, number>> = {};
  const foundationAreas: Area[] = [];
  const areas = [...new Set(week.tasks.map((task) => task.area))];
  for (const area of areas) {
    const tasks = week.tasks.filter((task) => task.area === area);
    const done = tasks.filter((task) => task.status === "completed");
    const hard = done.filter((task) => task.difficultyFeedback === "Hard").length;
    const easy = done.filter((task) => task.difficultyFeedback === "Easy").length;
    let factor = 1;
    if (done.length && easy >= Math.ceil(done.length / 2) && easy >= 2) factor *= 0.75; // improving quickly → fewer hours
    if (done.length && hard >= Math.ceil(done.length / 2)) { factor *= 1.2; foundationAreas.push(area); } // repeatedly hard → foundation work
    if (done.length < tasks.length && done.length >= 1 && area === stats.needsAttention) factor *= 1.15; // still weak → more time
    adjustments[area] = factor;
  }
  const completionRatio = stats.tasksTotal ? stats.tasksDone / stats.tasksTotal : 1;
  let capacityFactor = 1;
  if (feeling === "Too heavy" || completionRatio < 0.5) capacityFactor = 0.8;
  else if (feeling === "Too light" && completionRatio >= 0.85) capacityFactor = 1.15;
  const closed: Week = { ...week, review };
  const history: Roadmap = { ...roadmap, weeks: [...roadmap.weeks.slice(0, -1), closed] };
  const resources = { ...roadmap.resources };
  const { week: nextWeek, weights, capacity } = buildWeek({ profile, target: roadmap.target, setup, university, weekIndex: week.index + 1, previous: history, adjustments, capacityFactor, foundationAreas, strategy: { phase: phaseFor(profile, setup) } }, resources);
  return { ...history, weeks: [...history.weeks, nextWeek], resources, areaWeights: weights, weeklyCapacityMinutes: capacity, universityEnriched: Boolean(university) };
}

/** When university research arrives later, add its tasks to the current week without touching completed ones. */
export function enrichWithUniversity(roadmap: Roadmap, university: UniversityResearch, setup: RoadmapSetup): Roadmap {
  if (roadmap.universityEnriched) return roadmap;
  const week = currentWeek(roadmap);
  const resources = { ...roadmap.resources };
  const resource = resolveResource("official", "University research", university, resources);
  const template = templates["University research"][0]!;
  const day = studyDays(setup).at(-1) ?? "Saturday";
  const task: RoadmapTask = { id: `w${week.index}-uni-${university.id}`, week: week.index, day, area: "University research", title: template.title.replace("Target", university.name), minutes: 45, instructions: template.instructions, goal: template.goal, deliverable: template.deliverable, resourceId: resource.id, templateKey: "University research#0", status: "planned" };
  const tasks = [...week.tasks, task].sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day));
  const updated: Week = { ...week, tasks, plannedMinutes: week.plannedMinutes + task.minutes };
  return { ...roadmap, weeks: [...roadmap.weeks.slice(0, -1), updated], resources, universityEnriched: true };
}

export function todayName(): Day {
  const index = (new Date().getDay() + 6) % 7;
  return days[index]!;
}
