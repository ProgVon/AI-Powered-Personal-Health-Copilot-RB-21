import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

export default function Abha() {
  const { t } = useTranslation();
  const [abha, setAbha] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [otp, setOtp] = useState("");
  const [msg, setMsg] = useState("");
  const run = (f: () => Promise<string | void>) => f().then((m) => setMsg(m ?? "✓")).catch((e) => setMsg(e.message));
  const input = "rounded border border-slate-300 p-2";
  const btn = "rounded bg-teal-700 px-4 py-2 text-white";

  async function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(await api.fhir(), null, 2)], { type: "application/fhir+json" }));
    Object.assign(document.createElement("a"), { href: url, download: "health-records-fhir.json" }).click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("abhaTitle")}</h1>
      <p className="text-sm text-slate-600">{t("mockNote")}</p>
      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <input value={abha} onChange={(e) => setAbha(e.target.value)} placeholder={t("abhaInput")} aria-label={t("abhaInput")} className={`${input} min-w-72 flex-1`} />
          <button className={btn} onClick={() => run(async () => { setDemoOtp((await api.abhaLink(abha)).demo_otp); })}>{t("sendOtp")}</button>
        </div>
        {demoOtp && <>
          <p className="text-sm">{t("demoOtp")}: <code className="rounded bg-slate-100 px-1">{demoOtp}</code></p>
          <div className="flex gap-2">
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder={t("otp")} aria-label={t("otp")} className={input} />
            <button className={btn} onClick={() => run(async () => { await api.abhaVerify(otp); setDemoOtp(""); return `✓ ${t("abhaLinked")}`; })}>{t("verify")}</button>
          </div></>}
      </section>
      <div className="flex flex-wrap gap-3">
        <button className={btn} onClick={() => run(async () => t("imported", { n: (await api.abhaImport()).imported_document_ids.length }))}>{t("import")}</button>
        <button className={btn} onClick={() => run(async () => { await download(); })}>{t("export")}</button>
      </div>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
