export const IST_TIMEZONE = "Asia/Kolkata";
export const IST_OFFSET = "+05:30";
export const MOTOR_KEYS = { 1: "led2", 2: "led3", 3: "led4" };
export const MAX_DURATION_SECONDS = 24 * 60 * 60;

export function pad2(value) {
  return String(value).padStart(2, "0");
}

function partsInIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
}

export function dateKeyInIST(date = new Date()) {
  const p = partsInIST(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function timeKeyInIST(date = new Date()) {
  const p = partsInIST(date);
  return `${p.hour}:${p.minute}:${p.second}`;
}

export function normalizeTime(value) {
  const text = String(value || "").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return `${text}:00`;
  if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(text)) return text;
  throw new Error("Invalid start time. Use HH:MM:SS");
}

export function parseIST(dateString, timeString) {
  return new Date(`${dateString}T${normalizeTime(timeString)}${IST_OFFSET}`);
}

export function addDays(dateString, amount) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(amount || 0)));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function dayOfWeekIST(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isScheduleOnDate(schedule, dateString) {
  if (!schedule?.enabled) return false;
  if (!schedule?.date || dateString < schedule.date) return false;
  if (schedule.endDate && dateString > schedule.endDate) return false;

  if (schedule.repeat === "once") return dateString === schedule.date;
  if (schedule.repeat === "daily") return true;
  if (schedule.repeat === "weekly") {
    return Array.isArray(schedule.weekdays) && schedule.weekdays.includes(dayOfWeekIST(dateString));
  }
  return false;
}

export function occurrenceForDate(schedule, dateString) {
  if (!isScheduleOnDate(schedule, dateString)) return null;
  const start = parseIST(dateString, schedule.time);
  const end = new Date(start.getTime() + Number(schedule.durationSec) * 1000);
  return { date: dateString, start, end };
}

export function validateScheduleInput(input) {
  const motor = Number(input.motor);
  if (![1, 2, 3].includes(motor)) throw new Error("Choose Motor 1, Motor 2 or Motor 3");

  const title = String(input.title || `Motor ${motor} plan`).trim().slice(0, 80) || `Motor ${motor} plan`;
  const date = String(input.date || "");
  const time = normalizeTime(input.time);
  const repeat = String(input.repeat || "once");
  const durationSec = Math.round(Number(input.durationSec));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid schedule date");
  if (!["once", "daily", "weekly"].includes(repeat)) throw new Error("Invalid repeat mode");
  if (!Number.isFinite(durationSec) || durationSec < 1 || durationSec > MAX_DURATION_SECONDS) {
    throw new Error(`Duration must be between 1 and ${MAX_DURATION_SECONDS} seconds`);
  }

  let weekdays = [];
  if (repeat === "weekly") {
    weekdays = Array.from(
      new Set((Array.isArray(input.weekdays) ? input.weekdays : []).map(Number)),
    )
      .filter((day) => day >= 0 && day <= 6)
      .sort((a, b) => a - b);
    if (!weekdays.length) throw new Error("Choose at least one weekday");
  }

  const endDate = input.endDate ? String(input.endDate) : null;
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("Invalid end date");
  if (endDate && endDate < date) throw new Error("End date cannot be before start date");

  return {
    title,
    motor,
    date,
    time,
    durationSec,
    repeat,
    weekdays,
    endDate,
    enabled: input.enabled !== false,
    timezone: IST_TIMEZONE,
  };
}

function maxDateKey(a, b) {
  return a > b ? a : b;
}

export function getNextStartMs(schedule, afterMs = Date.now(), inclusive = false) {
  if (!schedule?.enabled) return null;

  const compare = (value) => (inclusive ? value >= afterMs : value > afterMs);

  if (schedule.repeat === "once") {
    const start = parseIST(schedule.date, schedule.time).getTime();
    return compare(start) ? start : null;
  }

  const today = dateKeyInIST(new Date(afterMs));
  let cursor = maxDateKey(schedule.date, today);

  if (schedule.endDate && cursor > schedule.endDate) return null;

  // Daily schedules need at most 2 checks. Weekly schedules need at most 8.
  // 14 gives comfortable room while still remaining tiny and deterministic.
  for (let i = 0; i < 14; i += 1) {
    if (schedule.endDate && cursor > schedule.endDate) return null;
    if (isScheduleOnDate(schedule, cursor)) {
      const start = parseIST(cursor, schedule.time).getTime();
      if (compare(start)) return start;
    }
    cursor = addDays(cursor, 1);
  }

  return null;
}

function expandOccurrences(schedule, rangeStart, days) {
  const occurrences = [];
  for (let i = -1; i <= days; i += 1) {
    const dateString = addDays(rangeStart, i);
    const occurrence = occurrenceForDate(schedule, dateString);
    if (occurrence) occurrences.push(occurrence);
  }
  return occurrences;
}

export function findConflict(candidate, schedules, ignoreId = null, days = 120) {
  if (!candidate.enabled) return null;

  const candidateOccurrences = expandOccurrences(candidate, candidate.date, days);

  for (const other of schedules) {
    if (!other || other.id === ignoreId || !other.enabled) continue;
    if (Number(other.motor) !== Number(candidate.motor)) continue;

    const otherOccurrences = expandOccurrences(other, candidate.date, days);

    for (const a of candidateOccurrences) {
      for (const b of otherOccurrences) {
        if (a.start < b.end && b.start < a.end) {
          return {
            id: other.id,
            title: other.title,
            date: b.date,
            time: other.time,
            startAt: b.start.getTime(),
            endAt: b.end.getTime(),
          };
        }
      }
    }
  }

  return null;
}

export function scheduleListFromObject(object) {
  if (!object || typeof object !== "object") return [];
  return Object.entries(object)
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function withComputedScheduleFields(schedule, now = Date.now()) {
  const nextRunAt = getNextStartMs(schedule, now, true);
  return {
    ...schedule,
    nextRunAt,
    expired: schedule.enabled && nextRunAt == null,
  };
}

export function occurrenceKey(scheduleId, startAtMs, phase) {
  return `${scheduleId}_${startAtMs}_${phase}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}
