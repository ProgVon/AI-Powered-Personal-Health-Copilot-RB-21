import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, TimelineItem } from "../api";
import Icon, { IconName } from "../components/Icon";
import Timeline from "../components/Timeline";
import { EmptyState, Skeleton } from "../components/ui";

const TYPES: { key: string; icon: IconName }[] = [
  { key: "reports", icon: "file" }, { key: "medicines", icon: "pill" }, { key: "diagnoses", icon: "steth" },
];

export default function TimelinePage() {
  const { t } = useTranslation();
  const [on, setOn] = useState<string[]>(TYPES.map((x) => x.key));
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  useEffect(() => { api.timeline(on).then(setItems).catch(() => setItems([])); }, [on]);
  const toggle = (k: string) => setOn((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{t("nav.timeline")}</p>
        <h1 className="h-display mt-1 text-3xl font-semibold">{t("timeline")}</h1>
        <p className="mt-1 text-muted">{t("timelineSub")}</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {TYPES.map(({ key, icon }) => (
          <button key={key} aria-pressed={on.includes(key)} onClick={() => toggle(key)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${on.includes(key) ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-muted hover:text-ink"}`}>
            <Icon name={icon} className="h-4 w-4" />{t(key)}
          </button>))}
      </div>
      {items === null ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        : items.length === 0 ? <EmptyState icon="activity" title={t("noItems")} sub={t("noItemsSub")}>
            <Link to="/upload" className="btn btn-primary mt-2"><Icon name="upload" className="h-4 w-4" />{t("nav.upload")}</Link></EmptyState>
        : <Timeline items={items} />}
    </div>
  );
}
