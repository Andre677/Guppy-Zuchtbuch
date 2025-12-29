/*
  Guppy Zuchtbuch – Option B: „Zuchtjournal“
  =========================================

  Idee:
  - Ein Zuchtansatz (Attempt) kann mehrere Becken umfassen.
  - Logbuch-Einträge hängen primär am Zuchtansatz (optional zusätzlich am Becken).
  - Zuchtgruppen (Group) hängen am Zuchtansatz + an einem Becken (für Besatz/Details).

  Hinweis:
  - Ein-Filen Canvas-Prototyp (localStorage)
  - bewusst schlank gehalten, damit Änderungen stabiler funktionieren.
*/

import React, { useEffect, useMemo, useState } from "react";

// ===================== Helpers =====================
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const pad2 = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date | string) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (!dt || Number.isNaN(dt.getTime())) return "";
  return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
};
const fromISO = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const formatShort = (iso: string) => {
  const d = fromISO(iso);
  if (!d) return "–";
  return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + String(d.getFullYear()).slice(-2);
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// ===================== Wasserwerte =====================
const PARAM_DEFS = {
  temp: { label: "Temperatur", short: "Temp", unit: "°C" },
  ph: { label: "pH", short: "pH", unit: "" },
  gh: { label: "Gesamthärte", short: "GH", unit: "°dH" },
  kh: { label: "Karbonathärte", short: "KH", unit: "°dH" },
  no2: { label: "Nitrit", short: "NO2", unit: "mg/L" },
  no3: { label: "Nitrat", short: "NO3", unit: "mg/L" },
  tds: { label: "TDS", short: "TDS", unit: "ppm" },
  cond: { label: "Leitfähigkeit", short: "µS/cm", unit: "µS/cm" },
} as const;

type ParamKey = keyof typeof PARAM_DEFS;
const ALL_PARAM_KEYS = Object.keys(PARAM_DEFS) as ParamKey[];

type WaterParams = Record<ParamKey, boolean>;
const makeAllParams = (enabled: boolean): WaterParams =>
  ALL_PARAM_KEYS.reduce((acc, k) => {
    (acc as any)[k] = enabled;
    return acc;
  }, {} as WaterParams);

type WaterLimits = Record<ParamKey, { min: number | null; max: number | null }>;
const makeDefaultLimits = (): WaterLimits =>
  ALL_PARAM_KEYS.reduce((acc, k) => {
    (acc as any)[k] = { min: null, max: null };
    return acc;
  }, {} as WaterLimits);

const parseNumOrNull = (s: string): number | null => {
  const t = String(s ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const inRange = (value: number | null, lim: { min: number | null; max: number | null }) => {
  if (value == null) return "na" as const;
  if (lim.min != null && value < lim.min) return "low" as const;
  if (lim.max != null && value > lim.max) return "high" as const;
  return "ok" as const;
};

// ===================== Types =====================

type Tank = {
  id: string;
  name: string;
  volumeL: number;
  location: string;
  purpose: string;
  active: boolean;
  waterParams: WaterParams;
};

type Line = {
  id: string;
  name: string;
  code: string;
  traits: string[];
  notes: string;
  archived: boolean;
};

type Attempt = {
  id: string;
  name: string;
  lineId: string;
  tankIds: string[]; // mehrere Becken
  startDate: string;
  endDate: string;
  goal: string;
  notes: string;
  active: boolean;
  archived: boolean;
};

type Group = {
  id: string;
  attemptId: string;
  name: string;
  tankId: string;
  maleCount: number;
  femaleCount: number;
  notes: string;
  active: boolean;
  archived: boolean;
};

type WaterEntry = {
  id: string;
  tankId: string;
  date: string;
  note: string;
} & Partial<Record<ParamKey, number | null>>;

type LogEntry = {
  id: string;
  attemptId: string;
  tankId: string; // optional: "" = allgemein
  date: string;
  kind: "Futter" | "Pflege" | "Wurf" | "Beobachtung" | "Sonstiges";
  title: string;
  notes: string;
};

type Settings = {
  breederName: string;
  maxPhotoMB: number;
  waterLimits: WaterLimits;
};

type AppState = {
  settings: Settings;
  tanks: Tank[];
  lines: Line[];
  attempts: Attempt[];
  groups: Group[];
  water: WaterEntry[];
  log: LogEntry[];
};

// ===================== Storage =====================
const STORAGE_KEY = "guppy_zuchtbuch_optionB_v1";

const seed = (): AppState => {
  const today = new Date();
  const t0 = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 21);
  const t1 = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 7);

  const tankA: Tank = {
    id: uid(),
    name: "Becken 01",
    volumeL: 54,
    location: "Wohnzimmer",
    purpose: "Zucht",
    active: true,
    waterParams: { ...makeAllParams(false), temp: true, ph: true, gh: true, kh: true, no2: true, no3: true },
  };
  const tankB: Tank = {
    id: uid(),
    name: "Becken 02",
    volumeL: 30,
    location: "Regal",
    purpose: "Aufzucht",
    active: true,
    waterParams: { ...makeAllParams(false), temp: true, ph: true, no2: true, no3: true, tds: true, cond: true },
  };

  const lineA: Line = {
    id: uid(),
    name: "Endler – Japan Blue",
    code: "JB-01",
    traits: ["Japan Blue", "Endler"],
    notes: "Stamm stabil, kräftige Blautöne.",
    archived: false,
  };

  const attemptA: Attempt = {
    id: uid(),
    name: "Ansatz 2025-01 (A)",
    lineId: lineA.id,
    tankIds: [tankA.id, tankB.id],
    startDate: toISODate(t0),
    endDate: "",
    goal: "Farbintensität & Flossenform",
    notes: "Becken 01 Zucht, Becken 02 Aufzucht.",
    active: true,
    archived: false,
  };

  const groups: Group[] = [
    { id: uid(), attemptId: attemptA.id, name: "Zuchtgruppe", tankId: tankA.id, maleCount: 2, femaleCount: 5, notes: "Hauptgruppe", active: true, archived: false },
    { id: uid(), attemptId: attemptA.id, name: "Jungfische", tankId: tankB.id, maleCount: 0, femaleCount: 0, notes: "Batch 1", active: true, archived: false },
  ];

  const limits = makeDefaultLimits();
  limits.temp = { min: 22, max: 28 };
  limits.ph = { min: 6.5, max: 7.8 };
  limits.no2 = { min: 0, max: 0.1 };
  limits.no3 = { min: 0, max: 30 };

  const water: WaterEntry[] = [
    { id: uid(), tankId: tankA.id, date: toISODate(t1), note: "", temp: 25.2, ph: 7.1, gh: 10, kh: 6, no2: 0, no3: 12 },
    { id: uid(), tankId: tankB.id, date: toISODate(t1), note: "", temp: 26.0, ph: 7.0, no2: 0, no3: 18, tds: 280, cond: 520 },
  ];

  const log: LogEntry[] = [
    { id: uid(), attemptId: attemptA.id, tankId: tankA.id, date: toISODate(t1), kind: "Pflege", title: "Wasserwechsel 30%", notes: "leicht aufsalzen" },
    { id: uid(), attemptId: attemptA.id, tankId: "", date: toISODate(t1), kind: "Beobachtung", title: "Färbung sichtbar", notes: "erste blaue Flanken" },
  ];

  return {
    settings: { breederName: "", maxPhotoMB: 1.5, waterLimits: limits },
    tanks: [tankA, tankB],
    lines: [lineA],
    attempts: [attemptA],
    groups,
    water,
    log,
  };
};

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);

    const settingsIn = (parsed && parsed.settings) || {};
    const waterLimits: WaterLimits = makeDefaultLimits();
    const incoming = settingsIn.waterLimits && typeof settingsIn.waterLimits === "object" ? settingsIn.waterLimits : null;
    if (incoming) {
      ALL_PARAM_KEYS.forEach((k) => {
        const x = (incoming as any)[k];
        if (x && typeof x === "object") {
          waterLimits[k] = {
            min: typeof x.min === "number" ? x.min : null,
            max: typeof x.max === "number" ? x.max : null,
          };
        }
      });
    }

    const normalizeTank = (t: any): Tank => {
      const wp = makeAllParams(false);
      const inc = t && t.waterParams ? t.waterParams : {};
      ALL_PARAM_KEYS.forEach((k) => {
        if (typeof inc[k] === "boolean") (wp as any)[k] = inc[k];
      });
      return {
        id: String(t?.id || uid()),
        name: String(t?.name || "Becken"),
        volumeL: typeof t?.volumeL === "number" ? t.volumeL : Number(t?.volumeL || 0),
        location: String(t?.location || ""),
        purpose: String(t?.purpose || ""),
        active: t?.active !== false,
        waterParams: wp,
      };
    };

    return {
      settings: {
        breederName: typeof settingsIn.breederName === "string" ? settingsIn.breederName : "",
        maxPhotoMB: typeof settingsIn.maxPhotoMB === "number" ? settingsIn.maxPhotoMB : 1.5,
        waterLimits,
      },
      tanks: Array.isArray(parsed.tanks) ? parsed.tanks.map(normalizeTank) : [],
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      water: Array.isArray(parsed.water) ? parsed.water : [],
      log: Array.isArray(parsed.log) ? parsed.log : [],
    };
  } catch {
    return seed();
  }
}

function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// ===================== UI =====================
function ButtonX(props: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const variant = props.variant || "primary";
  const disabled = !!props.disabled;
  const base = "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition border";
  const styles: Record<string, string> = {
    primary: "bg-black text-white border-black hover:opacity-90",
    secondary: "bg-white text-black border-neutral-200 hover:bg-neutral-50",
    ghost: "bg-transparent text-black border-transparent hover:bg-neutral-100",
    danger: "bg-white text-red-600 border-red-200 hover:bg-red-50",
  };
  const dis = disabled ? "opacity-50 cursor-not-allowed" : "";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={props.onClick}
      title={props.title}
      className={base + " " + (styles[variant] || styles.primary) + " " + dis + " " + (props.className || "")}
    >
      {props.children}
    </button>
  );
}

function InputX(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const cn =
    "w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200 " +
    ((props as any).className || "");
  const rest: any = { ...props };
  delete rest.className;
  return <input {...rest} className={cn} />;
}

function TextareaX(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const cn =
    "w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200 " +
    ((props as any).className || "");
  const rest: any = { ...props };
  delete rest.className;
  return <textarea {...rest} className={cn} />;
}

function CardX(props: { title?: string; subtitle?: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={"rounded-2xl border border-neutral-200 bg-white " + (props.className || "")}>
      {props.title || props.subtitle || props.right ? (
        <div className="p-4 border-b border-neutral-100 flex items-start justify-between gap-3">
          <div>
            {props.title ? <div className="font-bold">{props.title}</div> : null}
            {props.subtitle ? <div className="text-sm text-neutral-500 mt-1">{props.subtitle}</div> : null}
          </div>
          {props.right ? <div>{props.right}</div> : null}
        </div>
      ) : null}
      <div className="p-4">{props.children}</div>
    </div>
  );
}

function TogglePill(props: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      className={
        "relative inline-flex h-6 w-11 items-center rounded-full border transition " +
        (props.checked ? "bg-green-500 border-green-600" : "bg-red-500 border-red-600")
      }
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
        aria-label="toggle"
      />
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition " +
          (props.checked ? "translate-x-5" : "translate-x-0")
        }
      />
    </span>
  );
}

// ===================== Tabs =====================
function DashboardTab(props: { state: AppState; tanksById: Record<string, Tank>; linesById: Record<string, Line> }) {
  const activeAttempts = props.state.attempts.filter((a) => a.active && !a.archived).length;
  const activeTanks = props.state.tanks.filter((t) => t.active).length;
  const lastLog = props.state.log.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;

  return (
    <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-xs text-neutral-500">Aktive Ansätze</div>
            <div className="text-2xl font-extrabold mt-1">{activeAttempts}</div>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-xs text-neutral-500">Aktive Becken</div>
            <div className="text-2xl font-extrabold mt-1">{activeTanks}</div>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-xs text-neutral-500">Letzter Eintrag</div>
            <div className="text-2xl font-extrabold mt-1">{lastLog ? formatShort(lastLog.date) : "–"}</div>
            <div className="text-xs text-neutral-500 mt-1 truncate">{lastLog ? lastLog.title : "noch keiner"}</div>
          </div>
        </div>

        <CardX title="Aktive Ansätze" subtitle="Kurzüberblick">
          {props.state.attempts.length ? (
            <div className="space-y-2">
              {props.state.attempts
                .filter((a) => !a.archived)
                .slice()
                .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
                .slice(0, 6)
                .map((a) => (
                  <div key={a.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate">{a.name}</div>
                      <div className="text-xs text-neutral-500">{formatShort(a.startDate)}</div>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      Linie: {props.linesById[a.lineId]?.name || "–"} · Becken: {a.tankIds.map((id) => props.tanksById[id]?.name || "–").join(", ")}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-sm text-neutral-500">Noch keine Ansätze.</div>
          )}
        </CardX>
      </div>

      <div className="space-y-4">
        <CardX title="Hinweis">
          <div className="text-sm text-neutral-600">
            Option B: Zucht + Log zusammen als „Zuchtjournal“ pro Ansatz (kann mehrere Becken umfassen).
          </div>
        </CardX>
      </div>
    </div>
  );
}

function TanksTab(props: {
  tanks: Tank[];
  setTanks: (updater: (prev: Tank[]) => Tank[]) => void;
  upsertTank: (t: Tank) => void;
  removeTank: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Tank | null>(null);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [volumeL, setVolumeL] = useState("54");
  const [purpose, setPurpose] = useState("");
  const [location, setLocation] = useState("");
  const [params, setParams] = useState<WaterParams>({ ...makeAllParams(false), temp: true, ph: true, no2: true, no3: true });

  useEffect(() => {
    if (!open) return;
    const t = editing;
    setName(t ? t.name : "");
    setVolumeL(String(t ? t.volumeL : 54));
    setPurpose(t ? t.purpose : "");
    setLocation(t ? t.location : "");
    setParams(t ? t.waterParams : { ...makeAllParams(false), temp: true, ph: true, no2: true, no3: true });
  }, [open, editing]);

  const canSave = name.trim().length > 0;

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-extrabold">Becken</div>
          <div className="text-sm text-neutral-500">Voll-Editor · Wasserwerte pro Becken · Aktiv/Inaktiv</div>
        </div>
        <ButtonX onClick={() => (setEditing(null), setOpen(true))}>+ Becken</ButtonX>
      </div>

      {open ? (
        <CardX title={editing ? "Becken bearbeiten" : "Becken anlegen"} subtitle="Wasserwerte pro Becken aktivieren">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Name</div>
              <InputX value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-neutral-500 mb-1">Volumen (L)</div>
                <InputX type="number" value={volumeL} onChange={(e) => setVolumeL(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Zweck</div>
                <InputX value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Zucht / Aufzucht" />
              </div>
            </div>

            <div>
              <div className="text-xs text-neutral-500 mb-1">Standort</div>
              <InputX value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Wohnzimmer" />
            </div>

            <div className="rounded-2xl border border-neutral-200 p-3 bg-neutral-50">
              <div className="text-sm font-semibold">Wasserwerte aktiv (pro Becken)</div>
              <div className="text-xs text-neutral-500 mt-1">Grenzwerte pflegst du im Tab „Einstellungen“.</div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {ALL_PARAM_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2">
                    <input type="checkbox" checked={!!params[k]} onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.checked }))} />
                    {PARAM_DEFS[k].short}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <ButtonX variant="secondary" onClick={() => setOpen(false)}>
                Schließen
              </ButtonX>
              <ButtonX
                disabled={!canSave}
                onClick={() => {
                  const t: Tank = {
                    id: editing ? editing.id : uid(),
                    name: name.trim(),
                    volumeL: Number(volumeL || 0),
                    location,
                    purpose,
                    active: editing ? editing.active : true,
                    waterParams: params,
                  };
                  props.upsertTank(t);
                  setOpen(false);
                }}
              >
                Speichern
              </ButtonX>
            </div>
          </div>
        </CardX>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {props.tanks.map((t) => (
          <CardX
            key={t.id}
            title={t.name}
            subtitle={(t.location || "–") + " · " + t.volumeL + " L · " + (t.purpose || "–")}
            right={
              <div className="flex gap-2 items-center flex-wrap">
                <span className={"text-xs font-semibold " + (t.active ? "text-green-700" : "text-red-700")}>{t.active ? "aktiv" : "inaktiv"}</span>
                <TogglePill checked={t.active} onChange={(v) => props.setTanks((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: v } : x)))} />
                <ButtonX variant="secondary" onClick={() => (setEditing(t), setOpen(true))}>
                  Bearbeiten
                </ButtonX>
                <ButtonX variant="danger" onClick={() => props.removeTank(t.id)}>
                  Löschen
                </ButtonX>
              </div>
            }
          >
            <div className="text-sm text-neutral-600">Wasserwerte aktiv: {ALL_PARAM_KEYS.filter((k) => t.waterParams[k]).map((k) => PARAM_DEFS[k].short).join(" · ") || "–"}</div>
          </CardX>
        ))}
      </div>
    </div>
  );
}

function LinesTab(props: { lines: Line[]; attempts: Attempt[]; upsertLine: (l: Line) => void; removeLine: (id: string) => void }) {
  const [editing, setEditing] = useState<Line | null>(null);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [traits, setTraits] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const l = editing;
    setName(l ? l.name : "");
    setCode(l ? l.code : "");
    setTraits(l ? (l.traits || []).join(", ") : "");
    setNotes(l ? l.notes : "");
  }, [open, editing]);

  const linkedCount = (id: string) => props.attempts.filter((a) => a.lineId === id && !a.archived).length;

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-extrabold">Linien / Stämme</div>
          <div className="text-sm text-neutral-500">Voll-Editor · Wenn verknüpft, wird beim Entfernen archiviert.</div>
        </div>
        <ButtonX onClick={() => (setEditing(null), setOpen(true))}>+ Linie</ButtonX>
      </div>

      {open ? (
        <CardX title={editing ? "Linie bearbeiten" : "Linie anlegen"} subtitle="Name · Code · Merkmale · Notizen">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Name</div>
              <InputX value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-neutral-500 mb-1">Code</div>
                <InputX value={code} onChange={(e) => setCode(e.target.value)} placeholder="MB-01" />
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Merkmale (Komma)</div>
                <InputX value={traits} onChange={(e) => setTraits(e.target.value)} placeholder="Mosaic, Red" />
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Notizen</div>
              <TextareaX rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <ButtonX variant="secondary" onClick={() => setOpen(false)}>
                Schließen
              </ButtonX>
              <ButtonX
                disabled={!name.trim()}
                onClick={() => {
                  const l: Line = {
                    id: editing ? editing.id : uid(),
                    name: name.trim(),
                    code,
                    traits: traits
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                    notes,
                    archived: editing ? editing.archived : false,
                  };
                  props.upsertLine(l);
                  setOpen(false);
                }}
              >
                Speichern
              </ButtonX>
            </div>
          </div>
        </CardX>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {props.lines.map((l) => (
          <CardX
            key={l.id}
            title={l.name + (l.archived ? " (archiv)" : "")}
            subtitle={(l.code || "—") + ((l.traits || []).length ? " · " + l.traits.join(" · ") : "")}
            right={
              <div className="flex gap-2 flex-wrap">
                <ButtonX variant="secondary" onClick={() => (setEditing(l), setOpen(true))}>
                  Bearbeiten
                </ButtonX>
                <ButtonX variant="danger" onClick={() => props.removeLine(l.id)} title={linkedCount(l.id) ? "Archiviert (verknüpft)" : "Löschen"}>
                  {linkedCount(l.id) ? "Archiv" : "Löschen"}
                </ButtonX>
              </div>
            }
          >
            {l.notes ? <div className="text-sm text-neutral-600">{l.notes}</div> : <div className="text-sm text-neutral-500">Keine Notizen.</div>}
            {linkedCount(l.id) ? <div className="text-xs text-neutral-500 mt-2">Verknüpft mit {linkedCount(l.id)} Ansatz/Ansätzen.</div> : null}
          </CardX>
        ))}
      </div>
    </div>
  );
}

function ZuchtjournalTab(props: {
  attempts: Attempt[];
  tanks: Tank[];
  lines: Line[];
  tanksById: Record<string, Tank>;
  linesById: Record<string, Line>;
  upsertAttempt: (a: Attempt) => void;
  endAttempt: (id: string) => void;
  archiveAttempt: (id: string) => void;
  removeAttempt: (id: string) => void;
  logs: AttemptLog[];
  addLog: (e: Omit<AttemptLog, "id">) => void;
  removeLog: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(() => (props.attempts[0] ? props.attempts[0].id : ""));
  useEffect(() => {
    if (!selectedId && props.attempts.length) setSelectedId(props.attempts[0].id);
    if (selectedId && !props.attempts.some((a) => a.id === selectedId) && props.attempts.length) setSelectedId(props.attempts[0].id);
  }, [selectedId, props.attempts]);

  const selected = selectedId ? props.attempts.find((a) => a.id === selectedId) || null : null;

  // attempt editor
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<Attempt | null>(null);
  const [aName, setAName] = useState("");
  const [aLineId, setALineId] = useState("");
  const [aTanks, setATanks] = useState<string[]>([]);
  const [aStart, setAStart] = useState(toISODate(new Date()));
  const [aGoal, setAGoal] = useState("");
  const [aNotes, setANotes] = useState("");

  useEffect(() => {
    if (!editOpen) return;
    const a = edit;
    setAName(a ? a.name : "");
    setALineId(a ? a.lineId : (props.lines[0] ? props.lines[0].id : ""));
    setATanks(a ? a.tankIds : props.tanks.map((t) => t.id).slice(0, 1));
    setAStart(a ? a.startDate : toISODate(new Date()));
    setAGoal(a ? a.goal : "");
    setANotes(a ? a.notes : "");
  }, [editOpen, edit, props.lines, props.tanks]);

  const toggleTank = (id: string) => {
    setATanks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const groupsForAttempt = useMemo(() => (selected ? props.groups.filter((g) => g.attemptId === selected.id && !g.archived) : []), [props.groups, selected]);

  const logForAttempt = useMemo(() => {
    if (!selected) return [];
    return props.log
      .filter((e) => e.attemptId === selected.id)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [props.log, selected]);

  // quick group
  const [gName, setGName] = useState("Gruppe");
  const [gTankId, setGTankId] = useState("");
  const [gM, setGM] = useState("1");
  const [gF, setGF] = useState("3");
  const [gNotes, setGNotes] = useState("");

  useEffect(() => {
    if (!selected) return;
    setGTankId(selected.tankIds[0] || "");
  }, [selectedId]);

  // quick log
  const [lDate, setLDate] = useState(toISODate(new Date()));
  const [lKind, setLKind] = useState<LogEntry["kind"]>("Pflege");
  const [lTankId, setLTankId] = useState("");
  const [lTitle, setLTitle] = useState("Wasserwechsel");
  const [lNotes, setLNotes] = useState("");

  useEffect(() => {
    setLTankId("");
  }, [selectedId]);

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-extrabold">Zuchtjournal</div>
          <div className="text-sm text-neutral-500">Ansatz (mehrere Becken) + Gruppen + Logbuch in einem Tab.</div>
        </div>
        <ButtonX onClick={() => (setEdit(null), setEditOpen(true))}>+ Ansatz</ButtonX>
      </div>

      {editOpen ? (
        <CardX title={edit ? "Ansatz bearbeiten" : "Ansatz anlegen"} subtitle="Mehrere Becken auswählen">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Name</div>
              <InputX value={aName} onChange={(e) => setAName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Linie</div>
              <select value={aLineId} onChange={(e) => setALineId(e.target.value)} className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm">
                {props.lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Start</div>
              <InputX type="date" value={aStart} onChange={(e) => setAStart(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Ziel</div>
              <InputX value={aGoal} onChange={(e) => setAGoal(e.target.value)} />
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="text-sm font-semibold">Becken im Ansatz</div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {props.tanks.map((t) => (
                <label key={t.id} className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2">
                  <input type="checkbox" checked={aTanks.includes(t.id)} onChange={() => toggleTank(t.id)} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <div className="text-xs text-neutral-500 mb-1">Notizen</div>
            <TextareaX rows={3} value={aNotes} onChange={(e) => setANotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <ButtonX variant="secondary" onClick={() => setEditOpen(false)}>
              Schließen
            </ButtonX>
            <ButtonX
              disabled={!aName.trim() || !aLineId || !aTanks.length}
              onClick={() => {
                const a: Attempt = {
                  id: edit ? edit.id : uid(),
                  name: aName.trim(),
                  lineId: aLineId,
                  tankIds: aTanks,
                  startDate: aStart || toISODate(new Date()),
                  endDate: edit ? edit.endDate : "",
                  goal: aGoal,
                  notes: aNotes,
                  active: edit ? edit.active : true,
                  archived: edit ? edit.archived : false,
                };
                props.upsertAttempt(a);
                setEditOpen(false);
                setSelectedId(a.id);
              }}
            >
              Speichern
            </ButtonX>
          </div>
        </CardX>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardX title="Ansätze" subtitle="Auswählen">
          {props.attempts.length ? (
            <div className="space-y-2">
              {props.attempts
                .filter((a) => !a.archived)
                .slice()
                .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
                .map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={
                      "w-full text-left rounded-2xl border px-3 py-2 transition " +
                      (selectedId === a.id ? "bg-black text-white border-black" : "bg-white hover:bg-neutral-50 border-neutral-200")
                    }
                  >
                    <div className="font-semibold truncate">{a.name}</div>
                    <div className={"text-xs mt-1 " + (selectedId === a.id ? "text-white/80" : "text-neutral-500")}>
                      {formatShort(a.startDate)} · {props.linesById[a.lineId]?.name || "–"}
                    </div>
                  </button>
                ))}
            </div>
          ) : (
            <div className="text-sm text-neutral-500">Noch keine Ansätze.</div>
          )}
        </CardX>

        <CardX
          className="lg:col-span-2"
          title={selected ? selected.name : "Details"}
          subtitle={selected ? `Linie: ${props.linesById[selected.lineId]?.name || "–"} · Start: ${formatShort(selected.startDate)}` : "Wähle links einen Ansatz"}
          right={
            selected ? (
              <div className="flex gap-2 flex-wrap">
                <ButtonX variant="secondary" onClick={() => (setEdit(selected), setEditOpen(true))}>
                  Bearbeiten
                </ButtonX>
                <ButtonX variant="secondary" onClick={() => props.endAttempt(selected.id)}>
                  Beenden
                </ButtonX>
                <ButtonX variant="danger" onClick={() => props.archiveAttempt(selected.id)}>
                  Archivieren
                </ButtonX>
              </div>
            ) : null
          }
        >
          {selected ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-sm font-semibold">Becken im Ansatz</div>
                <div className="text-sm text-neutral-700 mt-2 flex flex-wrap gap-2">
                  {selected.tankIds.map((id) => (
                    <span key={id} className="rounded-2xl border bg-white px-3 py-1 text-sm">
                      {props.tanksById[id]?.name || "–"}
                    </span>
                  ))}
                </div>
                {selected.goal ? <div className="text-xs text-neutral-500 mt-2">Ziel: {selected.goal}</div> : null}
                {selected.notes ? <div className="text-xs text-neutral-500 mt-1">Notizen: {selected.notes}</div> : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CardX title="Gruppen" subtitle="pro Becken im Ansatz">
                  <div className="space-y-2">
                    {groupsForAttempt.length ? (
                      groupsForAttempt.map((g) => (
                        <div key={g.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{g.name}</div>
                              <div className="text-xs text-neutral-500 mt-1">
                                {props.tanksById[g.tankId]?.name || "–"} · ♂ {g.maleCount} · ♀ {g.femaleCount}
                              </div>
                              {g.notes ? <div className="text-xs text-neutral-500 mt-1">{g.notes}</div> : null}
                            </div>
                            <ButtonX variant="ghost" onClick={() => props.removeGroup(g.id)}>
                              ×
                            </ButtonX>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-neutral-500">Noch keine Gruppen.</div>
                    )}
                  </div>

                  <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="text-sm font-semibold">Gruppe hinzufügen</div>
                    <div className="mt-2 space-y-2">
                      <InputX value={gName} onChange={(e) => setGName(e.target.value)} />
                      <select value={gTankId} onChange={(e) => setGTankId(e.target.value)} className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm">
                        {selected.tankIds.map((id) => (
                          <option key={id} value={id}>
                            {props.tanksById[id]?.name || "–"}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-center text-sm text-neutral-500 mb-1 select-none">♂</div>
                        <InputX value={gM} onChange={(e) => setGM(e.target.value)} inputMode="numeric" />
                          </div>

                        <div>
                          <div className="text-center text-sm text-neutral-500 mb-1 select-none">♀</div>
                        <InputX value={gF} onChange={(e) => setGF(e.target.value)} inputMode="numeric" />
                          </div>
                      </div>
                      <InputX value={gNotes} onChange={(e) => setGNotes(e.target.value)} placeholder="Notiz (optional)" />
                      <ButtonX
                        onClick={() => {
                          if (!gTankId) return;
                          props.upsertGroup({
                            id: uid(),
                            attemptId: selected.id,
                            name: gName.trim() || "Gruppe",
                            tankId: gTankId,
                            maleCount: Number(gM || 0),
                            femaleCount: Number(gF || 0),
                            notes: gNotes,
                            active: true,
                            archived: false,
                          });
                          setGNotes("");
                        }}
                      >
                        Speichern
                      </ButtonX>
                    </div>
                  </div>
                </CardX>

                <CardX title="Logbuch" subtitle="Einträge zum Ansatz (optional Becken)">
                  <div className="space-y-2">
                    {logForAttempt.length ? (
                      logForAttempt.slice(0, 30).map((e) => (
                        <div key={e.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] rounded-xl border px-2 py-1 bg-neutral-50">{e.kind}</span>
                                <div className="font-semibold truncate">{e.title}</div>
                              </div>
                              <div className="text-xs text-neutral-500 mt-1">
                                {formatShort(e.date)} · {e.tankId ? props.tanksById[e.tankId]?.name || "–" : "allgemein"}
                              </div>
                              {e.notes ? <div className="text-sm text-neutral-600 mt-2">{e.notes}</div> : null}
                            </div>
                            <ButtonX variant="ghost" onClick={() => props.removeLog(e.id)}>
                              ×
                            </ButtonX>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-neutral-500">Noch keine Einträge.</div>
                    )}
                  </div>

                  <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="text-sm font-semibold">Eintrag hinzufügen</div>
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <InputX type="date" value={lDate} onChange={(e) => setLDate(e.target.value)} />
                        <select value={lKind} onChange={(e) => setLKind(e.target.value as any)} className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm">
                          <option value="Futter">Futter</option>
                          <option value="Pflege">Pflege</option>
                          <option value="Wurf">Wurf</option>
                          <option value="Beobachtung">Beobachtung</option>
                          <option value="Sonstiges">Sonstiges</option>
                        </select>
                      </div>
                      <select value={lTankId} onChange={(e) => setLTankId(e.target.value)} className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm">
                        <option value="">allgemein (kein Becken)</option>
                        {selected.tankIds.map((id) => (
                          <option key={id} value={id}>
                            {props.tanksById[id]?.name || "–"}
                          </option>
                        ))}
                      </select>
                      <InputX value={lTitle} onChange={(e) => setLTitle(e.target.value)} placeholder="Titel" />
                      <TextareaX rows={3} value={lNotes} onChange={(e) => setLNotes(e.target.value)} placeholder="Notizen" />
                      <ButtonX
                        onClick={() => {
                          props.addLog({
                            attemptId: selected.id,
                            tankId: lTankId,
                            date: lDate || toISODate(new Date()),
                            kind: lKind,
                            title: lTitle.trim() || "(ohne Titel)",
                            notes: lNotes,
                          });
                          setLNotes("");
                        }}
                      >
                        Speichern
                      </ButtonX>
                    </div>
                  </div>
                </CardX>
              </div>
            </div>
          ) : (
            <div className="text-sm text-neutral-500">Bitte links einen Ansatz auswählen oder einen neuen anlegen.</div>
          )}
        </CardX>
      </div>
    </div>
  );
}

function SparkMulti(props: { series: { key: string; label: string; unit?: string; points: { xLabel: string; y: number | null }[]; visible: boolean }[]; height?: number }) {
  const series = props.series || [];
  const height = typeof props.height === "number" ? props.height : 160;
  const w = 560;
  const h = height;
  const pad = 16;

  const allYs: number[] = [];
  series.forEach((s) => {
    if (!s.visible) return;
    s.points.forEach((p) => {
      if (typeof p.y === "number") allYs.push(p.y);
    });
  });

  if (!allYs.length) return <div className="text-sm text-neutral-500">Keine Werte für den Verlauf.</div>;

  const minY = Math.min(...allYs);
  const maxY = Math.max(...allYs);
  const span = maxY - minY || 1;

  const maxLen = Math.max(1, ...series.map((s) => s.points.length));
  const mapX = (i: number) => {
    const n = Math.max(1, maxLen - 1);
    return pad + ((w - pad * 2) * i) / n;
  };
  const mapY = (y: number) => {
    const t = (y - minY) / span;
    return h - pad - (h - pad * 2) * t;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg width={w} height={h} className="block">
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" opacity="0.15" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="currentColor" opacity="0.15" />

        {series.map((s) => {
          if (!s.visible) return null;
          const path = s.points
            .map((p, i) => {
              if (!p || typeof p.y !== "number") return null;
              return mapX(i) + "," + mapY(p.y);
            })
            .filter(Boolean)
            .join(" ");
          if (!path) return null;
          return <polyline key={s.key} points={path} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />;
        })}

        <text x={pad} y={pad - 2} fontSize="10" fill="currentColor" opacity="0.5">
          max {maxY}
        </text>
        <text x={pad} y={h - 2} fontSize="10" fill="currentColor" opacity="0.5">
          min {minY}
        </text>
      </svg>
    </div>
  );
}

function WaterTab(props: {
  tanks: Tank[];
  tanksById: Record<string, Tank>;
  water: WaterEntry[];
  addWater: (e: Omit<WaterEntry, "id">) => void;
  removeWater: (id: string) => void;
  limits: WaterLimits;
}) {
  const [tankId, setTankId] = useState(() => (props.tanks[0] ? props.tanks[0].id : ""));
  useEffect(() => {
    if (!tankId && props.tanks.length) setTankId(props.tanks[0].id);
    if (tankId && !props.tanks.some((t) => t.id === tankId) && props.tanks.length) setTankId(props.tanks[0].id);
  }, [tankId, props.tanks]);

  const tank = props.tanksById[tankId] || null;

  const activeParams = useMemo(() => {
    const wp = tank ? tank.waterParams : makeAllParams(true);
    const list: ParamKey[] = [];
    ALL_PARAM_KEYS.forEach((k) => {
      if (wp[k]) list.push(k);
    });
    if (!list.length) list.push("temp");
    return list;
  }, [tank]);

  const waterForTank = useMemo(
    () => props.water.filter((w) => w.tankId === tankId).slice().sort((a, b) => (a.date > b.date ? 1 : -1)),
    [props.water, tankId]
  );

  // Sichtbarkeit pro Parameter (nur Chart)
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // wenn Becken/aktive Params wechseln: neue Keys aktiv setzen, alte behalten
    setVisible((prev) => {
      const next: Record<string, boolean> = { ...prev };
      activeParams.forEach((k) => {
        if (typeof next[k] !== "boolean") next[k] = true;
      });
      // entfernte Keys nicht zwingend löschen – aber schadet nicht
      Object.keys(next).forEach((k) => {
        if (!activeParams.includes(k as any)) delete next[k];
      });
      return next;
    });
  }, [tankId, activeParams.join("|")]);

  const chartSeries = useMemo(() => {
    const pointsByParam: Record<string, { xLabel: string; y: number | null }[]> = {};
    activeParams.forEach((k) => {
      pointsByParam[k] = waterForTank.map((w) => {
        const v: any = (w as any)[k];
        return { xLabel: formatShort(w.date), y: typeof v === "number" ? v : null };
      });
    });
    return activeParams.map((k) => ({
      key: k,
      label: PARAM_DEFS[k].short,
      unit: PARAM_DEFS[k].unit,
      points: pointsByParam[k] || [],
      visible: visible[k] !== false,
    }));
  }, [activeParams, waterForTank, visible]);

  // new entry form
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues({});
    setNote("");
  }, [tankId]);

  const statusBadge = (k: ParamKey, val: number | null) => {
    const s = inRange(val, props.limits[k]);
    const cls =
      s === "ok"
        ? "bg-green-50 border-green-200 text-green-700"
        : s === "low" || s === "high"
        ? "bg-red-50 border-red-200 text-red-700"
        : "bg-neutral-50 border-neutral-200 text-neutral-600";
    const label = s === "ok" ? "OK" : s === "low" ? "zu niedrig" : s === "high" ? "zu hoch" : "–";
    return <span className={"text-[11px] rounded-xl border px-2 py-1 " + cls}>{label}</span>;
  };

  const toggleVisible = (k: ParamKey) => setVisible((p) => ({ ...p, [k]: !(p[k] !== false) }));
  const anyVisible = activeParams.some((k) => visible[k] !== false);

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-extrabold">Wasserwerte</div>
          <div className="text-sm text-neutral-500">Verlauf (mehrere Parameter) · Eintragen · Liste</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-neutral-500">Becken</div>
          <select value={tankId} onChange={(e) => setTankId(e.target.value)} className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm">
            {props.tanks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardX
          className="lg:col-span-2"
          title="Verlauf"
          subtitle={`${tank ? tank.name : "–"} · Klick auf Parameter blendet im Diagramm ein/aus`}
          right={
            <div className="flex gap-2 items-center flex-wrap">
              {activeParams.map((k) => (
                <ButtonX key={k} variant={visible[k] !== false ? "secondary" : "ghost"} onClick={() => toggleVisible(k)}>
                  {PARAM_DEFS[k].short}
                </ButtonX>
              ))}
              <ButtonX variant="ghost" onClick={() => setVisible(Object.fromEntries(activeParams.map((k) => [k, true])) as any)} title="Alle einblenden">
                Alle
              </ButtonX>
              <ButtonX variant="ghost" onClick={() => setVisible(Object.fromEntries(activeParams.map((k) => [k, false])) as any)} title="Alle ausblenden">
                Keine
              </ButtonX>
            </div>
          }
        >
          {anyVisible ? <SparkMulti series={chartSeries} /> : <div className="text-sm text-neutral-500">Alle Parameter ausgeblendet.</div>}
        </CardX>

        <CardX title="Neuer Messwert" subtitle="Speichert in localStorage">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Datum</div>
              <InputX type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="rounded-2xl border border-neutral-200 p-3 bg-neutral-50">
              <div className="text-xs text-neutral-500 mb-2">Aktive Parameter</div>
              <div className="grid grid-cols-2 gap-2">
                {activeParams.map((k) => (
                  <div key={k}>
                    <div className="text-xs text-neutral-500 mb-1">
                      {PARAM_DEFS[k].short} {PARAM_DEFS[k].unit ? <span>({PARAM_DEFS[k].unit})</span> : null}
                    </div>
                    <InputX value={values[k] || ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} placeholder="(leer)" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-neutral-500 mb-1">Notiz</div>
              <InputX value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
            </div>

            <ButtonX
              onClick={() => {
                const payload: any = { tankId, date: date || toISODate(new Date()), note };
                activeParams.forEach((k) => {
                  payload[k] = parseNumOrNull(values[k] || "");
                });
                props.addWater(payload);
                setNote("");
              }}
            >
              Speichern
            </ButtonX>
          </div>
        </CardX>
      </div>

      <CardX title="Messwerte" subtitle="Neueste oben · inkl. Grenzwerte">
        {waterForTank.length ? (
          <div className="space-y-3">
            {waterForTank
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 60)
              .map((w) => (
                <div key={w.id} className="rounded-2xl border p-3 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{formatShort(w.date)}</div>

                      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                        {activeParams.map((k) => {
                          const v = (w as any)[k] as number | null | undefined;
                          const val = typeof v === "number" ? v : null;
                          return (
                            <div key={k} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold">{PARAM_DEFS[k].short}</div>
                                {statusBadge(k, val)}
                              </div>
                              <div className="text-sm mt-1">
                                {val == null ? "–" : val} {PARAM_DEFS[k].unit || ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {w.note ? <div className="text-xs text-neutral-500 mt-2">{w.note}</div> : null}
                    </div>

                    <ButtonX variant="ghost" onClick={() => props.removeWater(w.id)} title="Löschen">
                      ×
                    </ButtonX>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">Keine Messwerte für dieses Becken.</div>
        )}
      </CardX>
    </div>
  );
}

function SettingsTab(props: { settings: Settings; setSettings: (updater: (prev: Settings) => Settings) => void; resetAll: () => void }) {
  return (
    <div className="mt-5 space-y-4">
      <div>
        <div className="text-xl font-extrabold">Einstellungen</div>
        <div className="text-sm text-neutral-500">Grenzwerte & Speicher</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardX title="Allgemein">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Züchtername</div>
              <InputX value={props.settings.breederName} onChange={(e) => props.setSettings((s) => ({ ...s, breederName: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Max Foto-Größe (MB)</div>
              <InputX type="number" step="0.1" value={String(props.settings.maxPhotoMB)} onChange={(e) => props.setSettings((s) => ({ ...s, maxPhotoMB: Number(e.target.value || 1.5) }))} />
              <div className="text-xs text-neutral-500 mt-1">localStorage ist begrenzt – lieber kleine Bilder nutzen.</div>
            </div>
            <div className="pt-2">
              <ButtonX variant="danger" onClick={props.resetAll}>
                Alles zurücksetzen (Demo-Seed)
              </ButtonX>

              <div className="pt-3 border-t border-neutral-200">
                <div className="text-xs text-neutral-500 mb-2">Backup (JSON)</div>
                <div className="flex gap-2 flex-wrap">
                  <ButtonX
                    variant="secondary"
                    onClick={() => {
                      try {
                        const raw = localStorage.getItem(STORAGE_KEY) || JSON.stringify(seed());
                        const blob = new Blob([raw], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "guppy-zuchtbuch-backup.json";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Export
                  </ButtonX>

                  <label className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold cursor-pointer">
                    Import
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                        if (!f) return;
                        try {
                          const txt = await f.text();
                          const parsed = JSON.parse(txt);
                          // sehr einfache Validierung
                          if (!parsed || typeof parsed !== "object") return;
                          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                          // reload state
                          props.resetAll();
                          // danach: seed erneut überschreiben mit import (resetAll setzt seed)
                          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                          window.location.reload();
                        } catch {
                          // ignore
                        }
                      }}
                    />
                  </label>
                </div>
                <div className="text-[11px] text-neutral-500 mt-2">Export lädt eine Datei herunter. Import ersetzt deine Daten (danach Reload).</div>
              </div>
            </div>
          </div>
        </CardX>

        <CardX className="lg:col-span-2" title="Grenzwerte Wasserwerte" subtitle="Min/Max – leer lassen = kein Limit">
          <div className="space-y-2">
            {ALL_PARAM_KEYS.map((k) => (
              <div key={k} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center rounded-2xl border border-neutral-200 bg-white p-3">
                <div className="font-semibold">{PARAM_DEFS[k].short}</div>
                <div className="text-xs text-neutral-500 md:col-span-1">{PARAM_DEFS[k].label}</div>
                <div>
                  <div className="text-[11px] text-neutral-500 mb-1">Min</div>
                  <InputX
                    value={props.settings.waterLimits[k].min == null ? "" : String(props.settings.waterLimits[k].min)}
                    onChange={(e) =>
                      props.setSettings((s) => ({
                        ...s,
                        waterLimits: { ...s.waterLimits, [k]: { ...s.waterLimits[k], min: parseNumOrNull(e.target.value) } },
                      }))
                    }
                    placeholder="–"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-neutral-500 mb-1">Max</div>
                  <InputX
                    value={props.settings.waterLimits[k].max == null ? "" : String(props.settings.waterLimits[k].max)}
                    onChange={(e) =>
                      props.setSettings((s) => ({
                        ...s,
                        waterLimits: { ...s.waterLimits, [k]: { ...s.waterLimits[k], max: parseNumOrNull(e.target.value) } },
                      }))
                    }
                    placeholder="–"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardX>
      </div>
    </div>
  );
}

// ===================== Main =====================
export default function GuppyZuchtbuchOptionB() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<"dashboard" | "tanks" | "zuchtjournal" | "water" | "settings">("dashboard");

  useEffect(() => {
    saveState(state);
  }, [state]);

  const tanksById = useMemo(() => {
    const m: Record<string, Tank> = {};
    state.tanks.forEach((t) => (m[t.id] = t));
    return m;
  }, [state.tanks]);

  const linesById = useMemo(() => {
    const m: Record<string, Line> = {};
    state.lines.forEach((l) => (m[l.id] = l));
    return m;
  }, [state.lines]);

  // mutations
  const upsertTank = (tank: Tank) => {
    setState((s) => {
      const exists = s.tanks.some((t) => t.id === tank.id);
      const tanks = exists ? s.tanks.map((t) => (t.id === tank.id ? { ...t, ...tank } : t)) : [tank, ...s.tanks];
      return { ...s, tanks };
    });
  };

  const removeTank = (id: string) => {
    // cascade: attempt tankIds, groups, water, log
    setState((s) => {
      const tanks = s.tanks.filter((t) => t.id !== id);
      const attempts = s.attempts.map((a) => ({ ...a, tankIds: a.tankIds.filter((x) => x !== id) })).filter((a) => a.tankIds.length > 0);
      const groups = s.groups.filter((g) => g.tankId !== id);
      const water = s.water.filter((w) => w.tankId !== id);
      const log = s.log.filter((e) => e.tankId !== id);
      return { ...s, tanks, attempts, groups, water, log };
    });
  };

  const upsertAttempt = (a: Attempt) => {
    setState((s) => {
      const exists = s.attempts.some((x) => x.id === a.id);
      const attempts = exists ? s.attempts.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : [a, ...s.attempts];
      return { ...s, attempts };
    });
  };

  const removeAttempt = (id: string) => {
    setState((s) => {
      const attempts = s.attempts.filter((a) => a.id !== id);
      const groups = s.groups.filter((g) => g.attemptId !== id);
      const log = s.log.filter((e) => e.attemptId !== id);
      return { ...s, attempts, groups, log };
    });
  };

  const upsertGroup = (g: Group) => {
    setState((s) => ({ ...s, groups: [g, ...s.groups] }));
  };

  const removeGroup = (id: string) => {
    setState((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== id) }));
  };

  const addWater = (entry: Omit<WaterEntry, "id">) => {
    setState((s) => ({ ...s, water: [{ ...entry, id: uid() }, ...s.water] }));
  };

  const removeWater = (id: string) => {
    setState((s) => ({ ...s, water: s.water.filter((w) => w.id !== id) }));
  };

  const addLog = (entry: Omit<LogEntry, "id">) => {
    setState((s) => ({ ...s, log: [{ ...entry, id: uid() }, ...s.log] }));
  };

  const removeLog = (id: string) => {
    setState((s) => ({ ...s, log: s.log.filter((e) => e.id !== id) }));
  };

  const resetAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(seed());
  };

  const tabs = [
    { key: "dashboard" as const, label: "Dashboard" },
    { key: "zuchtjournal" as const, label: "Zuchtjournal" },
    { key: "tanks" as const, label: "Becken" },
    { key: "water" as const, label: "Wasserwerte" },
    { key: "settings" as const, label: "Einstellungen" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-2xl font-extrabold leading-tight">Guppy Zuchtbuch</div>
            <div className="text-sm text-neutral-500">Option B · Ansatz kann mehrere Becken haben</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  "rounded-2xl px-4 py-2 text-sm font-semibold border transition " +
                  (tab === t.key ? "bg-black text-white border-black" : "bg-white text-black border-neutral-200 hover:bg-neutral-50")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "dashboard" ? <DashboardTab state={state} tanksById={tanksById} linesById={linesById} /> : null}

        {tab === "zuchtjournal" ? (
          <ZuchtjournalTab
            tanks={state.tanks}
            lines={state.lines}
            attempts={state.attempts}
            groups={state.groups}
            log={state.log}
            tanksById={tanksById}
            linesById={linesById}
            upsertAttempt={upsertAttempt}
            removeAttempt={removeAttempt}
            upsertGroup={upsertGroup}
            removeGroup={removeGroup}
            addLog={addLog}
            removeLog={removeLog}
          />
        ) : null}

        {tab === "tanks" ? (
          <TanksTab
            tanks={state.tanks}
            setTanks={(up) => setState((s) => ({ ...s, tanks: up(s.tanks) }))}
            upsertTank={upsertTank}
            removeTank={removeTank}
          />
        ) : null}

        {tab === "water" ? (
          <WaterTab
            tanks={state.tanks}
            tanksById={tanksById}
            water={state.water}
            addWater={addWater}
            removeWater={removeWater}
            limits={state.settings.waterLimits}
          />
        ) : null}

        {tab === "settings" ? (
          <SettingsTab
            settings={state.settings}
            setSettings={(up) => setState((s) => ({ ...s, settings: up(s.settings) }))}
            resetAll={resetAll}
          />
        ) : null}
      </div>
    </div>
  );
}
