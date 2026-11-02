import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Icon, { IconName } from "./Icon";

type Tone = "ok" | "low" | "high" | "crit" | "brand" | "med" | "dx" | "neutral";

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

// A page with a scan line passing over it: the app is reading a document.
export const Sheet = ({ scanning = false, className = "h-20 w-16" }: { scanning?: boolean; className?: string }) => (
  <div aria-hidden className={`${scanning ? "scan" : ""} relative space-y-1.5 overflow-hidden rounded-md border border-line bg-surface p-2.5 shadow-card ${className}`}>
    {[70, 90, 55, 80, 45, 65].map((w, i) => <i key={i} className="block h-1 rounded-full bg-line" style={{ width: `${w}%` }} />)}
  </div>
);

// "1-0-1 after food" as morning/afternoon/night slots. Same pattern and slot names as backend/app/rules/dosage.py.
const DASH = /[\d½¼¾.]+(?:\s*[-–]\s*[\d½¼¾.]+){1,3}/;
const SLOTS: Record<number, string[]> = { 2: ["morning", "night"], 3: ["morning", "afternoon", "night"], 4: ["morning", "afternoon", "evening", "night"] };

// Doses per slot from a dash pattern, or null for "BD", "सुबह-शाम" and other forms shown as written.
export function parseDose(pattern: string) {
  const m = DASH.exec(pattern);
  const doses = m ? m[0].split(/\s*[-–]\s*/) : [];
  const slots = SLOTS[doses.length];
  if (!m || !slots) return null;
  return { slots, doses, on: doses.map((d) => Number(d.replace(/[½¼¾]/, "1")) > 0),
    rest: (pattern.slice(0, m.index) + pattern.slice(m.index + m[0].length)).trim() };
}

// `timing` is the backend's "morning, night, after food": the slots are drawn, the rest is shown beside them.
export function DoseStrip({ pattern, timing }: { pattern: string; timing?: string | null }) {
  const { t } = useTranslation();
  const d = parseDose(pattern);
  if (!d) return <><Badge tone="med">{pattern}</Badge>{timing && <Badge>{timing}</Badge>}</>;
  const { slots, doses, on } = d;
  const rest = timing ? timing.split(", ").filter((x) => !slots.includes(x)).join(", ") : d.rest;
  const label = [...slots.filter((_, i) => on[i]).map((s) => t(`dose.${s}`)), rest].filter(Boolean).join(", ");
  return (
    <span role="img" aria-label={label} className="flex flex-wrap items-center gap-1">
      {slots.map((s, i) => (
        <span key={s} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${on[i] ? "bg-brand-soft text-brand-strong" : "border border-dashed border-line text-muted/70"}`}>
          {t(`dose.${s}`)}{on[i] && doses[i] !== "1" && ` ×${doses[i]}`}
        </span>))}
      {rest && <span className="ml-1 text-xs text-muted">{rest}</span>}
    </span>
  );
}

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
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-md px-3 text-xs font-semibold transition ${o.value === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, sub, children }: { icon: IconName; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="card reveal flex flex-col items-center gap-3 px-6 py-12 text-center">
      <Icon name={icon} className="h-8 w-8 text-muted" strokeWidth={1.6} />
      <h2 className="h-display text-xl">{title}</h2>
      {sub && <p className="max-w-sm text-sm text-muted">{sub}</p>}
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="h-display text-xl">{children}</h2>{action}
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
