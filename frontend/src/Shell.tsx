"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getToken, Profile, setToken } from "./api";
import Companion from "./components/Companion";
import { ToastProvider } from "./components/Toast";
import Icon, { IconName } from "./components/Icon";
import Login from "./components/Login";
import { EmptyState, Segmented } from "./components/ui";
import { LANGS, Lang } from "./i18n";

const ProfileCtx = createContext<{ profile: Profile | null; reload: () => void }>({ profile: null, reload: () => {} });
export const useProfile = () => useContext(ProfileCtx);

const NAV: { to: string; icon: IconName; key: string }[] = [
  { to: "/", icon: "home", key: "home" }, { to: "/upload", icon: "upload", key: "upload" },
  { to: "/timeline", icon: "activity", key: "timeline" }, { to: "/abha", icon: "shield", key: "abha" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-on-brand shadow-sm"><Icon name="heart" className="h-5 w-5" /></span>
      <span className="h-display text-lg font-semibold leading-none">Health<br /><span className="text-brand">Copilot</span></span>
    </div>
  );
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("theme-v2", dark ? "dark" : "light"); } catch { /* private mode */ }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function Controls() {
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
        options={(Object.keys(LANGS) as Lang[]).map((k) => ({ value: k, label: k === "en" ? "EN" : LANGS[k] }))} />
      <button onClick={toggle} aria-label={t("theme")} aria-pressed={dark} className="btn btn-ghost !min-h-9 !w-9 !px-0">
        <Icon name={dark ? "sun" : "moon"} className="h-4 w-4" />
      </button>
      {getToken() && (
        <button onClick={() => { setToken(null); location.reload(); }} aria-label={t("auth.logout")} title={t("auth.logout")} className="btn btn-ghost !min-h-9 !w-9 !px-0">
          <Icon name="logout" className="h-4 w-4" />
        </button>)}
    </div>
  );
}

function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [down, setDown] = useState(false);
  const reload = useCallback(() => { api.profile().then((p) => { setProfile(p); setDown(false); }).catch(() => setDown(true)); }, []);
  useEffect(reload, [reload]);
  useEffect(() => {  // re-check the session when the tab comes back, so a password reset elsewhere logs it out
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);
  const path = usePathname();
  const active = (n: (typeof NAV)[number]) => (n.to === "/" ? path === n.to : path.startsWith(n.to));
  const link = (on: boolean) =>
    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${on ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-2 hover:text-ink"}`;
  const abha = profile?.abha;
  return (
    <div className="app-shell min-h-screen md:grid md:grid-cols-[17rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">{t("skip")}</a>

      <aside className="no-print sticky top-0 hidden h-screen flex-col gap-6 border-r border-line bg-surface p-5 md:flex">
        <Logo />
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => <Link key={n.to} href={n.to} className={link(active(n))}><Icon name={n.icon} />{t(`nav.${n.key}`)}</Link>)}
        </nav>
        <div className="mt-auto space-y-4">
          <Link href="/abha" className="card block space-y-1 p-3.5 transition hover:border-brand/40">
            <p className="eyebrow flex items-center gap-1.5"><Icon name="shield" className="h-3.5 w-3.5" />{t("yourAbha")}</p>
            <p className={`text-sm font-semibold ${abha?.linked ? "text-ok" : "text-muted"}`}>
              {abha?.linked ? `✓ ${t("abhaLinked")}` : abha?.number || abha?.address ? t("abhaPending") : t("abhaNotLinked")}
            </p>
          </Link>
          <Controls />
        </div>
      </aside>

      <div className="min-w-0 pb-28 md:pb-12">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg px-4 py-3 md:hidden">
          <Logo /><Controls />
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-6 md:px-10 md:py-10">
          {down ? <EmptyState icon="alert" title={t("serverDown")} sub={t("serverDownSub")} /> : <ProfileCtx.Provider value={{ profile, reload }}>{children}</ProfileCtx.Provider>}
        </main>
      </div>

      <nav aria-label="Primary" className="no-print fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-card md:hidden">
        {NAV.map((n) => (
          <Link key={n.to} href={n.to}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold ${active(n) ? "bg-brand-soft text-brand-strong" : "text-muted"}`}>
            <Icon name={n.icon} />{t(`nav.${n.key}`)}
          </Link>))}
      </nav>
      <Companion />
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !!getToken());
  return (
    <ToastProvider>
      {authed ? <Layout>{children}</Layout> : (
        <div className="app-shell grid min-h-screen place-items-center gap-6 px-4 py-10">
          <div className="flex w-full max-w-md items-center justify-between"><Logo /><Controls /></div>
          <Login onDone={() => setAuthed(true)} />
        </div>)}
    </ToastProvider>
  );
}
