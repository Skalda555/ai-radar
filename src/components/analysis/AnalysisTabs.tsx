"use client";

import { useState } from "react";
import type { AnalysisItemRow, AnalysisRow } from "@/lib/types";
import {
  CONFIDENCE_LABELS,
  EVIDENCE_KIND_LABELS,
  ITEM_KIND_LABELS,
  PROMPT_KIND_LABELS,
  VERIFICATION_HINTS,
  VERIFICATION_LABELS,
  groupItems,
  parseJsonSafe,
  verificationClass,
  workflowSteps,
} from "@/lib/ui/labels";
import { formatDateTimeCs } from "@/lib/shared/time";
import { Icon } from "../ui/Icon";
import { CopyButton, VerifyControls } from "./ItemActions";
import { AskQuestion, type QuestionItem } from "./AskQuestion";
import { SummarySection } from "./SummarySection";
import { UseCases } from "./UseCases";

type TabId = "summary" | "points" | "tips" | "workflows" | "tools" | "prompts" | "sources";

function formatTs(seconds: number | null): string | null {
  if (seconds == null) return null;
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function TimestampLink({ seconds, url }: { seconds: number | null; url: string | null }) {
  const label = formatTs(seconds);
  if (!label || !url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="chip chip-teal"
      title="Otevřít přesné místo ve videu na YouTube"
    >
      <Icon name="clock" size={11} />
      {label}
    </a>
  );
}

export function AnalysisTabs({
  analysis,
  items,
  video,
  tokenInput,
  tokenOutput,
  questions,
  model,
  geminiKey,
}: {
  analysis: AnalysisRow;
  items: AnalysisItemRow[];
  video: { videoId: string; title: string; url: string; channelTitle: string; publishedAt: string };
  tokenInput: number | null;
  tokenOutput: number | null;
  questions: QuestionItem[];
  model: string;
  geminiKey: boolean;
}) {
  const groups = groupItems(items);
  const workflows = workflowSteps(items);
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "summary", label: "Shrnutí" },
    { id: "points", label: "Klíčové poznatky", count: groups.KEY_POINT.length },
    { id: "tips", label: "Tipy a triky", count: groups.TIP.length },
    { id: "workflows", label: "Postupy", count: workflows.length },
    { id: "tools", label: "Nástroje", count: groups.TOOL.length },
    { id: "prompts", label: "Prompty", count: groups.PROMPT.length },
    { id: "sources", label: "Zdroje a omezení" },
  ];
  const [active, setActive] = useState<TabId>("summary");

  const normalizedMeta = parseJsonSafe<{ insufficientReason?: string | null }>(
    analysis.normalized_json,
    {},
  );

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="tabs" role="tablist" aria-label="Sekce analýzy">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            className="tab"
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
            {typeof tab.count === "number" && tab.count > 0 ? (
              <span className="tiny muted" style={{ marginLeft: 6 }}>
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="panel-body" role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === "summary" ? (
          <div style={{ display: "grid", gap: 18 }}>
            {analysis.status === "INSUFFICIENT_CONTENT" ? (
              <div className="notice notice-warn" style={{ display: "block" }}>
                <strong>Málo obsahu pro poctivou analýzu.</strong> Model uvedl, že video neobsahuje dost
                informací. Aplikace proto nezobrazuje vymyšlené poznatky.
              </div>
            ) : null}

            <div>
              <div className="eyebrow">Anotace</div>
              <p className="prose-cs" style={{ fontSize: 17, color: "#E7EDF4", marginTop: 6 }}>
                {analysis.summary_short_cs}
              </p>
            </div>

            <SummarySection
              videoId={video.videoId}
              summaryLong={analysis.summary_long_cs ?? ""}
              initialDeep={analysis.summary_deep_cs ?? null}
            />

            <AskQuestion
              videoId={video.videoId}
              questions={questions}
              model={model}
              geminiKey={geminiKey}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <div className="panel" style={{ padding: 12 }}>
                <div className="tiny muted">Hlavní téma</div>
                <div style={{ fontWeight: 600 }}>{analysis.main_topic ?? "—"}</div>
              </div>
              <div className="panel" style={{ padding: 12 }}>
                <div className="tiny muted">Kategorie</div>
                <div style={{ fontWeight: 600 }}>{analysis.category ?? "—"}</div>
              </div>
              <div className="panel" style={{ padding: 12 }}>
                <div className="tiny muted">Relevance po analýze</div>
                <div style={{ fontWeight: 600 }}>
                  {analysis.relevance_score != null ? `${analysis.relevance_score} / 100` : "—"}
                </div>
              </div>
            </div>

            {analysis.relevance_explanation_cs ? (
              <div>
                <div className="eyebrow">Proč tato relevance</div>
                <p className="prose-cs" style={{ marginTop: 6 }}>
                  {analysis.relevance_explanation_cs}
                </p>
              </div>
            ) : null}

            {analysis.constraints_cs ? (
              <div className="notice notice-warn" style={{ display: "block" }}>
                <strong>Omezení:</strong> {analysis.constraints_cs}
              </div>
            ) : null}

            <UseCases interpretation={analysis.interpretation_cs} />
          </div>
        ) : null}

        {active === "points" ? (
          <div>
            {groups.KEY_POINT.length === 0 ? (
              <p className="muted">Analýza neobsahuje klíčové poznatky.</p>
            ) : (
              groups.KEY_POINT.map((item) => (
                <div key={item.id} className="item-block">
                  <h4>{item.text_cs}</h4>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                    <span className={verificationClass(item.verification_status)} title={VERIFICATION_HINTS[item.verification_status]}>
                      {VERIFICATION_LABELS[item.verification_status] ?? item.verification_status}
                    </span>
                    {item.confidence ? (
                      <span className="chip chip-neutral" title="Míra jistoty modelu – není to nezávislé ověření.">
                        {CONFIDENCE_LABELS[item.confidence] ?? item.confidence}
                      </span>
                    ) : null}
                    <TimestampLink seconds={item.timestamp_seconds} url={item.timestamp_url} />
                  </div>

                  {item.evidence_quote || (item.evidence_kind && item.evidence_kind !== "NONE") ? (
                    <details className="evidence">
                      <summary>Zdrojová evidence {item.evidence_kind ? `· ${EVIDENCE_KIND_LABELS[item.evidence_kind] ?? item.evidence_kind}` : ""}</summary>
                      <blockquote>{item.evidence_quote ?? "Model uvedl pouze popis obrazové evidence bez doslovného úryvku."}</blockquote>
                      <p className="tiny" style={{ color: "#8492A2", marginTop: 8, marginBottom: 0 }}>
                        Úryvek vytvořil model. Není to nezávislé ověření tvrzení.
                      </p>
                    </details>
                  ) : null}

                  <div style={{ marginTop: 10 }}>
                    <VerifyControls itemId={item.id} status={item.verification_status} />
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {active === "tips" ? (
          <div>
            {groups.TIP.length === 0 ? (
              <p className="muted">Video neobsahuje konkrétní tipy, které by šlo bezpečně vytěžit.</p>
            ) : (
              groups.TIP.map((item) => (
                <div key={item.id} className="item-block">
                  <h4>{item.text_cs}</h4>
                  {item.detail_cs ? (
                    <p style={{ margin: "4px 0 0", color: "#BFCDD9" }}>
                      <span className="tiny" style={{ color: "#8FE0BD", fontWeight: 600 }}>
                        Co získáš:{" "}
                      </span>
                      {item.detail_cs}
                    </p>
                  ) : null}
                  <div style={{ marginTop: 8 }}>
                    <TimestampLink seconds={item.timestamp_seconds} url={item.timestamp_url} />
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {active === "workflows" ? (
          <div style={{ display: "grid", gap: 16 }}>
            {workflows.length === 0 ? (
              <p className="muted">Autor v tomto videu nepředvádí konkrétní postup krok za krokem.</p>
            ) : (
              workflows.map(({ workflow, steps }) => {
                const extra = parseJsonSafe<{ prerequisites?: string[]; tools?: string[]; risks?: string[] }>(
                  workflow.extra_json,
                  {},
                );
                return (
                  <section key={workflow.id} className="panel" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <h3>{workflow.text_cs}</h3>
                      <TimestampLink seconds={workflow.timestamp_seconds} url={workflow.timestamp_url} />
                    </div>
                    <p className="prose-cs" style={{ marginTop: 4 }}>
                      {workflow.detail_cs}
                    </p>

                    {(extra.prerequisites?.length ?? 0) > 0 ? (
                      <div style={{ marginBottom: 10 }}>
                        <div className="tiny muted">Předpoklady</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                          {extra.prerequisites?.map((value) => (
                            <span key={value} className="chip chip-neutral">
                              {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <ol className="steps" style={{ marginTop: 10, paddingLeft: 0 }}>
                      {steps.map((step) => (
                        <li key={step.id}>
                          <div>
                            <div>{step.text_cs}</div>
                            {step.detail_cs ? (
                              <div className="prompt-block" style={{ marginTop: 6 }}>
                                {step.detail_cs}
                                <CopyButton text={step.detail_cs} />
                              </div>
                            ) : null}
                            <div style={{ marginTop: 6 }}>
                              <TimestampLink seconds={step.timestamp_seconds} url={step.timestamp_url} />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>

                    {(extra.risks?.length ?? 0) > 0 ? (
                      <div className="notice notice-warn" style={{ display: "block", marginTop: 12 }}>
                        <strong>Rizika a omezení:</strong>
                        <ul style={{ margin: "6px 0 0 18px" }}>
                          {extra.risks?.map((risk) => (
                            <li key={risk}>{risk}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                );
              })
            )}
          </div>
        ) : null}

        {active === "tools" ? (
          <div>
            {groups.TOOL.length === 0 ? (
              <p className="muted">Analýza neidentifikovala konkrétní nástroje.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {groups.TOOL.map((item) => {
                  const extra = parseJsonSafe<{ demonstrated?: boolean }>(item.extra_json, {});
                  return (
                    <div key={item.id} className="item-block" style={{ marginBottom: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{item.tool_name ?? item.text_cs}</strong>
                        <span className={extra.demonstrated ? "chip chip-success" : "chip chip-neutral"}>
                          {extra.demonstrated ? "předvedeno ve videu" : "jen zmíněno"}
                        </span>
                        {item.tool_url ? (
                          <a
                            href={item.tool_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="chip chip-teal"
                            title="Otevřít oficiální web"
                          >
                            <Icon name="external" size={11} /> web
                          </a>
                        ) : null}
                      </div>
                      {item.detail_cs ? (
                        <p className="tiny" style={{ margin: "5px 0 0", color: "#B9C6D3" }}>
                          {item.detail_cs}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {active === "prompts" ? (
          <div>
            {groups.PROMPT.length === 0 ? (
              <p className="muted">Ve videu nebyly doloženy žádné prompty ani příkazy.</p>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {groups.PROMPT.map((item) => {
                  const extra = parseJsonSafe<{ commandType?: string }>(item.extra_json, {});
                  const copyable = item.prompt_kind === "EXACT_QUOTE" || item.prompt_kind === "PARAPHRASE";
                  return (
                    <div key={item.id}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                        <span
                          className={
                            item.prompt_kind === "EXACT_QUOTE"
                              ? "chip chip-success"
                              : item.prompt_kind === "PARAPHRASE"
                                ? "chip chip-warn"
                                : "chip chip-neutral"
                          }
                        >
                          {PROMPT_KIND_LABELS[item.prompt_kind ?? ""] ?? item.prompt_kind}
                        </span>
                        <span className="chip chip-neutral">
                          {extra.commandType === "COMMAND" ? "příkaz" : "prompt"}
                        </span>
                        <TimestampLink seconds={item.timestamp_seconds} url={item.timestamp_url} />
                      </div>
                      <div className="prompt-block">
                        {item.prompt_text ?? item.text_cs}
                        {copyable ? <CopyButton text={item.prompt_text ?? item.text_cs} /> : null}
                      </div>
                      {item.detail_cs ? (
                        <p className="tiny muted" style={{ marginTop: 6 }}>
                          {item.detail_cs}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {active === "sources" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <div className="eyebrow">Zdroj</div>
              <div style={{ display: "grid", gap: 5, marginTop: 8, fontSize: 14 }}>
                <span>
                  Video:{" "}
                  <a href={video.url} target="_blank" rel="noreferrer noopener" style={{ color: "#B6AEE8" }}>
                    {video.title} <Icon name="external" size={12} />
                  </a>
                </span>
                <span className="muted">Kanál: {video.channelTitle}</span>
                <span className="muted">
                  Model: <span className="mono">{analysis.model}</span> · prompt{" "}
                  <span className="mono">{analysis.prompt_version}</span> · schéma v{analysis.schema_version}
                </span>
                <span className="muted">Analýza vytvořena: {formatDateTimeCs(analysis.created_at)}</span>
                {tokenInput != null || tokenOutput != null ? (
                  <span className="muted">
                    Tokeny hlášené poskytovatelem: vstup {tokenInput ?? "?"} / výstup {tokenOutput ?? "?"}
                  </span>
                ) : (
                  <span className="muted">Tokeny poskytovatel nevrátil.</span>
                )}
                <span className="muted">Režim: {analysis.mode}</span>
              </div>
            </div>

            <div>
              <div className="eyebrow">Jak číst stav ověření</div>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {Object.entries(VERIFICATION_LABELS).map(([key, label]) => (
                  <div key={key} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={verificationClass(key)}>{label}</span>
                    <span className="tiny muted">{VERIFICATION_HINTS[key]}</span>
                  </div>
                ))}
              </div>
            </div>

            {groups.LIMITATION.length > 0 ? (
              <div>
                <div className="eyebrow">Omezení uvedená v analýze</div>
                <ul className="prose-cs" style={{ marginTop: 8 }}>
                  {groups.LIMITATION.map((item) => (
                    <li key={item.id}>{item.text_cs}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {normalizedMeta.insufficientReason ? (
              <div className="notice notice-warn" style={{ display: "block" }}>
                <strong>Důvod nedostatečného obsahu:</strong> {normalizedMeta.insufficientReason}
              </div>
            ) : null}

            <div>
              <div className="eyebrow">Export</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <a className="btn btn-sm" href={`/api/export/analysis/${video.videoId}?format=md`}>
                  <Icon name="download" size={14} /> Markdown
                </a>
                <a className="btn btn-sm" href={`/api/export/analysis/${video.videoId}?format=json`}>
                  <Icon name="download" size={14} /> JSON
                </a>
              </div>
              <p className="tiny muted" style={{ marginTop: 6 }}>
                Export zachová zdrojové odkazy, časové značky a informaci o neověřených tvrzeních.
              </p>
            </div>

            <p className="tiny muted" style={{ margin: 0 }}>
              Tahle obrazovka je AI interpretace uloženého modelového výstupu. Platné schéma
              neznamená, že tvrzení jsou pravdivá. {ITEM_KIND_LABELS.KEY_POINT} jsou jen tak dobré,
              jak dobrý je zdroj a jeho ověření.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
