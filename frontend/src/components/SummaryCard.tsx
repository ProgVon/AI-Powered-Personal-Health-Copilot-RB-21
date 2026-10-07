import { useTranslation } from "react-i18next";
import type { Obs, Summary } from "../api";
import AbnormalCard from "./AbnormalCard";
import Icon, { IconName } from "./Icon";
import { Badge, flagFromLabel, SectionTitle } from "./ui";

const Line = ({ icon, label, text }: { icon: IconName; label: string; text: string }) => (
  <p className="flex gap-2.5"><Icon name={icon} className="mt-0.5 h-4 w-4 text-brand" />
    <span><b className="font-semibold">{label}: </b>{text}</span></p>
);

export default function SummaryCard({ s, observations }: { s: Summary; observations: Obs[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <section className="card reveal relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-soft blur-2xl" aria-hidden />
        <Badge tone="brand" icon="sparkles">{t("aiSummary")}</Badge>
        <h2 className="h-display relative mt-3 text-2xl font-semibold leading-snug md:text-3xl">{s.headline}</h2>
        {s.key_points.length > 0 && (
          <ul className="relative mt-5 space-y-2.5">
            {s.key_points.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-on-brand"><Icon name="check" className="h-3 w-3" strokeWidth={3} /></span>
                <span>{p}</span>
              </li>))}
          </ul>)}
      </section>

      {s.abnormal_explanations.length > 0 && (
        <section>
          <SectionTitle>{t("stands")}</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {s.abnormal_explanations.map((a, i) => {
              // match back to the structured value so the gauge uses code-computed numbers, not LLM text
              const obs = observations.find((o) => o.display_name === a.test);
              const flag = obs?.interpretation ?? flagFromLabel(a.status);
              return (
                <div key={i} className="reveal" style={{ ["--d" as string]: i + 1 }}>
                  <AbnormalCard name={a.test} value={a.value} flag={flag} obs={obs}>
                    <Line icon="lightbulb" label={t("meaning")} text={a.what_it_means} />
                    {a.common_reasons && <Line icon="activity" label={t("reasons")} text={a.common_reasons} />}
                    <Line icon="message" label={t("askDoctor")} text={a.question_for_doctor} />
                  </AbnormalCard>
                </div>);
            })}
          </div>
        </section>)}

      {s.medicines_explained.length > 0 && (
        <section>
          <SectionTitle>{t("medicines")}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {s.medicines_explained.map((m, i) => (
              <article key={i} className="card reveal flex gap-3 p-4" style={{ ["--d" as string]: i + 1 }}>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-med-soft text-med"><Icon name="pill" /></div>
                <div className="min-w-0">
                  <h3 className="font-semibold">{m.name}</h3>
                  {m.general_purpose && <p className="text-sm text-muted">{m.general_purpose}</p>}
                  {m.how_to_take && <p className="mt-1.5 inline-block rounded-lg bg-surface-2 px-2 py-1 text-sm">{m.how_to_take}</p>}
                </div>
              </article>))}
          </div>
        </section>)}

      {s.next_steps.length > 0 && (
        <section>
          <SectionTitle>{t("nextSteps")}</SectionTitle>
          <ol className="card divide-y divide-line">
            {s.next_steps.map((n, i) => (
              <li key={i} className="flex gap-3 p-4">
                <span className="h-display grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-strong">{i + 1}</span>
                <span className="pt-0.5">{n}</span>
              </li>))}
          </ol>
        </section>)}

      <p className="flex gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-xs leading-relaxed text-muted">
        <Icon name="shield" className="h-4 w-4 text-brand" />{t("disclaimer")}
      </p>
    </div>
  );
}
