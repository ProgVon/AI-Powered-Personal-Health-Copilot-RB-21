"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getToken, Profile, setToken } from "./api";
import WhatsNew from "./components/WhatsNew";
import { ToastProvider } from "./components/Toast";
import Icon, { IconName } from "./components/Icon";
import Login from "./components/Login";
import { EmptyState, Segmented, Spinner } from "./components/ui";
import { LANGS, Lang } from "./i18n";

const ProfileCtx = createContext<{ profile: Profile | null; reload: () => void }>({ profile: null, reload: () => {} });
export const useProfile = () => useContext(ProfileCtx);

const NAV: { to: string; icon: IconName; key: string }[] = [
  { to: "/", icon: "home", key: "home" }, { to: "/upload", icon: "upload", key: "upload" },
  { to: "/timeline", icon: "activity", key: "timeline" }, { to: "/abha", icon: "shield", key: "abha" },
];

const Logo = () => <Link href="/" className="h-display whitespace-nowrap text-xl tracking-tight">Health Copilot</Link>;
const logout = () => { setToken(null); location.reload(); };

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("theme-v2", dark ? "dark" : "light"); } catch { /* private mode */ }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function Controls({ short = false }: { short?: boolean }) {
  const { t, i18n } = useTranslation();
  const { dark, toggle } = useTheme();
  const change = (l: Lang) => {
    i18n.changeLanguage(l);
    try { localStorage.setItem("lang", l); } catch { /* private mode */ }
    api.setLanguage(l).catch(() => {});
  };
  return (
    <div className="flex items-center gap-2">
      <Segmented label={t("language")} value={i18n.language as Lang} onChange={change}
        options={(Object.keys(LANGS) as Lang[]).map((k) => ({ value: k, label: k === "en" ? "EN" : short ? LANGS[k].slice(0, 2) : LANGS[k] }))} />
      <button onClick={toggle} aria-label={t("theme")} aria-pressed={dark} className="btn btn-ghost !min-h-9 !w-9 !px-0">
        <Icon name={dark ? "sun" : "moon"} className="h-4 w-4" />
      </button>
    </div>
  );
}

function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [down, setDown] = useState(false);
  const reload = useCallback(() => { api.profile().then((p) => { setProfile(p); setDown(false); }).catch(() => setDown(true)); }, []);
  useEffect(reload, [reload]);
  useEffect(() => {  // a sleeping free-tier server answers after a while, so keep knocking
    if (!down) return;
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [down, reload]);
  useEffect(() => {  // re-check the session when the tab comes back, so a password reset elsewhere logs it out
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);
  const path = usePathname();
  const active = (n: (typeof NAV)[number]) => (n.to === "/" ? path === n.to : path.startsWith(n.to));
  const link = (on: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${on ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`;
  return (
    <div className="app-shell min-h-screen md:grid md:grid-cols-[17rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">{t("skip")}</a>

      <aside className="no-print sticky top-0 hidden h-screen flex-col gap-6 border-r border-line p-5 md:flex">
        <div className="px-3 pt-1"><Logo /></div>
        <Link href="/upload" className="btn btn-upload"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{t("nav.upload")}</Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.filter((n) => n.to !== "/upload").map((n) => <Link key={n.to} href={n.to} className={link(active(n))}><Icon name={n.icon} className="h-[18px] w-[18px]" />{t(`nav.${n.key}`)}</Link>)}
        </nav>
        <div className="mt-auto space-y-4 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="min-w-0 truncate text-sm font-semibold">{profile?.name}</span>
            <button onClick={logout} className="shrink-0 text-sm font-semibold text-muted hover:text-ink">{t("auth.logout")}</button>
          </div>
          <Controls />
          <WhatsNew />
        </div>
      </aside>

      <div className="min-w-0 pb-28 md:pb-12">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg px-4 py-3 md:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <Controls short />
            <button onClick={logout} aria-label={t("auth.logout")} title={t("auth.logout")} className="btn btn-ghost !min-h-9 !w-9 !px-0"><Icon name="logout" className="h-4 w-4" /></button>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-6 md:px-10 md:py-10">
          {down ? <EmptyState icon="refresh" title={t("serverWaking")} sub={t("serverWakingSub")}>
            <Spinner className="h-5 w-5 text-muted" />
            <button className="btn btn-ghost mt-1" onClick={reload}>{t("retry")}</button></EmptyState> : <ProfileCtx.Provider value={{ profile, reload }}>{children}</ProfileCtx.Provider>}
        </main>
      </div>

      <nav aria-label="Primary" className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-line bg-surface px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden">
        {NAV.map((n) => (
          <Link key={n.to} href={n.to}
            className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-semibold ${active(n) ? "text-brand" : "text-muted"}`}>
            <Icon name={n.icon} />{t(`nav.${n.key}`)}
          </Link>))}
      </nav>
    </div>
  );
}

function Intro() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <h1 className="h-display max-w-md text-3xl leading-tight md:text-5xl">{t("intro.title")}</h1>
      <ol className="hidden space-y-4 md:block">
        {(["s1", "s2", "s3"] as const).map((k, i) => (
          <li key={k} className="flex items-baseline gap-4">
            <span className="h-display w-5 shrink-0 text-lg text-muted tabular-nums">{i + 1}</span><span>{t(`intro.${k}`)}</span>
          </li>))}
      </ol>
      <p className="hidden max-w-md border-t border-line pt-4 text-xs leading-relaxed text-muted md:block">{t("disclaimer")}</p>
    </section>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !!getToken());
  return (
    <ToastProvider>
      {authed ? <Layout>{children}</Layout> : (
        <div className="app-shell mx-auto grid min-h-screen max-w-5xl content-center gap-10 px-4 py-8 md:grid-cols-[1fr_26rem] md:items-center md:gap-16 md:px-10">
          <div className="flex items-center justify-between md:col-span-2"><Logo /><Controls /></div>
          <Intro />
          <Login onDone={() => setAuthed(true)} />
        </div>)}
    </ToastProvider>
  );
}
