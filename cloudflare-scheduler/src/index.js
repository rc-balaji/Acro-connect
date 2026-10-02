import { DurableObject } from "cloudflare:workers";

const IST_OFFSET = "+05:30";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function authorized(request, env) {
  const secret = String(env.SCHEDULER_SHARED_SECRET || "");
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeTime(value) {
  const text = String(value || "");
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return `${text}:00`;
  if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(text)) return text;
  throw new Error("Invalid schedule time");
}

function parseIST(date, time) {
  return Date.parse(`${date}T${normalizeTime(time)}${IST_OFFSET}`);
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function dateKeyIST(epochMs) {
  // IST is UTC+05:30 and has no daylight-saving transition.
  const date = new Date(epochMs + 330 * 60 * 1000);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function dayOfWeek(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function applies(schedule, dateString) {
  if (!schedule.enabled) return false;
  if (dateString < schedule.date) return false;
  if (schedule.endDate && dateString > schedule.endDate) return false;
  if (schedule.repeat === "once") return dateString === schedule.date;
  if (schedule.repeat === "daily") return true;
  if (schedule.repeat === "weekly") {
    return Array.isArray(schedule.weekdays) && schedule.weekdays.includes(dayOfWeek(dateString));
  }
  return false;
}

function nextStart(schedule, afterMs, inclusive = false) {
  if (!schedule?.enabled) return null;
  const valid = (value) => (inclusive ? value >= afterMs : value > afterMs);

  if (schedule.repeat === "once") {
    const value = parseIST(schedule.date, schedule.time);
    return valid(value) ? value : null;
  }

  const today = dateKeyIST(afterMs);
  let cursor = schedule.date > today ? schedule.date : today;
  if (schedule.endDate && cursor > schedule.endDate) return null;

  for (let i = 0; i < 14; i += 1) {
    if (schedule.endDate && cursor > schedule.endDate) return null;
    if (applies(schedule, cursor)) {
      const value = parseIST(cursor, schedule.time);
      if (valid(value)) return value;
    }
    cursor = addDays(cursor, 1);
  }
  return null;
}

function occurrenceId(scheduleId, startAt, phase) {
  return `${scheduleId}_${startAt}_${phase}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function callMotorApi(env, schedule, phase, startAt, cleanup = false) {
  const base = String(env.NEXT_API_BASE_URL || "").replace(/\/$/, "");
  const secret = String(env.SCHEDULER_SHARED_SECRET || "");
  if (!base) throw new Error("NEXT_API_BASE_URL is missing");
  if (!secret) throw new Error("SCHEDULER_SHARED_SECRET is missing");

  const scheduledFor = phase === "start"
    ? startAt
    : startAt + Number(schedule.durationSec) * 1000;

  const response = await fetch(`${base}/api/motor/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      scheduleId: schedule.id,
      motor: Number(schedule.motor),
      phase,
      scheduledFor,
      occurrenceId: occurrenceId(schedule.id, startAt, phase),
      source: "cloudflare-alarm",
      cleanup,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Next.js motor API returned ${response.status}`);
  }
  return data;
}

async function configureNextAlarm(storage, schedule, now = Date.now()) {
  if (!schedule?.enabled) {
    await storage.deleteAlarm();
    await storage.put("event", { kind: "idle", runAt: null, startAt: null });
    return { armed: false, state: "disabled", nextAlarmAt: null };
  }

  // 2-second grace means a schedule created right on the boundary can still
  // start immediately rather than being incorrectly skipped.
  const startAt = nextStart(schedule, now - 2000, true);
  if (startAt == null) {
    await storage.deleteAlarm();
    await storage.put("event", { kind: "idle", runAt: null, startAt: null });
    return { armed: false, state: "complete", nextAlarmAt: null };
  }

  const runAt = Math.max(startAt, Date.now());
  await storage.put("event", { kind: "start", runAt, startAt });
  await storage.setAlarm(runAt);
  return { armed: true, state: "armed", nextAlarmAt: runAt, nextStartAt: startAt };
}

export class ScheduleAlarm extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/sync") {
      const body = await request.json();
      const schedule = body?.schedule;
      if (!schedule?.id) return json({ ok: false, error: "schedule.id is required" }, 400);

      const previousSchedule = await this.ctx.storage.get("schedule");
      const previousEvent = await this.ctx.storage.get("event");

      // If the previous plan is currently in its ON window, stop that motor
      // before replacing/disabling the alarm. This prevents edit/disable from
      // ever leaving a motor stuck ON.
      if (previousSchedule && previousEvent?.kind === "stop" && Number.isFinite(Number(previousEvent.startAt))) {
        await callMotorApi(
          this.env,
          previousSchedule,
          "stop",
          Number(previousEvent.startAt),
          true,
        );
      }

      await this.ctx.storage.put("schedule", schedule);
      const result = await configureNextAlarm(this.ctx.storage, schedule);
      await this.ctx.storage.put("schedulerState", {
        ...result,
        syncedAt: Date.now(),
      });
      return json({ ok: true, scheduleId: schedule.id, ...result });
    }

    if (request.method === "DELETE" && url.pathname === "/schedule") {
      const previousSchedule = await this.ctx.storage.get("schedule");
      const previousEvent = await this.ctx.storage.get("event");

      if (previousSchedule && previousEvent?.kind === "stop" && Number.isFinite(Number(previousEvent.startAt))) {
        await callMotorApi(
          this.env,
          previousSchedule,
          "stop",
          Number(previousEvent.startAt),
          true,
        );
      }

      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return json({ ok: true, deleted: true });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      const schedule = await this.ctx.storage.get("schedule");
      const event = await this.ctx.storage.get("event");
      const alarm = await this.ctx.storage.getAlarm();
      const schedulerState = await this.ctx.storage.get("schedulerState");
      return json({ ok: true, schedule, event, alarm, schedulerState });
    }

    return json({ ok: false, error: "Not found" }, 404);
  }

  async alarm() {
    const schedule = await this.ctx.storage.get("schedule");
    const event = await this.ctx.storage.get("event");

    if (!schedule || !schedule.enabled || !event || event.kind === "idle") {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const startAt = Number(event.startAt);
    if (!Number.isFinite(startAt)) {
      await configureNextAlarm(this.ctx.storage, schedule);
      return;
    }

    if (event.kind === "start") {
      const result = await callMotorApi(this.env, schedule, "start", startAt);
      if (result.ignored) {
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.put("event", { kind: "idle", runAt: null, startAt: null });
        return;
      }

      const stopAt = startAt + Number(schedule.durationSec) * 1000;

      // If Cloudflare was delayed beyond the entire run window, perform STOP
      // immediately after the idempotent START so the motor is never left ON.
      if (Date.now() >= stopAt) {
        await callMotorApi(this.env, schedule, "stop", startAt);
        await this.scheduleFollowingOccurrence(schedule, startAt);
        return;
      }

      await this.ctx.storage.put("event", {
        kind: "stop",
        runAt: stopAt,
        startAt,
      });
      await this.ctx.storage.setAlarm(stopAt);
      await this.ctx.storage.put("schedulerState", {
        armed: true,
        state: "running",
        nextAlarmAt: stopAt,
        currentStartAt: startAt,
        updatedAt: Date.now(),
      });
      return;
    }

    if (event.kind === "stop") {
      await callMotorApi(this.env, schedule, "stop", startAt);
      await this.scheduleFollowingOccurrence(schedule, startAt);
      return;
    }

    await configureNextAlarm(this.ctx.storage, schedule);
  }

  async scheduleFollowingOccurrence(schedule, previousStartAt) {
    if (schedule.repeat === "once") {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.put("event", { kind: "idle", runAt: null, startAt: null });
      await this.ctx.storage.put("schedulerState", {
        armed: false,
        state: "complete",
        nextAlarmAt: null,
        updatedAt: Date.now(),
      });
      return;
    }

    const after = Math.max(Date.now(), previousStartAt + 1000);
    const next = nextStart(schedule, after, false);

    if (next == null) {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.put("event", { kind: "idle", runAt: null, startAt: null });
      await this.ctx.storage.put("schedulerState", {
        armed: false,
        state: "complete",
        nextAlarmAt: null,
        updatedAt: Date.now(),
      });
      return;
    }

    await this.ctx.storage.put("event", { kind: "start", runAt: next, startAt: next });
    await this.ctx.storage.setAlarm(next);
    await this.ctx.storage.put("schedulerState", {
      armed: true,
      state: "armed",
      nextAlarmAt: next,
      nextStartAt: next,
      updatedAt: Date.now(),
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "AGRO CONNECT scheduler",
        engine: "Cloudflare Durable Objects Alarms",
        precision: "millisecond alarm timestamp",
        timestamp: Date.now(),
      });
    }

    if (!authorized(request, env)) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    if (request.method === "POST" && url.pathname === "/sync") {
      const body = await request.json();
      const schedule = body?.schedule;
      if (!schedule?.id) return json({ ok: false, error: "schedule.id is required" }, 400);

      const id = env.SCHEDULES.idFromName(String(schedule.id));
      const stub = env.SCHEDULES.get(id);
      return stub.fetch("https://schedule.internal/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule }),
      });
    }

    const match = url.pathname.match(/^\/schedule\/([^/]+)$/);
    if (match) {
      const scheduleId = decodeURIComponent(match[1]);
      const id = env.SCHEDULES.idFromName(scheduleId);
      const stub = env.SCHEDULES.get(id);

      if (request.method === "DELETE") {
        return stub.fetch("https://schedule.internal/schedule", { method: "DELETE" });
      }
      if (request.method === "GET") {
        return stub.fetch("https://schedule.internal/status", { method: "GET" });
      }
    }

    return json({ ok: false, error: "Not found" }, 404);
  },
};
