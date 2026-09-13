import type { ApplicationView, Capture } from "./types";

export const DEFAULT_API_BASE = "http://localhost:3000";

/** The only setting: where the web app is. There is no auth; the app binds to loopback. */
export type Settings = { apiBase: string };

export async function loadSettings(): Promise<Settings> {
  const s = (await chrome.storage.local.get(["apiBase"])) as { apiBase?: string };
  return { apiBase: (s.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "") };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set(s);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(s: Settings, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${s.apiBase}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export type Health = { ok: boolean; hasProfile: boolean; name: string | null; email: string | null };

export const api = {
  me: (s: Settings) => request<Health>(s, "/api/me"),
  findByUrl: (s: Settings, url: string) => request<ApplicationView | null>(s, `/api/applications?url=${encodeURIComponent(url)}`),
  capture: (s: Settings, c: Capture) => request<{ id: string; existing: boolean }>(s, "/api/applications", { method: "POST", body: JSON.stringify(c) }),
  get: (s: Settings, id: string) => request<ApplicationView>(s, `/api/applications/${id}`),
  stage: (s: Settings, id: string, stage: string, note?: string | null) =>
    request<ApplicationView>(s, `/api/applications/${id}/stage`, { method: "POST", body: JSON.stringify({ stage, note: note ?? null }) }),
  async prompt(s: Settings, id: string): Promise<string> {
    const res = await fetch(`${s.apiBase}/api/applications/${id}/prompt`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? "Could not build the prompt.");
    }
    return res.text();
  },
  reply: (s: Settings, id: string, text: string) => request<ApplicationView>(s, `/api/applications/${id}/reply`, { method: "POST", body: JSON.stringify({ text }) }),
  regenerate: (s: Settings, id: string, note: string | null) =>
    request<ApplicationView>(s, `/api/applications/${id}/regenerate`, { method: "POST", body: JSON.stringify({ note }) }),
  async fileBase64(s: Settings, docId: string): Promise<string> {
    const res = await fetch(`${s.apiBase}/api/documents/${docId}/file`);
    if (!res.ok) throw new ApiError(res.status, "Could not download the PDF.");
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  },
};
