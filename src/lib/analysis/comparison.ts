import { alignmentFor, type AlignmentBreakdown, type StudentProfile, type UniversityResearch } from "../admissions";
import { buildStudentEvidence, type SignalStrength, type StudentEvidence } from "./evidence";
import {
  buildLens,
  pathwiseWeights,
  type PriorityId,
  type UniversityAdmissionsLens,
  type UniversityPriority,
  type Weights,
} from "./lens";

/*
 * UniversityProfileComparison
 *
 * Maps every documented university priority onto what this student's evidence
 * actually demonstrates, then names one first move. Text is not produced here:
 * every line is an id plus parameters, so the UI can render it in any locale.
 */

export type NoteId =
  | "academics-strong"
  | "academics-developing"
  | "academics-weak"
  | "testing-strong"
  | "testing-developing"
  | "testing-missing"
  | "english-strong"
  | "english-uneven"
  | "english-weak"
  | "depth-strong"
  | "depth-breadth-without-depth"
  | "depth-thin"
  | "leadership-strong"
  | "leadership-weak"
  | "impact-strong"
  | "impact-missing"
  | "validation-strong"
  | "validation-missing"
  | "field-clear"
  | "field-mixed"
  | "field-mismatch"
  | "curiosity-research"
  | "curiosity-none"
  | "commitment-strong"
  | "commitment-weak";

export type ComparisonItem = {
  priorityId: PriorityId;
  importance: "high" | "medium";
  /** Whether the university side is documented or a Pathwise reading. */
  interpretationType: UniversityPriority["interpretationType"];
  evidenceStrength: UniversityPriority["evidenceStrength"];
  /** What the student's own record demonstrates against it. */
  evidence: SignalStrength;
  noteId: NoteId;
  params: Record<string, string | number>;
  reasoningId: string;
  reasoningParams: Record<string, string | number>;
  source: { url: string; title: string; quote: string };
};

export type MoveId =
  | "deepen-strongest-project"
  | "build-field-evidence"
  | "add-measurable-impact"
  | "take-leadership"
  | "fix-english-subskill"
  | "lift-sat-math"
  | "lift-sat-verbal"
  | "take-sat-diagnostic"
  | "start-first-activity"
  | "application-execution"
  | "protect-academics";

export type UniversityProfileComparison = {
  lens: UniversityAdmissionsLens;
  evidence: StudentEvidence;
  alignment: AlignmentBreakdown;
  /** The internal Pathwise weights actually applied to this university. */
  weights: Weights;
  strongMatches: ComparisonItem[];
  partialMatches: ComparisonItem[];
  importantGaps: ComparisonItem[];
  narrativeMismatch: ComparisonItem | null;
  topPriority: ComparisonItem | null;
  topOpportunity: { moveId: MoveId; params: Record<string, string | number> };
};

function rank(strength: SignalStrength) {
  return strength === "strong" ? 2 : strength === "developing" ? 1 : 0;
}

function evaluate(priority: UniversityPriority, evidence: StudentEvidence, profile: StudentProfile): { evidence: SignalStrength; noteId: NoteId; params: Record<string, string | number> } {
  switch (priority.id) {
    case "academic-strength":
    case "exam-performance": {
      if (priority.id === "exam-performance" && profile.sat.status !== "Taken") {
        return { evidence: evidence.testingSignal, noteId: "testing-missing", params: { status: profile.sat.status } };
      }
      if (priority.id === "exam-performance") {
        const total = Number(profile.sat.math) + Number(profile.sat.verbal);
        return { evidence: evidence.testingSignal, noteId: evidence.testingSignal === "strong" ? "testing-strong" : "testing-developing", params: { total, math: profile.sat.math, verbal: profile.sat.verbal } };
      }
      const note = evidence.academicSignal === "strong" ? "academics-strong" : evidence.academicSignal === "developing" ? "academics-developing" : "academics-weak";
      return { evidence: evidence.academicSignal, noteId: note, params: { gpa: profile.gpa, scale: profile.scale } };
    }
    case "english-proficiency": {
      if (evidence.englishWeakness) {
        return { evidence: "developing", noteId: "english-uneven", params: { skill: evidence.englishWeakness.label, score: evidence.englishWeakness.score, others: evidence.englishWeakness.others } };
      }
      return { evidence: evidence.englishSignal, noteId: evidence.englishSignal === "strong" ? "english-strong" : "english-weak", params: {} };
    }
    case "technical-depth":
    case "subject-depth":
    case "research-depth": {
      if (evidence.majorNarrative === "mismatch" && evidence.competingTheme) {
        return { evidence: "weak", noteId: "field-mismatch", params: { field: profile.major, theme: evidence.competingTheme } };
      }
      if (evidence.depthSignal === "strong") return { evidence: "strong", noteId: "depth-strong", params: { title: evidence.deepestItem?.title ?? "" } };
      if (evidence.breadthVsDepth === "breadth-without-depth") return { evidence: "developing", noteId: "depth-breadth-without-depth", params: { count: evidence.items.length } };
      return { evidence: evidence.depthSignal, noteId: "depth-thin", params: { count: evidence.items.length } };
    }
    case "hands-on-building":
    case "meaningful-initiative": {
      if (evidence.impactSignal === "strong") return { evidence: "strong", noteId: "impact-strong", params: { title: evidence.deepestItem?.title ?? "" } };
      if (evidence.items.length && !evidence.items.some((item) => item.hasMeasurableImpact)) {
        return { evidence: evidence.items.length >= 3 ? "developing" : "weak", noteId: "impact-missing", params: { count: evidence.items.length } };
      }
      return { evidence: evidence.impactSignal, noteId: evidence.items.length ? "depth-breadth-without-depth" : "depth-thin", params: { count: evidence.items.length } };
    }
    case "leadership":
    case "collaboration": {
      return evidence.leadershipSignal === "strong"
        ? { evidence: "strong", noteId: "leadership-strong", params: { count: evidence.items.filter((item) => item.hasLeadership).length } }
        : { evidence: evidence.leadershipSignal, noteId: "leadership-weak", params: {} };
    }
    case "intellectual-curiosity":
    case "independent-thinking":
    case "interdisciplinary-thinking": {
      const research = evidence.items.some((item) => item.theme === "research" || item.hasExternalValidation);
      return research
        ? { evidence: evidence.depthSignal === "weak" ? "developing" : "strong", noteId: "curiosity-research", params: {} }
        : { evidence: "weak", noteId: "curiosity-none", params: {} };
    }
    case "community-contribution": {
      const community = evidence.items.some((item) => item.theme === "community");
      return community
        ? { evidence: "strong", noteId: "impact-strong", params: { title: evidence.items.find((item) => item.theme === "community")?.title ?? "" } }
        : { evidence: "weak", noteId: "impact-missing", params: { count: evidence.items.length } };
    }
    case "long-term-commitment": {
      const sustained = evidence.items.filter((item) => item.months >= 6).length;
      return sustained
        ? { evidence: sustained >= 2 ? "strong" : "developing", noteId: "commitment-strong", params: { count: sustained } }
        : { evidence: "weak", noteId: "commitment-weak", params: {} };
    }
    case "personal-character":
    case "creative-work": {
      const validated = evidence.items.filter((item) => item.hasExternalValidation).length;
      return validated
        ? { evidence: "strong", noteId: "validation-strong", params: { count: validated } }
        : { evidence: "weak", noteId: "validation-missing", params: {} };
    }
    default:
      return { evidence: evidence.depthSignal, noteId: "depth-thin", params: { count: evidence.items.length } };
  }
}

function chooseMove(comparison: Omit<UniversityProfileComparison, "topOpportunity">, profile: StudentProfile): { moveId: MoveId; params: Record<string, string | number> } {
  const { evidence } = comparison;
  if (!evidence.items.length) return { moveId: "start-first-activity", params: { field: profile.major } };
  if (profile.grade === "Grade 12") return { moveId: "application-execution", params: { university: comparison.lens.universityName } };
  if (evidence.majorNarrative === "mismatch" && evidence.competingTheme) {
    return { moveId: "build-field-evidence", params: { field: profile.major, theme: evidence.competingTheme } };
  }
  if (evidence.englishWeakness && evidence.englishWeakness.score <= 5.5) {
    return { moveId: "fix-english-subskill", params: { skill: evidence.englishWeakness.label, score: evidence.englishWeakness.score, others: evidence.englishWeakness.others } };
  }
  if (evidence.breadthVsDepth === "breadth-without-depth") {
    return { moveId: "deepen-strongest-project", params: { title: evidence.deepestItem?.title ?? "", count: evidence.items.length } };
  }
  if (evidence.impactSignal === "weak") return { moveId: "add-measurable-impact", params: { title: evidence.deepestItem?.title ?? "" } };
  if (evidence.leadershipSignal === "weak") return { moveId: "take-leadership", params: { title: evidence.deepestItem?.title ?? "" } };
  if (profile.sat.status !== "Taken") return { moveId: "take-sat-diagnostic", params: {} };
  const math = Number(profile.sat.math);
  const verbal = Number(profile.sat.verbal);
  if (math < verbal) return { moveId: "lift-sat-math", params: { math, verbal } };
  if (verbal < math) return { moveId: "lift-sat-verbal", params: { math, verbal } };
  if (evidence.academicSignal !== "strong") return { moveId: "protect-academics", params: {} };
  return { moveId: "deepen-strongest-project", params: { title: evidence.deepestItem?.title ?? "", count: evidence.items.length } };
}

export function compareProfileToUniversity(
  profile: StudentProfile,
  university: UniversityResearch,
  homeCountry?: string,
  precomputed?: { lens?: UniversityAdmissionsLens; evidence?: StudentEvidence },
): UniversityProfileComparison {
  const lens = precomputed?.lens ?? buildLens(profile, university);
  const evidence = precomputed?.evidence ?? buildStudentEvidence(profile);
  const weights = pathwiseWeights(profile, university);
  const alignment = alignmentFor(profile, university, homeCountry, weights);

  const items: ComparisonItem[] = lens.priorities.map((priority) => {
    const verdict = evaluate(priority, evidence, profile);
    return {
      priorityId: priority.id,
      importance: priority.importance,
      interpretationType: priority.interpretationType,
      evidenceStrength: priority.evidenceStrength,
      evidence: verdict.evidence,
      noteId: verdict.noteId,
      params: verdict.params,
      reasoningId: priority.reasoningId,
      reasoningParams: priority.reasoningParams,
      source: { url: priority.sourceUrl, title: priority.sourceTitle, quote: priority.supportingText },
    };
  });

  const strongMatches = items.filter((item) => item.evidence === "strong");
  const partialMatches = items.filter((item) => item.evidence === "developing");
  const importantGaps = items.filter((item) => item.evidence === "weak");

  const narrativeMismatch: ComparisonItem | null =
    evidence.majorNarrative === "mismatch" || evidence.majorNarrative === "mixed"
      ? {
          priorityId: "subject-depth",
          importance: "high",
          interpretationType: "pathwise_interpretation",
          evidenceStrength: "indirect",
          evidence: evidence.majorNarrative === "mismatch" ? "weak" : "developing",
          noteId: evidence.majorNarrative === "mismatch" ? "field-mismatch" : "field-mixed",
          params: { field: profile.major, theme: evidence.competingTheme ?? evidence.dominantTheme ?? "" },
          reasoningId: "interpretation.subject-depth",
          reasoningParams: { university: lens.universityName },
          source: { url: lens.sources[0]?.url ?? "", title: lens.sources[0]?.title ?? "", quote: "" },
        }
      : null;

  const topPriority =
    [...items]
      .sort((a, b) => Number(b.importance === "high") - Number(a.importance === "high") || rank(a.evidence) - rank(b.evidence))
      .find((item) => item.evidence !== "strong") ?? null;

  const base = { lens, evidence, alignment, weights, strongMatches, partialMatches, importantGaps, narrativeMismatch, topPriority };
  return { ...base, topOpportunity: chooseMove(base, profile) };
}

/** Why one alternative university fits this exact student better or worse. */
export type PersonalFit = {
  whyItFitsThisStudentId: FitReasonId;
  whatItRewardsId: PriorityId | null;
  mainAdvantageId: FitReasonId;
  mainGapId: NoteId;
  mainGapParams: Record<string, string | number>;
  /** How this university's testing expectations compare with the dream one. */
  testingContextId: "testing-closer" | "testing-similar" | "testing-further";
  params: Record<string, string | number>;
};

export type FitReasonId =
  | "applied-technical-environment"
  | "academic-match"
  | "program-strength"
  | "smaller-testing-gap"
  | "same-country-costs"
  | "english-taught-route"
  | "broad-holistic-review";

export function personalFit(
  profile: StudentProfile,
  comparison: UniversityProfileComparison,
  dreamComparison: UniversityProfileComparison,
): PersonalFit {
  const { lens, evidence, alignment } = comparison;
  const testingDelta = alignment.testing - dreamComparison.alignment.testing;
  const academicDelta = alignment.academics - dreamComparison.alignment.academics;

  const why: FitReasonId =
    lens.character === "technical-institute" && (evidence.fieldTheme === "engineering" || evidence.fieldTheme === "computing")
      ? "applied-technical-environment"
      : testingDelta >= 8
        ? "smaller-testing-gap"
        : academicDelta >= 8
          ? "academic-match"
          : lens.character === "holistic-private"
            ? "broad-holistic-review"
            : alignment.programFit >= 70
              ? "program-strength"
              : "same-country-costs";

  const rewarded = comparison.strongMatches[0]?.priorityId ?? comparison.partialMatches[0]?.priorityId ?? null;
  const gap = comparison.importantGaps[0] ?? comparison.partialMatches[0] ?? comparison.topPriority;

  return {
    whyItFitsThisStudentId: why,
    whatItRewardsId: rewarded,
    mainAdvantageId: testingDelta >= 5 ? "smaller-testing-gap" : academicDelta >= 5 ? "academic-match" : why,
    mainGapId: gap?.noteId ?? "depth-thin",
    mainGapParams: gap?.params ?? { count: evidence.items.length },
    testingContextId: testingDelta >= 5 ? "testing-closer" : testingDelta <= -5 ? "testing-further" : "testing-similar",
    params: { university: lens.universityName, field: profile.major, testingDelta: Math.round(testingDelta), academicDelta: Math.round(academicDelta) },
  };
}

/** One personalized sentence for the Compare screen. */
export type CompareTakeaway = {
  id: "ambition-vs-current-fit" | "current-fit-stronger" | "dream-already-aligned" | "both-need-same-work";
  params: Record<string, string | number>;
};

export function compareTakeaway(left: UniversityProfileComparison, right: UniversityProfileComparison): CompareTakeaway {
  const params = { left: left.lens.universityName, right: right.lens.universityName };
  if (left.topOpportunity.moveId === right.topOpportunity.moveId && Math.abs(left.alignment.overall - right.alignment.overall) < 6) {
    return { id: "both-need-same-work", params };
  }
  if (right.alignment.overall - left.alignment.overall >= 6) return { id: "ambition-vs-current-fit", params };
  if (left.alignment.overall - right.alignment.overall >= 6) return { id: "dream-already-aligned", params };
  return { id: "current-fit-stronger", params };
}
