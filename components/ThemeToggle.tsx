"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DEFAULT_THEME_PREFS, THEME_CHANGE_EVENT, THEME_STORAGE_KEY, applyTheme, isDarkAt, readThemePrefs, writeThemePrefs,
  type ThemeMode, type ThemePrefs,
} from "@/lib/theme";

/**
 * Mounted once in the root layout. The <head> script sets the theme before
 * first paint; this keeps it right afterwards — auto mode crossing its
 * switch time while a page is open, and changes made in another tab.
 */
export function ThemeSync() {
  useEffect(() => {
    const sync = () => applyTheme();
    const timer = setInterval(sync, 60_000);
    const onStorage = (e: StorageEvent) => e.key === THEME_STORAGE_KEY && sync();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return null;
}

function useThemePrefs(): [ThemePrefs, (p: ThemePrefs) => void, boolean] {
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULT_THEME_PREFS);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const load = () => {
      const p = readThemePrefs();
      setPrefs(p);
      setDark(isDarkAt(p, new Date()));
    };
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener(THEME_CHANGE_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(THEME_CHANGE_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return [prefs, writeThemePrefs, dark];
}

const MODES: { value: ThemeMode; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "auto", label: "Auto", icon: "◐" },
];

/** Mode picker + auto-mode hours. Styled for the navy sidebar / header chrome. */
function ThemeControls({ prefs, save }: { prefs: ThemePrefs; save: (p: ThemePrefs) => void }) {
  const id = useId();
  return (
    <div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1" role="radiogroup" aria-label="Theme">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={prefs.mode === m.value}
            onClick={() => save({ ...prefs, mode: m.value })}
            className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] transition ${
              prefs.mode === m.value ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
            }`}
          >
            <span aria-hidden>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>
      {prefs.mode === "auto" && (
        <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[11px] text-white/50">
          <label htmlFor={`${id}-dark`}>Dark from</label>
          <input
            id={`${id}-dark`}
            type="time"
            value={prefs.darkFrom}
            onChange={(e) => e.target.value && save({ ...prefs, darkFrom: e.target.value })}
            className="min-w-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/80 [color-scheme:dark]"
          />
          <label htmlFor={`${id}-light`}>Light from</label>
          <input
            id={`${id}-light`}
            type="time"
            value={prefs.lightFrom}
            onChange={(e) => e.target.value && save({ ...prefs, lightFrom: e.target.value })}
            className="min-w-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/80 [color-scheme:dark]"
          />
        </div>
      )}
    </div>
  );
}

/** Inline version for the sidebar footer. */
export function ThemeToggle() {
  const [prefs, save] = useThemePrefs();
  return <ThemeControls prefs={prefs} save={save} />;
}

/** Icon button + popover, for the public catalog headers. */
export function ThemeMenu() {
  const [prefs, save, dark] = useThemePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Theme"
        aria-expanded={open}
        className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
      >
        {dark ? "☾" : "☀"}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-60 rounded-xl bg-chrome border border-white/10 p-3 shadow-xl">
          <ThemeControls prefs={prefs} save={save} />
        </div>
      )}
    </div>
  );
}
