import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import Icon from "./Icon";
import { useToast } from "./Toast";
import { Spinner } from "./ui";

type Stage = "uploading" | "reading" | "done" | "failed";
type Item = { key: string; name: string; size: number; preview?: string; id?: number; stage: Stage; error?: string };
const OK = ["image/jpeg", "image/png", "application/pdf"];
const MAX = 15 * 1024 * 1024;
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function UploadZone() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const timers = useRef<number[]>([]);
  const pick = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  useEffect(() => () => timers.current.forEach(clearInterval), []);

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function add(files: FileList | File[] | null) {
    for (const f of Array.from(files ?? [])) {
      const key = crypto.randomUUID();
      const bad = !OK.includes(f.type) ? t("badType") : f.size > MAX ? t("tooBig") : undefined;
      const preview = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      setItems((xs) => [{ key, name: f.name, size: f.size, preview, stage: bad ? "failed" : "uploading", error: bad }, ...xs]);
      if (bad) { toast(`${f.name}: ${bad}`, true); continue; }
      try {
        const { id } = await api.upload(f);
        patch(key, { id, stage: "reading" });
        const timer = window.setInterval(async () => {  // poll every 2 s
          const d = await api.doc(id).catch(() => null);
          if (d && d.status !== "processing") { clearInterval(timer); patch(key, { stage: d.status as Stage }); }
        }, 2000);
        timers.current.push(timer);
      } catch (e) { patch(key, { stage: "failed", error: (e as Error).message }); toast((e as Error).message, true); }
    }
  }

  return (
    <div className="space-y-6">
      <div
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={`reveal relative overflow-hidden rounded-3xl border-2 border-dashed p-8 text-center transition md:p-12
          ${over ? "scale-[1.01] border-brand bg-brand-soft" : "border-line bg-surface"}`}>
        <div className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(60% 50% at 50% 0%, var(--brand-soft), transparent)" }} aria-hidden />
        <div className="relative flex flex-col items-center gap-4">
          <div className={`grid h-16 w-16 place-items-center rounded-2xl bg-brand text-on-brand shadow-lg transition ${over ? "-translate-y-1" : ""}`}>
            <Icon name="upload" className="h-8 w-8" strokeWidth={1.8} />
          </div>
          <div>
            <p className="h-display text-2xl font-semibold">{over ? t("dropHere") : t("uploadTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("uploadSub")}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button className="btn btn-primary" onClick={() => pick.current?.click()}><Icon name="file" className="h-4 w-4" />{t("chooseFiles")}</button>
            <button className="btn btn-ghost" onClick={() => cam.current?.click()}><Icon name="camera" className="h-4 w-4" />{t("takePhoto")}</button>
          </div>
          <p className="text-xs text-muted">{t("limits")}</p>
        </div>
        <input ref={pick} type="file" multiple accept="image/*,application/pdf" className="sr-only" tabIndex={-1}
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1}
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.key} className="card reveal flex items-center gap-4 p-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-muted">
                {i.preview ? <img src={i.preview} alt="" className="h-full w-full object-cover" /> : <Icon name="file" className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.name}</p>
                <p className="text-xs text-muted">{kb(i.size)}</p>
                {(i.stage === "uploading" || i.stage === "reading") && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted">
                    <Spinner /><span>{t(`stage.${i.stage}`)}</span>
                  </div>)}
                {i.stage === "uploading" || i.stage === "reading"
                  ? <div className="indeterminate relative mt-2 h-1.5 overflow-hidden rounded-full bg-line" />
                  : i.stage === "failed"
                    ? <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-crit"><Icon name="alert" className="h-4 w-4" />{i.error ?? t("failedSub")}</p>
                    : <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-ok"><span className="pop"><Icon name="check" className="h-4 w-4" strokeWidth={2.6} /></span>{t("ready")}</p>}
              </div>
              {i.stage === "done" && i.id && <Link className="btn btn-soft" to={`/documents/${i.id}`}>{t("viewSummary")}<Icon name="chevron" className="h-4 w-4" /></Link>}
            </li>))}
        </ul>)}

      <aside className="card p-5">
        <h2 className="eyebrow mb-3 flex items-center gap-2"><Icon name="lightbulb" className="h-4 w-4 text-high" />{t("tipsTitle")}</h2>
        <ul className="grid gap-3 text-sm sm:grid-cols-3">
          {(["tip1", "tip2", "tip3"] as const).map((k, n) => (
            <li key={k} className="flex gap-3"><span className="h-display grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-strong">{n + 1}</span>{t(k)}</li>))}
        </ul>
      </aside>
    </div>
  );
}
