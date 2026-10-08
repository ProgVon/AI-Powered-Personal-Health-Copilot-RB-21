"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api, Doc, Summary } from "@/api";
import AbnormalCard from "@/components/AbnormalCard";
import Icon from "@/components/Icon";
import SummaryCard from "@/components/SummaryCard";
import { Badge, DOC_ICON, EmptyState, fmtDate, SectionTitle, Segmented, Skeleton, Spinner } from "@/components/ui";

type Tab = "summary" | "data" | "original";

function Processing() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  useEffect(() => { const i = setInterval(() => setStep((s) => Math.min(s + 1, 2)), 4000); return () => clearInterval(i); }, []);
  return (
    <div className="card reveal mx-auto max-w-lg space-y-5 p-8 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-brand"><Spinner className="h-7 w-7" /></div>
      <h1 className="h-display text-2xl font-semibold">{t("processing.title")}</h1>
      <ol className="space-y-2 text-left text-sm">
        {(["s1", "s2", "s3"] as const).map((k, i) => (
          <li key={k} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${i === step ? "bg-brand-soft font-semibold text-brand-strong" : i < step ? "text-muted" : "text-muted/60"}`}>
            <span className="grid h-5 w-5 place-items-center">{i < step ? <Icon name="check" className="h-4 w-4 text-ok" strokeWidth={2.6} /> : i === step ? <Spinner /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span>
            {t(`processing.${k}`)}
          </li>))}
      </ol>
      <div className="indeterminate relative h-1.5 overflow-hidden rounded-full bg-line" />
    </div>
  );
}

export default function DocumentDetail() {
  const id = Number(useParams<{ id: string }>().id);
  const { t, i18n } = useTranslation();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ url: string; type: string } | null>(null);
  const [tab, setTab] = useState<Tab>("summary");

  useEffect(() => {  // poll until the summary lands; extracted data shows as soon as status is "summarizing"
    let timer: number;
    const load = () => api.doc(id).then((d) => { setDoc(d); if (d.status === "processing" || d.status === "summarizing") timer = window.setTimeout(load, 1000); });
    load();
    return () => clearTimeout(timer);
  }, [id]);
  useEffect(() => { if (doc?.source === "upload" && doc.status !== "processing") api.file(id).then(setFile).catch(() => {}); }, [id, doc?.source, doc?.status === "processing"]);
  useEffect(() => {  // summary follows the UI language; translations are cached server-side
    if (doc?.status !== "done" || !doc.summary) return;
    setBusy(true);
    api.summary(id, i18n.language).then(setSummary).catch(() => setSummary(doc.summary!)).finally(() => setBusy(false));
  }, [id, doc, i18n.language]);

  if (!doc) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (doc.status === "processing") return <Processing />;
  if (doc.status === "failed")
    return <EmptyState icon="alert" title={t("failedTitle")} sub={t("failedSub")}><Link href="/upload" className="btn btn-primary mt-2"><Icon name="upload" className="h-4 w-4" />{t("tryAgain")}</Link></EmptyState>;

  const kind = doc.doc_type ?? "other";
  const warnings = doc.extraction?._warnings ?? [];
  const obs = doc.observations ?? [], meds = doc.medications ?? [];
  const hasData = obs.length || meds.length || doc.conditions?.length || doc.allergies?.length;
  const tabs = [{ value: "summary" as Tab, label: t("tab.summary") }, { value: "data" as Tab, label: t("tab.data") },
    ...(file ? [{ value: "original" as Tab, label: t("tab.original") }] : [])];

  return (
    <div className="space-y-6">
      <header className="reveal flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name={DOC_ICON[kind] ?? "file"} className="h-7 w-7" /></span>
          <div>
            <h1 className="h-display text-3xl font-semibold">{t(`docType.${kind}`)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              {doc.doc_date && <span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="h-4 w-4" />{fmtDate(doc.doc_date, i18n.language, "long")}</span>}
              {doc.facility && <span className="inline-flex items-center gap-1.5"><Icon name="building" className="h-4 w-4" />{doc.facility}</span>}
              {doc.practitioner && <span className="inline-flex items-center gap-1.5"><Icon name="user" className="h-4 w-4" />{doc.practitioner}</span>}
              {doc.source === "abdm" && <Badge tone="med" icon="shield">{t("abdmBadge")}</Badge>}
            </p>
          </div>
        </div>
        <button className="btn btn-ghost no-print" onClick={() => window.print()}><Icon name="printer" className="h-4 w-4" />{t("print")}</button>
      </header>

      {warnings.length > 0 && (
        <div role="alert" className="reveal flex gap-3 rounded-2xl border border-high/40 bg-high-soft p-4 text-sm text-ink">
          <Icon name="alert" className="mt-0.5 h-5 w-5 text-high" />
          <div><p className="font-semibold">{t("warnings")}</p><ul className="mt-1 list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
        </div>)}

      <div className="no-print flex items-center gap-3">
        <Segmented label="View" value={tab} onChange={setTab} options={tabs} />
        {busy && <span className="flex items-center gap-2 text-sm text-muted"><Spinner />{t("translating")}</span>}
      </div>

      {/* summary and data both render; the inactive one is hidden on screen but still printed */}
      <div className={tab === "summary" ? "" : "hidden print:block"}>
        {summary
          ? <SummaryCard s={summary} observations={obs} />
          : doc.status === "summarizing"
            ? <div className="card flex items-center gap-3 p-6 text-muted"><Spinner />{t("processing.s3")}</div>
            : <EmptyState icon="file" title={t("noSummary")} />}
      </div>

      <div className={tab === "data" ? "" : "hidden print:block"}>
        <div className="space-y-8 print:mt-8">
          {!hasData && <EmptyState icon="file" title={t("noData")} />}
          {obs.length > 0 && (
            <section>
              <SectionTitle>{t("labResults")}</SectionTitle>
              <div className="grid gap-4 lg:grid-cols-2">
                {obs.map((o, i) => (
                  <div key={o.id} className="reveal" style={{ ["--d" as string]: Math.min(i, 8) }}>
                    <AbnormalCard name={o.display_name} flag={o.interpretation} obs={o}
                      value={[o.value_num ?? o.value_text, o.unit].filter((x) => x != null && x !== "").join(" ")}>
                      {o.note ? <p className="flex gap-2 text-high"><Icon name="alert" className="mt-0.5 h-4 w-4" />{o.note}</p> : null}
                    </AbnormalCard>
                  </div>))}
              </div>
            </section>)}
          {meds.length > 0 && (
            <section>
              <SectionTitle>{t("medicines")}</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {meds.map((m) => (
                  <article key={m.id} className="card flex gap-3 p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-med-soft text-med"><Icon name="pill" /></span>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{m.brand_name}</h3>
                      <p className="text-sm text-muted">{[m.salt, m.strength].filter(Boolean).join(" · ")}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.dose_pattern && <Badge tone="med">{m.dose_pattern}</Badge>}
                        {m.timing && <Badge>{m.timing}</Badge>}
                        {m.duration_days != null && <Badge>{m.duration_days} d</Badge>}
                      </div>
                    </div>
                  </article>))}
              </div>
            </section>)}
          {(doc.conditions?.length || doc.allergies?.length) ? (
            <section className="flex flex-wrap gap-2">
              {doc.conditions?.map((c, i) => <Badge key={i} tone="dx" icon="steth">{c.name}</Badge>)}
              {doc.allergies?.map((a, i) => <Badge key={i} tone="high" icon="alert">{a.substance}</Badge>)}
            </section>) : null}
        </div>
      </div>

      {tab === "original" && file && (
        <div className="card overflow-hidden">
          {file.type.startsWith("image/")
            ? <img src={file.url} alt={t("tab.original")} className="mx-auto max-h-[80vh] w-auto" />
            : <iframe src={file.url} title={t("tab.original")} className="h-[80vh] w-full" />}
        </div>)}
    </div>
  );
}
