import { useTranslation } from "react-i18next";

const STYLE: Record<string, string> = {
  High: "border-amber-500 bg-amber-50", Low: "border-sky-500 bg-sky-50",
  "Critically high": "border-red-600 bg-red-50", "Critically low": "border-red-600 bg-red-50",
};
const ICON: Record<string, string> = { High: "▲", Low: "▼", "Critically high": "▲▲", "Critically low": "▼▼" };

export const FLAG_LABEL: Record<string, string> = { H: "High", L: "Low", HH: "Critically high", LL: "Critically low" };

// status is always shown as text + arrow, never colour alone
export default function AbnormalCard({ test, value, status, children }:
  { test: string; value: string; status: string; children?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-lg border-l-4 p-3 ${STYLE[status] ?? "border-slate-400 bg-slate-50"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{test}</span>
        <span className="text-sm font-medium">{value} · <span aria-hidden>{ICON[status]} </span>{t(status)}</span>
      </div>
      {children}
    </div>
  );
}
