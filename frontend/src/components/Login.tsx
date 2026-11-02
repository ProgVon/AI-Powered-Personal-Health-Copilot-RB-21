"use client";
import { InputHTMLAttributes, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, setToken } from "@/api";
import { useToast } from "./Toast";
import { Segmented, Spinner } from "./ui";

type Mode = "signup" | "login" | "forgot";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESEND = 30;  // seconds, matches RESEND_AFTER in backend/app/routers/auth.py
const seen = () => { try { return !!localStorage.getItem("returning"); } catch { return false; } };

export default function Login({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [kicked] = useState(() => {  // sent here by a 401, e.g. the password was reset on another device
    try { const v = sessionStorage.getItem("loggedOut"); sessionStorage.removeItem("loggedOut"); return !!v; } catch { return false; }
  });
  const [mode, setMode] = useState<Mode>(() => (kicked || seen() ? "login" : "signup"));
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState("");  // set once an OTP is on its way
  const [otp, setOtp] = useState("");
  const [otpOk, setOtpOk] = useState(false);  // forgot flow: code confirmed, now ask for the new password
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);  // a free-tier server can take a minute to wake up
  const [wait, setWait] = useState(0);  // seconds until a new code can be requested
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function run(f: () => Promise<void>) {
    setBusy(true);
    const timer = setTimeout(() => setSlow(true), 4000);
    try { await f(); } catch (e) { toast((e as Error).message, true); } finally { clearTimeout(timer); setSlow(false); setBusy(false); }
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
    setWait(RESEND);
    toast(t(mode === "forgot" ? "auth.resetSent" : "auth.otpSent", { email: r.email }));
  });
  const resend = () => run(async () => {  // the signup already created the account, so a new code comes from /login
    if (mode === "forgot") await api.forgot(sentTo); else await api.login(username.trim(), password);
    setWait(RESEND);
    toast(t("auth.otpSent", { email: sentTo }));
  });
  const verify = () => run(async () => {
    if (mode === "forgot") { await api.checkReset(sentTo, otp); setPassword(""); setOtpOk(true); return; }
    setToken((await api.verifyOtp(sentTo, otp)).token);
    try { localStorage.setItem("returning", "1"); } catch { /* private mode */ }
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
    <div className="card reveal w-full space-y-5 p-6 md:p-8">
      <div>
        <h1 className="h-display text-2xl font-semibold">{t(title)}</h1>
        {(otpOk || sentTo || mode === "forgot") && <p className="mt-1 text-sm text-muted">
          {otpOk ? t("auth.passwordHint") : sentTo ? t(mode === "forgot" ? "auth.resetSent" : "auth.otpSent", { email: sentTo }) : t("auth.forgotSub")}
        </p>}
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
          <button className="btn btn-primary w-full" disabled={otp.length !== 6 || busy}>{busy && <Spinner />}{t("verify")}</button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" className="font-semibold text-brand underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
              onClick={resend} disabled={busy || wait > 0}>{wait > 0 ? t("auth.resendIn", { n: wait }) : t("auth.resend")}</button>
            <button type="button" className="font-semibold text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => { setSentTo(""); setOtp(""); }} disabled={busy}>
              {mode === "forgot" ? t("auth.back") : t("auth.different")}</button>
          </div>
        </form>
      ) : mode === "forgot" ? (
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); send(); }}>
          {field(t("auth.email"), email, setEmail, { type: "email", autoComplete: "email", autoFocus: true })}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Spinner />}{t("auth.sendCode")}</button>
          <button type="button" className="block text-sm font-semibold text-brand underline-offset-4 hover:underline" onClick={() => switchMode("login")}>{t("auth.backToLogin")}</button>
        </form>
      ) : (<>
        {kicked && mode === "login" && <p role="status" className="rounded-lg border border-line bg-surface-2 p-3 text-sm">{t("auth.loggedOut")}</p>}
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
            <button type="button" className="text-sm font-semibold text-brand underline-offset-4 hover:underline" onClick={() => switchMode("forgot")}>{t("auth.forgot")}</button>
          </>)}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Spinner />}{t("auth.continue")}</button>
        </form>
      </>)}
      {slow && <p role="status" className="flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm text-muted"><Spinner />{t("auth.slow")}</p>}
    </div>
  );
}
