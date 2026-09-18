export type Grade = "Grade 9" | "Grade 10" | "Grade 11" | "Grade 12" | "Gap year" | "Other";
export type Scale = "5-point scale" | "4.0 GPA" | "Percentage" | "IB" | "A-levels" | "Other";
export type SatStatus = "Not taken" | "Planning" | "Taken";
export type EnglishTestType = "IELTS" | "TOEFL" | "Duolingo English Test" | "Not taken";
export type AchievementLevel = "School" | "City" | "Regional" | "National" | "International";
export type Intensity = "Light" | "Balanced" | "Intensive" | "Custom";

/** A factual value that keeps where it came from. */
export type Provenance = {
  value: string;
  sourceUrl: string;
  sourceTitle: string;
  verifiedAt: string;
};

export type UniversityImage = {
  imageUrl: string;
  sourceUrl: string;
  sourceName: string;
  attribution: string;
  universityMatchConfidence: number;
};

export type UniversityResearch = {
  id: string;
  name: string;
  city?: string;
  country?: string;
  locationVerified: boolean;
  officialWebsite?: string;
  wikipediaUrl?: string;
  extract?: string;
  typeLabels: string[];
  /** Canonical parent university when the entity is a school inside one. */
  parentName?: string;
  schoolName?: string;
  image?: UniversityImage;
  fact?: Provenance;
  prominence: number;
  researchedAt: string;
};

export type Candidate = {
  id: string;
  name: string;
  location?: string;
  wikipediaUrl: string;
  officialWebsite: string;
};

export type Honor = { id: string; title: string; level: AchievementLevel; year: string; result: string };
/**
 * `current: true` means the activity is ongoing, and `end` is always empty.
 *
 * The structured fields below exist so the analysis can tell "participated in
 * robotics" apart from "led a 5-person robotics team, built an autonomous robot
 * and won a regional competition" without guessing from prose.
 */
export type Activity = {
  id: string;
  name: string;
  role: string;
  start: string;
  end: string;
  current?: boolean;
  work: string;
  impact: string;
  /** Topic / field this belongs to, used for major-narrative analysis. */
  field?: string;
  teamSize?: string;
  audience?: string;
  iterations?: string;
  validation?: string;
};
export type Experience = { id: string; name: string; role: string; contribution: string; result: string };

export type StudentProfile = {
  grade: Grade | "";
  major: string;
  scale: Scale;
  gpa: string;
  sat: { status: SatStatus; math: string; verbal: string };
  englishTest: EnglishTestType;
  ielts: { listening: string; reading: string; writing: string; speaking: string };
  toefl: { reading: string; listening: string; speaking: string; writing: string };
  det: { score: string };
  honors: Honor[];
  activities: Activity[];
  experiences: Experience[];
  preferences: string[];
};

export type AlignmentBreakdown = {
  academics: number;
  testing: number;
  english: number;
  activities: number;
  programFit: number;
  financialFit: number;
  overall: number;
};

export type AlignmentWeights = Record<Exclude<keyof AlignmentBreakdown, "overall">, number>;

/**
 * Starting point for the internal Pathwise planning weights. The weights that
 * are actually applied are adjusted per university and per student by
 * `pathwiseWeights` in analysis/lens.ts — no university publishes these.
 */
export const alignmentWeights: AlignmentWeights = {
  academics: 0.22,
  testing: 0.2,
  english: 0.15,
  activities: 0.15,
  programFit: 0.18,
  financialFit: 0.1,
};

export type Recommendation = {
  id: string;
  university: UniversityResearch;
  program: string;
  alignment: AlignmentBreakdown;
  why: string;
  advantage: string;
  gap: string;
  cost?: Provenance;
  aid?: Provenance;
  deadline?: Provenance;
};

export type RoadmapTarget = { name: string; program: string; universityId: string };

export const brandName = "Pathwise";
export const stateKey = "pathwise:app-state:v2";

export const majors = [
  "Computer Science",
  "Engineering",
  "Economics",
  "Business",
  "Medicine",
  "Biology",
  "Chemistry",
  "Physics",
  "Mathematics",
  "Law",
  "Design",
  "Psychology",
  "Other",
];

export const emptyProfile = (): StudentProfile => ({
  grade: "",
  major: "",
  scale: "5-point scale",
  gpa: "",
  sat: { status: "Not taken", math: "", verbal: "" },
  englishTest: "IELTS",
  ielts: { listening: "", reading: "", writing: "", speaking: "" },
  toefl: { reading: "", listening: "", speaking: "", writing: "" },
  det: { score: "" },
  honors: [],
  activities: [],
  experiences: [],
  preferences: [],
});

export function numericText(value: string, allowDecimal = true) {
  const cleaned = value.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, "")}`;
}

export function parseScore(value: string) {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function rangeError(value: string, min: number, max: number, message: string, step?: number) {
  const number = parseScore(value);
  if (number === null) return message;
  if (number < min || number > max) return message;
  if (step && Math.abs(number / step - Math.round(number / step)) > 0.00001) return message;
  return "";
}

export function scaleBounds(scale: Scale) {
  if (scale === "4.0 GPA") return { min: 0, max: 4, step: 0.01 };
  if (scale === "Percentage") return { min: 0, max: 100, step: 0.1 };
  if (scale === "IB") return { min: 1, max: 45, step: 1 };
  if (scale === "A-levels") return { min: 0, max: 5, step: 1 };
  if (scale === "Other") return { min: 0, max: 100, step: 0.01 };
  return { min: 0, max: 5, step: 0.01 };
}

export function academicError(profile: StudentProfile) {
  const messages: Record<Scale, string> = {
    "5-point scale": "Enter a score from 0 to 5.",
    "4.0 GPA": "Enter a score from 0 to 4.",
    Percentage: "Enter a score from 0 to 100.",
    IB: "Enter an IB score from 1 to 45.",
    "A-levels": "Enter a score from 0 to 5.",
    Other: "Enter a valid numeric score.",
  };
  const { min, max, step } = scaleBounds(profile.scale);
  return rangeError(profile.gpa, min, max, messages[profile.scale], step);
}

/** Academic score normalised to 0–1 regardless of scale. */
export function academicRatio(profile: StudentProfile) {
  const number = parseScore(profile.gpa);
  if (number === null || academicError(profile)) return null;
  const { min, max } = scaleBounds(profile.scale);
  return (number - min) / (max - min);
}

export function satTotal(profile: StudentProfile) {
  if (profile.sat.status !== "Taken") return null;
  const math = parseScore(profile.sat.math);
  const verbal = parseScore(profile.sat.verbal);
  if (math === null || verbal === null) return null;
  return math + verbal;
}

export function satErrors(profile: StudentProfile) {
  if (profile.sat.status !== "Taken") return { math: "", verbal: "" };
  return {
    math: rangeError(profile.sat.math, 200, 800, "Enter a score from 200 to 800.", 10),
    verbal: rangeError(profile.sat.verbal, 200, 800, "Enter a score from 200 to 800.", 10),
  };
}

export function ieltsOverall(profile: StudentProfile) {
  const values = [profile.ielts.listening, profile.ielts.reading, profile.ielts.writing, profile.ielts.speaking].map(parseScore);
  if (values.some((value) => value === null)) return null;
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 4;
  return Math.round(total * 2) / 2;
}

export function ieltsErrors(profile: StudentProfile) {
  if (profile.englishTest !== "IELTS") return {} as Record<keyof StudentProfile["ielts"], string>;
  return Object.fromEntries(
    Object.entries(profile.ielts).map(([key, value]) => [key, rangeError(value, 0, 9, "Choose a band from 0 to 9.", 0.5)]),
  ) as Record<keyof StudentProfile["ielts"], string>;
}

export function toeflTotal(profile: StudentProfile) {
  const values = [profile.toefl.reading, profile.toefl.listening, profile.toefl.speaking, profile.toefl.writing].map(parseScore);
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function toeflErrors(profile: StudentProfile) {
  if (profile.englishTest !== "TOEFL") return {} as Record<keyof StudentProfile["toefl"], string>;
  return Object.fromEntries(
    Object.entries(profile.toefl).map(([key, value]) => [key, rangeError(value, 0, 30, "Enter a score from 0 to 30.", 1)]),
  ) as Record<keyof StudentProfile["toefl"], string>;
}

export function detError(profile: StudentProfile) {
  if (profile.englishTest !== "Duolingo English Test") return "";
  return rangeError(profile.det.score, 10, 160, "Enter a score from 10 to 160.", 5);
}

export function isAcademicsValid(profile: StudentProfile) {
  const sat = satErrors(profile);
  const ielts = ieltsErrors(profile);
  const toefl = toeflErrors(profile);
  return (
    !academicError(profile) &&
    !sat.math &&
    !sat.verbal &&
    Object.values(ielts).every((error) => !error) &&
    Object.values(toefl).every((error) => !error) &&
    !detError(profile)
  );
}

/*
 * Structured evidence validation.
 *
 * Draft entries may exist while editing, but nothing invalid is ever saved or
 * fed to the analysis: a honor needs a real title, a level and a plausible
 * year; an activity needs a name, at least one substantive field and a
 * chronologically possible date range; an experience needs a context plus a
 * role, contribution or result.
 */

const PLACEHOLDER_TITLE = /^(untitled|unnamed|none|n\/?a|-+|\.+)$/i;

export function honorYearError(year: string) {
  if (!year.trim()) return "Add the year you received this.";
  const value = Number(year);
  const thisYear = new Date().getFullYear();
  if (!Number.isFinite(value) || value < thisYear - 12 || value > thisYear + 1) {
    return `Enter a year between ${thisYear - 12} and ${thisYear + 1}.`;
  }
  return "";
}

export function honorErrors(honor: Honor) {
  return {
    title: !honor.title.trim() || PLACEHOLDER_TITLE.test(honor.title.trim()) ? "Add the name of this honor." : "",
    year: honorYearError(honor.year),
  };
}

/** Month inputs are "YYYY-MM", so a plain string comparison is chronological. */
export function activityDateError(activity: Activity) {
  if (activity.current) return "";
  if (!activity.start || !activity.end) return "";
  if (activity.end < activity.start) return "End date cannot be earlier than start date.";
  return "";
}

export function activityErrors(activity: Activity) {
  const substance = activity.role.trim() || activity.work.trim() || activity.impact.trim();
  return {
    name: !activity.name.trim() || PLACEHOLDER_TITLE.test(activity.name.trim()) ? "Add a name for this project or activity." : "",
    detail: substance ? "" : "Add your role, what you did, or the result.",
    dates: activityDateError(activity),
  };
}

export function experienceErrors(experience: Experience) {
  const substance = experience.role.trim() || experience.contribution.trim() || experience.result.trim();
  return {
    name: !experience.name.trim() ? "Add the organization or context." : "",
    detail: substance ? "" : "Add your role, contribution or result.",
  };
}

export function validHonor(honor: Honor) {
  const errors = honorErrors(honor);
  return Boolean(honor.level.trim()) && !errors.title && !errors.year;
}

export function validActivity(activity: Activity) {
  return Object.values(activityErrors(activity)).every((message) => !message);
}

export function validExperience(experience: Experience) {
  return Object.values(experienceErrors(experience)).every((message) => !message);
}

/** Normalize before persisting: an ongoing activity never keeps an end date. */
export function normalizeActivity(activity: Activity): Activity {
  return activity.current ? { ...activity, end: "" } : activity;
}

export function droppedEntryCount(profile: StudentProfile) {
  return (
    profile.honors.filter((item) => !validHonor(item)).length +
    profile.activities.filter((item) => !validActivity(item)).length +
    profile.experiences.filter((item) => !validExperience(item)).length
  );
}

/** Strip incomplete drafts before anything is persisted to the profile. */
export function sanitizeProfile(profile: StudentProfile): StudentProfile {
  return {
    ...profile,
    honors: profile.honors.filter(validHonor),
    activities: profile.activities.map(normalizeActivity).filter(validActivity),
    experiences: profile.experiences.filter(validExperience),
  };
}

export function isProfileComplete(profile: StudentProfile | null): profile is StudentProfile {
  return Boolean(profile && profile.grade && profile.major && isAcademicsValid(profile));
}

/**
 * How much measured evidence the alignment score actually rests on. With too
 * little, no precise number is shown at all — an honest "incomplete" beats a
 * confident-looking invention.
 */
export function alignmentInputs(profile: StudentProfile) {
  const present = [
    academicRatio(profile) !== null,
    satTotal(profile) !== null,
    englishRatio(profile) !== null,
    profile.activities.length + profile.honors.length + profile.experiences.length > 0,
  ];
  const have = present.filter(Boolean).length;
  return { have, total: present.length, complete: have >= 3, missingAcademics: !present[0], missingTesting: !present[1], missingEnglish: !present[2], missingEvidence: !present[3] };
}

/** English proficiency on a 0–1 scale, whatever test was taken. */
export function englishRatio(profile: StudentProfile) {
  if (profile.englishTest === "IELTS") {
    const overall = ieltsOverall(profile);
    return overall === null ? null : overall / 9;
  }
  if (profile.englishTest === "TOEFL") {
    const total = toeflTotal(profile);
    return total === null ? null : total / 120;
  }
  if (profile.englishTest === "Duolingo English Test") {
    const score = parseScore(profile.det.score);
    return score === null ? null : (score - 10) / 150;
  }
  return null;
}

export type Priority = { area: string; value: string; note: string; severity: number };

/** Ranked list of what the student should work on, with the evidence behind it. */
export function priorities(profile: StudentProfile): Priority[] {
  const list: Priority[] = [];
  const math = parseScore(profile.sat.math);
  const verbal = parseScore(profile.sat.verbal);
  if (profile.sat.status === "Taken" && math !== null && verbal !== null) {
    if (math <= verbal) list.push({ area: "SAT Math", value: String(math), note: `${math} Math vs ${verbal} Reading & Writing.`, severity: (800 - math) / 600 + (verbal - math) / 400 });
    else list.push({ area: "SAT Reading & Writing", value: String(verbal), note: `${verbal} Reading & Writing vs ${math} Math.`, severity: (800 - verbal) / 600 + (math - verbal) / 400 });
  } else if (profile.sat.status === "Planning") {
    list.push({ area: "SAT", value: "Not taken yet", note: "No diagnostic score on record.", severity: 0.9 });
  }
  if (profile.englishTest === "IELTS") {
    const sections = Object.entries(profile.ielts).map(([key, value]) => [key, parseScore(value)] as const).filter((entry): entry is readonly [string, number] => entry[1] !== null);
    const weakest = [...sections].sort((a, b) => a[1] - b[1])[0];
    if (weakest && weakest[1] < 7.5) list.push({ area: `IELTS ${capitalize(weakest[0])}`, value: weakest[1].toFixed(1), note: `${weakest[1].toFixed(1)} ${capitalize(weakest[0])} is your lowest band.`, severity: (7.5 - weakest[1]) / 3 });
  } else if (profile.englishTest === "TOEFL") {
    const sections = Object.entries(profile.toefl).map(([key, value]) => [key, parseScore(value)] as const).filter((entry): entry is readonly [string, number] => entry[1] !== null);
    const weakest = [...sections].sort((a, b) => a[1] - b[1])[0];
    if (weakest && weakest[1] < 26) list.push({ area: `TOEFL ${capitalize(weakest[0])}`, value: String(weakest[1]), note: `${weakest[1]}/30 ${capitalize(weakest[0])} is your lowest section.`, severity: (26 - weakest[1]) / 15 });
  } else if (profile.englishTest === "Duolingo English Test") {
    const score = parseScore(profile.det.score);
    if (score !== null && score < 130) list.push({ area: "Duolingo English Test", value: String(score), note: `${score}/160 is below common 130+ expectations.`, severity: (130 - score) / 60 });
  } else {
    list.push({ area: "English test", value: "Not taken", note: "Most English-taught programs require a score.", severity: 0.8 });
  }
  const withImpact = profile.activities.filter((activity) => activity.impact.trim());
  if (!profile.activities.length) list.push({ area: "Project evidence", value: "None yet", note: "No project or activity on record.", severity: 0.7 });
  else if (!withImpact.length) list.push({ area: "Project evidence", value: "Needs measurable impact", note: `${profile.activities.length} activit${profile.activities.length === 1 ? "y" : "ies"} without a stated result.`, severity: 0.5 });
  return list.sort((a, b) => b.severity - a.severity);
}

export function strongestArea(profile: StudentProfile): { label: string; evidence: string } {
  const math = parseScore(profile.sat.math);
  const verbal = parseScore(profile.sat.verbal);
  const best: Array<{ label: string; evidence: string; score: number }> = [];
  if (profile.sat.status === "Taken" && math !== null && verbal !== null) {
    best.push(math >= verbal ? { label: "SAT Math", evidence: `${math}/800 Math.`, score: math / 800 } : { label: "SAT Reading & Writing", evidence: `${verbal}/800 Reading & Writing.`, score: verbal / 800 });
  }
  const english = englishRatio(profile);
  if (english !== null) {
    const label = profile.englishTest === "IELTS" ? `IELTS ${ieltsOverall(profile)}` : profile.englishTest === "TOEFL" ? `TOEFL ${toeflTotal(profile)}` : `DET ${profile.det.score}`;
    best.push({ label: "English", evidence: `${label} overall.`, score: english });
  }
  const academic = academicRatio(profile);
  if (academic !== null) best.push({ label: "Academics", evidence: `${profile.gpa} on the ${profile.scale}.`, score: academic });
  if (profile.honors.length) {
    const top = [...profile.honors].sort((a, b) => levelRank(b.level) - levelRank(a.level))[0]!;
    best.push({ label: "Recognition", evidence: `${top.level}-level: ${top.title || "honor"}.`, score: 0.6 + levelRank(top.level) * 0.08 });
  }
  if (profile.activities.some((activity) => activity.impact.trim())) best.push({ label: "Project evidence", evidence: `${profile.activities.length} activit${profile.activities.length === 1 ? "y" : "ies"} with stated results.`, score: 0.78 });
  const winner = best.sort((a, b) => b.score - a.score)[0];
  return winner ? { label: winner.label, evidence: winner.evidence } : { label: "Clear direction", evidence: `${profile.major} chosen as the target field.` };
}

export function biggestGap(profile: StudentProfile): { label: string; evidence: string } {
  const first = priorities(profile)[0];
  return first ? { label: first.area, evidence: first.note } : { label: "Application specificity", evidence: "Scores look balanced; the next lever is a sharper story." };
}

export function bestNextMove(profile: StudentProfile) {
  const gap = biggestGap(profile).label;
  if (gap.startsWith("SAT Math")) return "Run a timed Math diagnostic and start an error log.";
  if (gap.startsWith("SAT Reading")) return "Run a timed Reading & Writing module and tag every miss.";
  if (gap === "SAT") return "Take one full Bluebook practice test to get a baseline.";
  if (gap.startsWith("IELTS") || gap.startsWith("TOEFL") || gap.startsWith("Duolingo")) return "Book one focused English practice block this week.";
  if (gap === "English test") return "Pick a test date and take one official sample test.";
  if (gap === "Project evidence") return "Turn one activity into a story with a measurable result.";
  return "Compare requirements and lock one target strategy.";
}

export function levelRank(level: AchievementLevel) {
  return ["School", "City", "Regional", "National", "International"].indexOf(level);
}

export function achievementCount(profile: StudentProfile) {
  return profile.honors.length + profile.activities.length + profile.experiences.length;
}

export function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function majorKeywords(major: string) {
  const map: Record<string, string[]> = {
    Engineering: ["engineering", "technical", "technology", "polytechnic", "institute of technology"],
    "Computer Science": ["computer", "information technology", "technology", "technical", "informatics", "engineering"],
    Economics: ["economics", "economic", "finance", "business"],
    Business: ["business", "management", "economics", "finance"],
    Medicine: ["medical", "medicine", "health"],
    Biology: ["biology", "life sciences", "natural sciences", "science"],
    Chemistry: ["chemistry", "chemical", "natural sciences", "science"],
    Physics: ["physics", "physical", "science", "technical"],
    Mathematics: ["mathematics", "mathematical", "science", "technical"],
    Law: ["law", "legal", "juridical"],
    Design: ["design", "arts", "architecture"],
    Psychology: ["psychology", "social sciences", "humanities"],
  };
  return map[major] ?? [major.toLowerCase()];
}

/** How clearly a university's public description signals the student's field (0–1). */
export function programSignal(profile: StudentProfile, university: UniversityResearch) {
  const text = `${university.name} ${university.typeLabels.join(" ")} ${university.extract ?? ""}`.toLowerCase();
  const keywords = majorKeywords(profile.major);
  const hits = keywords.filter((keyword) => text.includes(keyword)).length;
  const nameHit = keywords.some((keyword) => university.name.toLowerCase().includes(keyword));
  const comprehensive = /national university|state university|university of/i.test(university.name);
  return Math.min(1, 0.45 + hits * 0.12 + (nameHit ? 0.2 : 0) + (comprehensive ? 0.08 : 0));
}

/** Transparent alignment: each dimension is 0–100 and the overall is a weighted average. */
export function alignmentFor(
  profile: StudentProfile,
  university: UniversityResearch,
  homeCountry?: string,
  weights: AlignmentWeights = alignmentWeights,
): AlignmentBreakdown {
  const tier = Math.min(1, Math.log10(Math.max(university.prominence, 5)) / 2.4); // prominence 5 → 0.29, 250 → 1
  const academic = academicRatio(profile) ?? 0.55;
  const academics = clamp(40 + academic * 60 - tier * 8);
  const sat = satTotal(profile);
  const testing = profile.sat.status === "Taken" && sat !== null ? clamp(((sat - 800) / 800) * 100 - tier * 10 + 8) : profile.sat.status === "Planning" ? clamp(50 - tier * 12) : clamp(44 - tier * 10);
  const englishValue = englishRatio(profile);
  const english = englishValue !== null ? clamp(englishValue * 110 - tier * 6) : clamp(38 - tier * 8);
  const impactCount = profile.activities.filter((activity) => activity.impact.trim()).length;
  const activities = clamp(42 + Math.min(profile.activities.length, 3) * 9 + impactCount * 6 + Math.min(profile.honors.length, 3) * 5 + profile.honors.reduce((max, honor) => Math.max(max, levelRank(honor.level)), 0) * 3 - tier * 6);
  const programFit = clamp(programSignal(profile, university) * 100);
  const wantsAid = profile.preferences.includes("Financial aid");
  const domestic = homeCountry && university.country ? homeCountry === university.country : true;
  const financialFit = clamp((domestic ? 74 : 52) - (wantsAid ? 12 : 0) - tier * 8 + (profile.preferences.includes("European alternatives") && !domestic ? 6 : 0));
  const breakdown = { academics, testing, english, activities, programFit, financialFit };
  const overall = Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + breakdown[key as keyof typeof breakdown] * weight, 0));
  return { ...breakdown, overall };
}

function clamp(value: number) {
  return Math.round(Math.max(20, Math.min(96, value)));
}

export function formatLocation(university: Pick<UniversityResearch, "city" | "country" | "locationVerified">) {
  if (!university.locationVerified) return "";
  return [university.city, university.country].filter(Boolean).join(", ");
}

export function testSummary(profile: StudentProfile) {
  const lines: Array<{ label: string; value: string; parts: string[] }> = [];
  if (profile.sat.status === "Taken") lines.push({ label: "SAT", value: String(satTotal(profile) ?? "—"), parts: [`Math ${profile.sat.math}`, `R&W ${profile.sat.verbal}`] });
  else lines.push({ label: "SAT", value: profile.sat.status, parts: [] });
  if (profile.englishTest === "IELTS") lines.push({ label: "IELTS", value: String(ieltsOverall(profile) ?? "—"), parts: [`L ${profile.ielts.listening}`, `R ${profile.ielts.reading}`, `W ${profile.ielts.writing}`, `S ${profile.ielts.speaking}`] });
  else if (profile.englishTest === "TOEFL") lines.push({ label: "TOEFL", value: String(toeflTotal(profile) ?? "—"), parts: [`R ${profile.toefl.reading}`, `L ${profile.toefl.listening}`, `S ${profile.toefl.speaking}`, `W ${profile.toefl.writing}`] });
  else if (profile.englishTest === "Duolingo English Test") lines.push({ label: "DET", value: profile.det.score || "—", parts: [] });
  else lines.push({ label: "English test", value: "Not taken", parts: [] });
  return lines;
}
