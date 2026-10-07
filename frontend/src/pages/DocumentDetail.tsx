import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, Doc, Summary } from "../api";
import { FLAG_LABEL } from "../components/AbnormalCard";
import SummaryCard from "../components/SummaryCard";

export default function DocumentDetail() {
  const id = Number(useParams().id);
  const { t, i18n } = useTranslation();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<string | null>(null);

  useEffect(() => {  // poll while processing
    let timer: number;
    const load = () => api.doc(id).then((d) => { setDoc(d); if (d.status === "processing") timer = window.setTimeout(load, 2000); });
    load();
    return () => clearTimeout(timer);
  }, [id]);
  useEffect(() => { if (doc?.source === "upload" && doc.status !== "processing") api.file(id).then(setFile).catch(() => {}); }, [id, doc?.source, doc?.status]);
  useEffect(() => {  // summary follows the UI language; translations are cached server-side
    if (doc?.status !== "done" || !doc.summary) return;
    setBusy(true);
    api.summary(id, i18n.language).then(setSummary).catch(() => setSummary(doc.summary!)).finally(() => setBusy(false));
  }, [id, doc, i18n.language]);

  if (!doc) return null;
  if (doc.status === "processing") return <p>⏳ {t("reading")}</p>;
  if (doc.status === "failed") return <p role="alert" className="text-red-700">{t("failed")}</p>;
  const warnings = doc.extraction?._warnings ?? [];
  const th = "p-2 text-left font-medium";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold capitalize">{(doc.doc_type ?? "document").replace("_", " ")} {doc.doc_date && <span className="text-base font-normal text-slate-600">· {doc.doc_date}</span>}</h1>
      {warnings.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm">
          <b>{t("warnings")}</b><ul className="list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>)}
      {busy && <p className="text-sm text-slate-600">{t("translating")}</p>}
      {summary ? <SummaryCard s={summary} /> : <p className="text-slate-600">{t("noSummary")}</p>}

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t("extracted")}</h2>
        {!!doc.observations?.length && (
          <table className="mb-4 w-full rounded-lg bg-white text-sm shadow-sm">
            <caption className="p-2 text-left font-semibold">{t("labResults")}</caption>
            <thead><tr><th className={th}>{t("test")}</th><th className={th}>{t("value")}</th><th className={th}>{t("range")}</th><th className={th}>{t("status")}</th></tr></thead>
            <tbody>{doc.observations.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2">{o.display_name}</td>
                <td className="p-2">{o.value_num ?? o.value_text} {o.unit}</td>
                <td className="p-2">{o.ref_low ?? "–"} – {o.ref_high ?? "–"}</td>
                <td className="p-2">{o.note ?? (o.interpretation ? (o.interpretation === "N" ? "Normal" : t(FLAG_LABEL[o.interpretation])) : "–")}</td>
              </tr>))}</tbody>
          </table>)}
        {!!doc.medications?.length && (
          <table className="mb-4 w-full rounded-lg bg-white text-sm shadow-sm">
            <caption className="p-2 text-left font-semibold">{t("medicines")}</caption>
            <tbody>{doc.medications.map((m) => (
              <tr key={m.id} className="border-t"><td className="p-2 font-medium">{m.brand_name}</td>
                <td className="p-2">{[m.salt, m.strength].filter(Boolean).join(" ")}</td>
                <td className="p-2">{[m.dose_pattern, m.timing, m.duration_days && `${m.duration_days} d`].filter(Boolean).join(" · ")}</td></tr>))}</tbody>
          </table>)}
      </section>
      {file && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">{t("original")}</h2>
          <iframe src={file} title={t("original")} className="h-[32rem] w-full rounded-lg bg-white shadow-sm" />
        </section>)}
    </div>
  );
}
