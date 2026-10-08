import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { TimelineItem } from "../api";
import Icon, { IconName } from "./Icon";
import { Badge, FLAG, fmtDate, fmtMonth } from "./ui";

const KIND: Record<string, { icon: IconName; tone: string }> = {
  document: { icon: "file", tone: "brand" }, abnormal_result: { icon: "flask", tone: "high" },
  medicine_started: { icon: "pill", tone: "med" }, medicine_ended: { icon: "pill", tone: "muted" }, diagnosis: { icon: "steth", tone: "dx" },
};

export default function Timeline({ items }: { items: TimelineItem[] }) {
  const { t, i18n } = useTranslation();
  const groups = new Map<string, TimelineItem[]>();
  for (const i of items) groups.set(fmtMonth(i.date, i18n.language), [...(groups.get(fmtMonth(i.date, i18n.language)) ?? []), i]);
  let n = 0;
  return (
    <div className="space-y-8">
      {[...groups].map(([month, xs]) => (
        <section key={month}>
          <h2 className="eyebrow sticky top-0 z-10 -mx-1 mb-3 bg-bg/85 px-1 py-2 backdrop-blur">{month}</h2>
          <ol className="relative space-y-3 pl-12 before:absolute before:bottom-2 before:left-[19px] before:top-2 before:w-0.5 before:rounded before:bg-line">
            {xs.map((i, k) => {
              const kind = KIND[i.type] ?? KIND.document;
              const f = i.interpretation ? FLAG[i.interpretation] : undefined;
              const tone = f && i.type === "abnormal_result" ? (f.tone === "crit" ? "crit" : f.tone) : kind.tone;
              const title = i.type === "document" ? t(`docType.${i.title.replace(/ /g, "_")}`, { defaultValue: i.title }) : i.title;
              return (
                <li key={k} className="reveal relative" style={{ ["--d" as string]: Math.min(n++, 8) }}>
                  <span className="absolute -left-12 top-3 grid h-10 w-10 place-items-center rounded-full border-4 border-bg"
                    style={{ background: tone === "muted" ? "var(--line)" : `var(--${tone}-soft)`, color: tone === "muted" ? "var(--muted)" : `var(--${tone})` }}>
                    <Icon name={kind.icon} className="h-4 w-4" />
                  </span>
                  <Link href={`/documents/${i.document_id}`} className="card group flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand/40">
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">{t(`tl.${i.type}`)}</p>
                      <p className="mt-0.5 truncate font-semibold">{title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                        {i.detail && <span>{i.detail}</span>}
                        {f && <Badge tone={f.tone} icon={f.icon}>{t(f.label)}</Badge>}
                        {i.source === "abdm" && <Badge tone="med" icon="shield">{t("abdmBadge")}</Badge>}
                      </div>
                    </div>
                    <time className="shrink-0 text-xs text-muted" dateTime={i.date}>{fmtDate(i.date, i18n.language)}</time>
                    <Icon name="chevron" className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Link>
                </li>);
            })}
          </ol>
        </section>))}
    </div>
  );
}
