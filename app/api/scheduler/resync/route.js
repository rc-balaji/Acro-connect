import { DEVICE_ID } from "@/lib/firebase-config";
import { firebaseGet, firebasePatch } from "@/lib/firebase-rest";
import { syncScheduleToScheduler } from "@/lib/scheduler-client";
import { scheduleListFromObject } from "@/lib/schedule-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const schedules = scheduleListFromObject(
      await firebaseGet(`devices/${DEVICE_ID}/schedules`),
    );

    const results = [];
    for (const schedule of schedules) {
      try {
        const scheduler = await syncScheduleToScheduler(schedule);
        await firebasePatch(`devices/${DEVICE_ID}/schedules/${schedule.id}`, {
          schedulerStatus: scheduler.armed ? "armed" : scheduler.state || "idle",
          schedulerNextAlarmAt: scheduler.nextAlarmAt || null,
          updatedAt: Date.now(),
        });
        results.push({ id: schedule.id, ok: true, scheduler });
      } catch (error) {
        await firebasePatch(`devices/${DEVICE_ID}/schedules/${schedule.id}`, {
          schedulerStatus: "sync_failed",
          schedulerError: error.message,
          updatedAt: Date.now(),
        }).catch(() => null);
        results.push({ id: schedule.id, ok: false, error: error.message });
      }
    }

    return Response.json({
      ok: results.every((result) => result.ok),
      count: results.length,
      results,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
