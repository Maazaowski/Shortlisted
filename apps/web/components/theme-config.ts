export type ColorMode = "light" | "dark" | "system";
export type Accent = "persimmon" | "cobalt" | "moss";

export const MODE_COOKIE = "sl-mode";
export const ACCENT_COOKIE = "sl-accent";

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "persimmon", label: "Persimmon", swatch: "#c8401a" },
  { id: "cobalt", label: "Cobalt", swatch: "#2547d0" },
  { id: "moss", label: "Moss", swatch: "#2f6a3c" },
];

export function isMode(v: unknown): v is ColorMode {
  return v === "light" || v === "dark" || v === "system";
}
export function isAccent(v: unknown): v is Accent {
  return ACCENTS.some((a) => a.id === v);
}
