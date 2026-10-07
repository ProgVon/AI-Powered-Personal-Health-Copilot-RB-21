import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api";

type Item = { key: string; name: string; id?: number; status: "reading" | "done" | "failed"; error?: string };
const OK = ["image/jpeg", "image/png", "application/pdf"];
const MAX = 15 * 1024 * 1024;

export default function UploadZone() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearInterval), []);

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function add(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      const key = crypto.randomUUID();
      const bad = !OK.includes(f.type) ? t("badType") : f.size > MAX ? t("tooBig") : null;
      setItems((xs) => [{ key, name: f.name, status: bad ? "failed" : "reading", error: bad ?? undefined }, ...xs]);
      if (bad) continue;
      try {
        const { id } = await api.upload(f);
        patch(key, { id });
        const timer = window.setInterval(async () => {  // poll every 2 s
          const d = await api.doc(id).catch(() => null);
          if (d && d.status !== "processing") { clearInterval(timer); patch(key, { status: d.status as Item["status"] }); }
        }, 2000);
        timers.current.push(timer);
      } catch (e) { patch(key, { status: "failed", error: (e as Error).message }); }
    }
  }

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-400 bg-white p-10 text-center hover:border-teal-600">
        <span className="text-lg font-medium">{t("uploadTitle")}</span>
        <span className="text-sm text-slate-600">{t("uploadHint")}</span>
        <input type="file" multiple accept="image/*,application/pdf" capture="environment" className="sr-only"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </label>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
            <span className="truncate">{i.name}</span>
            <span className="flex items-center gap-3 text-sm">
              <span className={i.status === "failed" ? "text-red-700" : i.status === "done" ? "text-green-700" : "text-slate-600"}>
                {i.status === "reading" ? `⏳ ${t("reading")}` : i.status === "done" ? `✓ ${t("done")}` : `✗ ${i.error ?? t("failed")}`}
              </span>
              {i.status === "done" && i.id && <Link className="text-teal-700 underline" to={`/documents/${i.id}`}>{t("openDoc")}</Link>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
