import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, TimelineItem } from "../api";
import Timeline from "../components/Timeline";

const TYPES = ["reports", "medicines", "diagnoses"] as const;

export default function TimelinePage() {
  const { t } = useTranslation();
  const [on, setOn] = useState<string[]>([...TYPES]);
  const [items, setItems] = useState<TimelineItem[]>([]);
  useEffect(() => { api.timeline(on).then(setItems); }, [on]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("timeline")}</h1>
      <div className="flex gap-2">
        {TYPES.map((k) => (
          <button key={k} aria-pressed={on.includes(k)} onClick={() => setOn(on.includes(k) ? on.filter((x) => x !== k) : [...on, k])}
            className={`rounded-full border px-3 py-1 text-sm ${on.includes(k) ? "border-teal-700 bg-teal-700 text-white" : "bg-white"}`}>
            {t(k)}
          </button>))}
      </div>
      <Timeline items={items} />
    </div>
  );
}
