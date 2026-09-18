import {
  academicRatio,
  englishRatio,
  levelRank,
  parseScore,
  satTotal,
  type Activity,
  type Experience,
  type Honor,
  type StudentProfile,
} from "../admissions";

/*
 * StudentEvidence
 *
 * Reads meaning, not counts. Every entry is scored for relevance, depth,
 * duration, ownership, impact, external validation and coherence with the
 * intended field, so "eight shallow projects" never reads as "excellent".
 */

export type Theme =
  | "engineering"
  | "computing"
  | "economics"
  | "business"
  | "research"
  | "mathematics"
  | "natural-science"
  | "medicine"
  | "community"
  | "creative"
  | "languages"
  | "sport"
  | "other";

export type SignalStrength = "strong" | "developing" | "weak";

export type EvidenceItem = {
  id: string;
  kind: "honor" | "activity" | "experience";
  title: string;
  theme: Theme;
  months: number;
  hasLeadership: boolean;
  hasMeasurableImpact: boolean;
  hasExternalValidation: boolean;
  /** Reached people outside the student's own desk (users, audience, team). */
  hasRealAudience: boolean;
  /** Was improved more than once based on feedback. */
  wasIterated: boolean;
  substance: number; // 0–1, how much the student actually described
  relevance: number; // 0–1 against the intended field
  depth: number; // 0–1 composite
};

export type MissingSignal =
  | "measurable-impact"
  | "real-audience"
  | "leadership"
  | "sustained-commitment"
  | "external-validation"
  | "field-evidence"
  | "any-evidence";

export type StudentEvidence = {
  items: EvidenceItem[];
  themes: Array<{ theme: Theme; weight: number }>;
  dominantTheme: Theme | null;
  fieldTheme: Theme;
  majorNarrative: "clear" | "mixed" | "mismatch" | "thin";
  competingTheme: Theme | null;
  depthSignal: SignalStrength;
  leadershipSignal: SignalStrength;
  impactSignal: SignalStrength;
  breadthVsDepth: "breadth-without-depth" | "balanced" | "focused" | "thin";
  deepestItem: EvidenceItem | null;
  demonstratedStrengths: string[];
  missingSignals: MissingSignal[];
  academicSignal: SignalStrength;
  testingSignal: SignalStrength;
  englishSignal: SignalStrength;
  /** Lowest English sub-skill, when one is clearly behind the others. */
  englishWeakness: { label: string; score: number; others: string } | null;
};

const themeWords: Array<[Theme, RegExp]> = [
  ["engineering", /engineer|robot|mechan|electro|circuit|drone|cad|3d print|hardware|construct|aero|auto|manufactur/i],
  ["computing", /program|code|coding|software|app|web|python|java|machine learning|ai|data|algorithm|cyber|it |informat/i],
  ["economics", /econom|olympiad in economics|finance|invest|trading|stock|market analysis/i],
  ["business", /business|startup|start-up|entrepreneur|sales|marketing|company|product manage/i],
  ["research", /research|paper|study|laborator|experiment|thesis|publication|conference/i],
  ["mathematics", /math|olympiad in math|algebra|geometry|calculus/i],
  ["natural-science", /physic|chemis|biolog|astronom|ecolog|environment/i],
  ["medicine", /medic|clinic|hospital|health|first aid|nurs/i],
  ["community", /volunteer|charity|communit|ngo|social|mentor|teach|tutor|fundrais|donat|club president/i],
  ["creative", /design|art|music|film|photo|theatre|draw|writ|poetry|architect/i],
  ["languages", /english|language|debate|speech|model un|mun|translation/i],
  ["sport", /sport|football|basketball|chess|athlet|swim|tennis|judo/i],
];

const leadershipWords = /lead|led|found|co-found|captain|president|head|chair|organis|organiz|manage|mentor|coordinat|director|initiat/i;
const validationWords = /award|prize|winner|won|medal|grant|scholarship|published|accepted|featured|selected|finalist|certificat|patent/i;
const numberPattern = /\b\d[\d.,]*\s*(%|percent|people|users|students|members|participants|customers|schools|hours|kg|usd|\$|₸|tenge|times)?/i;

const fieldThemes: Record<string, Theme> = {
  Engineering: "engineering",
  "Computer Science": "computing",
  Economics: "economics",
  Business: "business",
  Medicine: "medicine",
  Biology: "natural-science",
  Chemistry: "natural-science",
  Physics: "natural-science",
  Mathematics: "mathematics",
  Law: "other",
  Design: "creative",
  Psychology: "other",
};

const relatedThemes: Partial<Record<Theme, Theme[]>> = {
  engineering: ["computing", "mathematics", "natural-science"],
  computing: ["engineering", "mathematics"],
  economics: ["business", "mathematics"],
  business: ["economics"],
  "natural-science": ["research", "mathematics"],
  mathematics: ["computing", "natural-science"],
  medicine: ["natural-science", "research"],
  creative: ["computing"],
};

function classify(text: string): Theme {
  for (const [theme, pattern] of themeWords) {
    if (pattern.test(text)) return theme;
  }
  return "other";
}

function monthsBetween(start: string, end: string) {
  if (!start) return 0;
  const [sy, sm] = start.split("-").map(Number);
  if (!sy || !sm) return 0;
  const endDate = end ? end.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
  const [ey, em] = endDate as [number, number];
  if (!ey || !em) return 0;
  return Math.max(0, (ey - sy) * 12 + (em - sm));
}

function substanceScore(...fields: string[]) {
  const total = fields.join(" ").trim().length;
  return Math.max(0, Math.min(1, total / 220));
}

function relevanceFor(theme: Theme, fieldTheme: Theme) {
  if (theme === fieldTheme) return 1;
  if ((relatedThemes[fieldTheme] ?? []).includes(theme)) return 0.6;
  if (theme === "research") return 0.5;
  return 0.2;
}

function itemFromActivity(activity: Activity, fieldTheme: Theme): EvidenceItem {
  const text = `${activity.name} ${activity.field ?? ""} ${activity.role} ${activity.work} ${activity.impact}`;
  // An explicitly chosen topic wins over guessing the theme from prose.
  const theme = activity.field ? classify(`${activity.field} ${text}`) : classify(text);
  const months = monthsBetween(activity.start, activity.end);
  const teamSize = Number(activity.teamSize ?? "");
  const hasLeadership = leadershipWords.test(`${activity.role} ${activity.work}`) || (Number.isFinite(teamSize) && teamSize >= 2 && /lead|led|found|captain|head|manage/i.test(activity.role));
  const hasMeasurableImpact = numberPattern.test(activity.impact) && Boolean(activity.impact.trim());
  const hasExternalValidation = Boolean(activity.validation?.trim()) || validationWords.test(`${activity.impact} ${activity.work}`);
  const hasRealAudience = Boolean(activity.audience?.trim()) || (Number.isFinite(teamSize) && teamSize >= 2);
  const wasIterated = Boolean(activity.iterations?.trim());
  const substance = substanceScore(activity.work, activity.impact, activity.audience ?? "", activity.iterations ?? "");
  const relevance = relevanceFor(theme, fieldTheme);
  const depth = clamp01(
    0.14 * substance +
      0.22 * Math.min(1, months / 12) +
      0.2 * (hasMeasurableImpact ? 1 : activity.impact.trim() ? 0.4 : 0) +
      0.14 * (hasLeadership ? 1 : 0) +
      0.12 * (hasExternalValidation ? 1 : 0) +
      0.1 * (hasRealAudience ? 1 : 0) +
      0.08 * (wasIterated ? 1 : 0),
  );
  return {
    id: activity.id,
    kind: "activity",
    title: activity.name || "Activity",
    theme,
    months,
    hasLeadership,
    hasMeasurableImpact,
    hasExternalValidation,
    hasRealAudience,
    wasIterated,
    substance,
    relevance,
    depth,
  };
}

function itemFromHonor(honor: Honor, fieldTheme: Theme): EvidenceItem {
  const text = `${honor.title} ${honor.result}`;
  const theme = classify(text);
  const rank = levelRank(honor.level); // 0 school → 4 international
  return {
    id: honor.id,
    kind: "honor",
    title: honor.title || "Honor",
    theme,
    months: 0,
    hasLeadership: false,
    hasMeasurableImpact: /1st|2nd|3rd|first|second|third|gold|silver|bronze|\d+(st|nd|rd|th) place/i.test(honor.result),
    hasExternalValidation: true,
    hasRealAudience: rank >= 1,
    wasIterated: false,
    substance: substanceScore(honor.title, honor.result),
    relevance: relevanceFor(theme, fieldTheme),
    depth: clamp01(0.4 + rank * 0.15),
  };
}

function itemFromExperience(experience: Experience, fieldTheme: Theme): EvidenceItem {
  const text = `${experience.name} ${experience.role} ${experience.contribution} ${experience.result}`;
  const theme = classify(text);
  const hasLeadership = leadershipWords.test(`${experience.role} ${experience.contribution}`);
  const hasMeasurableImpact = Boolean(experience.result.trim()) && numberPattern.test(experience.result);
  return {
    id: experience.id,
    kind: "experience",
    title: experience.name || "Experience",
    theme,
    months: 0,
    hasLeadership,
    hasMeasurableImpact,
    hasExternalValidation: validationWords.test(`${experience.result} ${experience.contribution}`),
    hasRealAudience: true,
    wasIterated: false,
    substance: substanceScore(experience.contribution, experience.result),
    relevance: relevanceFor(theme, fieldTheme),
    depth: clamp01(0.3 + 0.3 * (hasMeasurableImpact ? 1 : 0) + 0.2 * (hasLeadership ? 1 : 0) + 0.2 * substanceScore(experience.contribution)),
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function strength(value: number, strong: number, developing: number): SignalStrength {
  if (value >= strong) return "strong";
  if (value >= developing) return "developing";
  return "weak";
}

export function buildStudentEvidence(profile: StudentProfile): StudentEvidence {
  const fieldTheme = fieldThemes[profile.major] ?? "other";
  const items: EvidenceItem[] = [
    ...profile.activities.map((activity) => itemFromActivity(activity, fieldTheme)),
    ...profile.honors.map((honor) => itemFromHonor(honor, fieldTheme)),
    ...profile.experiences.map((experience) => itemFromExperience(experience, fieldTheme)),
  ];

  const themeTotals = new Map<Theme, number>();
  items.forEach((item) => {
    const weight = 0.5 + item.depth;
    themeTotals.set(item.theme, (themeTotals.get(item.theme) ?? 0) + weight);
  });
  const themes = [...themeTotals.entries()].map(([theme, weight]) => ({ theme, weight })).sort((a, b) => b.weight - a.weight);
  const dominantTheme = themes[0]?.theme ?? null;

  const fieldWeight = themes.filter((entry) => entry.theme === fieldTheme || (relatedThemes[fieldTheme] ?? []).includes(entry.theme)).reduce((sum, entry) => sum + entry.weight, 0);
  const totalWeight = themes.reduce((sum, entry) => sum + entry.weight, 0);
  const fieldShare = totalWeight ? fieldWeight / totalWeight : 0;
  const competing = themes.find((entry) => entry.theme !== fieldTheme && !(relatedThemes[fieldTheme] ?? []).includes(entry.theme))?.theme ?? null;

  const majorNarrative: StudentEvidence["majorNarrative"] =
    items.length < 2 ? "thin" : fieldShare >= 0.6 ? "clear" : fieldShare >= 0.35 ? "mixed" : "mismatch";

  const deepestItem = [...items].sort((a, b) => b.depth - a.depth)[0] ?? null;
  const depthAverage = items.length ? items.reduce((sum, item) => sum + item.depth, 0) / items.length : 0;
  const sustained = items.filter((item) => item.months >= 6).length;
  const withImpact = items.filter((item) => item.hasMeasurableImpact).length;
  const withLeadership = items.filter((item) => item.hasLeadership).length;
  const withValidation = items.filter((item) => item.hasExternalValidation).length;

  const depthSignal = strength(depthAverage + (deepestItem ? deepestItem.depth * 0.3 : 0), 0.75, 0.45);
  const leadershipSignal = strength(withLeadership / Math.max(1, items.length) + (withLeadership ? 0.2 : 0), 0.5, 0.25);
  const impactSignal = strength(withImpact / Math.max(1, items.length) + (withImpact ? 0.15 : 0), 0.5, 0.25);

  const breadthVsDepth: StudentEvidence["breadthVsDepth"] =
    items.length === 0 ? "thin" : items.length >= 4 && depthAverage < 0.45 ? "breadth-without-depth" : items.length <= 2 && depthAverage >= 0.6 ? "focused" : depthAverage >= 0.55 ? "balanced" : items.length >= 4 ? "breadth-without-depth" : "thin";

  const missingSignals: MissingSignal[] = [];
  if (!items.length) missingSignals.push("any-evidence");
  if (items.length && !withImpact) missingSignals.push("measurable-impact");
  if (items.length && !items.some((item) => item.hasRealAudience)) missingSignals.push("real-audience");
  if (items.length && !withLeadership) missingSignals.push("leadership");
  if (items.length && !sustained) missingSignals.push("sustained-commitment");
  if (items.length && !withValidation) missingSignals.push("external-validation");
  if (items.length && fieldShare < 0.35) missingSignals.push("field-evidence");

  const demonstratedStrengths: string[] = [];
  if (withValidation) demonstratedStrengths.push("external-validation");
  if (withLeadership) demonstratedStrengths.push("leadership");
  if (sustained) demonstratedStrengths.push("sustained-commitment");
  if (withImpact) demonstratedStrengths.push("measurable-impact");

  const academic = academicRatio(profile);
  const sat = satTotal(profile);
  const english = englishRatio(profile);

  return {
    items,
    themes,
    dominantTheme,
    fieldTheme,
    majorNarrative,
    competingTheme: majorNarrative === "mismatch" || majorNarrative === "mixed" ? competing : null,
    depthSignal,
    leadershipSignal,
    impactSignal,
    breadthVsDepth,
    deepestItem,
    demonstratedStrengths,
    missingSignals,
    academicSignal: academic === null ? "weak" : strength(academic, 0.85, 0.65),
    testingSignal: sat === null ? (profile.sat.status === "Planning" ? "developing" : "weak") : strength((sat - 800) / 800, 0.7, 0.45),
    englishSignal: english === null ? "weak" : strength(english, 0.78, 0.6),
    englishWeakness: englishWeakness(profile),
  };
}

function englishWeakness(profile: StudentProfile) {
  if (profile.englishTest === "IELTS") {
    const bands: Array<[string, number | null]> = [
      ["Listening", parseScore(profile.ielts.listening)],
      ["Reading", parseScore(profile.ielts.reading)],
      ["Writing", parseScore(profile.ielts.writing)],
      ["Speaking", parseScore(profile.ielts.speaking)],
    ];
    if (bands.some(([, value]) => value === null)) return null;
    const sorted = [...bands].sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
    const lowest = sorted[0]!;
    const rest = sorted.slice(1);
    const average = rest.reduce((sum, [, value]) => sum + (value ?? 0), 0) / rest.length;
    if ((lowest[1] ?? 0) >= average - 1) return null;
    return { label: `IELTS ${lowest[0]}`, score: lowest[1] ?? 0, others: rest.map(([label, value]) => `${label} ${value}`).join(", ") };
  }
  if (profile.englishTest === "TOEFL") {
    const parts: Array<[string, number | null]> = [
      ["Reading", parseScore(profile.toefl.reading)],
      ["Listening", parseScore(profile.toefl.listening)],
      ["Speaking", parseScore(profile.toefl.speaking)],
      ["Writing", parseScore(profile.toefl.writing)],
    ];
    if (parts.some(([, value]) => value === null)) return null;
    const sorted = [...parts].sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
    const lowest = sorted[0]!;
    const rest = sorted.slice(1);
    const average = rest.reduce((sum, [, value]) => sum + (value ?? 0), 0) / rest.length;
    if ((lowest[1] ?? 0) >= average - 4) return null;
    return { label: `TOEFL ${lowest[0]}`, score: lowest[1] ?? 0, others: rest.map(([label, value]) => `${label} ${value}`).join(", ") };
  }
  return null;
}
