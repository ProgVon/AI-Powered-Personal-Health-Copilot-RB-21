import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, Profile } from "../api";
import { FLAG_LABEL } from "../components/AbnormalCard";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl bg-white p-4 shadow-sm"><h2 className="mb-2 font-semibold">{title}</h2>{children}</section>
);

export default function Home() {
  const { t } = useTranslation();
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => { api.profile().then(setP); }, []);
  if (!p) return null;
  const none = <p className="text-sm text-slate-600">{t("none")}</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <p className="text-sm text-slate-600">
            {p.age != null && `${t("age")} ${p.age} · `}{p.abha.linked ? `✓ ${t("abhaLinked")}` : t("abhaNotLinked")}
          </p>
        </div>
        <Link to="/upload" className="rounded-lg bg-teal-700 px-8 py-4 text-lg font-semibold text-white">＋ {t("upload")}</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t("conditions")}>{p.conditions.length ? <ul className="list-disc pl-5">{p.conditions.map((c) => <li key={c}>{c}</li>)}</ul> : none}</Card>
        <Card title={t("allergies")}>{p.allergies.length ? <ul className="list-disc pl-5">{p.allergies.map((c) => <li key={c}>{c}</li>)}</ul> : none}</Card>
        <Card title={t("currentMedicines")}>
          {p.current_medicines.length ? <ul className="space-y-1">{p.current_medicines.map((m, i) => (
            <li key={i}><Link className="underline" to={`/documents/${m.document_id}`}>{m.name}</Link>
              <span className="text-sm text-slate-600"> {m.salt} {m.dose_pattern}</span></li>))}</ul> : none}
        </Card>
        <Card title={t("latestAbnormal")}>
          {p.latest_abnormal.length ? <ul className="space-y-1">{p.latest_abnormal.map((a, i) => (
            <li key={i}><Link className="underline" to={`/documents/${a.document_id}`}>{a.test}</Link>
              <span className="text-sm"> {a.value} {a.unit} · {t(FLAG_LABEL[a.interpretation])}</span></li>))}</ul> : none}
        </Card>
      </div>
    </div>
  );
}
