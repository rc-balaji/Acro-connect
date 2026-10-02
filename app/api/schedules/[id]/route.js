import { DEVICE_ID } from "@/lib/firebase-config";
import { firebaseDelete, firebaseGet, firebasePut } from "@/lib/firebase-rest";
import {
  findConflict,
  scheduleListFromObject,
  validateScheduleInput,
} from "@/lib/schedule-utils";

export const dynamic = "force-dynamic";

export async function PATCH(request, context) {
  try {
    const { id } = await context.params;
    const current = await firebaseGet(`devices/${DEVICE_ID}/schedules/${id}`);
    if (!current) return Response.json({ ok: false, error: "Plan not found" }, { status: 404 });

    const body = await request.json();
    const merged = validateScheduleInput({ ...current, ...body });
    const existing = scheduleListFromObject(
      await firebaseGet(`devices/${DEVICE_ID}/schedules`),
    );
    const conflict = findConflict(merged, existing, id);

    if (conflict) {
      return Response.json(
        {
          ok: false,
          error: `Motor ${merged.motor} already has an overlapping plan on ${conflict.date} at ${conflict.time}`,
          conflict,
        },
        { status: 409 },
      );
    }

    const updated = {
      ...current,
      ...merged,
      updatedAt: Date.now(),
    };
    await firebasePut(`devices/${DEVICE_ID}/schedules/${id}`, updated);
    return Response.json({ ok: true, schedule: { id, ...updated } });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(_request, context) {
  try {
    const { id } = await context.params;
    await firebaseDelete(`devices/${DEVICE_ID}/schedules/${id}`);
    return Response.json({ ok: true, id });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
