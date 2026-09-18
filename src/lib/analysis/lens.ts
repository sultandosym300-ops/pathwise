import type { StudentProfile, UniversityResearch } from "../admissions";

/*
 * UniversityAdmissionsLens
 *
 * What this university *appears* to value.
 *
 * The evidence pipeline is strict and runs in one direction only:
 *
 *   reliable public source about the institution
 *     -> a specific sentence that survives a semantic relevance check
 *       -> a normalized Pathwise interpretation
 *         -> comparison against the student's own evidence
 *
 * A priority is NEVER invented first and then matched to a vaguely related
 * sentence. If no sentence in the source actually supports the priority, the
 * priority is either dropped entirely or downgraded to an explicitly labelled
 * Pathwise interpretation grounded in a structural institutional fact.
 *
 * Priority labels, descriptions and interpretation sentences are localized in
 * the UI through their ids.
 */

export type PriorityId =
  | "academic-strength"
  | "intellectual-curiosity"
  | "meaningful-initiative"
  | "community-contribution"
  | "personal-character"
  | "research-depth"
  | "technical-depth"
  | "hands-on-building"
  | "collaboration"
  | "independent-thinking"
  | "subject-depth"
  | "exam-performance"
  | "english-proficiency"
  | "long-term-commitment"
  | "leadership"
  | "interdisciplinary-thinking"
  | "creative-work";

/** Documented = the source says it. Interpretation = Pathwise inferred it. */
export type InterpretationType = "documented" | "pathwise_interpretation";
export type EvidenceStrength = "direct" | "indirect";
export type Importance = "high" | "medium";

export type SourceKind = "official-website" | "public-record";

export type UniversityPriority = {
  id: PriorityId;
  interpretationType: InterpretationType;
  evidenceStrength: EvidenceStrength;
  importance: Importance;
  sourceKind: SourceKind;
  sourceTitle: string;
  sourceUrl: string;
  /** The exact sentence, or the structural institutional fact, behind this. */
  supportingText: string;
  /** Localization id for the 1–2 sentence Pathwise explanation. */
  reasoningId: string;
  reasoningParams: Record<string, string | number>;
};

export type LensContext = {
  value?: string;
  sourceUrl?: string;
  sourceTitle?: string;
};

export type UniversityAdmissionsLens = {
  universityId: string;
  universityName: string;
  applicationLevel: "undergraduate";
  intendedField: string;
  character: LensCharacter;
  priorities: UniversityPriority[];
  /** How many priorities rest on a sentence that passed the relevance check. */
  documentedCount: number;
  /** Priorities that were considered but discarded for lack of real support. */
  discarded: Array<{ id: PriorityId; reason: string }>;
  academicExpectations: LensContext;
  testingContext: LensContext;
  englishContext: LensContext;
  programSpecificSignals: LensContext;
  financialContext: LensContext;
  sources: Array<{ title: string; url: string }>;
  complete: boolean;
};

export type LensCharacter =
  | "technical-institute"
  | "ancient-collegiate"
  | "holistic-private"
  | "public-flagship"
  | "national-university"
  | "specialist-school";

export const ENGLISH_SPEAKING = new Set(["United States", "United Kingdom", "Canada", "Australia", "Ireland", "New Zealand"]);

function sentences(extract: string) {
  return extract
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 30 && item.length < 320);
}

export function lensCharacter(university: UniversityResearch): LensCharacter {
  const name = university.name.toLowerCase();
  const types = university.typeLabels.join(" ").toLowerCase();
  const text = `${name} ${types}`;
  const extract = (university.extract ?? "").toLowerCase();
  if (/institute of technology|polytechnic|technical university|technological/.test(text)) return "technical-institute";
  if (/school of|conservator|academy of (art|music)|business school/.test(name) && !/university$/.test(name)) return "specialist-school";
  if (/collegiate/.test(extract) && /united kingdom/i.test(university.country ?? "")) return "ancient-collegiate";
  if (/collegiate university/.test(extract)) return "ancient-collegiate";
  if (university.country === "United States") {
    if (/private/.test(extract) || /ivy league/.test(extract)) return "holistic-private";
    return "public-flagship";
  }
  if (/public|state|national/.test(extract) || /national/.test(name)) return "national-university";
  return "national-university";
}

// ---------------------------------------------------------------------------
// Semantic source-to-priority relevance validation
// ---------------------------------------------------------------------------

/**
 * Sentences that describe institutional history, prestige, finance or
 * publishing activity can never justify an admissions priority, however many
 * keywords they happen to contain.
 */
const NEVER_ADMISSIONS =
  /\b(was )?(founded|established|chartered|renamed|merged|relocated|moved)\b|\bin \d{3,4}\b(?!.*(requir|admiss|applicant))|history of|world war|press|publish|endowment|revenue|ranked|ranking|acceptance rate|alumni (include|have included)|nobel (laureates|prize winners) (are|include|have)|net assets|campus covers|square (kilometre|mile|meter|metre)/i;

/** The sentence must connect to applicants, students or teaching to count. */
const APPLICANT_CONTEXT =
  /student|undergraduate|applicant|admission|admit|entrance|entry|apply|applicat|curricul|course|programme|program|teaching|taught|tutorial|seminar|degree|study|studies/i;

type Support = {
  /** What the sentence must actually be about for this priority. */
  core: RegExp;
  /** Extra disqualifiers on top of the global ones. */
  exclude?: RegExp;
};

const support: Record<PriorityId, Support> = {
  "academic-strength": {
    core: /highly selective|selective admission|competitive admission|academic (rigour|rigor|excellence|standards?)|entry requirements?|admission (standards?|requirements?)|minimum grades?/i,
  },
  "exam-performance": {
    core: /entrance exam|admission test|unified national testing|standardi[sz]ed test|entry requirements?|grade requirements?|a-levels?|sat scores?|act scores?|matriculation exam/i,
  },
  "english-proficiency": {
    core: /english[- ](language|taught|medium)|language of instruction is english|english proficiency|english requirement/i,
  },
  "technical-depth": {
    core: /engineering (degrees?|programmes?|programs?|education|courses?)|technical education|applied sciences?|science and technology (programmes?|programs?|education|curricul)/i,
  },
  "hands-on-building": {
    core: /laborator(y|ies) (work|training|courses?)|workshops?|maker ?space|hands-on|practical (training|work|classes)|project-based|prototyp/i,
  },
  "research-depth": {
    // Institutional research activity is NOT evidence that undergraduate
    // applicants are expected to show research. Only student-facing wording.
    core: /undergraduate research|research opportunit(y|ies) for (students|undergraduates)|students (conduct|carry out|participate in|undertake) research|research-(based|led) (teaching|curricul|education)/i,
  },
  "intellectual-curiosity": {
    core: /liberal arts|intellectual (curiosity|inquiry|life)|broad curricul|general education requirement|scholarly inquiry|tutorial system|seminars?/i,
  },
  "independent-thinking": {
    core: /tutorial system|supervision system|self-directed (study|learning)|independent (study|learning|research) (is|forms|remains)/i,
  },
  "subject-depth": {
    core: /admission is (by|organised|organized)|apply (to|for) a (specific )?(course|programme|program|faculty)|course-specific|subject-specific|single-subject|entry is by (faculty|department|programme|program)/i,
  },
  "meaningful-initiative": {
    core: /student(-| )(run|led|founded|initiated)|student (organi[sz]ations?|societies|entrepreneur)|founded by students|extracurricular activities/i,
  },
  "community-contribution": {
    core: /public service|civic (engagement|duty)|community (service|engagement|outreach|projects?)|volunteer(ing|s)?|outreach programme/i,
  },
  "personal-character": {
    core: /residential (college|house) system|house system|collegiate (community|life)|pastoral (care|support)|living and learning/i,
  },
  collaboration: {
    core: /collaborative (projects?|learning|work)|team-based (learning|projects?)|joint (degrees?|programmes?|programs?)|group (projects?|work) (is|are|form)/i,
  },
  leadership: {
    // "alumni include presidents" is prestige, not an applicant expectation.
    core: /student government|student union|leadership (programme|program|development|training)|student leaders/i,
  },
  "long-term-commitment": {
    core: /sustained (commitment|engagement)|long-term commitment|multi-year (project|commitment|programme|program)/i,
  },
  "interdisciplinary-thinking": {
    core: /interdisciplinar|cross-disciplinary|dual degrees?|double majors?|joint honours/i,
  },
  "creative-work": {
    core: /portfolio (review|submission|is required)|studio (work|based|practice)|creative practice|design education|audition/i,
  },
};

export type RelevanceCheck = { supported: boolean; confidence: number; reason: string };

/**
 * Does this exact sentence actually support this exact priority?
 * Returns a confidence and a human-readable reason so unsupported
 * source/priority pairs can be discarded rather than displayed.
 */
export function checkSourceSupportsPriority(id: PriorityId, sentence: string): RelevanceCheck {
  const rule = support[id];
  if (!sentence.trim()) return { supported: false, confidence: 0, reason: "No candidate sentence." };
  if (NEVER_ADMISSIONS.test(sentence)) {
    return { supported: false, confidence: 0, reason: "Sentence describes institutional history or prestige, not admissions." };
  }
  if (rule.exclude?.test(sentence)) {
    return { supported: false, confidence: 0, reason: "Sentence matched a disqualifying context for this priority." };
  }
  if (!rule.core.test(sentence)) {
    return { supported: false, confidence: 0.1, reason: "Sentence does not state this criterion." };
  }
  const applicantRelevant = APPLICANT_CONTEXT.test(sentence);
  if (!applicantRelevant) {
    return { supported: false, confidence: 0.35, reason: "Sentence is about the institution, not about what applicants or students do." };
  }
  return { supported: true, confidence: 0.85, reason: "Sentence states this criterion in an applicant or student context." };
}

/** First sentence in the extract that genuinely supports the priority. */
function findSupportingSentence(extract: string | undefined, id: PriorityId) {
  if (!extract) return null;
  for (const sentence of sentences(extract)) {
    const check = checkSourceSupportsPriority(id, sentence);
    if (check.supported) return { sentence, check };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Interpretation rules — only structural, checkable institutional facts
// ---------------------------------------------------------------------------

type InterpretationRule = {
  id: PriorityId;
  importance: Importance;
  /** May this priority ever be shown as a Pathwise interpretation? */
  allowed: (input: { university: UniversityResearch; character: LensCharacter; profile: StudentProfile }) => boolean;
  /** The structural fact the interpretation rests on. */
  fact: (university: UniversityResearch, character: LensCharacter) => string;
};

const interpretations: InterpretationRule[] = [
  {
    id: "academic-strength",
    importance: "high",
    allowed: () => true,
    fact: (university) =>
      `${university.name} is a degree-granting institution that publishes entry requirements for undergraduate applicants.`,
  },
  {
    id: "technical-depth",
    importance: "high",
    allowed: ({ character }) => character === "technical-institute",
    fact: (university) => `${university.name} is organised as a technical institution (${university.typeLabels.slice(0, 2).join(", ") || "institute of technology"}).`,
  },
  {
    id: "hands-on-building",
    importance: "medium",
    allowed: ({ character }) => character === "technical-institute",
    fact: (university) => `${university.name} is a technical institution whose degrees are built around laboratory and project work.`,
  },
  {
    id: "subject-depth",
    importance: "high",
    allowed: ({ character }) => character === "ancient-collegiate" || character === "specialist-school" || character === "national-university",
    fact: (university) => `Admission to ${university.name} is organised by faculty or programme rather than through one general application.`,
  },
  {
    id: "exam-performance",
    importance: "high",
    allowed: ({ character }) => character === "national-university" || character === "ancient-collegiate" || character === "public-flagship",
    fact: (university) => `${university.name} publishes programme-level entry requirements expressed as measured scores.`,
  },
  {
    id: "english-proficiency",
    importance: "medium",
    allowed: ({ university }) => !ENGLISH_SPEAKING.has(university.country ?? "") && /english|international/i.test(university.extract ?? ""),
    fact: (university) => `${university.name} runs English-language study routes for international applicants.`,
  },
  {
    id: "intellectual-curiosity",
    importance: "high",
    allowed: ({ character }) => character === "holistic-private" || character === "ancient-collegiate",
    fact: (university) => `${university.name} admits undergraduates through a whole-application review rather than an exam score alone.`,
  },
  {
    id: "meaningful-initiative",
    importance: "high",
    allowed: ({ character }) => character === "holistic-private",
    fact: (university) => `${university.name} reviews the whole application, so what an applicant built outside class is read alongside scores.`,
  },
  {
    id: "creative-work",
    importance: "high",
    allowed: ({ profile, character }) => character === "specialist-school" || /design|art/i.test(profile.major),
    fact: (university) => `${university.name} admits to creative programmes where submitted work is part of the application.`,
  },
];

// Priorities with no interpretation rule can ONLY appear when a real sentence
// supports them: research-depth, leadership, collaboration, community
// contribution, personal character, long-term commitment, independent
// thinking and interdisciplinary thinking.
const candidateOrder: PriorityId[] = [
  "academic-strength",
  "technical-depth",
  "subject-depth",
  "exam-performance",
  "research-depth",
  "intellectual-curiosity",
  "meaningful-initiative",
  "hands-on-building",
  "independent-thinking",
  "creative-work",
  "english-proficiency",
  "community-contribution",
  "leadership",
  "collaboration",
  "personal-character",
  "interdisciplinary-thinking",
  "long-term-commitment",
];

const importanceById: Record<PriorityId, Importance> = {
  "academic-strength": "high",
  "technical-depth": "high",
  "subject-depth": "high",
  "exam-performance": "high",
  "research-depth": "high",
  "intellectual-curiosity": "high",
  "meaningful-initiative": "high",
  "hands-on-building": "medium",
  "independent-thinking": "high",
  "creative-work": "high",
  "english-proficiency": "medium",
  "community-contribution": "medium",
  leadership: "medium",
  collaboration: "medium",
  "personal-character": "medium",
  "interdisciplinary-thinking": "medium",
  "long-term-commitment": "medium",
};

/** Build the admissions lens for one researched university. */
export function buildLens(profile: StudentProfile, university: UniversityResearch): UniversityAdmissionsLens {
  const character = lensCharacter(university);
  const recordUrl = university.wikipediaUrl ?? university.officialWebsite ?? "";
  const recordTitle = `Public record: ${university.name}`;
  const siteUrl = university.officialWebsite ?? recordUrl;
  const siteTitle = `${university.name} — official website`;

  const priorities: UniversityPriority[] = [];
  const discarded: Array<{ id: PriorityId; reason: string }> = [];

  for (const id of candidateOrder) {
    if (priorities.length >= 6) break;

    const documented = findSupportingSentence(university.extract, id);
    if (documented) {
      priorities.push({
        id,
        interpretationType: "documented",
        evidenceStrength: "direct",
        importance: importanceById[id],
        sourceKind: university.wikipediaUrl ? "public-record" : "official-website",
        sourceTitle: university.wikipediaUrl ? recordTitle : siteTitle,
        sourceUrl: university.wikipediaUrl ?? siteUrl,
        supportingText: documented.sentence,
        reasoningId: `interpretation.${id}`,
        reasoningParams: { university: university.name },
      });
      continue;
    }

    const rule = interpretations.find((item) => item.id === id);
    if (!rule || !rule.allowed({ university, character, profile })) {
      discarded.push({ id, reason: "No source sentence supports this, and no structural fact justifies it." });
      continue;
    }

    priorities.push({
      id,
      interpretationType: "pathwise_interpretation",
      evidenceStrength: "indirect",
      importance: rule.importance,
      sourceKind: university.officialWebsite ? "official-website" : "public-record",
      sourceTitle: university.officialWebsite ? siteTitle : recordTitle,
      sourceUrl: siteUrl,
      supportingText: rule.fact(university, character),
      reasoningId: `interpretation.${id}`,
      reasoningParams: { university: university.name },
    });
  }

  const ordered = [...priorities].sort(
    (a, b) =>
      Number(b.interpretationType === "documented") - Number(a.interpretationType === "documented") ||
      Number(b.importance === "high") - Number(a.importance === "high"),
  );

  const sources: Array<{ title: string; url: string }> = [];
  if (university.officialWebsite) sources.push({ title: siteTitle, url: university.officialWebsite });
  if (university.wikipediaUrl) sources.push({ title: recordTitle, url: university.wikipediaUrl });

  const officialContext = (): LensContext => (university.officialWebsite ? { sourceUrl: university.officialWebsite, sourceTitle: siteTitle } : {});
  const programSentence = sentences(university.extract ?? "").find((sentence) => new RegExp(programRegex(profile.major), "i").test(sentence));

  return {
    universityId: university.id,
    universityName: university.name,
    applicationLevel: "undergraduate",
    intendedField: profile.major,
    character,
    priorities: ordered,
    documentedCount: ordered.filter((item) => item.interpretationType === "documented").length,
    discarded,
    academicExpectations: officialContext(),
    testingContext: officialContext(),
    englishContext: officialContext(),
    programSpecificSignals: programSentence ? { value: programSentence, sourceUrl: recordUrl, sourceTitle: recordTitle } : {},
    financialContext: officialContext(),
    sources,
    complete: ordered.length >= 3,
  };
}

// ---------------------------------------------------------------------------
// Pathwise planning weights — internal, and different per university
// ---------------------------------------------------------------------------

export type WeightKey = "academics" | "testing" | "english" | "activities" | "programFit" | "financialFit";
export type Weights = Record<WeightKey, number>;

const baseWeights: Weights = { academics: 0.22, testing: 0.2, english: 0.15, activities: 0.15, programFit: 0.18, financialFit: 0.1 };

const characterShift: Record<LensCharacter, Partial<Weights>> = {
  "technical-institute": { programFit: 0.06, activities: 0.04, academics: -0.03, english: -0.04, financialFit: -0.03 },
  "ancient-collegiate": { academics: 0.06, testing: 0.05, activities: -0.07, english: -0.02, financialFit: -0.02 },
  "holistic-private": { activities: 0.08, academics: 0.02, testing: -0.05, programFit: -0.04, financialFit: 0.01, english: -0.02 },
  "public-flagship": { academics: 0.03, financialFit: 0.05, activities: -0.03, programFit: -0.03, testing: 0.01, english: -0.03 },
  "national-university": { testing: 0.06, english: 0.05, activities: -0.08, programFit: -0.04, financialFit: 0.03, academics: -0.02 },
  "specialist-school": { programFit: 0.09, activities: 0.05, testing: -0.07, academics: -0.04, english: -0.02, financialFit: -0.01 },
};

/**
 * Internal Pathwise planning weights. They are NOT the university's own
 * formula and no university publishes them. They shift with the institution's
 * admissions character, its language of instruction, the student's testing
 * status and the intended field.
 */
export function pathwiseWeights(profile: StudentProfile, university: UniversityResearch): Weights {
  const character = lensCharacter(university);
  const weights: Weights = { ...baseWeights };
  const shift = characterShift[character];
  (Object.keys(weights) as WeightKey[]).forEach((key) => {
    weights[key] += shift[key] ?? 0;
  });

  // Language of instruction: proof of English matters more where the degree is
  // taught in English to an international applicant.
  if (ENGLISH_SPEAKING.has(university.country ?? "")) weights.english += 0.03;
  else if (!/english/i.test(university.extract ?? "")) weights.english -= 0.03;

  // Testing policy: with no measured score, a test-led system leans harder on
  // the school record instead.
  if (profile.sat.status !== "Taken" && !ENGLISH_SPEAKING.has(university.country ?? "")) {
    weights.testing -= 0.04;
    weights.academics += 0.04;
  }

  // Intended field: portfolio and build-heavy fields weigh evidence higher.
  if (/design|art/i.test(profile.major)) {
    weights.activities += 0.05;
    weights.testing -= 0.05;
  }
  if (/computer science|engineering/i.test(profile.major)) {
    weights.programFit += 0.02;
    weights.financialFit -= 0.02;
  }

  // Funding pressure for the student.
  if (profile.preferences.includes("Financial aid")) {
    weights.financialFit += 0.04;
    weights.programFit -= 0.02;
    weights.academics -= 0.02;
  }

  (Object.keys(weights) as WeightKey[]).forEach((key) => {
    weights[key] = Math.max(0.04, weights[key]);
  });
  const total = (Object.keys(weights) as WeightKey[]).reduce((sum, key) => sum + weights[key], 0);
  (Object.keys(weights) as WeightKey[]).forEach((key) => {
    weights[key] = Math.round((weights[key] / total) * 1000) / 1000;
  });
  return weights;
}

function programRegex(major: string) {
  const map: Record<string, string> = {
    Engineering: "engineering|technolog",
    "Computer Science": "computer|informatics|computing",
    Economics: "economic|finance",
    Business: "business|management",
    Medicine: "medic|health",
    Biology: "biolog|life science",
    Chemistry: "chemis",
    Physics: "physic",
    Mathematics: "mathemat",
    Law: "law|legal",
    Design: "design|architect|art",
    Psychology: "psycholog",
  };
  return map[major] ?? major.toLowerCase().slice(0, 12);
}
