import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { LANGS, Lang } from "./i18n";
import Abha from "./pages/Abha";
import DocumentDetail from "./pages/DocumentDetail";
import Home from "./pages/Home";
import TimelinePage from "./pages/TimelinePage";
import Upload from "./pages/Upload";

function Layout() {
  const { t, i18n } = useTranslation();
  const link = ({ isActive }: { isActive: boolean }) => `rounded px-3 py-1 ${isActive ? "bg-teal-700 text-white" : "hover:bg-teal-100"}`;
  return (
    <div className="mx-auto max-w-4xl p-4">
      <header className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-4 text-lg font-bold">{t("app")}</span>
        <nav className="flex flex-1 gap-1">
          <NavLink to="/" end className={link}>{t("home")}</NavLink>
          <NavLink to="/upload" className={link}>{t("upload")}</NavLink>
          <NavLink to="/timeline" className={link}>{t("timeline")}</NavLink>
          <NavLink to="/abha" className={link}>{t("abha")}</NavLink>
        </nav>
        <select aria-label={t("language")} value={i18n.language} className="rounded border p-1"
          onChange={(e) => { const l = e.target.value as Lang; i18n.changeLanguage(l); try { localStorage.setItem("lang", l); } catch { /* private mode */ } api.setLanguage(l); }}>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </header>
      <main><Outlet /></main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="upload" element={<Upload />} />
        <Route path="documents/:id" element={<DocumentDetail />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="abha" element={<Abha />} />
      </Route>
    </Routes>
  );
}
