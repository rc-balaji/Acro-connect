import { DEVICE_ID } from "@/lib/firebase-config";
import { firebaseGet, firebasePut } from "@/lib/firebase-rest";
import {
  findConflict,
  scheduleListFromObject,
  validateScheduleInput,
} from "@/lib/schedule-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await firebaseGet(`devices/${DEVICE_ID}/schedules`);
    return Response.json({
      ok: true,
      deviceId: DEVICE_ID,
      schedules: scheduleListFromObject(data),
      timestamp: Date.now(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
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

    const id = `plan_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
    const now = Date.now();
    const schedule = {
      ...input,
      createdAt: now,
      updatedAt: now,
      lastTriggeredAt: null,
      lastResult: null,
    };

    await firebasePut(`devices/${DEVICE_ID}/schedules/${id}`, schedule);
    return Response.json({ ok: true, schedule: { id, ...schedule } }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
