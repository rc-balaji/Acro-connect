import { DEVICE_ID } from "@/lib/firebase-config";
import {
  firebaseClaimExecution,
  firebaseGet,
  firebasePatch,
} from "@/lib/firebase-rest";
import { executeMotorCommand } from "@/lib/mqtt-command";
import { MOTOR_KEYS, occurrenceKey } from "@/lib/schedule-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request) {
  const secret = String(process.env.SCHEDULER_SHARED_SECRET || "");
  if (!secret) return true; // prototype/local mode
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let executionPath = null;

  try {
    const body = await request.json();
    const scheduleId = String(body.scheduleId || "");
    const motor = Number(body.motor);
    const phase = body.phase === "stop" ? "stop" : "start";
    const turnOn = phase === "start";
    const scheduledFor = Number(body.scheduledFor);
    const providedOccurrenceId = String(body.occurrenceId || "");
    const cleanup = body.cleanup === true;

    if (!scheduleId) throw new Error("scheduleId is required");
    if (!MOTOR_KEYS[motor]) throw new Error("motor must be 1, 2 or 3");
    if (!Number.isFinite(scheduledFor)) throw new Error("scheduledFor must be epoch milliseconds");

    const schedule = await firebaseGet(`devices/${DEVICE_ID}/schedules/${scheduleId}`);

    // START must always match an active Firebase plan. STOP is intentionally
    // more permissive: disabling/editing a plan while it is running must still
    // be able to turn the old motor OFF safely. Only the authenticated scheduler
    // can reach this endpoint in deployed mode.
    if (phase === "start") {
      if (!schedule) {
        return Response.json({ ok: true, ignored: true, reason: "schedule_deleted" });
      }
      if (schedule.enabled === false) {
        return Response.json({ ok: true, ignored: true, reason: "schedule_disabled" });
      }
      if (Number(schedule.motor) !== motor) {
        throw new Error("Scheduled motor does not match Firebase plan");
      }
    } else if (!cleanup) {
      if (!schedule) {
        return Response.json({ ok: true, ignored: true, reason: "schedule_deleted" });
      }
      if (Number(schedule.motor) !== motor) {
        throw new Error("Scheduled motor does not match Firebase plan");
      }
    }

    const executionId = providedOccurrenceId || occurrenceKey(scheduleId, scheduledFor, phase);
    executionPath = `devices/${DEVICE_ID}/scheduleExecutions/${executionId}`;

    const claim = await firebaseClaimExecution(executionPath, {
      executionId,
      scheduleId,
      motor,
      phase,
      turnOn,
      scheduledFor,
      title: schedule?.title || `Motor ${motor} plan`,
    });

    if (!claim.claimed) {
      if (claim.existing?.status === "claimed") {
        return Response.json(
          {
            ok: false,
            retry: true,
            error: "Execution is currently being claimed by another request",
            executionId,
          },
          { status: 409 },
        );
      }

      return Response.json({
        ok: true,
        duplicate: true,
        executionId,
        existing: claim.existing || null,
      });
    }

    let result;
    try {
      result = await executeMotorCommand({
        motor,
        turnOn,
        source: "server-schedule",
        scheduleId,
        phase,
        occurrenceId: executionId,
        scheduledFor,
      });
    } catch (error) {
      await firebasePatch(executionPath, {
        status: "failed",
        error: error.message,
        finishedAt: Date.now(),
      }).catch(() => null);
      throw error;
    }

    const status = result.acknowledged ? "success" : "published_no_ack";
    await firebasePatch(executionPath, {
      status,
      published: result.published,
      acknowledged: result.acknowledged,
      commandId: result.commandId,
      sentAt: result.sentAt,
      finishedAt: result.completedAt,
      latencyMs: result.latencyMs,
      requestedState: result.requestedState,
      hardwareState: result.hardwareState,
      error: result.acknowledged ? null : "ESP32 ACK not received before timeout",
    });

    if (schedule) {
      await firebasePatch(`devices/${DEVICE_ID}/schedules/${scheduleId}`, {
        lastTriggeredAt: Date.now(),
        lastScheduledFor: scheduledFor,
        lastResult: status,
        lastPhase: phase,
      }).catch(() => null);
    }

    return Response.json({
      ok: true,
      executionId,
      status,
      motor,
      phase,
      result,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message, executionPath },
      { status: 500 },
    );
  }
}
