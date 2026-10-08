"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { api, Doc } from "@/api";
import { useProfile } from "@/Shell";
import Icon, { IconName } from "@/components/Icon";
import RangeGauge from "@/components/RangeGauge";
import { Badge, DOC_ICON, EmptyState, FLAG, fmtDate, SectionTitle, Skeleton, Spinner } from "@/components/ui";

const Stat = ({ icon, value, label, tone, d }: { icon: IconName; value: number; label: string; tone: string; d: number }) => (
  <div className="card reveal p-4" style={{ ["--d" as string]: d }}>
    <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }}><Icon name={icon} className="h-[18px] w-[18px]" /></span>
    <p className="h-display mt-3 text-3xl font-semibold tabular-nums">{value}</p>
    <p className="text-sm text-muted">{label}</p>
  </div>
);

const Chips = ({ items, tone, icon }: { items: string[]; tone: "dx" | "high"; icon: IconName }) => (
  <div className="flex flex-wrap gap-2">{items.map((c) => <Badge key={c} tone={tone} icon={icon}>{c}</Badge>)}</div>
);
const Block = ({ title, children, d }: { title: string; children: ReactNode; d: number }) => (
  <section className="card reveal p-5" style={{ ["--d" as string]: d }}><h2 className="eyebrow mb-3">{title}</h2>{children}</section>
);

export default function Home() {
  const { t, i18n } = useTranslation();
  const { profile: p } = useProfile();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  useEffect(() => { api.docs().then(setDocs).catch(() => setDocs([])); }, []);

  if (!p) return <div className="space-y-4"><Skeleton className="h-52 w-full" /><div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div></div>;
  const h = new Date().getHours();
  const greet = t(`greet.${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}`);
  const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const first = docs !== null && docs.length === 0;

  return (
    <div className="space-y-8">
      <section className="reveal relative overflow-hidden rounded-3xl border border-line p-6 text-ink shadow-card md:p-9"
        style={{ background: "linear-gradient(135deg, var(--brand-soft) 0%, var(--surface-2) 60%, var(--surface) 100%)" }}>
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl" aria-hidden />
        <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-brand opacity-30" aria-hidden>
          <path className="ecg" d="M0 44 H120 L140 44 L155 8 L175 76 L190 44 H262 L276 44 L288 24 L300 44 H400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="h-display grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand text-2xl font-semibold text-on-brand">{initials}</span>
            <div>
              <p className="text-sm text-muted">{greet}</p>
              <h1 className="h-display text-3xl font-semibold leading-tight md:text-4xl">{p.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                {p.age != null && <span className="rounded-full bg-surface/80 px-2.5 py-1 ring-1 ring-line">{t("age", { n: p.age })}</span>}
                <span className="inline-flex items-center gap-1 rounded-full bg-surface/80 px-2.5 py-1 ring-1 ring-line">
                  <Icon name="shield" className="h-3.5 w-3.5" />{p.abha.linked ? t("abhaLinked") : t("abhaNotLinked")}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/upload" className="btn btn-primary shadow-lg"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{t("nav.upload")}</Link>
            <Link href="/timeline" className="btn btn-ghost">{t("nav.timeline")}</Link>
          </div>
        </div>
        <p className="relative mt-5 max-w-md text-sm text-muted">{t("heroSub")}</p>
      </section>

      {first && <EmptyState icon="upload" title={t("firstRunTitle")} sub={t("firstRunSub")}>
        <Link href="/upload" className="btn btn-primary mt-2"><Icon name="upload" className="h-4 w-4" />{t("nav.upload")}</Link></EmptyState>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat d={1} icon="file" tone="brand" value={docs?.length ?? 0} label={t("stat.docs")} />
        <Stat d={2} icon="alert" tone={p.latest_abnormal.length ? "high" : "ok"} value={p.latest_abnormal.length} label={t("stat.abnormal")} />
        <Stat d={3} icon="pill" tone="med" value={p.current_medicines.length} label={t("stat.meds")} />
        <Stat d={4} icon="steth" tone="dx" value={p.conditions.length} label={t("stat.conditions")} />
      </div>

      <section>
        <SectionTitle>{t("needsAttention")}</SectionTitle>
        {p.latest_abnormal.length === 0 ? (
          <div className="card flex items-center gap-4 p-5">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-ok-soft text-ok"><Icon name="check" strokeWidth={2.6} /></span>
            <div><p className="font-semibold">{t("allClear")}</p><p className="text-sm text-muted">{t("allClearSub")}</p></div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {p.latest_abnormal.map((a, i) => {
              const f = FLAG[a.interpretation];
              return (
                <Link key={i} href={`/documents/${a.document_id}`} className="card reveal group block p-4 transition hover:-translate-y-0.5 hover:border-brand/40" style={{ ["--d" as string]: i }}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{a.test}</h3>
                    {f && <Badge tone={f.tone} icon={f.icon}>{t(f.label)}</Badge>}
                  </div>
                  <p className="h-display text-2xl font-semibold tabular-nums">{a.value} <span className="text-sm font-normal text-muted">{a.unit}</span></p>
                  {typeof a.value === "number" && <RangeGauge compact value={a.value} low={a.ref_low} high={a.ref_high} unit={a.unit} flag={a.interpretation} />}
                </Link>);
            })}
          </div>)}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Block d={1} title={t("currentMedicines")}>
          {p.current_medicines.length ? (
            <ul className="space-y-2.5">
              {p.current_medicines.map((m, i) => (
                <li key={i}><Link href={`/documents/${m.document_id}`} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-surface-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-med-soft text-med"><Icon name="pill" className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block truncate font-medium">{m.name}</span>
                    <span className="block truncate text-xs text-muted">{[m.salt, m.dose_pattern].filter(Boolean).join(" · ")}</span></span>
                </Link></li>))}
            </ul>) : <p className="text-sm text-muted">{t("none")}</p>}
        </Block>
        <div className="space-y-4">
          <Block d={2} title={t("conditions")}>{p.conditions.length ? <Chips items={p.conditions} tone="dx" icon="steth" /> : <p className="text-sm text-muted">{t("none")}</p>}</Block>
          <Block d={3} title={t("allergies")}>{p.allergies.length ? <Chips items={p.allergies} tone="high" icon="alert" /> : <p className="text-sm text-muted">{t("none")}</p>}</Block>
        </div>
      </div>

      {docs && docs.length > 0 && (
        <section>
          <SectionTitle action={<Link href="/timeline" className="text-sm font-semibold text-brand hover:underline">{t("viewAll")}</Link>}>{t("recentDocs")}</SectionTitle>
          <ul className="card divide-y divide-line overflow-hidden">
            {docs.slice(0, 5).map((d) => (
              <li key={d.id}><Link href={`/documents/${d.id}`} className="flex items-center gap-4 p-4 transition hover:bg-surface-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name={DOC_ICON[d.doc_type ?? "other"] ?? "file"} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{d.doc_type ? t(`docType.${d.doc_type}`) : t("docType.other")}</span>
                  <span className="block truncate text-xs text-muted">{[fmtDate(d.doc_date ?? d.created_at, i18n.language), d.facility].filter(Boolean).join(" · ")}</span>
                </span>
                {d.status === "processing" ? <span className="flex items-center gap-1.5 text-xs text-muted"><Spinner />{t("stage.reading")}</span>
                  : d.status === "failed" ? <Badge tone="crit" icon="alert">{t("failedTitle")}</Badge>
                  : d.source === "abdm" ? <Badge tone="med" icon="shield">{t("abdmBadge")}</Badge> : null}
                <Icon name="chevron" className="h-4 w-4 text-muted" />
              </Link></li>))}
          </ul>
        </section>)}
    </div>
  );
}
