import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fmtDate } from "./ui";

type Update = { hash: string; date: string; msg: string };
const UPDATES: Update[] = JSON.parse(process.env.NEXT_PUBLIC_UPDATES || "[]");  // read from git at build time, see next.config.ts

// Sidebar link that opens the latest pushed updates above it.
export default function WhatsNew() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      {open && (
        <section id="whats-new" className="card absolute bottom-full left-0 z-40 mb-2 w-60 p-4" aria-label={t("whatsNew")}>
          <h2 className="eyebrow mb-3">{t("whatsNew")}</h2>
          {UPDATES.length ? (
            <ol className="space-y-3 text-sm">
              {UPDATES.map((u) => (
                <li key={u.hash}>
                  <p className="font-medium first-letter:uppercase">{u.msg}</p>
                  <p className="text-xs text-muted">{fmtDate(u.date, i18n.language)}</p>
                </li>))}
            </ol>
          ) : <p className="text-sm text-muted">{t("noUpdates")}</p>}
        </section>)}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="whats-new"
        className="px-1 text-xs font-semibold text-muted hover:text-ink">{t("whatsNew")}</button>
    </div>
  );
}
