"use client";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, Profile } from "@/api";
import { useToast } from "./Toast";
import { Spinner } from "./ui";

// Sex picks the lab ranges, birth date catches impossible dates, and the name flags reports for someone else.
export default function ProfileForm({ p, onSaved }: { p: Profile; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(p.name);
  const [dob, setDob] = useState(p.dob ?? "");
  const [sex, setSex] = useState(p.sex ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateProfile({ name: name.trim(), dob: dob || null, sex: sex || null });
      toast(t("details.saved"));
      onSaved();
    } catch (err) { toast((err as Error).message, true); } finally { setBusy(false); }
  }

  const label = (text: string) => <span className="mb-1.5 block text-sm font-semibold">{text}</span>;
  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-muted">{t("details.why")}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">{label(t("details.name"))}
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" /></label>
        <label className="block">{label(t("details.dob"))}
          <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} autoComplete="bday" /></label>
        <label className="block">{label(t("details.sex"))}
          <select className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="" disabled>{t("details.choose")}</option>
            {(["female", "male", "other"] as const).map((s) => <option key={s} value={s}>{t(`details.${s}`)}</option>)}
          </select></label>
      </div>
      <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy && <Spinner />}{t("details.save")}</button>
    </form>
  );
}
