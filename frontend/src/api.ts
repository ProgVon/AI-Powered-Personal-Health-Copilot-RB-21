const BASE = import.meta.env.VITE_API ?? "http://localhost:8000";

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const r = await fetch(BASE + path, { ...init, headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? r.statusText);
  return r.status === 204 ? (undefined as T) : r.json();
}
const post = <T,>(p: string, body?: unknown) => req<T>(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export type Summary = {
  headline: string; key_points: string[]; next_steps: string[];
  abnormal_explanations: { test: string; value: string; status: string; what_it_means: string; common_reasons: string; question_for_doctor: string }[];
  medicines_explained: { name: string; general_purpose: string; how_to_take: string }[];
};
export type Doc = {
  id: number; doc_type: string | null; doc_date: string | null; facility: string | null; status: string; source: string;
  created_at?: string; practitioner?: string | null;
  summary?: Summary | null; extraction?: { _warnings?: string[]; _error?: string } | null;
  observations?: Obs[]; medications?: Med[]; conditions?: { name: string }[]; allergies?: { substance: string }[];
};
export type Obs = { id: number; display_name: string; value_num: number | null; value_text: string | null; unit: string | null; ref_low: number | null; ref_high: number | null; interpretation: string | null; note: string | null };
export type Med = { id: number; brand_name: string; salt: string | null; strength: string | null; dose_pattern: string | null; timing: string | null; duration_days: number | null };
export type TimelineItem = { type: string; date: string; document_id: number; title: string; detail: string | null; interpretation?: string; source: string };
export type Profile = {
  name: string; age: number | null; abha: { number: string | null; address: string | null; linked: boolean };
  conditions: string[]; allergies: string[]; current_medicines: { name: string; salt: string | null; dose_pattern: string | null; document_id: number }[];
  latest_abnormal: { test: string; value: string | number; unit: string | null; interpretation: string; document_id: number; ref_low: number | null; ref_high: number | null }[];
  dob: string | null; sex: string | null;
};

export const api = {
  profile: () => req<Profile>("/profile"),
  setLanguage: (preferred_language: string) => req("/profile", { method: "PUT", body: JSON.stringify({ preferred_language }) }),
  upload: (f: File) => { const fd = new FormData(); fd.append("file", f); return req<Doc>("/documents", { method: "POST", body: fd }); },
  docs: () => req<Doc[]>("/documents"),
  doc: (id: number) => req<Doc>(`/documents/${id}`),
  summary: (id: number, lang: string) => req<Summary>(`/documents/${id}/summary?lang=${lang}`),
  file: async (id: number) => { const b = await (await fetch(`${BASE}/documents/${id}/file`)).blob(); return { url: URL.createObjectURL(b), type: b.type }; },
  timeline: (types: string[]) => req<TimelineItem[]>(`/profile/timeline?types=${types.join(",")}`),
  abhaLink: (abha: string) => post<{ demo_otp: string }>("/abha/link", { abha }),
  abhaVerify: (otp: string) => post("/abha/verify", { otp }),
  abhaImport: () => post<{ imported_document_ids: number[] }>("/abha/import"),
  fhir: () => req<unknown>("/profile/fhir"),
};
