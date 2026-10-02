export const IST_TIMEZONE = "Asia/Kolkata";
export const IST_OFFSET = "+05:30";
export const MOTOR_KEYS = { 1: "led2", 2: "led3", 3: "led4" };
export const MAX_DURATION_MINUTES = 24 * 60;

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function dateKeyInIST(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function timeKeyInIST(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function parseIST(dateString, timeString) {
  return new Date(`${dateString}T${timeString}:00${IST_OFFSET}`);
}

export function addDays(dateString, amount) {
  const base = new Date(`${dateString}T00:00:00${IST_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + amount);
  return dateKeyInIST(base);
}

export function dayOfWeekIST(dateString) {
  return new Date(`${dateString}T12:00:00${IST_OFFSET}`).getDay();
}

export function isScheduleOnDate(schedule, dateString) {
  if (!schedule?.enabled) return false;
  if (!schedule?.date || dateString < schedule.date) return false;
  if (schedule.endDate && dateString > schedule.endDate) return false;

  if (schedule.repeat === "once") return dateString === schedule.date;
  if (schedule.repeat === "daily") return dateString >= schedule.date;
  if (schedule.repeat === "weekly") {
    return (
      dateString >= schedule.date &&
      Array.isArray(schedule.weekdays) &&
      schedule.weekdays.includes(dayOfWeekIST(dateString))
    );
  }
  return false;
}

export function occurrenceForDate(schedule, dateString) {
  if (!isScheduleOnDate(schedule, dateString)) return null;
  const start = parseIST(dateString, schedule.time);
  const end = new Date(start.getTime() + Number(schedule.durationMinutes) * 60_000);
  return { date: dateString, start, end };
}

export function validateScheduleInput(input) {
  const motor = Number(input.motor);
  if (![1, 2, 3].includes(motor)) throw new Error("Choose Motor 1, Motor 2 or Motor 3");

  const title = String(input.title || `Motor ${motor} plan`).trim().slice(0, 80);
  const date = String(input.date || "");
  const time = String(input.time || "");
  const repeat = String(input.repeat || "once");
  const durationMinutes = Number(input.durationMinutes);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid schedule date");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Invalid schedule time");
  if (!["once", "daily", "weekly"].includes(repeat)) throw new Error("Invalid repeat mode");
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > MAX_DURATION_MINUTES) {
    throw new Error("Duration must be between 1 and 1440 minutes");
  }

  let weekdays = [];
  if (repeat === "weekly") {
    weekdays = Array.from(
      new Set((Array.isArray(input.weekdays) ? input.weekdays : []).map(Number)),
    ).filter((d) => d >= 0 && d <= 6);
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
    durationMinutes: Math.round(durationMinutes),
    repeat,
    weekdays,
    endDate,
    enabled: input.enabled !== false,
    timezone: IST_TIMEZONE,
  };
}

function expandOccurrences(schedule, rangeStart, days) {
  const occurrences = [];
  // Include the previous date so a long run crossing midnight is also checked.
  for (let i = -1; i <= days; i += 1) {
    const dateString = addDays(rangeStart, i);
    const occurrence = occurrenceForDate(schedule, dateString);
    if (occurrence) occurrences.push(occurrence);
  }
  return occurrences;
}

// Check future overlap for the same motor. 90 days is enough for the prototype
// and catches one-time, daily, weekly and cross-midnight collisions before saving.
export function findConflict(candidate, schedules, ignoreId = null, days = 90) {
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

// Build START/STOP events that are due within the grace window.
export function getDueEvents(schedules, now = new Date(), graceMs = 5 * 60_000) {
  const today = dateKeyInIST(now);
  const yesterday = addDays(today, -1);
  const events = [];

  for (const schedule of schedules) {
    if (!schedule?.enabled) continue;

    for (const dateString of [yesterday, today]) {
      const occurrence = occurrenceForDate(schedule, dateString);
      if (!occurrence) continue;

      const candidates = [
        {
          type: "start",
          turnOn: true,
          dueAt: occurrence.start.getTime(),
          occurrenceDate: dateString,
        },
        {
          type: "stop",
          turnOn: false,
          dueAt: occurrence.end.getTime(),
          occurrenceDate: dateString,
        },
      ];

      for (const event of candidates) {
        const age = now.getTime() - event.dueAt;
        if (age >= 0 && age <= graceMs) {
          const stamp = new Date(event.dueAt).toISOString().slice(0, 16).replace(/[:T-]/g, "");
          events.push({
            ...event,
            scheduleId: schedule.id,
            motor: Number(schedule.motor),
            title: schedule.title,
            executionId: `${schedule.id}_${event.type}_${stamp}`,
          });
        }
      }
    }
  }

  return events.sort((a, b) => a.dueAt - b.dueAt);
}
