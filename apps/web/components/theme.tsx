"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { ACCENTS, ACCENT_COOKIE, MODE_COOKIE, isAccent, isMode, type Accent, type ColorMode } from "./theme-config";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

const MODES: { id: ColorMode; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ColorMode>("system");
  const [accent, setAccent] = useState<Accent>("persimmon");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = document.documentElement;
    setMode(isMode(h.dataset.mode) ? h.dataset.mode : "system");
    setAccent(isAccent(h.dataset.accent) ? h.dataset.accent : "persimmon");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickMode(m: ColorMode) {
    setMode(m);
    if (m === "system") delete document.documentElement.dataset.mode;
    else document.documentElement.dataset.mode = m;
    setCookie(MODE_COOKIE, m);
  }
  function pickAccent(a: Accent) {
    setAccent(a);
    document.documentElement.dataset.accent = a;
    setCookie(ACCENT_COOKIE, a);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn btn-ghost btn-sm" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Appearance
      </button>
      {open && (
        <div role="dialog" aria-label="Appearance" className="card enter absolute right-0 z-30 mt-2 w-56 !p-2">
          <div className="label px-2 pt-1 pb-2">Mode</div>
          <ul className="flex flex-col">
            {MODES.map(({ id, label, Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => pickMode(id)}
                  aria-pressed={mode === id}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] hover:bg-surface-2"
                >
                  <Icon size={14} strokeWidth={1.75} className="text-ink-2" />
                  <span className="flex-1 text-left">{label}</span>
                  {mode === id && <Check size={14} strokeWidth={2} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="divider my-2" />
          <div className="label px-2 pb-2">Accent</div>
          <ul className="flex flex-col">
            {ACCENTS.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => pickAccent(a.id)}
                  aria-pressed={accent === a.id}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] hover:bg-surface-2"
                >
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: a.swatch }} aria-hidden />
                  <span className="flex-1 text-left">{a.label}</span>
                  {accent === a.id && <Check size={14} strokeWidth={2} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
