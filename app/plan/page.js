"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Edit3,
  FlaskConical,
  Plus,
  Power,
  RefreshCw,
  Repeat2,
  ServerCog,
  Trash2,
  X,
} from "lucide-react";

const MOTOR_META = {
  1: {
    name: "Motor 1",
    pin: "D14",
    color: "Green",
    dot: "bg-emerald-400",
    className: "bg-emerald-400/14 text-emerald-200 border-emerald-300/20",
  },
  2: {
    name: "Motor 2",
    pin: "D23",
    color: "Orange",
    dot: "bg-amber-400",
    className: "bg-amber-400/14 text-amber-200 border-amber-300/20",
  },
  3: {
    name: "Motor 3",
    pin: "D22",
    color: "Red",
    dot: "bg-red-400",
    className: "bg-red-400/14 text-red-200 border-red-300/20",
  },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const IST_TZ = "Asia/Kolkata";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function partsInIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
}

function todayIST() {
  const p = partsInIST();
  return `${p.year}-${p.month}-${p.day}`;
}

function futureIST(secondsFromNow) {
  const p = partsInIST(new Date(Date.now() + secondsFromNow * 1000));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
  };
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function dayOfWeek(key) {
  return parseDateKey(key).getDay();
}

function appliesOnDate(schedule, key) {
  if (key < schedule.date) return false;
  if (schedule.endDate && key > schedule.endDate) return false;
  if (schedule.repeat === "once") return key === schedule.date;
  if (schedule.repeat === "daily") return true;
  return schedule.repeat === "weekly" && (schedule.weekdays || []).includes(dayOfWeek(key));
}

function defaultForm(motor = 1, date = todayIST()) {
  return {
    title: `Motor ${motor} plan`,
    motor,
    date,
    time: "07:00:00",
    durationSec: 60,
    repeat: "once",
    weekdays: [1, 2, 3, 4, 5],
    endDate: "",
    enabled: true,
  };
}

function humanDuration(seconds) {
  const value = Number(seconds || 0);
  if (value < 60) return `${value}s`;
  if (value % 3600 === 0) return `${value / 3600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  return `${Math.floor(value / 60)}m ${value % 60}s`;
}

function formatNextRun(epoch) {
  if (!epoch) return "No future run";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(epoch));
}

export default function PlanPage() {
  const [schedules, setSchedules] = useState([]);
  const [month, setMonth] = useState(() => {
    const d = parseDateKey(todayIST());
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [motorFilter, setMotorFilter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [motorPicker, setMotorPicker] = useState(false);
  const [pendingDate, setPendingDate] = useState(null);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);
  const [schedulerHealth, setSchedulerHealth] = useState(null);
  const [resyncing, setResyncing] = useState(false);

  async function loadSchedules() {
    try {
      setLoading(true);
      const response = await fetch("/api/schedules", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load plans");
      setSchedules(data.schedules || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedulerHealth() {
    try {
      const response = await fetch("/api/scheduler/status", { cache: "no-store" });
      const data = await response.json();
      setSchedulerHealth(data);
    } catch (e) {
      setSchedulerHealth({ ok: false, configured: false, error: e.message });
    }
  }

  useEffect(() => {
    loadSchedules();
    loadSchedulerHealth();
  }, []);

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const d = new Date(start);
      d.setDate(start.getDate() + index);
      return d;
    });
  }, [month]);

  const visibleSchedules = useMemo(
    () => (motorFilter ? schedules.filter((s) => Number(s.motor) === motorFilter) : schedules),
    [motorFilter, schedules],
  );

  const upcoming = useMemo(
    () =>
      visibleSchedules
        .filter((s) => s.enabled !== false && s.nextRunAt)
        .sort((a, b) => Number(a.nextRunAt) - Number(b.nextRunAt)),
    [visibleSchedules],
  );

  function openMotorPicker(date = null) {
    setPendingDate(date);
    setMotorPicker(true);
  }

  function beginForMotor(motor) {
    const date = pendingDate || todayIST();
    setMotorFilter(motor);
    setMotorPicker(false);
    setPendingDate(null);
    setEditor({ mode: "create" });
    setForm(defaultForm(motor, date));
  }

  function beginForDate(dateKey) {
    if (!motorFilter) {
      openMotorPicker(dateKey);
      return;
    }
    setForm(defaultForm(motorFilter, dateKey));
    setEditor({ mode: "create" });
  }

  function editSchedule(schedule) {
    setMotorFilter(Number(schedule.motor));
    setForm({
      title: schedule.title,
      motor: Number(schedule.motor),
      date: schedule.date,
      time: schedule.time,
      durationSec: Number(schedule.durationSec),
      repeat: schedule.repeat,
      weekdays: schedule.weekdays || [],
      endDate: schedule.endDate || "",
      enabled: schedule.enabled !== false,
    });
    setEditor({ mode: "edit", id: schedule.id });
  }

  function duplicateSchedule(schedule) {
    setMotorFilter(Number(schedule.motor));
    setForm({
      title: `${schedule.title} copy`,
      motor: Number(schedule.motor),
      date: schedule.date,
      time: schedule.time,
      durationSec: Number(schedule.durationSec),
      repeat: schedule.repeat,
      weekdays: schedule.weekdays || [],
      endDate: schedule.endDate || "",
      enabled: true,
    });
    setEditor({ mode: "create" });
  }

  async function saveSchedule(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const url = editor.mode === "edit" ? `/api/schedules/${editor.id}` : "/api/schedules";
      const response = await fetch(url, {
        method: editor.mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, endDate: form.endDate || null }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save plan");
      setEditor(null);
      setNotice(editor.mode === "edit" ? "Plan updated and scheduler re-armed." : "Plan saved and scheduler armed.");
      await Promise.all([loadSchedules(), loadSchedulerHealth()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function patchSchedule(schedule, patch) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to update plan");
      setNotice(patch.enabled === false ? "Plan disabled." : "Plan enabled and scheduler armed.");
      await loadSchedules();
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteSchedule(schedule) {
    if (!window.confirm(`Delete ${schedule.title}?`)) return;
    setError("");
    const response = await fetch(`/api/schedules/${schedule.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      setError(data.error || "Unable to delete plan");
      return;
    }
    if (editor?.id === schedule.id) setEditor(null);
    setNotice("Plan deleted and future alarm cancelled.");
    await loadSchedules();
  }

  async function resyncAll() {
    setResyncing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/scheduler/resync", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "One or more plans failed to sync");
      setNotice(`${data.count} plan${data.count === 1 ? "" : "s"} synced to the scheduler.`);
      await Promise.all([loadSchedules(), loadSchedulerHealth()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setResyncing(false);
    }
  }

  async function quickTest(motor) {
    const when = futureIST(20);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Motor ${motor} 5-second test`,
          motor,
          date: when.date,
          time: when.time,
          durationSec: 5,
          repeat: "once",
          weekdays: [],
          endDate: null,
          enabled: true,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to create quick test");
      setMotorFilter(motor);
      setNotice(`Motor ${motor} test armed: starts in about 20 seconds and runs for 5 seconds.`);
      await loadSchedules();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <main className="grid-bg min-h-[calc(100vh-65px)]">
      <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-7 md:py-7">
        <header className="glass rounded-[28px] p-5 md:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                <CalendarDays size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Plan</h1>
                <p className="mt-1 text-sm text-white/38">Server-side motor routines · Asia/Kolkata (IST) · seconds supported</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SchedulerBadge health={schedulerHealth} />
              <button
                onClick={resyncAll}
                disabled={resyncing}
                className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[.03] px-3 py-3 text-sm text-white/55 hover:bg-white/6 disabled:opacity-40"
              >
                <RefreshCw size={16} className={resyncing ? "animate-spin" : ""} />
                Sync
              </button>
              <button
                onClick={() => openMotorPicker()}
                className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-[0_10px_35px_rgba(37,199,102,.2)] hover:bg-emerald-300"
              >
                <Plus size={18} /> Create new
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <FilterChip active={motorFilter === 0} onClick={() => setMotorFilter(0)}>All motors</FilterChip>
            {[1, 2, 3].map((motor) => (
              <FilterChip key={motor} active={motorFilter === motor} onClick={() => setMotorFilter(motor)}>
                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${MOTOR_META[motor].dot}`} />
                {MOTOR_META[motor].name}
              </FilterChip>
            ))}
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-200">{error}</div>
        )}
        {notice && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-400/7 px-4 py-3 text-sm text-emerald-100">
            <CheckCircle2 size={17} className="text-emerald-300" /> {notice}
          </div>
        )}

        <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="glass overflow-hidden rounded-3xl">
            <div className="flex flex-col gap-3 border-b border-white/7 p-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-white/8 bg-white/[.03] p-2 text-white/60 hover:bg-white/6" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="rounded-xl border border-white/8 bg-white/[.03] px-3 py-2 text-xs text-white/65 hover:bg-white/6"
                  onClick={() => {
                    const d = parseDateKey(todayIST());
                    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  }}
                >
                  Today
                </button>
                <button className="rounded-xl border border-white/8 bg-white/[.03] p-2 text-white/60 hover:bg-white/6" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <h2 className="text-lg font-semibold">{monthLabel(month)}</h2>
              <p className="text-xs text-white/35">Select a motor, then tap any date</p>
            </div>

            <div className="grid grid-cols-7 border-b border-white/7 bg-white/[.018]">
              {DAYS.map((day) => (
                <div key={day} className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-white/30">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((date) => {
                const key = toDateKey(date);
                const inMonth = date.getMonth() === month.getMonth();
                const isToday = key === todayIST();
                const events = visibleSchedules.filter((schedule) => appliesOnDate(schedule, key));

                return (
                  <button
                    key={key}
                    onClick={() => beginForDate(key)}
                    className={`min-h-[118px] border-b border-r border-white/6 p-2 text-left align-top transition hover:bg-emerald-300/[.035] ${!inMonth ? "bg-black/10 text-white/20" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${isToday ? "bg-emerald-400 font-semibold text-emerald-950" : "text-white/50"}`}>
                        {date.getDate()}
                      </span>
                      {events.length > 2 && <span className="text-[10px] text-white/25">+{events.length - 2}</span>}
                    </div>
                    <div className="mt-2 space-y-1">
                      {events.slice(0, 2).map((schedule) => {
                        const meta = MOTOR_META[schedule.motor];
                        return (
                          <div key={schedule.id} className={`truncate rounded-lg border px-2 py-1 text-[10px] ${meta.className} ${schedule.enabled === false ? "opacity-35" : ""}`}>
                            {schedule.time} · M{schedule.motor}
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="glass rounded-3xl p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/40">Available</p>
                <h2 className="mt-1 text-lg font-semibold">Upcoming plans</h2>
              </div>
              <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/40">{visibleSchedules.length}</span>
            </div>

            {motorFilter > 0 && (
              <button
                onClick={() => quickTest(motorFilter)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 px-3 py-2.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10"
              >
                <FlaskConical size={15} /> Quick test · ON in 20s · OFF after 5s
              </button>
            )}

            <div className="mt-4 space-y-3">
              {loading && <p className="text-sm text-white/35">Loading…</p>}
              {!loading && !visibleSchedules.length && <EmptyState />}
              {visibleSchedules.slice(0, 16).map((schedule) => {
                const meta = MOTOR_META[schedule.motor];
                return (
                  <div key={schedule.id} className="rounded-2xl border border-white/7 bg-white/[.025] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-lg border px-2 py-1 text-[10px] ${meta.className}`}>M{schedule.motor}</span>
                          <p className="truncate text-sm font-medium">{schedule.title}</p>
                        </div>
                        <p className="mt-2 text-xs text-white/42">{schedule.time} · {humanDuration(schedule.durationSec)} · {repeatLabel(schedule)}</p>
                        <p className="mt-1 text-[11px] text-white/25">Next: {formatNextRun(schedule.nextRunAt)}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-white/20">Scheduler: {schedule.schedulerStatus || "—"}</p>
                      </div>
                      <button
                        onClick={() => patchSchedule(schedule, { enabled: !schedule.enabled })}
                        className={`rounded-xl p-2 ${schedule.enabled ? "bg-emerald-300/10 text-emerald-300" : "bg-white/5 text-white/30"}`}
                        title={schedule.enabled ? "Disable" : "Enable"}
                      >
                        <Power size={15} />
                      </button>
                    </div>
                    <div className="mt-3 flex gap-1.5">
                      <IconButton title="Edit" onClick={() => editSchedule(schedule)}><Edit3 size={14} /></IconButton>
                      <IconButton title="Duplicate" onClick={() => duplicateSchedule(schedule)}><Copy size={14} /></IconButton>
                      <IconButton title="Delete" danger onClick={() => deleteSchedule(schedule)}><Trash2 size={14} /></IconButton>
                    </div>
                  </div>
                );
              })}
            </div>

            {upcoming.length > 0 && (
              <div className="mt-5 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.035] p-4">
                <p className="text-[10px] uppercase tracking-[.16em] text-emerald-300/60">Next execution</p>
                <p className="mt-2 text-sm font-medium">{upcoming[0].title}</p>
                <p className="mt-1 text-xs text-white/40">{formatNextRun(upcoming[0].nextRunAt)} · {humanDuration(upcoming[0].durationSec)}</p>
              </div>
            )}
          </aside>
        </section>
      </div>

      {motorPicker && (
        <Modal onClose={() => { setMotorPicker(false); setPendingDate(null); }}>
          <div className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[.16em] text-emerald-300/70">Step 1</p>
                <h2 className="mt-2 text-xl font-semibold">Which motor do you want to plan?</h2>
                <p className="mt-1 text-sm text-white/38">Choose one. The calendar will immediately focus on that motor.</p>
              </div>
              <CloseButton onClick={() => { setMotorPicker(false); setPendingDate(null); }} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((motor) => {
                const meta = MOTOR_META[motor];
                const count = schedules.filter((s) => Number(s.motor) === motor).length;
                return (
                  <button
                    key={motor}
                    onClick={() => beginForMotor(motor)}
                    className="rounded-2xl border border-white/8 bg-white/[.025] p-4 text-left transition hover:border-emerald-300/25 hover:bg-emerald-300/[.04]"
                  >
                    <div className={`inline-flex rounded-lg border px-2 py-1 text-xs ${meta.className}`}>{meta.color}</div>
                    <p className="mt-4 font-semibold">{meta.name}</p>
                    <p className="mt-1 text-xs text-white/35">{meta.pin} · {count} saved plan{count === 1 ? "" : "s"}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {editor && (
        <Modal onClose={() => setEditor(null)} wide>
          <form onSubmit={saveSchedule} className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[.16em] text-emerald-300/70">{editor.mode === "edit" ? "Edit plan" : "New plan"}</p>
                <h2 className="mt-2 text-xl font-semibold">{MOTOR_META[form.motor].name}</h2>
                <p className="mt-1 text-sm text-white/38">Server sends ON at the exact alarm time, then OFF after the duration. IST fixed.</p>
              </div>
              <CloseButton onClick={() => setEditor(null)} />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <input className="w-full rounded-xl px-3 py-3 text-sm" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="Motor">
                <select className="w-full rounded-xl px-3 py-3 text-sm" value={form.motor} onChange={(e) => setForm({ ...form, motor: Number(e.target.value), title: `Motor ${Number(e.target.value)} plan` })}>
                  {[1, 2, 3].map((motor) => <option key={motor} value={motor}>Motor {motor} · {MOTOR_META[motor].pin}</option>)}
                </select>
              </Field>
              <Field label="Start date">
                <input type="date" className="w-full rounded-xl px-3 py-3 text-sm" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </Field>
              <Field label="Start time · seconds supported">
                <input type="time" step="1" className="w-full rounded-xl px-3 py-3 text-sm" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
              </Field>
              <Field label="Run for">
                <div className="relative">
                  <input type="number" min="1" max="86400" className="w-full rounded-xl px-3 py-3 pr-20 text-sm" value={form.durationSec} onChange={(e) => setForm({ ...form, durationSec: Number(e.target.value) })} required />
                  <span className="absolute right-3 top-3 text-xs text-white/35">seconds</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[10, 30, 60, 300, 900].map((seconds) => (
                    <button key={seconds} type="button" onClick={() => setForm({ ...form, durationSec: seconds })} className="rounded-lg border border-white/7 bg-white/[.025] px-2 py-1 text-[10px] text-white/40 hover:text-white/70">
                      {humanDuration(seconds)}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Repeat">
                <select className="w-full rounded-xl px-3 py-3 text-sm" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}>
                  <option value="once">This date only</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Selected weekdays</option>
                </select>
              </Field>
            </div>

            {form.repeat === "weekly" && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-white/40">Days</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day, index) => {
                    const active = form.weekdays.includes(index);
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() => setForm({
                          ...form,
                          weekdays: active
                            ? form.weekdays.filter((d) => d !== index)
                            : [...form.weekdays, index].sort(),
                        })}
                        className={`rounded-xl border px-3 py-2 text-xs ${active ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-white/8 bg-white/[.02] text-white/35"}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {form.repeat !== "once" && (
              <div className="mt-4 max-w-sm">
                <Field label="Optional end date">
                  <input type="date" className="w-full rounded-xl px-3 py-3 text-sm" value={form.endDate} min={form.date} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </Field>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/7 bg-white/[.02] p-4">
              <div>
                <p className="text-sm font-medium">Plan enabled</p>
                <p className="mt-1 text-xs text-white/35">Disable anytime without deleting it.</p>
              </div>
              <button type="button" onClick={() => setForm({ ...form, enabled: !form.enabled })} className={`rounded-xl px-3 py-2 text-xs font-semibold ${form.enabled ? "bg-emerald-400 text-emerald-950" : "bg-white/7 text-white/45"}`}>
                {form.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.035] p-4 text-xs text-white/45">
              <div className="flex gap-2">
                <Clock3 size={16} className="shrink-0 text-emerald-300" />
                <span>
                  At <b className="text-white/75">{form.time}</b>, Motor {form.motor} turns ON. After <b className="text-white/75">{humanDuration(form.durationSec)}</b>, it turns OFF automatically. Soil relay D25 is never changed by Plan.
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setEditor(null)} className="rounded-xl border border-white/8 px-4 py-2.5 text-sm text-white/55">Cancel</button>
              <button disabled={saving} className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-emerald-950 disabled:opacity-50">
                {saving ? "Saving…" : editor.mode === "edit" ? "Update plan" : "Save plan"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function repeatLabel(schedule) {
  if (schedule.repeat === "once") return schedule.date;
  if (schedule.repeat === "daily") return "Daily";
  return (schedule.weekdays || []).map((day) => DAYS[day]).join(", ") || "Selected days";
}

function SchedulerBadge({ health }) {
  const ready = Boolean(health?.ok && health?.configured);
  return (
    <div className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-xs ${ready ? "border-emerald-300/15 bg-emerald-300/6 text-emerald-200" : "border-amber-300/15 bg-amber-300/6 text-amber-100"}`}>
      <ServerCog size={16} />
      {ready ? "Scheduler ready" : "Scheduler setup needed"}
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-xl border px-3 py-2 text-xs transition ${active ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-white/8 bg-white/[.025] text-white/38 hover:text-white/65"}`}>
      {children}
    </button>
  );
}

function IconButton({ onClick, children, title, danger }) {
  return (
    <button type="button" title={title} onClick={onClick} className={`rounded-lg border p-2 ${danger ? "border-red-300/10 bg-red-300/5 text-red-300/65 hover:bg-red-300/10" : "border-white/7 bg-white/[.02] text-white/38 hover:text-white/70"}`}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-2 block text-xs text-white/40">{label}</span>{children}</label>;
}

function CloseButton({ onClick }) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-white/8 bg-white/[.025] p-2 text-white/45"><X size={17} /></button>;
}

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className={`glass max-h-[92vh] w-full overflow-y-auto rounded-[28px] ${wide ? "max-w-3xl" : "max-w-2xl"}`}>
        {children}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center">
      <Repeat2 className="mx-auto text-white/20" />
      <p className="mt-3 text-sm text-white/40">No plans yet</p>
      <p className="mt-1 text-xs text-white/25">Use Create new, choose a motor, then pick a date/time.</p>
    </div>
  );
}
