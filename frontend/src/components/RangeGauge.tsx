import { FLAG } from "./ui";

// Value marker on a track with the reference band highlighted. Axis is derived from the reference range.
export default function RangeGauge({ value, low, high, unit, flag, compact = false }:
  { value: number; low: number | null; high: number | null; unit?: string | null; flag?: string | null; compact?: boolean }) {
  if (low == null && high == null) return null;
  let min: number, max: number, bandLo: number, bandHi: number;
  if (low != null && high != null) {
    const span = high - low;
    [min, max, bandLo, bandHi] = [low - span * 0.8, high + span * 0.8, low, high];
  } else if (high != null) {
    [min, max, bandLo, bandHi] = [0, high * 1.7, 0, high];
  } else {
    [min, max, bandLo, bandHi] = [(low as number) * 0.3, (low as number) * 1.9, low as number, (low as number) * 1.9];
  }
  const pad = (max - min) * 0.08;
  min = Math.min(min, value - pad); max = Math.max(max, value + pad);
  if ((low ?? 0) >= 0 && value >= 0) min = Math.max(0, min);
  const pct = (x: number) => `${Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100))}%`;
  const f = FLAG[flag ?? "N"] ?? FLAG.N;
  const label = `${value}${unit ? ` ${unit}` : ""}, reference ${low ?? "up to"}${low != null && high != null ? "–" : ""}${high ?? " and above"}, ${f.label}`;
  const fmt = (n: number) => +n.toFixed(2);
  return (
    <div role="img" aria-label={label} className={compact ? "pb-4 pt-1.5" : "pb-5 pt-2"}>
      <div className="relative h-2.5 rounded-full bg-line">
        <div className="absolute inset-y-0 rounded-full border border-ok/40 bg-ok/25"
          style={{ left: pct(bandLo), width: `calc(${pct(bandHi)} - ${pct(bandLo)})` }} />
        <div className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow-md transition-all duration-700"
          style={{ left: pct(value), background: `var(--${f.tone === "crit" ? "crit" : f.tone})` }} />
        {low != null && <span className="absolute top-4 -translate-x-1/2 text-[11px] tabular-nums text-muted" style={{ left: pct(low) }}>{fmt(low)}</span>}
        {high != null && <span className="absolute top-4 -translate-x-1/2 text-[11px] tabular-nums text-muted" style={{ left: pct(high) }}>{fmt(high)}</span>}
      </div>
    </div>
  );
}
