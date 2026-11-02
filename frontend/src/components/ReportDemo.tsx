import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AbnormalCard from "./AbnormalCard";

// Login-page demo, built from the app's own result card: a photographed report is scanned,
// the low value comes out as a card, and its plain-language explanation streams in.
// Plays once when scrolled into view; reduced motion shows the finished frame.
const HB = { id: 0, display_name: "Haemoglobin", value_num: 10.8, value_text: null, unit: "g/dL", ref_low: 12, ref_high: 15, interpretation: "L", note: null };
const FILLER = [[62, 70, 86], [48, 66, 90], [70, 72, 84], [54, 68, 88], [40, 64, 86]];  // bar widths (%) per column
const READ = 1800, SAY = 800;  // scan pass (matches .scan in index.css), then the card's arrival

export default function ReportDemo() {
  const { t, i18n } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(() => (matchMedia("(prefers-reduced-motion: reduce)").matches ? 3 : 0));

  useEffect(() => {  // once on mount: 1 scanning, 2 card arrives, 3 explanation streams
    if (step) return;
    const timers: number[] = [];
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setStep(1);
      timers.push(window.setTimeout(() => setStep(2), READ), window.setTimeout(() => setStep(3), READ + SAY));
    }, { threshold: 0.6 });
    io.observe(box.current!);
    return () => { io.disconnect(); timers.forEach(clearTimeout); };
  }, []);

  // A new language re-streams the explanation, so the switch visibly does something: its words
  // render hidden for a frame (fading out is instant, see .rd-word), then stream back in.
  const [shown, setShown] = useState(i18n.language);
  useEffect(() => {
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setShown(i18n.language)); });
    return () => cancelAnimationFrame(id);
  }, [i18n.language]);

  return (
    <div ref={box} role="img" aria-label={t("intro.alt")} className="rd relative flow-root"
      data-read={step >= 2 || undefined} data-said={(step >= 3 && shown === i18n.language) || undefined}>
      <div className={`rd-paper ${step === 1 ? "scan" : ""}`}>
        <div className="flex items-center justify-between"><i className="rd-bar w-20" /><i className="rd-bar w-12" /></div>
        <p className="mb-2 mt-3 text-xs font-bold">{t("intro.report")}</p>
        <div className="rd-row rd-hit"><span>Haemoglobin</span><b className="tabular-nums">10.8</b><span className="tabular-nums">12.0–15.0</span></div>
        {FILLER.map(([a, b, c], i) => (
          <div key={i} className="rd-row"><i className="rd-bar" style={{ width: `${a}%` }} /><i className="rd-bar" style={{ width: `${b}%` }} /><i className="rd-bar" style={{ width: `${c}%` }} /></div>))}
      </div>
      <div className="rd-card">
        <AbnormalCard name={HB.display_name} value="10.8 g/dL" flag="L" obs={HB}>
          <p>{t("intro.explain").split(" ").map((w, i) => <span key={i} className="rd-word" style={{ transitionDelay: `${i * 45}ms` }}>{w} </span>)}</p>
        </AbnormalCard>
      </div>
    </div>
  );
}
