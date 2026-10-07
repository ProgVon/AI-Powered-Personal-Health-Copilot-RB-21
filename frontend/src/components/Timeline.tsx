import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TimelineItem } from "../api";
import { FLAG_LABEL } from "./AbnormalCard";

const ICON: Record<string, string> = { document: "📄", abnormal_result: "⚠", medicine_started: "💊", medicine_ended: "⏹", diagnosis: "🩺" };

export default function Timeline({ items }: { items: TimelineItem[] }) {
  const { t, i18n } = useTranslation();
  if (!items.length) return <p className="text-slate-600">{t("noItems")}</p>;
  const groups = new Map<string, TimelineItem[]>();
  for (const i of items) {
    const m = new Date(i.date).toLocaleDateString(i18n.language, { month: "long", year: "numeric" });
    groups.set(m, [...(groups.get(m) ?? []), i]);
  }
  return (
    <div className="space-y-6">
      {[...groups].map(([month, xs]) => (
        <section key={month}>
          <h3 className="mb-2 font-semibold text-slate-700">{month}</h3>
          <ol className="space-y-2 border-l-2 border-slate-300 pl-4">
            {xs.map((i, k) => (
              <li key={k}>
                <Link to={`/documents/${i.document_id}`} className="block rounded-lg bg-white p-3 shadow-sm hover:bg-teal-50">
                  <span aria-hidden>{ICON[i.type]} </span><b className="capitalize">{i.title}</b>
                  {i.interpretation && <span className="ml-2 text-sm">{t(FLAG_LABEL[i.interpretation])}</span>}
                  {i.detail && <span className="ml-2 text-sm text-slate-600">{i.detail}</span>}
                  {i.source === "abdm" && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-800">{t("abdmBadge")}</span>}
                  <span className="float-right text-xs text-slate-500">{i.date}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
