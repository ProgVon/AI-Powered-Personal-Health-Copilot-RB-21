"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { api, Doc, Profile } from "@/api";
import { useProfile } from "@/Shell";
import Icon, { IconName } from "@/components/Icon";
import ProfileForm from "@/components/ProfileForm";
import RangeGauge from "@/components/RangeGauge";
import ReportDemo from "@/components/ReportDemo";
import { Badge, DOC_ICON, FLAG, fmtDate, parseDose, SectionTitle, Sheet, Skeleton, Spinner } from "@/components/ui";

const Chips = ({ items, tone, icon }: { items: string[]; tone: "dx" | "high"; icon: IconName }) => (
  <div className="flex flex-wrap gap-2">{items.map((c) => <Badge key={c} tone={tone} icon={icon}>{c}</Badge>)}</div>
);
const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="card p-5"><h2 className="eyebrow mb-3">{title}</h2>{children}</section>
);

// The day's doses in columns, the current part of the day marked. Doses written any other way are listed as written.
function Schedule({ meds }: { meds: Profile["current_medicines"] }) {
  const { t } = useTranslation();
  const parsed = meds.map((m) => ({ m, d: m.dose_pattern ? parseDose(m.dose_pattern) : null }));
  const cols = ["morning", "afternoon", "evening", "night"].filter((s) => s !== "evening" || parsed.some((x) => x.d?.slots.includes(s)));
  const h = new Date().getHours();
  const now = h < 12 ? "morning" : h < 17 ? "afternoon" : h < 20 && cols.includes("evening") ? "evening" : "night";
  const other = parsed.filter((x) => !x.d);
  return (
    <div className="card overflow-hidden">
      <div className={`grid divide-y divide-line sm:divide-x sm:divide-y-0 ${cols.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {cols.map((s) => {
          const due = parsed.flatMap(({ m, d }) => { const i = d?.slots.indexOf(s) ?? -1; return i >= 0 && d!.on[i] ? [{ m, n: d!.doses[i], rest: d!.rest }] : []; });
          return (
            <section key={s} aria-current={s === now ? "time" : undefined} className={`p-4 ${s === now ? "bg-brand-soft/60" : ""}`}>
              <h3 className="flex min-h-6 items-center justify-between gap-2 text-sm font-semibold">{t(`dose.${s}`)}{s === now && <Badge tone="brand"><i className="live" />{t("now")}</Badge>}</h3>
              <ul className="-mx-1.5 mt-2 space-y-1">
                {due.length ? due.map(({ m, n, rest }, i) => (
                  <li key={i}><Link href={`/documents/${m.document_id}`} className="flex gap-2.5 rounded-lg p-1.5 transition hover:bg-surface-2">
                    <Icon name="pill" className="mt-0.5 h-4 w-4 text-med" />
                    <span className="min-w-0"><span className="block font-medium leading-snug">{m.name}{n !== "1" && <span className="text-muted"> ×{n}</span>}</span>
                      {rest && <span className="block text-xs text-muted">{rest}</span>}</span>
                  </Link></li>))
                  : <li className="p-1.5 text-sm text-muted" aria-label={t("none")}>—</li>}
              </ul>
            </section>);
        })}
      </div>
      {other.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line p-4 text-sm">
          <span className="font-semibold">{t("asPrescribed")}</span>
          {other.map(({ m }, i) => <Link key={i} href={`/documents/${m.document_id}`} className="flex items-center gap-2 hover:underline">
            {m.name}{m.dose_pattern && <Badge tone="med">{m.dose_pattern}</Badge>}</Link>)}
        </div>)}
    </div>
  );
}

// The latest reports as a pile of paper, like the login demo. The top sheet marks the first value
// that needs attention; while a document is being read, a scan line passes over it.
function Pile({ docs, hit }: { docs: Doc[]; hit?: Profile["latest_abnormal"][number] }) {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="relative h-[6.3rem] w-32 shrink-0 sm:h-40 sm:w-52">
      <div className="pile absolute right-0 top-0 h-40 w-52 origin-top-right max-sm:scale-[.615]">
        {docs.length > 2 && <div className="paper" style={{ rotate: "6deg" }} />}
        {docs.length > 1 && <div className="paper" style={{ rotate: "-5deg" }} />}
        <div className={`paper ${docs.some((d) => d.status === "processing") ? "scan" : ""}`} style={{ rotate: "-1.5deg" }}>
          <div className="flex items-center justify-between"><i className="rd-bar w-14" /><i className="rd-bar w-8" /></div>
          <p className="mb-1.5 mt-2.5 truncate text-[11px] font-bold">{t(`docType.${docs[0].doc_type ?? "other"}`)}</p>
          {hit && <div className="rd-row rd-hit"><span className="truncate">{hit.test}</span><b className="tabular-nums">{hit.value}</b>
            <span className="tabular-nums">{hit.ref_low != null && hit.ref_high != null ? `${hit.ref_low}–${hit.ref_high}` : ""}</span></div>}
          {[[60, 70, 86], [46, 66, 90], [70, 72, 84], [52, 68, 88]].map(([a, b, c], i) => (
            <div key={i} className="rd-row"><i className="rd-bar" style={{ width: `${a}%` }} /><i className="rd-bar" style={{ width: `${b}%` }} /><i className="rd-bar" style={{ width: `${c}%` }} /></div>))}
        </div>
      </div>
    </div>
  );
}

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
    <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[1fr_20rem]">
      <header className="rise lg:col-span-2">
        <p className="text-sm text-muted">{greet}, {p.name}</p>
        <h1 className="h-display mt-1 text-3xl md:text-4xl">{t("start.title")}</h1>
        <p className="mt-2 text-muted">{t("start.sub")}</p>
      </header>
      <ol className="rise card divide-y divide-line self-start" style={{ animationDelay: "80ms" }}>
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
      <div className="rise lg:pt-2" style={{ animationDelay: "160ms" }}><ReportDemo /></div>
      <p className="text-xs leading-relaxed text-muted lg:col-span-2">{t("disclaimer")}</p>
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
      <header className="rise flex items-start justify-between gap-4 md:items-center">
        <div className="min-w-0">
          <p className="text-sm text-muted">{greet}</p>
          <h1 className="h-display text-3xl leading-tight md:text-5xl">{p.name}</h1>
          <p className="mt-2 text-sm text-muted">{summary}</p>
          {!editing && p.sex && <button className="btn btn-ghost mt-4" onClick={() => setEditing(true)}><Icon name="user" className="h-4 w-4" />{t("details.edit")}</button>}
        </div>
        <Pile docs={docs} hit={p.latest_abnormal[0]} />
      </header>

      {editing || !p.sex ? (
        !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
            <p className="flex gap-3 text-sm"><Icon name="user" className="h-5 w-5 text-muted" />{t("detailsNudge")}</p>
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>{t("addDetails")}</button>
          </div>
        ) : <Block title={t("details.title")}><ProfileForm p={p} onSaved={() => { setEditing(false); reload(); }} /></Block>
      ) : null}

      <section className="rise" style={{ animationDelay: "80ms" }}>
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
                <Link key={i} href={`/documents/${a.document_id}`} style={{ animationDelay: `${160 + i * 70}ms` }}
                  className={`rise card block p-4 transition hover:-translate-y-0.5 hover:border-muted/50 ${f?.tone === "crit" ? "border-crit/50" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div><h3 className="font-semibold">{a.test}</h3>{a.date && <p className="text-xs text-muted">{fmtDate(a.date, i18n.language)}</p>}</div>
                    {f && <Badge tone={f.tone} icon={f.icon}>{t(f.label)}</Badge>}
                  </div>
                  <p className="h-display mt-1 text-2xl tabular-nums">{a.value} <span className="font-sans text-sm font-normal text-muted">{a.unit}</span></p>
                  {typeof a.value === "number" && <RangeGauge compact value={a.value} low={a.ref_low} high={a.ref_high} unit={a.unit} flag={a.interpretation} />}
                </Link>);
            })}
          </div>)}
      </section>

      <section className="rise" style={{ animationDelay: "240ms" }}>
        <SectionTitle>{t("currentMedicines")}</SectionTitle>
        {p.current_medicines.length ? <Schedule meds={p.current_medicines} /> : <p className="card p-5 text-sm text-muted">{t("none")}</p>}
      </section>

      <div className="rise grid gap-4 md:grid-cols-2" style={{ animationDelay: "320ms" }}>
        <Block title={t("conditions")}>{p.conditions.length ? <Chips items={p.conditions} tone="dx" icon="steth" /> : <p className="text-sm text-muted">{t("none")}</p>}</Block>
        <Block title={t("allergies")}>{p.allergies.length ? <Chips items={p.allergies} tone="high" icon="alert" /> : <p className="text-sm text-muted">{t("none")}</p>}</Block>
      </div>

      <section className="rise" style={{ animationDelay: "400ms" }}>
        <SectionTitle action={<Link href="/timeline" className="text-sm font-semibold text-brand underline-offset-4 hover:underline">{t("viewAll")}</Link>}>{t("recentDocs")}</SectionTitle>
        <ul className="card divide-y divide-line overflow-hidden">
          {docs.slice(0, 5).map((d) => (
            <li key={d.id}><Link href={`/documents/${d.id}`} className="flex items-center gap-4 p-4 transition hover:bg-surface-2">
              {d.status === "processing" ? <Sheet scanning className="h-11 w-9 shrink-0" />
                : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"><Icon name={DOC_ICON[d.doc_type ?? "other"] ?? "file"} /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.doc_type ? t(`docType.${d.doc_type}`) : t("docType.other")}</span>
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
