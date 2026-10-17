// Client-safe. Light / dark / auto (by time of day) theme preference, kept
// per device in localStorage and applied as <html data-theme="light|dark">.
// The colour tokens each theme maps to live in tailwind.config.ts.

export type ThemeMode = "light" | "dark" | "auto";
export type ThemePrefs = {
  mode: ThemeMode;
  /** "HH:MM" — in auto mode, dark from this time... */
  darkFrom: string;
  /** "HH:MM" — ...until this time. */
  lightFrom: string;
};

export const THEME_STORAGE_KEY = "jd-theme";
/** Fired on window after the preference changes in this tab (localStorage's "storage" event only reaches other tabs). */
export const THEME_CHANGE_EVENT = "jd-theme-change";
export const DEFAULT_THEME_PREFS: ThemePrefs = { mode: "auto", darkFrom: "19:00", lightFrom: "07:00" };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function readThemePrefs(): ThemePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? "{}") as Partial<ThemePrefs>;
    return {
      mode: raw.mode === "light" || raw.mode === "dark" || raw.mode === "auto" ? raw.mode : DEFAULT_THEME_PREFS.mode,
      darkFrom: raw.darkFrom && TIME_RE.test(raw.darkFrom) ? raw.darkFrom : DEFAULT_THEME_PREFS.darkFrom,
      lightFrom: raw.lightFrom && TIME_RE.test(raw.lightFrom) ? raw.lightFrom : DEFAULT_THEME_PREFS.lightFrom,
    };
  } catch {
    return DEFAULT_THEME_PREFS;
  }
}

export function writeThemePrefs(prefs: ThemePrefs) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
  applyTheme(prefs);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Whether `prefs` means dark at `now`. The auto window may wrap midnight (19:00 -> 07:00) or not (13:00 -> 15:00). */
export function isDarkAt(prefs: ThemePrefs, now: Date): boolean {
  if (prefs.mode !== "auto") return prefs.mode === "dark";
  const t = now.getHours() * 60 + now.getMinutes();
  const from = minutes(prefs.darkFrom);
  const to = minutes(prefs.lightFrom);
  if (from === to) return false;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

export function applyTheme(prefs: ThemePrefs = readThemePrefs(), now = new Date()) {
  document.documentElement.dataset.theme = isDarkAt(prefs, now) ? "dark" : "light";
}

/**
 * Inline <head> script: the same logic as readThemePrefs + isDarkAt, run
 * before first paint so a dark-mode page never flashes light. Kept in sync
 * with isDarkAt by lib/theme.test.ts.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=${JSON.stringify(DEFAULT_THEME_PREFS)},p=d;try{p=JSON.parse(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})||"{}")}catch(e){}var r=/^([01]\\d|2[0-3]):[0-5]\\d$/,m=p.mode==="light"||p.mode==="dark"||p.mode==="auto"?p.mode:d.mode,f=r.test(p.darkFrom||"")?p.darkFrom:d.darkFrom,l=r.test(p.lightFrom||"")?p.lightFrom:d.lightFrom,k=function(s){return +s.slice(0,2)*60+ +s.slice(3,5)},n=new Date(),t=n.getHours()*60+n.getMinutes(),a=k(f),b=k(l),dark=m==="dark";if(m==="auto")dark=a===b?false:a<b?t>=a&&t<b:t>=a||t<b;document.documentElement.dataset.theme=dark?"dark":"light"})()`;
