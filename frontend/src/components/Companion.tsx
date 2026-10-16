import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fmtDate } from "./ui";

type Update = { hash: string; date: string; msg: string };
const UPDATES: Update[] = JSON.parse(process.env.NEXT_PUBLIC_UPDATES || "[]");  // read from git at build time, see next.config.ts
const REACH = 3.5;  // px a pupil can move from the eye's centre

// Little round buddy in the corner: eyes follow the cursor, click it to see the latest pushed updates.
export default function Companion() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const pupils = useRef<(HTMLSpanElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const look = (e: PointerEvent) => pupils.current.forEach((p) => {
      const r = p?.parentElement?.getBoundingClientRect();
      if (!p || !r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const k = Math.min(REACH, Math.hypot(dx, dy) / 20) / (Math.hypot(dx, dy) || 1);
      p.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    });
    window.addEventListener("pointermove", look);
    return () => window.removeEventListener("pointermove", look);
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={box} className="no-print fixed bottom-24 right-4 z-40 flex flex-col items-end gap-8 md:bottom-6 md:right-6">
      {open && (
        <section id="whats-new" className="card toast w-72 p-4" aria-label={t("whatsNew")}>
          <h2 className="eyebrow mb-3">{t("whatsNew")}</h2>
          {UPDATES.length ? (
            <ol className="space-y-3 text-sm">
              {UPDATES.map((u) => (
                <li key={u.hash} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium first-letter:uppercase">{u.msg}</p>
                    <p className="text-xs text-muted">{fmtDate(u.date, i18n.language)} · <code>{u.hash}</code></p>
                  </div>
                </li>))}
            </ol>
          ) : <p className="text-sm text-muted">{t("noUpdates")}</p>}
        </section>)}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="whats-new" aria-label={t("whatsNew")}
        className="relative grid h-14 w-14 place-items-center rounded-full bg-brand shadow-card transition hover:-translate-y-0.5 active:scale-95">
        <svg viewBox="0 0 40 28" className="absolute -top-[18px] left-1/2 w-10 -translate-x-1/2 -rotate-6" aria-hidden>
          <path d="M8 24a12 12 0 0 1 24 0z" fill="var(--med)" />
          <rect x="4" y="22.5" width="32" height="3.5" rx="1.75" fill="var(--med)" />
          <path d="M20 12V6" stroke="var(--ink)" strokeWidth="1.5" />
          <g className="propeller">
            <ellipse cx="11.5" cy="6" rx="8" ry="2" fill="var(--crit)" />
            <ellipse cx="28.5" cy="6" rx="8" ry="2" fill="var(--high)" />
          </g>
          <circle cx="20" cy="6" r="2" fill="var(--ink)" />
        </svg>
        <span className="flex gap-2" aria-hidden>
          {[0, 1].map((i) => (
            <span key={i} className="grid h-4 w-4 place-items-center">
              <span ref={(el) => { pupils.current[i] = el; }} className="h-2.5 w-2.5 rounded-full bg-black transition-transform duration-75" />
            </span>))}
        </span>
      </button>
    </div>
  );
}
