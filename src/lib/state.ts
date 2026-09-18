import { stateKey, type Recommendation, type RoadmapTarget, type StudentProfile, type UniversityResearch } from "./admissions";
import type { Roadmap, RoadmapSetup, RoadmapStatus } from "./roadmap";

export type AppState = {
  onboardingCompleted: boolean;
  studentProfile: StudentProfile | null;
  dreamUniversity: UniversityResearch | null;
  recommendations: Recommendation[];
  recommendationsStatus: "idle" | "researching" | "done";
  savedUniversities: UniversityResearch[];
  compareSelection: [string | null, string | null];
  roadmapTarget: RoadmapTarget | null;
  roadmapStatus: RoadmapStatus;
  roadmapSetup: RoadmapSetup | null;
  roadmap: Roadmap | null;
  roadmapError: string | null;
  roadmapHistory: Roadmap[];
};

export const emptyState = (): AppState => ({
  onboardingCompleted: false,
  studentProfile: null,
  dreamUniversity: null,
  recommendations: [],
  recommendationsStatus: "idle",
  savedUniversities: [],
  compareSelection: [null, null],
  roadmapTarget: null,
  roadmapStatus: "not_ready",
  roadmapSetup: null,
  roadmap: null,
  roadmapError: null,
  roadmapHistory: [],
});

export function loadAppState(): AppState {
  if (typeof window === "undefined") return emptyState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(stateKey) || "{}") as Partial<AppState>;
    const state = { ...emptyState(), ...parsed };
    // Transient statuses never survive a reload.
    if (state.roadmapStatus === "generating" || state.roadmapStatus === "replanning") state.roadmapStatus = state.roadmap ? "active" : "collecting_availability";
    if (state.recommendationsStatus === "researching") state.recommendationsStatus = state.recommendations.length ? "done" : "idle";
    return state;
  } catch {
    return emptyState();
  }
}

export function saveAppState(state: AppState) {
  if (typeof window !== "undefined") window.localStorage.setItem(stateKey, JSON.stringify(state));
}
