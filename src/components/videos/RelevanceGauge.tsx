/**
 * Semicircular relevance gauge. The colour encodes the band, the number stays
 * readable as text; the arc is decorative, so it is hidden from screen readers.
 */
export function RelevanceGauge({
  score,
  kind,
}: {
  score: number | null | undefined;
  kind: "odhad" | "analýza";
}) {
  if (score == null || !Number.isFinite(score)) {
    return <span className="chip chip-neutral">bez odhadu</span>;
  }

  const value = Math.max(0, Math.min(100, Math.round(score)));
  const color = value >= 70 ? "#35B989" : value >= 40 ? "#E9A548" : "#E46B6B";

  // Semicircle: centre (11,11), radius 9, from 180° to 0°.
  const radius = 9;
  const endX = 11 + radius * Math.cos(Math.PI - (value / 100) * Math.PI);
  const endY = 11 - radius * Math.sin(Math.PI - (value / 100) * Math.PI);

  return (
    <span
      className="chip chip-neutral relevance-gauge"
      title={`Relevance ${value}/100 (${kind})`}
      style={{ gap: 5, paddingLeft: 7 }}
    >
      <svg width="22" height="13" viewBox="0 0 22 13" aria-hidden="true" focusable="false">
        <path
          d="M2 11 A9 9 0 0 1 20 11"
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d={`M2 11 A9 9 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ opacity: 0.55 }}>/100</span>
    </span>
  );
}
