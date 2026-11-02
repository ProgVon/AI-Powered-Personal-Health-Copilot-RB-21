"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { api, Doc, Profile } from "@/api";
import { useProfile } from "@/Shell";
import Icon, { IconName } from "@/components/Icon";
import ProfileForm from "@/components/ProfileForm";
import RangeGauge from "@/components/RangeGauge";
import { Badge, DOC_ICON, FLAG, fmtDate, SectionTitle, Skeleton, Spinner } from "@/components/ui";

const Chips = ({ items, tone, icon }: { items: string[]; tone: "dx" | "high"; icon: IconName }) => (
  <div className="flex flex-wrap gap-2">{items.map((c) => <Badge key={c} tone={tone} icon={icon}>{c}</Badge>)}</div>
);
const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="card p-5"><h2 className="eyebrow mb-3">{title}</h2>{children}</section>
);

function Step({ n, done, title, sub, children }: { n: number; done: boolean; title: string; sub?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <li className="flex gap-4 p-5 md:p-6">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums ${done ? "bg-ok text-white" : "border border-line text-muted"}`}>
        {done ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="font-semibold">{title}{done && <span className="sr-only"> ({t("start.done")})</span>}</h2>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
        {children}
      </div>
    </li>
  );
}

// First visit: one checklist instead of a dashboard of zeros.
function GetStarted({ p, greet, reload }: { p: Profile; greet: string; reload: () => void }) {
  const { t } = useTranslation();
  const hasDetails = !!p.sex;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">{greet}, {p.name}</p>
        <h1 className="h-display mt-1 text-3xl md:text-4xl">{t("start.title")}</h1>
        <p className="mt-2 text-muted">{t("start.sub")}</p>
      </header>
      <ol className="card divide-y divide-line">
        <Step n={1} done={hasDetails} title={t("start.details")} sub={hasDetails ? [p.name, p.age != null && t("age", { n: p.age })].filter(Boolean).join(" · ") : undefined}>
          {!hasDetails && <ProfileForm p={p} onSaved={reload} />}
        </Step>
        <Step n={2} done={false} title={t("start.upload")} sub={t("start.uploadSub")}>
          <Link href="/upload" className="btn btn-upload"><Icon name="upload" className="h-4 w-4" />{t("nav.upload")}</Link>
        </Step>
        <Step n={3} done={p.abha.linked} title={t("start.abha")} sub={t("start.abhaSub")}>
          {!p.abha.linked && <Link href="/abha" className="btn btn-ghost"><Icon name="link" className="h-4 w-4" />{t("nav.abha")}</Link>}
        </Step>
      </ol>
      <p className="text-xs leading-relaxed text-muted">{t("disclaimer")}</p>
    </div>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const { profile: p, reload } = useProfile();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { api.docs().then(setDocs).catch(() => setDocs([])); }, []);

  if (!p || docs === null) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>;
  const h = new Date().getHours();
  const greet = t(`greet.${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}`);
  if (docs.length === 0) return <GetStarted p={p} greet={greet} reload={reload} />;

  const summary = [t("sum.docs", { count: docs.length }),
    p.latest_abnormal.length > 0 && t("sum.abnormal", { count: p.latest_abnormal.length }),
    p.current_medicines.length > 0 && t("sum.meds", { count: p.current_medicines.length })].filter(Boolean).join(" · ");

  return (
    <div className="space-y-10">
      <header className="card relative flex flex-wrap items-end justify-between gap-4 overflow-hidden p-6 pb-16 md:p-8 md:pb-16">
        <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-1 h-12 w-full text-ink opacity-25" aria-hidden>
          <path className="ecg" d="M0 44 H120 L140 44 L155 8 L175 76 L190 44 H262 L276 44 L288 24 L300 44 H400" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="relative">
          <p className="text-sm text-muted">{greet}</p>
          <h1 className="h-display text-3xl md:text-4xl">{p.name}</h1>
          <p className="mt-2 text-sm text-muted">{summary}</p>
        </div>
        {!editing && p.sex && <button className="btn btn-ghost relative" onClick={() => setEditing(true)}><Icon name="user" className="h-4 w-4" />{t("details.edit")}</button>}
      </header>

      {editing || !p.sex ? (
        !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
            <p className="flex gap-3 text-sm"><Icon name="user" className="h-5 w-5 text-muted" />{t("detailsNudge")}</p>
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>{t("addDetails")}</button>
          </div>
        ) : <Block title={t("details.title")}><ProfileForm p={p} onSaved={() => { setEditing(false); reload(); }} /></Block>
      ) : null}

      <section>
        <SectionTitle>{t("needsAttention")}</SectionTitle>
        {p.latest_abnormal.length === 0 ? (
          <div className="card flex items-center gap-4 p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ok-soft text-ok"><Icon name="check" strokeWidth={2.6} /></span>
            <div><p className="font-semibold">{t("allClear")}</p><p className="text-sm text-muted">{t("allClearSub")}</p></div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {p.latest_abnormal.map((a, i) => {
              const f = FLAG[a.interpretation];
              return (
                <Link key={i} href={`/documents/${a.document_id}`} className="card block p-4 transition hover:border-muted/50">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{a.test}</h3>
                    {f && <Badge tone={f.tone} icon={f.icon}>{t(f.label)}</Badge>}
                  </div>
                  <p className="h-display mt-1 text-2xl tabular-nums">{a.value} <span className="font-sans text-sm font-normal text-muted">{a.unit}</span></p>
                  {typeof a.value === "number" && <RangeGauge compact value={a.value} low={a.ref_low} high={a.ref_high} unit={a.unit} flag={a.interpretation} />}
                </Link>);
            })}
          </div>)}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title={t("currentMedicines")}>
          {p.current_medicines.length ? (
            <ul className="-mx-1.5 space-y-1">
              {p.current_medicines.map((m, i) => (
                <li key={i}><Link href={`/documents/${m.document_id}`} className="flex items-center gap-3 rounded-lg p-1.5 transition hover:bg-surface-2">
                  <Icon name="pill" className="h-4 w-4 text-muted" />
                  <span className="min-w-0"><span className="block truncate font-medium">{m.name}</span>
                    <span className="block truncate text-xs text-muted">{[m.salt, m.dose_pattern].filter(Boolean).join(" · ")}</span></span>
                </Link></li>))}
            </ul>) : <p className="text-sm text-muted">{t("none")}</p>}
        </Block>
        <div className="space-y-4">
          <Block title={t("conditions")}>{p.conditions.length ? <Chips items={p.conditions} tone="dx" icon="steth" /> : <p className="text-sm text-muted">{t("none")}</p>}</Block>
          <Block title={t("allergies")}>{p.allergies.length ? <Chips items={p.allergies} tone="high" icon="alert" /> : <p className="text-sm text-muted">{t("none")}</p>}</Block>
        </div>
      </div>

      <section>
        <SectionTitle action={<Link href="/timeline" className="text-sm font-semibold text-brand underline-offset-4 hover:underline">{t("viewAll")}</Link>}>{t("recentDocs")}</SectionTitle>
        <ul className="card divide-y divide-line overflow-hidden">
          {docs.slice(0, 5).map((d) => (
            <li key={d.id}><Link href={`/documents/${d.id}`} className="flex items-center gap-4 p-4 transition hover:bg-surface-2">
              <Icon name={DOC_ICON[d.doc_type ?? "other"] ?? "file"} className="h-5 w-5 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{d.doc_type ? t(`docType.${d.doc_type}`) : t("docType.other")}</span>
                <span className="block truncate text-xs text-muted">{[fmtDate(d.doc_date ?? d.created_at, i18n.language), d.facility].filter(Boolean).join(" · ")}</span>
              </span>
              {d.status === "processing" ? <span className="flex items-center gap-1.5 text-xs text-muted"><Spinner />{t("stage.reading")}</span>
                : d.status === "failed" ? <Badge tone="crit" icon="alert">{t("failedTitle")}</Badge>
                : d.source === "abdm" ? <Badge tone="neutral" icon="shield">{t("abdmBadge")}</Badge> : null}
              <Icon name="chevron" className="h-4 w-4 text-muted" />
            </Link></li>))}
        </ul>
      </section>
    </div>
  );
}
