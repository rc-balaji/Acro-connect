import { DEVICE_ID } from "@/lib/firebase-config";
import {
  firebaseClaimExecution,
  firebaseGet,
  firebasePatch,
  firebasePut,
} from "@/lib/firebase-rest";
import { runMotorEvents } from "@/lib/mqtt-scheduler";
import { getDueEvents, scheduleListFromObject } from "@/lib/schedule-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // Prototype mode. Set CRON_SECRET in Vercel for production.
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const scheduleObject = await firebaseGet(`devices/${DEVICE_ID}/schedules`);
    const schedules = scheduleListFromObject(scheduleObject);
    const due = getDueEvents(schedules, new Date(), 5 * 60_000);
    const claimed = [];

    for (const event of due) {
      const path = `devices/${DEVICE_ID}/scheduleExecutions/${event.executionId}`;
      const gotClaim = await firebaseClaimExecution(path, {
        scheduleId: event.scheduleId,
        motor: event.motor,
        phase: event.type,
        turnOn: event.turnOn,
        dueAt: event.dueAt,
        occurrenceDate: event.occurrenceDate,
      });
      if (gotClaim) claimed.push(event);
    }

    if (!claimed.length) {
      return Response.json({
        ok: true,
        checkedAt: Date.now(),
        due: due.length,
        executed: 0,
        message: "No unclaimed plan events due",
      });
    }

    const fallback = (await firebaseGet(`devices/${DEVICE_ID}/commands`)) || {};
    let mqttResult;
    try {
      mqttResult = await runMotorEvents(claimed, fallback);
    } catch (error) {
      for (const event of claimed) {
        await firebasePatch(
          `devices/${DEVICE_ID}/scheduleExecutions/${event.executionId}`,
          { status: "failed", error: error.message, finishedAt: Date.now() },
        );
      }
      throw error;
    }

    await firebasePut(`devices/${DEVICE_ID}/commands`, {
      led2: Boolean(mqttResult.finalState.led2),
      led3: Boolean(mqttResult.finalState.led3),
      led4: Boolean(mqttResult.finalState.led4),
      updatedAt: Date.now(),
      source: "plan",
    });

    for (const event of claimed) {
      const result = mqttResult.results.find((item) => item.executionId === event.executionId);
      const success = Boolean(result?.acknowledged);
      await firebasePatch(
        `devices/${DEVICE_ID}/scheduleExecutions/${event.executionId}`,
        {
          status: success ? "success" : "failed",
          published: Boolean(result?.published),
          acknowledged: success,
          commandId: result?.commandId || null,
          finishedAt: Date.now(),
          error: success ? null : "ESP32 ACK not received",
        },
      );

      await firebasePatch(`devices/${DEVICE_ID}/schedules/${event.scheduleId}`, {
        lastTriggeredAt: Date.now(),
        lastResult: success ? "success" : "no_ack",
        lastPhase: event.type,
      });
    }

    return Response.json({
      ok: true,
      checkedAt: Date.now(),
      executionMs: Date.now() - startedAt,
      due: due.length,
      executed: claimed.length,
      results: mqttResult.results,
    });
  } catch (error) {
    console.error("Plan cron failed", error);
    return Response.json(
      { ok: false, error: error.message, checkedAt: Date.now() },
      { status: 500 },
    );
  }
}
