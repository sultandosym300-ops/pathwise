import { useState } from "react";

import { useLocale } from "../lib/i18n";
import type { ComparisonItem, UniversityProfileComparison } from "../lib/analysis/comparison";
import type { SignalStrength } from "../lib/analysis/evidence";

function strengthLabelKey(strength: SignalStrength) {
  return strength === "strong" ? "common.strong" : strength === "developing" ? "common.developing" : "common.weak";
}

/** Localize note params that carry internal ids (themes). */
function localizedParams(t: (key: string, params?: Record<string, string | number>) => string, params: Record<string, string | number>) {
  const out: Record<string, string | number> = { ...params };
  const theme = out["theme"];
  if (typeof theme === "string" && theme) out["theme"] = t(`theme.${theme}`);
  return out;
}

/**
 * One university priority with the student's verdict against it.
 *
 * "Why we say this" expands inline and pushes the rest of the list down — it
 * never floats over neighbouring cards. Documented emphasis and Pathwise
 * interpretation are visibly different labels.
 */
export function PriorityRow({ item }: { item: ComparisonItem }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const documented = item.interpretationType === "documented";
  const emphasisLabel = documented ? t("matches.documentedEmphasis") : t("matches.pathwiseInterpretation");
  const emphasisValue = documented
    ? t(item.importance === "high" ? "common.high" : "common.medium")
    : t(item.importance === "high" ? "common.important" : "common.supporting");

  return (
    <div className={`priority-row ${item.evidence} ${documented ? "documented" : "interpreted"}`}>
      <div className="priority-main">
        <strong>{t(`priority.${item.priorityId}.label`)}</strong>
        <p>{t(`priority.${item.priorityId}.desc`)}</p>
      </div>
      <div className="priority-verdict">
        <span className={documented ? "tag documented" : "tag interpreted"}>
          {emphasisLabel}: <b>{emphasisValue}</b>
        </span>
        <span>
          {t("matches.yourEvidence")}: <b className={`signal ${item.evidence}`}>{t(strengthLabelKey(item.evidence))}</b>
        </span>
        <button type="button" className="link-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? t("common.hide") : t("common.why")}
        </button>
      </div>
      {open ? (
        <div className="priority-why">
          <div>
            <p className="field-label">{t("matches.whyYourEvidence")}</p>
            <p>{t(`note.${item.noteId}`, localizedParams(t, item.params))}</p>
          </div>
          {item.source.quote ? (
            <div>
              <p className="field-label">{t("matches.whyUniversityEvidence")}</p>
              <blockquote className="mini">{item.source.quote}</blockquote>
            </div>
          ) : null}
          {item.source.url ? (
            <div>
              <p className="field-label">{t("matches.whySource")}</p>
              <a href={item.source.url} target="_blank" rel="noreferrer">
                {item.source.title || t("common.source")} ↗
              </a>
            </div>
          ) : null}
          <div>
            <p className="field-label">{t("matches.whyInterpretation")}</p>
            <p>{t(item.reasoningId, item.reasoningParams)}</p>
          </div>
          <button type="button" className="link-button" onClick={() => setOpen(false)}>
            {t("common.hide")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PriorityList({ comparison }: { comparison: UniversityProfileComparison }) {
  const { t } = useLocale();
  const items = [...comparison.strongMatches, ...comparison.partialMatches, ...comparison.importantGaps];
  if (!items.length) return <p className="quiet-note">{t("matches.valuesEmpty")}</p>;
  return (
    <>
      <div className="priority-list">
        {items.map((item) => (
          <PriorityRow key={item.priorityId} item={item} />
        ))}
      </div>
      {comparison.lens.complete ? null : <p className="quiet-note">{t("matches.valuesPartial")}</p>}
    </>
  );
}

/**
 * How your profile compares. Strongest signal, biggest mismatch and the next
 * move already appear in the key insights above, so they are deliberately
 * absent here — the same sentence is never printed twice on one screen.
 */
export function ProfileVerdict({ comparison }: { comparison: UniversityProfileComparison }) {
  const { t } = useLocale();
  const { evidence } = comparison;
  const missing = evidence.missingSignals[0] ?? null;

  const rows: Array<{ label: string; value: string }> = [];
  if (missing) {
    const map: Record<string, string> = {
      "measurable-impact": t("note.impact-missing", { count: evidence.items.length }),
      leadership: t("note.leadership-weak"),
      "sustained-commitment": t("note.commitment-weak"),
      "external-validation": t("note.validation-missing"),
      "field-evidence": t("note.field-mismatch", { field: comparison.lens.intendedField, theme: t(`theme.${evidence.dominantTheme ?? "other"}`) }),
      "any-evidence": t("note.depth-thin", { count: 0 }),
    };
    rows.push({ label: t("matches.missingEvidence"), value: map[missing] ?? "" });
  }
  rows.push({
    label: t("matches.majorNarrative"),
    value:
      evidence.majorNarrative === "clear"
        ? t("note.field-clear", { field: comparison.lens.intendedField })
        : evidence.majorNarrative === "thin"
          ? t("note.depth-thin", { count: evidence.items.length })
          : t(evidence.majorNarrative === "mixed" ? "note.field-mixed" : "note.field-mismatch", {
              field: comparison.lens.intendedField,
              theme: t(`theme.${evidence.competingTheme ?? evidence.dominantTheme ?? "other"}`),
            }),
  });

  return (
    <div className="verdict-list">
      {rows.map((row) => (
        <div key={row.label} className="verdict-row">
          <span>{row.label}</span>
          <p>{row.value}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * The three answers a student came for, above everything else: what they are
 * already strong at, where the real gap is, and what to do next. Each card is
 * one sentence of plain language, never a bare score.
 */
export function KeyInsights({ comparison }: { comparison: UniversityProfileComparison }) {
  const { t } = useLocale();
  const strongest = comparison.strongMatches[0] ?? comparison.partialMatches[0] ?? null;
  const gap = comparison.narrativeMismatch ?? comparison.importantGaps[0] ?? null;
  const move = comparison.topOpportunity;

  const cards = [
    strongest
      ? {
          id: "strong",
          label: t("matches.strongestSignal"),
          title: t(`priority.${strongest.priorityId}.label`),
          body: t(`note.${strongest.noteId}`, localizedParams(t, strongest.params)),
        }
      : { id: "strong", label: t("matches.strongestSignal"), title: t("matches.noSignalYet"), body: t("matches.noSignalYetBody") },
    gap
      ? {
          id: "gap",
          label: t("matches.biggestMismatch"),
          title: t(`priority.${gap.priorityId}.label`),
          body: t(`note.${gap.noteId}`, localizedParams(t, gap.params)),
        }
      : { id: "gap", label: t("matches.biggestMismatch"), title: t("matches.noGapYet"), body: t("matches.noGapYetBody") },
    {
      id: "move",
      label: t("matches.nextMove"),
      title: t(`moveTitle.${move.moveId}`, localizedParams(t, move.params)),
      body: t(`move.${move.moveId}`, localizedParams(t, move.params)),
    },
  ];

  return (
    <div className="key-insights">
      {cards.map((card) => (
        <article key={card.id} className={`key-insight ${card.id}`}>
          <p className="field-label">{card.label}</p>
          <strong>{card.title}</strong>
          <p>{card.body}</p>
        </article>
      ))}
    </div>
  );
}

/** The single strategic recommendation: one headline, one reason, one action. */
export function StrategyBlock({ comparison, children }: { comparison: UniversityProfileComparison; children?: React.ReactNode }) {
  const { t } = useLocale();
  const params = localizedParams(t, comparison.topOpportunity.params);
  return (
    <div className="strategy-block panel" id="strategy">
      <p className="eyebrow">{t("matches.highestLeverage")}</p>
      <h2>{t(`moveTitle.${comparison.topOpportunity.moveId}`, params)}</h2>
      <p className="strategy-body">{t(`move.${comparison.topOpportunity.moveId}`, params)}</p>
      {children}
    </div>
  );
}
