import type { ReactNode } from "react";
import Icon, { IconName } from "./Icon";

export type Tone = "ok" | "low" | "high" | "crit" | "brand" | "med" | "dx" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok", low: "bg-low-soft text-low", high: "bg-high-soft text-high", crit: "bg-crit-soft text-crit",
  brand: "bg-brand-soft text-brand-strong", med: "bg-med-soft text-med", dx: "bg-dx-soft text-dx",
  neutral: "border border-line bg-surface-2 text-muted",
};

// Interpretation code -> look. Status is always icon + text, never colour alone.
export const FLAG: Record<string, { tone: Tone; label: string; icon: IconName }> = {
  N: { tone: "ok", label: "Normal", icon: "check" },
  L: { tone: "low", label: "Low", icon: "down" },
  H: { tone: "high", label: "High", icon: "up" },
  LL: { tone: "crit", label: "Critically low", icon: "alert" },
  HH: { tone: "crit", label: "Critically high", icon: "alert" },
};
export const flagFromLabel = (s: string) =>
  Object.entries(FLAG).find(([, v]) => v.label.toLowerCase() === s.toLowerCase())?.[0];

export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}>
      {icon && <Icon name={icon} className="h-3.5 w-3.5" strokeWidth={2.2} />}{children}
    </span>
  );
}

export const TONE_TILE = TONE;

export const Skeleton = ({ className = "h-4 w-full" }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden />;

export const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function Segmented<T extends string>({ options, value, onChange, label }:
  { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-[10px] px-3 text-xs font-semibold transition ${o.value === value ? "bg-surface text-brand-strong shadow-sm" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, sub, children }: { icon: IconName; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="card reveal flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 rounded-full bg-brand-soft" />
        <span className="absolute -right-1 top-1 h-4 w-4 rounded-full bg-med-soft" />
        <span className="absolute -left-2 bottom-2 h-3 w-3 rounded-full bg-high-soft" />
        <Icon name={icon} className="relative h-9 w-9 text-brand" strokeWidth={1.6} />
      </div>
      <h2 className="h-display text-xl font-semibold">{title}</h2>
      {sub && <p className="max-w-sm text-sm text-muted">{sub}</p>}
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="h-display text-xl font-semibold">{children}</h2>{action}
    </div>
  );
}

const LOCALE: Record<string, string> = { en: "en-IN", hi: "hi-IN", te: "te-IN" };
export const fmtDate = (d: string | null | undefined, lang: string, month: "short" | "long" = "short") =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(LOCALE[lang] ?? "en-IN", { day: "numeric", month, year: "numeric" }) : "";
export const fmtMonth = (d: string, lang: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(LOCALE[lang] ?? "en-IN", { month: "long", year: "numeric" });

export const DOC_ICON: Record<string, IconName> = {
  prescription: "pill", lab_report: "flask", discharge_summary: "building", diagnostic_report: "image", other: "file",
};
