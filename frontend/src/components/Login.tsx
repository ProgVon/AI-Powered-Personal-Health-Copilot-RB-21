"use client";
import { InputHTMLAttributes, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, setToken } from "@/api";
import { useToast } from "./Toast";
import { Segmented, Spinner } from "./ui";

type Mode = "signup" | "login" | "forgot";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function Login({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [kicked] = useState(() => {  // sent here by a 401, e.g. the password was reset on another device
    try { const v = sessionStorage.getItem("loggedOut"); sessionStorage.removeItem("loggedOut"); return !!v; } catch { return false; }
  });
  const [mode, setMode] = useState<Mode>(kicked ? "login" : "signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState("");  // set once an OTP is on its way
  const [otp, setOtp] = useState("");
  const [otpOk, setOtpOk] = useState(false);  // forgot flow: code confirmed, now ask for the new password
  const [busy, setBusy] = useState(false);

  async function run(f: () => Promise<void>) {
    setBusy(true);
    try { await f(); } catch (e) { toast((e as Error).message, true); } finally { setBusy(false); }
  }
  const switchMode = (m: Mode) => { setMode(m); setPassword(""); setSentTo(""); setOtp(""); setOtpOk(false); };
  const send = () => run(async () => {
    // our own checks: the browser's bubbles get hidden behind Chrome's saved-login dropdown
    if (mode === "login" && (!username.trim() || !password)) throw new Error(t("auth.fillBoth"));
    if (mode === "signup" && !/^[A-Za-z0-9_.-]{3,30}$/.test(username.trim())) throw new Error(t("auth.usernameHint"));
    if (mode !== "login" && !EMAIL.test(email.trim())) throw new Error(t("auth.emailHint"));
    if (mode === "signup" && password.length < 8) throw new Error(t("auth.passwordHint"));
    const r = mode === "signup" ? await api.signup(username.trim(), email.trim(), password)
      : mode === "login" ? await api.login(username.trim(), password) : await api.forgot(email.trim());
    setSentTo(r.email);
    toast(t(mode === "forgot" ? "auth.resetSent" : "auth.otpSent", { email: r.email }));
  });
  const verify = () => run(async () => {
    if (mode === "forgot") { await api.checkReset(sentTo, otp); setPassword(""); setOtpOk(true); return; }
    setToken((await api.verifyOtp(sentTo, otp)).token);
    onDone();
  });
  const reset = () => run(async () => {
    if (password.length < 8) throw new Error(t("auth.passwordHint"));
    await api.reset(sentTo, otp, password);
    switchMode("login");
    setUsername(sentTo);
    toast(t("auth.resetDone"));
  });

  const field = (label: string, value: string, set: (v: string) => void, props: InputHTMLAttributes<HTMLInputElement>, hint?: string) => (
    <label className="block"><span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <input className="input" value={value} onChange={(e) => set(e.target.value)} {...props} />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}</label>
  );
  const title = otpOk ? "auth.newPasswordTitle" : sentTo ? "auth.checkEmail" : `auth.${mode}Title`;

  return (
    <div className="card reveal mx-auto w-full max-w-md space-y-5 p-6">
      <div>
        <h1 className="h-display text-2xl font-semibold">{t(title)}</h1>
        <p className="mt-1 text-sm text-muted">
          {otpOk ? t("auth.passwordHint") : sentTo ? t(mode === "forgot" ? "auth.resetSent" : "auth.otpSent", { email: sentTo })
            : mode === "forgot" ? t("auth.forgotSub") : t("tagline")}
        </p>
      </div>

      {otpOk ? (
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); reset(); }}>
          {field(t("auth.newPassword"), password, setPassword, { type: "password", autoComplete: "new-password", autoFocus: true })}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Spinner />}{t("auth.savePassword")}</button>
        </form>
      ) : sentTo ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">{t("otp")}</span>
            <input className="input text-center font-mono text-xl tracking-[.5em]" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" autoFocus /></label>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={otp.length !== 6 || busy}>{busy && <Spinner />}{t("verify")}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setSentTo(""); setOtp(""); }} disabled={busy}>{t("auth.back")}</button>
          </div>
        </form>
      ) : mode === "forgot" ? (
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); send(); }}>
          {field(t("auth.email"), email, setEmail, { type: "email", autoComplete: "email", autoFocus: true })}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Spinner />}{t("sendOtp")}</button>
          <button type="button" className="block text-sm font-semibold text-brand-strong underline" onClick={() => switchMode("login")}>{t("auth.backToLogin")}</button>
        </form>
      ) : (<>
        {kicked && mode === "login" && <p role="status" className="rounded-xl bg-brand-soft p-3 text-sm">{t("auth.loggedOut")}</p>}
        <Segmented label={t("auth.mode")} value={mode} onChange={switchMode}
          options={[{ value: "signup", label: t("auth.signup") }, { value: "login", label: t("auth.login") }]} />
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); send(); }}>
          {mode === "signup" ? (<>
            {field(t("auth.username"), username, setUsername, { autoComplete: "username", maxLength: 30 }, t("auth.usernameHint"))}
            {field(t("auth.email"), email, setEmail, { type: "email", autoComplete: "email" })}
            {field(t("auth.password"), password, setPassword, { type: "password", autoComplete: "new-password" }, t("auth.passwordHint"))}
          </>) : (<>
            {field(t("auth.usernameOrEmail"), username, setUsername, { autoComplete: "username" })}
            {field(t("auth.password"), password, setPassword, { type: "password", autoComplete: "current-password" })}
            <button type="button" className="text-sm font-semibold text-brand-strong underline" onClick={() => switchMode("forgot")}>{t("auth.forgot")}</button>
          </>)}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Spinner />}{t("sendOtp")}</button>
        </form>
      </>)}
    </div>
  );
}
