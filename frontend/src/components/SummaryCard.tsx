import { useTranslation } from "react-i18next";
import type { Summary } from "../api";
import AbnormalCard from "./AbnormalCard";

export default function SummaryCard({ s }: { s: Summary }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-xl font-semibold">{s.headline}</h2>
      <ul className="list-disc space-y-1 pl-5">{s.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
      {s.abnormal_explanations.map((a, i) => (
        <AbnormalCard key={i} test={a.test} value={a.value} status={a.status}>
          <p className="mt-2 text-sm"><b>{t("meaning")}: </b>{a.what_it_means}</p>
          {a.common_reasons && <p className="mt-1 text-sm"><b>{t("reasons")}: </b>{a.common_reasons}</p>}
          <p className="mt-1 text-sm"><b>{t("askDoctor")}: </b>{a.question_for_doctor}</p>
        </AbnormalCard>
      ))}
      {s.medicines_explained.length > 0 && (
        <div>
          <h3 className="font-semibold">{t("medicines")}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {s.medicines_explained.map((m, i) => (
              <li key={i}><b>{m.name}</b>{m.general_purpose && ` — ${m.general_purpose}`}{m.how_to_take && ` (${m.how_to_take})`}</li>
            ))}
          </ul>
        </div>
      )}
      {s.next_steps.length > 0 && (
        <div>
          <h3 className="font-semibold">{t("nextSteps")}</h3>
          <ul className="list-disc pl-5 text-sm">{s.next_steps.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      <p className="border-t pt-3 text-xs text-slate-600">{t("disclaimer")}</p>
    </section>
  );
}
