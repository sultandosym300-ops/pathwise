import { alignmentFor, majorKeywords, programSignal, type Candidate, type Provenance, type Recommendation, type StudentProfile, type UniversityImage, type UniversityResearch } from "./admissions";
import { pathwiseWeights } from "./analysis/lens";

/*
 * University research pipeline.
 *
 * search (Wikipedia) → entity validation (Wikidata: is a higher-education
 * institution, has an official website, has a verified country) → research
 * (description, matching image, memorable fact) → alignment scoring.
 *
 * Nothing is rendered as a university unless it passed validation.
 */

const WIKIDATA = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";

type Claim = { mainsnak: { datavalue?: { value: unknown } } };
type Entity = {
  id: string;
  labels?: Record<string, { value: string }>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, { title: string }>;
};

const INSTITUTION_LABEL = /universit|college|institute of technology|higher education|polytechnic|school of (engineering|medicine|business|economics|law|design|arts|management)|business school|conservator|medical school|art school/i;
const REJECT_TITLE = /^list of|^lists of|^category:|^portal:|^template:|^outline of|^education in|^higher education in|ranking|^top |universities in|colleges in|^timeline of|^history of/i;
/** Names that are never an undergraduate institution, even with a university-like type. */
const REJECT_NAME = /university press|\bpress\b|publish|national academy of|academy of sciences|learned society|research institute|institute of history|museum|library|foundation|association|council|observatory|hospital trust|news|magazine|journal/i;
/** Wikidata type labels that disqualify an entity. */
/**
 * A core higher-education type outranks incidental extra types. Wikidata tags
 * MIT as an academic publisher too; that must never disqualify the university.
 */
const CORE_INSTITUTION = /universit|institute of technology|polytechnic|\bcollege\b/i;
const REJECT_TYPE = /publish|press|learned society|academy of sciences|research institute|museum|library|archive|city|town|municipalit|association|nonprofit organization$|company|scientific society/i;
const GRADUATE_ONLY = /graduate school|graduate university|postgraduate|business school of management$|school of continuing/i;
const SCHOOL_OF = /school of|college of|faculty of|institute of/i;


const entityCache = new Map<string, Entity | null>();
const labelCache = new Map<string, string>();
const researchCache = new Map<string, UniversityResearch>();

function claimIds(entity: Entity, property: string): string[] {
  return (entity.claims?.[property] ?? [])
    .map((claim) => (claim.mainsnak.datavalue?.value as { id?: string } | undefined)?.id)
    .filter((id): id is string => Boolean(id));
}

function claimStrings(entity: Entity, property: string): string[] {
  return (entity.claims?.[property] ?? [])
    .map((claim) => claim.mainsnak.datavalue?.value)
    .filter((value): value is string => typeof value === "string");
}

async function getJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json();
}

async function fetchEntitiesByTitles(titles: string[]) {
  const missing = titles.filter((title) => !entityCache.has(`title:${title}`));
  if (missing.length) {
    const url = new URL(WIKIDATA);
    url.search = new URLSearchParams({ action: "wbgetentities", sites: "enwiki", titles: missing.join("|"), props: "claims|labels|sitelinks", languages: "en", format: "json", origin: "*" }).toString();
    const data = await getJson(url.toString());
    const entities = Object.values((data?.entities ?? {}) as Record<string, Entity & { missing?: string }>);
    for (const title of missing) {
      const found = entities.find((entity) => !entity.missing && entity.sitelinks?.["enwiki"]?.title.toLowerCase() === title.toLowerCase());
      entityCache.set(`title:${title}`, found ?? null);
    }
  }
  return titles.map((title) => entityCache.get(`title:${title}`) ?? null);
}

async function fetchLabels(ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => !labelCache.has(id));
  for (let index = 0; index < missing.length; index += 50) {
    const chunk = missing.slice(index, index + 50);
    const url = new URL(WIKIDATA);
    url.search = new URLSearchParams({ action: "wbgetentities", ids: chunk.join("|"), props: "labels", languages: "en", format: "json", origin: "*" }).toString();
    const data = await getJson(url.toString());
    for (const entity of Object.values((data?.entities ?? {}) as Record<string, Entity>)) {
      labelCache.set(entity.id, entity.labels?.["en"]?.value ?? "");
    }
  }
  return Object.fromEntries(ids.map((id) => [id, labelCache.get(id) ?? ""]));
}

export type ValidatedEntity = {
  id: string;
  name: string;
  typeLabels: string[];
  officialWebsite: string;
  city?: string;
  country?: string;
  wikipediaTitle: string;
  sitelinkCount: number;
  /** Canonical parent university when this entity is a school/college inside one. */
  parentName?: string;
  parentId?: string;
  schoolName?: string;
  checks: EntityChecks;
};

export type EntityChecks = {
  isDegreeGrantingInstitution: boolean;
  acceptsUndergraduateApplicants: boolean;
  hasOfficialWebsite: boolean;
  officialInstitutionNameVerified: boolean;
  locationVerified: boolean;
  officialDomainVerified: boolean;
};

/**
 * Entity validator. Only degree-granting institutions that admit undergraduates
 * pass. Presses, learned academies, research institutes, museums, directories,
 * ranking pages, cities and graduate-only schools are rejected outright.
 */
async function validateEntities(titles: string[]): Promise<ValidatedEntity[]> {
  const clean = titles.filter((title) => !REJECT_TITLE.test(title) && !REJECT_NAME.test(title));
  if (!clean.length) return [];
  const entities = await fetchEntitiesByTitles(clean);
  const idsToLabel = new Set<string>();
  entities.forEach((entity) => {
    if (!entity) return;
    [...claimIds(entity, "P31"), ...claimIds(entity, "P17"), ...claimIds(entity, "P131"), ...claimIds(entity, "P159"), ...claimIds(entity, "P749")].forEach((id) => idsToLabel.add(id));
  });
  const labels = await fetchLabels([...idsToLabel]);
  const validated: ValidatedEntity[] = [];
  entities.forEach((entity, index) => {
    if (!entity) return;
    const typeLabels = claimIds(entity, "P31").map((id) => labels[id] ?? "").filter(Boolean);
    const officialWebsite = claimStrings(entity, "P856").find((value) => /^https?:\/\//.test(value));
    const fallbackTitle = clean[index] ?? "";
    const name = entity.labels?.["en"]?.value ?? fallbackTitle;
    const country = labels[claimIds(entity, "P17")[0] ?? ""] || undefined;
    const city = labels[claimIds(entity, "P131")[0] ?? claimIds(entity, "P159")[0] ?? ""] || undefined;

    const typeText = typeLabels.join(" ");
    const isCoreInstitution = typeLabels.some((label) => CORE_INSTITUTION.test(label));
    const isDegreeGrantingInstitution =
      typeLabels.some((label) => INSTITUTION_LABEL.test(label)) &&
      (isCoreInstitution || !REJECT_TYPE.test(typeText)) &&
      !REJECT_NAME.test(name);
    const acceptsUndergraduateApplicants = !GRADUATE_ONLY.test(`${name} ${typeText}`);
    const officialDomainVerified = Boolean(officialWebsite && isPublicDomain(officialWebsite));

    const checks: EntityChecks = {
      isDegreeGrantingInstitution,
      acceptsUndergraduateApplicants,
      hasOfficialWebsite: Boolean(officialWebsite),
      officialInstitutionNameVerified: Boolean(entity.labels?.["en"]?.value),
      locationVerified: Boolean(country),
      officialDomainVerified,
    };
    if (!officialWebsite || Object.values(checks).some((passed) => !passed)) return;

    const record: ValidatedEntity = {
      id: entity.id,
      name,
      typeLabels,
      officialWebsite,
      wikipediaTitle: entity.sitelinks?.["enwiki"]?.title ?? fallbackTitle,
      sitelinkCount: Object.keys(entity.sitelinks ?? {}).length,
      checks,
    };
    if (city) record.city = city;
    if (country) record.country = country;
    const parentId = claimIds(entity, "P749")[0];
    const parentName = parentId ? labels[parentId] : undefined;
    if (parentName && /universit|college|institute/i.test(parentName) && SCHOOL_OF.test(name)) {
      record.parentId = parentId!;
      record.parentName = parentName;
      record.schoolName = name.replace(new RegExp(`^${escapeRegex(parentName)}\\s*`, "i"), "").trim() || name;
    }
    validated.push(record);
  });
  return validated;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPublicDomain(url: string) {
  try {
    const { hostname, protocol } = new URL(url);
    return /^https?:$/.test(protocol) && hostname.includes(".") && !/^(localhost|example\.)/i.test(hostname);
  } catch {
    return false;
  }
}


async function searchWikipedia(query: string, limit = 8): Promise<string[]> {
  const url = new URL(WIKIPEDIA);
  url.search = new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: String(limit), srnamespace: "0", format: "json", origin: "*" }).toString();
  const data = await getJson(url.toString());
  return ((data?.query?.search ?? []) as Array<{ title: string }>).map((item) => item.title);
}

/** Search for a university by name. Only validated institutions are returned. */
export async function resolveUniversity(query: string): Promise<Candidate[]> {
  const value = query.trim();
  if (!value) return [];
  const titles = await searchWikipedia(/universit|college|institute|school/i.test(value) ? value : `${value} university`, 10);
  const validated = await validateEntities(titles);
  return validated.slice(0, 5).map((entity) => {
    const candidate: Candidate = {
      id: entity.id,
      name: entity.name,
      wikipediaUrl: wikipediaUrl(entity.wikipediaTitle),
      officialWebsite: entity.officialWebsite,
    };
    const location = [entity.city, entity.country].filter(Boolean).join(", ");
    if (location) candidate.location = location;
    return candidate;
  });
}

function wikipediaUrl(title: string) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

type PageInfo = { title: string; extract?: string; fullurl?: string; original?: { source?: string }; pageimage?: string };

async function fetchPage(title: string): Promise<PageInfo | null> {
  const url = new URL(WIKIPEDIA);
  url.search = new URLSearchParams({ action: "query", prop: "extracts|pageimages|info", exintro: "1", explaintext: "1", piprop: "original|name", inprop: "url", redirects: "1", titles: title, format: "json", origin: "*" }).toString();
  const data = await getJson(url.toString());
  const pages = Object.values((data?.query?.pages ?? {}) as Record<string, PageInfo>);
  return pages[0] ?? null;
}

/**
 * Image pipeline. Confidence reflects how tightly the image is bound to the
 * entity itself, not just to a search phrase:
 *  0.95 — the university's own Wikidata image (P18)
 *  0.88 — a photo from the university's own Wikimedia Commons category
 *  0.80 — the lead image of the university's Wikipedia article (photo only)
 */
async function findImage(entity: ValidatedEntity, page: PageInfo | null, wikidataEntity: Entity | null): Promise<UniversityImage | undefined> {
  const p18 = wikidataEntity ? claimStrings(wikidataEntity, "P18")[0] : undefined;
  if (p18 && isPhoto(p18)) {
    const info = await commonsFileInfo(`File:${p18}`);
    if (info) return { ...info, sourceName: "Wikidata · Wikimedia Commons", universityMatchConfidence: 0.95 };
  }
  const category = wikidataEntity ? claimStrings(wikidataEntity, "P373")[0] : undefined;
  const categoryImage = await commonsCategoryImage(category ?? entity.name, entity.name);
  if (categoryImage) return { ...categoryImage, sourceName: "Wikimedia Commons category", universityMatchConfidence: 0.88 };
  const lead = page?.original?.source;
  if (lead && isPhoto(lead) && page?.pageimage) {
    const info = await commonsFileInfo(`File:${page.pageimage}`);
    if (info) return { ...info, sourceName: "Wikipedia lead image", universityMatchConfidence: 0.8 };
    return { imageUrl: lead, sourceUrl: page.fullurl ?? wikipediaUrl(page.title), sourceName: "Wikipedia lead image", attribution: "Wikipedia", universityMatchConfidence: 0.8 };
  }
  return undefined;
}

function isPhoto(fileName: string) {
  return /\.(jpe?g|webp)$/i.test(fileName) && !/logo|seal|emblem|coat|flag|crest|wordmark|banner|map/i.test(fileName);
}

function plain(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function commonsFileInfo(fileTitle: string) {
  try {
    const url = new URL(COMMONS);
    url.search = new URLSearchParams({ action: "query", titles: fileTitle, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1600", format: "json", origin: "*" }).toString();
    const data = await getJson(url.toString());
    const page = Object.values((data?.query?.pages ?? {}) as Record<string, { imageinfo?: Array<{ url: string; thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value: string }> }> }>)[0];
    const info = page?.imageinfo?.[0];
    if (!info?.url) return null;
    const artist = plain(info.extmetadata?.["Artist"]?.value ?? "Wikimedia Commons contributor");
    const license = plain(info.extmetadata?.["LicenseShortName"]?.value ?? "See source");
    return { imageUrl: info.thumburl ?? info.url, sourceUrl: info.descriptionurl ?? info.url, attribution: `${artist.slice(0, 60)} · ${license}` };
  } catch {
    return null;
  }
}

async function commonsCategoryImage(category: string, universityName: string) {
  try {
    const url = new URL(COMMONS);
    url.search = new URLSearchParams({ action: "query", generator: "categorymembers", gcmtitle: `Category:${category}`, gcmtype: "file", gcmlimit: "30", prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1600", format: "json", origin: "*" }).toString();
    const data = await getJson(url.toString());
    const pages = Object.values((data?.query?.pages ?? {}) as Record<string, { title: string; imageinfo?: Array<{ url: string; thumburl?: string; descriptionurl?: string; width?: number; height?: number; extmetadata?: Record<string, { value: string }> }> }>);
    const keyword = universityName.split(/\s+/).filter((word) => word.length > 3)[0]?.toLowerCase() ?? "";
    const photos = pages
      .filter((page) => isPhoto(page.title) && (page.imageinfo?.[0]?.width ?? 0) >= 800 && (page.imageinfo?.[0]?.width ?? 0) >= (page.imageinfo?.[0]?.height ?? 0))
      .sort((a, b) => Number(/campus|building|main|entrance|university|facade/i.test(b.title)) - Number(/campus|building|main|entrance|university|facade/i.test(a.title)) || Number(b.title.toLowerCase().includes(keyword)) - Number(a.title.toLowerCase().includes(keyword)));
    const chosen = photos[0]?.imageinfo?.[0];
    if (!chosen) return null;
    const artist = plain(chosen.extmetadata?.["Artist"]?.value ?? "Wikimedia Commons contributor");
    const license = plain(chosen.extmetadata?.["LicenseShortName"]?.value ?? "See source");
    return { imageUrl: chosen.thumburl ?? chosen.url, sourceUrl: chosen.descriptionurl ?? chosen.url, attribution: `${artist.slice(0, 60)} · ${license}` };
  } catch {
    return null;
  }
}

/** Pick one memorable, non-admissions fact from the article intro. */
function pickInterestingFact(extract: string): string | undefined {
  const sentences = extract.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => item.length > 40 && item.length < 260);
  const boring = /ranked|ranking|acceptance rate|tuition|applicants|enrol|students enrolled|is a (public|private|national|state) (research )?university|is a university|located in|headquartered/i;
  const memorable: Array<[RegExp, number]> = [
    [/nobel|laureate|prize/i, 6],
    [/invent|discover|first (in|to)|oldest|earliest|only/i, 6],
    [/museum|castle|palace|cathedral|monastery|observatory|botanical|library holds|collection/i, 5],
    [/tradition|ceremony|festival|mascot|nickname|legend/i, 5],
    [/architect|designed by|building|campus was|tower|hall/i, 4],
    [/named after|honou?r of|in memory/i, 4],
    [/space|satellite|reactor|supercomputer|expedition|nuclear/i, 5],
    [/partnership with|joint|british|american|german|french|japanese|korean/i, 3],
    [/moved|relocated|evacuated|war|soviet|independence|decree/i, 3],
    [/founded|established/i, 1],
  ];
  const scored = sentences
    .map((sentence) => ({ sentence, score: memorable.reduce((sum, [pattern, weight]) => sum + (pattern.test(sentence) ? weight : 0), 0) - (boring.test(sentence) ? 5 : 0) }))
    .filter((item) => item.score >= 3 && !/^(it|the university) was (founded|established) in \d{4}\.?$/i.test(item.sentence))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.sentence;
}

/** Research one validated university. Cached per entity id. */
export async function researchUniversity(candidate: Candidate): Promise<UniversityResearch> {
  const cached = researchCache.get(candidate.id);
  if (cached) return cached;
  const title = decodeURIComponent(candidate.wikipediaUrl.split("/wiki/")[1] ?? candidate.name).replace(/_/g, " ");
  const [validated] = await validateEntities([title]);
  if (!validated) throw new Error("entity failed validation");
  const [page, [wikidataEntity]] = await Promise.all([fetchPage(validated.wikipediaTitle).catch(() => null), fetchEntitiesByTitles([validated.wikipediaTitle])]);
  const now = new Date().toISOString();
  const research: UniversityResearch = {
    id: validated.id,
    name: validated.name,
    locationVerified: Boolean(validated.country),
    officialWebsite: validated.officialWebsite,
    wikipediaUrl: page?.fullurl ?? wikipediaUrl(validated.wikipediaTitle),
    typeLabels: validated.typeLabels,
    prominence: validated.sitelinkCount,
    researchedAt: now,
  };
  if (validated.parentName) research.parentName = validated.parentName;
  if (validated.schoolName) research.schoolName = validated.schoolName;
  if (validated.city) research.city = validated.city;
  if (validated.country) research.country = validated.country;
  if (page?.extract) research.extract = page.extract;
  const image = await findImage(validated, page, wikidataEntity ?? null);
  if (image && image.universityMatchConfidence >= 0.8) research.image = image;
  const fact = page?.extract ? pickInterestingFact(page.extract) : undefined;
  if (fact) {
    const provenance: Provenance = { value: fact, sourceUrl: research.wikipediaUrl ?? candidate.wikipediaUrl, sourceTitle: `Wikipedia: ${validated.wikipediaTitle}`, verifiedAt: now };
    research.fact = provenance;
  }
  researchCache.set(candidate.id, research);
  return research;
}

async function countryId(university: UniversityResearch) {
  const [entity] = await fetchEntitiesByTitles([decodeURIComponent((university.wikipediaUrl ?? "").split("/wiki/")[1] ?? university.name).replace(/_/g, " ")]);
  return entity ? claimIds(entity, "P17")[0] : undefined;
}

async function sparqlUniversities(country: string, extraCountries: string[] = []) {
  const countries = [country, ...extraCountries].map((id) => `wd:${id}`).join(" ");
  const query = `SELECT ?u ?uLabel ?sitelinks ?article WHERE { VALUES ?type { wd:Q3918 wd:Q875538 wd:Q902104 wd:Q1371037 wd:Q15936437 wd:Q1188663 wd:Q38723 wd:Q62078547 } VALUES ?country { ${countries} } ?u wdt:P31 ?type; wdt:P17 ?country; wdt:P856 ?website; wikibase:sitelinks ?sitelinks. ?article schema:about ?u; schema:isPartOf <https://en.wikipedia.org/>. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?sitelinks) LIMIT 40`;
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/sparql-results+json" }, signal: controller.signal });
    if (!response.ok) throw new Error("sparql failed");
    const data = await response.json();
    const seen = new Set<string>();
    return ((data?.results?.bindings ?? []) as Array<{ article: { value: string } }>)
      .map((binding) => decodeURIComponent(binding.article.value.split("/wiki/")[1] ?? "").replace(/_/g, " "))
      .filter((title) => title && !seen.has(title) && seen.add(title));
  } finally {
    clearTimeout(timer);
  }
}

export type RecommendationProgress = (message: string) => void;

/**
 * Recommendation pipeline: candidates in the same country as the dream
 * university (plus a wider net when the student prefers alternatives), each
 * validated, researched, program-checked and scored. Emits results as soon
 * as each one is verified; never pads with unverified entities.
 */
export async function findRecommendations(profile: StudentProfile, dream: UniversityResearch, onProgress?: RecommendationProgress, onPartial?: (items: Recommendation[]) => void): Promise<Recommendation[]> {
  onProgress?.("Searching institutions near your target");
  const country = await countryId(dream).catch(() => undefined);
  let titles: string[] = [];
  if (country) titles = await sparqlUniversities(country).catch(() => []);
  if (titles.length < 6) {
    const keyword = majorKeywords(profile.major)[0] ?? profile.major;
    const extra = await searchWikipedia(`${keyword} university ${dream.country ?? ""}`, 12).catch(() => []);
    titles = [...new Set([...titles, ...extra])];
  }
  onProgress?.("Validating that every candidate is a real university");
  const validated = (await validateEntities(titles.filter((title) => title !== dream.name).slice(0, 30))).filter((entity) => entity.id !== dream.id);
  const dreamCountry = dream.country;
  const keywords = majorKeywords(profile.major);
  const ranked = validated
    .map((entity) => ({ entity, score: entity.sitelinkCount + (keywords.some((keyword) => entity.name.toLowerCase().includes(keyword)) ? 40 : 0) + (entity.country === dreamCountry ? 10 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const results: Recommendation[] = [];
  for (const { entity } of ranked) {
    if (results.length >= 3) break;
    onProgress?.(`Researching ${entity.name}`);
    try {
      const research = await researchUniversity({ id: entity.id, name: entity.name, wikipediaUrl: wikipediaUrl(entity.wikipediaTitle), officialWebsite: entity.officialWebsite });
      if (programSignal(profile, research) < 0.5) continue;
      results.push(buildRecommendation(profile, dream, research, results));
      onPartial?.([...results]);
    } catch {
      continue;
    }
  }
  return results;
}

function buildRecommendation(profile: StudentProfile, dream: UniversityResearch, university: UniversityResearch, existing: Recommendation[]): Recommendation {
  const alignment = alignmentFor(profile, university, dream.country, pathwiseWeights(profile, university));
  const dreamAlignment = alignmentFor(profile, dream, dream.country, pathwiseWeights(profile, dream));
  const dims: Array<[keyof typeof alignment, string, string]> = [
    ["programFit", `Its public profile signals ${profile.major.toLowerCase()} directly, so your field choice reads as a natural fit.`, `Program signal for ${profile.major}`],
    ["testing", `Your current test profile sits closer to its likely entry expectations, which shrinks your testing gap versus ${dream.name}.`, "Smaller testing gap"],
    ["activities", `Your project-heavy profile carries more weight here than raw test numbers do.`, "Project evidence counts"],
    ["financialFit", university.country === dream.country ? `Staying in ${university.country} keeps cost and paperwork closer to home, which matches your financial preferences.` : `It fits your stated regional preference and broadens funding options.`, "Cost and region fit"],
    ["english", `Your English score already clears typical English-taught program thresholds here.`, "English requirement covered"],
    ["academics", `Your school record is a relative strength against its academic expectations.`, "Academic record fits"],
  ];
  const used = new Set(existing.map((item) => item.advantage));
  const best = dims
    .map((dim) => ({ dim, delta: alignment[dim[0]] - dreamAlignment[dim[0]], value: alignment[dim[0]] }))
    .sort((a, b) => b.delta + b.value * 0.3 - (a.delta + a.value * 0.3))
    .find((item) => !used.has(item.dim[2])) ?? { dim: dims[0]!, delta: 0, value: 0 };
  const weakest = (Object.entries(alignment) as Array<[keyof typeof alignment, number]>).filter(([key]) => key !== "overall").sort((a, b) => a[1] - b[1])[0]!;
  const gapLabel: Record<string, string> = { academics: "Academic record", testing: "Testing profile", english: "English score", activities: "Project evidence", programFit: "Program match", financialFit: "Cost and funding" };
  return {
    id: university.id,
    university,
    program: profile.major,
    alignment,
    why: best.dim[1],
    advantage: best.dim[2],
    gap: `${gapLabel[weakest[0]]} (${weakest[1]})`,
  };
}

export { buildRecommendation };
