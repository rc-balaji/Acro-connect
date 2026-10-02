import { DEVICE_ID } from "@/lib/firebase-config";
import { firebaseDelete, firebaseGet, firebasePut } from "@/lib/firebase-rest";
import { syncScheduleToScheduler } from "@/lib/scheduler-client";
import {
  findConflict,
  getNextStartMs,
  scheduleListFromObject,
  validateScheduleInput,
  withComputedScheduleFields,
} from "@/lib/schedule-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await firebaseGet(`devices/${DEVICE_ID}/schedules`);
    const schedules = scheduleListFromObject(data).map((schedule) =>
      withComputedScheduleFields(schedule),
    );

    return Response.json({
      ok: true,
      deviceId: DEVICE_ID,
      timezone: "Asia/Kolkata",
      schedules,
      timestamp: Date.now(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  let id = null;

  try {
    const input = validateScheduleInput(await request.json());
    const existingObject = await firebaseGet(`devices/${DEVICE_ID}/schedules`);
    const existing = scheduleListFromObject(existingObject);
    const conflict = findConflict(input, existing);

    if (conflict) {
      return Response.json(
        {
          ok: false,
          error: `Motor ${input.motor} already has an overlapping plan on ${conflict.date} at ${conflict.time}`,
          conflict,
        },
        { status: 409 },
      );
    }

    const nextRunAt = getNextStartMs(input, Date.now(), true);
    if (input.enabled && nextRunAt == null) {
      throw new Error("This plan has no future occurrence. Choose a future time/date or disable it.");
    }

    id = `plan_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
    const now = Date.now();
    let schedule = {
      id,
      ...input,
      createdAt: now,
      updatedAt: now,
      lastTriggeredAt: null,
      lastResult: null,
      schedulerStatus: "syncing",
      schedulerNextAlarmAt: null,
    };

    // Save first so an immediate alarm always sees a real Firebase plan.
    await firebasePut(`devices/${DEVICE_ID}/schedules/${id}`, schedule);

    let scheduler;
    try {
      scheduler = await syncScheduleToScheduler(schedule);
    } catch (error) {
      await firebaseDelete(`devices/${DEVICE_ID}/schedules/${id}`).catch(() => null);
      throw error;
    }

    schedule = {
      ...schedule,
      schedulerStatus: scheduler.armed ? "armed" : scheduler.state || "idle",
      schedulerNextAlarmAt: scheduler.nextAlarmAt || null,
      updatedAt: Date.now(),
    };

    await firebasePut(`devices/${DEVICE_ID}/schedules/${id}`, schedule);

    return Response.json(
      {
        ok: true,
        schedule: withComputedScheduleFields(schedule),
        scheduler,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ ok: false, error: error.message, scheduleId: id }, { status: 400 });
  }
}
