import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, token } from "../api";

export default function Login() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [signup, setSignup] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const body = signup ? { ...f, dob: f.dob || null, sex: f.sex || null, preferred_language: i18n.language } : null;
      const r = signup ? await api.register(body as never) : await api.login(f.email, f.password);
      token.set(r.token);
      nav("/");
    } catch (e) { setErr((e as Error).message); }
  }
  const input = "w-full rounded border border-slate-300 p-2";
  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-sm space-y-3 rounded-xl bg-white p-6 shadow">
      <h1 className="text-2xl font-semibold">{t("app")}</h1>
      {signup && <input name="name" required placeholder={t("name")} aria-label={t("name")} className={input} />}
      <input name="email" type="email" required placeholder={t("email")} aria-label={t("email")} className={input} />
      <input name="password" type="password" required placeholder={t("password")} aria-label={t("password")} className={input} />
      {signup && <>
        <input name="dob" type="date" aria-label={t("dob")} className={input} />
        <select name="sex" aria-label={t("sex")} className={input}>
          <option value="">{t("sex")}</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
        </select>
      </>}
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <button className="w-full rounded bg-teal-700 p-2 font-medium text-white">{signup ? t("register") : t("login")}</button>
      <button type="button" onClick={() => setSignup(!signup)} className="w-full text-sm text-teal-700 underline">
        {signup ? t("login") : t("register")}
      </button>
    </form>
  );
}
