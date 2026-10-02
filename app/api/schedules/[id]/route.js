import { DEVICE_ID } from "@/lib/firebase-config";
import { firebaseDelete, firebaseGet, firebasePut } from "@/lib/firebase-rest";
import {
  deleteScheduleFromScheduler,
  syncScheduleToScheduler,
} from "@/lib/scheduler-client";
import {
  findConflict,
  getNextStartMs,
  scheduleListFromObject,
  validateScheduleInput,
  withComputedScheduleFields,
} from "@/lib/schedule-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request, context) {
  const { id } = await context.params;
  const path = `devices/${DEVICE_ID}/schedules/${id}`;
  let current = null;

  try {
    current = await firebaseGet(path);
    if (!current) {
      return Response.json({ ok: false, error: "Plan not found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = validateScheduleInput({ ...current, ...body });
    const existing = scheduleListFromObject(
      await firebaseGet(`devices/${DEVICE_ID}/schedules`),
    );
    const conflict = findConflict(validated, existing, id);

    if (conflict) {
      return Response.json(
        {
          ok: false,
          error: `Motor ${validated.motor} already has an overlapping plan on ${conflict.date} at ${conflict.time}`,
          conflict,
        },
        { status: 409 },
      );
    }

    const nextRunAt = getNextStartMs(validated, Date.now(), true);
    if (validated.enabled && nextRunAt == null) {
      throw new Error("This plan has no future occurrence. Choose a future time/date or disable it.");
    }

    let updated = {
      ...current,
      ...validated,
      id,
      updatedAt: Date.now(),
      schedulerStatus: "syncing",
    };

    await firebasePut(path, updated);

    let scheduler;
    try {
      scheduler = await syncScheduleToScheduler(updated);
    } catch (error) {
      await firebasePut(path, current).catch(() => null);
      await syncScheduleToScheduler({ id, ...current }).catch(() => null);
      throw error;
    }

    updated = {
      ...updated,
      schedulerStatus: scheduler.armed ? "armed" : scheduler.state || "idle",
      schedulerNextAlarmAt: scheduler.nextAlarmAt || null,
      updatedAt: Date.now(),
    };

    await firebasePut(path, updated);

    return Response.json({
      ok: true,
      schedule: withComputedScheduleFields(updated),
      scheduler,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(_request, context) {
  const { id } = await context.params;
  const path = `devices/${DEVICE_ID}/schedules/${id}`;

  try {
    const current = await firebaseGet(path);
    if (!current) return Response.json({ ok: true, id, alreadyDeleted: true });

    await deleteScheduleFromScheduler(id);

    try {
      await firebaseDelete(path);
    } catch (error) {
      await syncScheduleToScheduler({ id, ...current }).catch(() => null);
      throw error;
    }

    return Response.json({ ok: true, id });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
