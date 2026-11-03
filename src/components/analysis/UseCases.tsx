export function UseCases({ interpretation }: { interpretation: string | null }) {
  const items = (interpretation ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[•\-*]\s*/, ""))
    .filter(Boolean);

  return (
    <section className="panel-raised" style={{ padding: 18, borderColor: "rgba(64,201,189,0.28)", background: "rgba(64,201,189,0.05)" }}>
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>Jak to mohu využít?</h3>
      <p className="tiny" style={{ color: "#8FE0DB", margin: "0 0 14px" }}>
        Doporučení AI Radaru, nikoli informace přímo z videa.
      </p>

      {items.length > 0 ? (
        <div style={{ display: "grid", gap: 14 }}>
          {items.map((item, index) => {
            const split = splitLead(item);
            return (
              <div key={index}>
                {split.title ? (
                  <div style={{ fontWeight: 650, color: "#EDF2F7", marginBottom: 3 }}>{split.title}</div>
                ) : null}
                <p className="prose-cs" style={{ margin: 0, fontSize: 14.5, color: "#C9D5E1" }}>
                  {split.body}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="prose-cs" style={{ margin: 0 }}>
          Model k tomuto videu nedodal vlastní doporučení.
        </p>
      )}
    </section>
  );
}

/** Splits "Název: vysvětlení" into a bold lead and the explanation, when the model wrote it that way. */
function splitLead(text: string): { title: string | null; body: string } {
  const match = /^([^:]{8,90}):\s+(.+)$/s.exec(text);
  if (!match) return { title: null, body: text };
  return { title: match[1].trim(), body: match[2].trim() };
}
