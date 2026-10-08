"use client";
import { useState } from "react";

import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { useProfile } from "@/Shell";
import Icon, { IconName } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Badge, Spinner } from "@/components/ui";

const STEPS = ["link", "verify", "sync"] as const;

export default function Abha() {
  const { t } = useTranslation();
  const toast = useToast();
  const { profile, reload } = useProfile();
  const [abha, setAbha] = useState("");
  const [otp, setOtp] = useState("");
  const [demo, setDemo] = useState("");
  const [busy, setBusy] = useState("");

  const pending = profile?.abha.number ?? profile?.abha.address ?? "";
  const linked = !!profile?.abha.linked;
  const step = linked ? 2 : pending ? 1 : 0;

  async function run(name: string, f: () => Promise<void>) {
    setBusy(name);
    try { await f(); } catch (e) { toast((e as Error).message, true); } finally { setBusy(""); }
  }
  const send = (value: string) => run("send", async () => { setDemo((await api.abhaLink(value)).demo_otp); toast(t("otpSent")); reload(); });
  const verify = () => run("verify", async () => { await api.abhaVerify(otp); setOtp(""); setDemo(""); toast(t("linkedOk")); reload(); });
  const doImport = () => run("import", async () => {
    const n = (await api.abhaImport()).imported_document_ids.length;
    toast(n ? t("imported", { n }) : t("nothingNew"));
  });
  const doExport = () => run("export", async () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(await api.fhir(), null, 2)], { type: "application/fhir+json" }));
    Object.assign(document.createElement("a"), { href: url, download: "health-records-fhir.json" }).click();
    URL.revokeObjectURL(url);
    toast(t("exported"));
  });

  const Action = ({ icon, title, sub, onClick, name, disabled }: { icon: IconName; title: string; sub: string; onClick: () => void; name: string; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled || !!busy} className="card group flex items-center gap-4 p-5 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:border-brand/40 disabled:opacity-50">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{busy === name ? <Spinner className="h-5 w-5" /> : <Icon name={icon} className="h-6 w-6" />}</span>
      <span><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{sub}</span></span>
    </button>
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">{t("nav.abha")}</p>
        <h1 className="h-display mt-1 text-3xl font-semibold">{t("abhaTitle")}</h1>
        <p className="mt-1 max-w-xl text-muted">{t("abhaSub")}</p>
      </header>

      <div className="reveal relative overflow-hidden rounded-3xl border border-line p-6 text-ink shadow-card md:p-8"
        style={{ background: "linear-gradient(135deg, var(--brand-soft) 0%, var(--surface-2) 60%, var(--surface) 100%)" }}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand/10 blur-2xl" aria-hidden />
        <div className="relative flex items-start justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-muted">{t("yourAbha")}</p>
            <p className="h-display mt-1 text-xl font-semibold">{profile?.name}</p></div>
          <Icon name="shield" className="h-9 w-9 text-brand" strokeWidth={1.4} />
        </div>
        <p className="relative mt-8 font-mono text-2xl tracking-widest md:text-3xl">{pending || "••-••••-••••-••••"}</p>
        <div className="relative mt-5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${linked ? "bg-ok-soft text-ok" : "bg-surface/80 text-muted ring-1 ring-line"}`}>
            <Icon name={linked ? "check" : "link"} className="h-3.5 w-3.5" strokeWidth={2.4} />
            {linked ? t("abhaLinked") : pending ? t("abhaPending") : t("notSet")}
          </span>
        </div>
      </div>

      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition ${i < step ? "bg-ok text-white" : i === step ? "bg-brand text-on-brand" : "bg-surface-2 text-muted ring-1 ring-line"}`}
              aria-current={i === step ? "step" : undefined}>
              {i < step ? <Icon name="check" className="h-4 w-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`text-sm font-semibold ${i <= step ? "text-ink" : "text-muted"}`}>{t(`abhaStep.${s}`)}</span>
            {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 rounded ${i < step ? "bg-ok" : "bg-line"}`} />}
          </li>))}
      </ol>

      {step === 0 && (
        <form className="card reveal space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); send(abha.trim()); }}>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">{t("abhaInput")}</span>
            <input className="input font-mono" value={abha} onChange={(e) => setAbha(e.target.value)} placeholder="12-3456-7890-1234" inputMode="text" autoComplete="off" />
            <span className="mt-1.5 block text-xs text-muted">{t("abhaHint")}</span></label>
          <button className="btn btn-primary" disabled={!abha.trim() || !!busy}>{busy === "send" && <Spinner />}{t("sendOtp")}</button>
        </form>)}

      {step === 1 && (
        <form className="card reveal space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); verify(); }}>
          {demo && <p className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-soft p-3 text-sm">
            <Badge tone="brand" icon="sparkles">{t("demoOtp")}</Badge><code className="font-mono text-base font-bold tracking-widest">{demo}</code>
            <button type="button" className="ml-auto text-sm font-semibold text-brand-strong underline" onClick={() => setOtp(demo)}>{t("useDemo")}</button></p>}
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">{t("otp")}</span>
            <input className="input text-center font-mono text-xl tracking-[.5em]" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" /></label>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={otp.length !== 6 || !!busy}>{busy === "verify" && <Spinner />}{t("verify")}</button>
            <button type="button" className="btn btn-ghost" onClick={() => send(pending)} disabled={!!busy}>{t("resend")}</button>
          </div>
        </form>)}

      <div className="grid gap-4 md:grid-cols-2">
        <Action icon="download" title={t("import")} sub={t("importSub")} onClick={doImport} name="import" disabled={!linked} />
        <Action icon="file" title={t("export")} sub={t("exportSub")} onClick={doExport} name="export" />
      </div>

      <p className="flex gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-xs text-muted"><Icon name="lightbulb" className="h-4 w-4 text-high" />{t("mockNote")}</p>
    </div>
  );
}
