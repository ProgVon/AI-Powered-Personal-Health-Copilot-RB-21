const BASE = "/api";  // proxied to the backend by next.config.ts

// JWT from /auth/verify, kept across tabs and restarts until logout or a 401.
let memToken: string | null = null;  // fallback when storage is blocked
export const getToken = () => { try { return localStorage.getItem("token"); } catch { return memToken; } };
export function setToken(t: string | null) {
  memToken = t;
  try { if (t) localStorage.setItem("token", t); else localStorage.removeItem("token"); } catch { /* private mode */ }
}
const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = getToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const r = await fetch(BASE + path, { ...init, headers });
  if (r.status === 401 && getToken()) {  // expired, password reset elsewhere, or account deleted: back to login
    setToken(null);
    try { sessionStorage.setItem("loggedOut", "1"); } catch { /* private mode */ }
    location.reload();
  }
  if (!r.ok) {
    const detail = (await r.json().catch(() => ({}))).detail;  // 422s carry a list of field errors
    throw new Error((Array.isArray(detail) ? detail[0]?.msg : detail) ?? r.statusText);
  }
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
  summary?: Summary | null; extraction?: { _warnings?: string[]; _error?: string; _busy?: boolean } | null;
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
  rescan: (id: number) => post<Doc>(`/documents/${id}/rescan`),
  summary: (id: number, lang: string) => req<Summary>(`/documents/${id}/summary?lang=${lang}`),
  file: async (id: number) => {
    const r = await fetch(`${BASE}/documents/${id}/file`, { headers: authHeader() });
    if (!r.ok) throw new Error("Original file not available");  // e.g. wiped with the server's disk
    const b = await r.blob();
    return { url: URL.createObjectURL(b), type: b.type };
  },
  timeline: (types: string[]) => req<TimelineItem[]>(`/profile/timeline?types=${types.join(",")}`),
  abhaLink: (abha: string) => post<{ demo_otp: string }>("/abha/link", { abha }),
  abhaVerify: (otp: string) => post("/abha/verify", { otp }),
  abhaImport: () => post<{ imported_document_ids: number[] }>("/abha/import"),
  fhir: () => req<unknown>("/profile/fhir"),
  signup: (username: string, email: string, password: string) => post<{ email: string }>("/auth/signup", { username, email, password }),
  login: (login: string, password: string) => post<{ email: string }>("/auth/login", { login, password }),
  verifyOtp: (email: string, otp: string) => post<{ token: string }>("/auth/verify", { email, otp }),
  forgot: (email: string) => post<{ email: string }>("/auth/forgot", { email }),
  checkReset: (email: string, otp: string) => post("/auth/reset/check", { email, otp }),
  reset: (email: string, otp: string, password: string) => post("/auth/reset", { email, otp, password }),
};
