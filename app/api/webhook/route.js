import { DEVICE_ID } from "@/lib/firebase-config";
import { firebaseGet, firebasePatch, firebasePut } from "@/lib/firebase-rest";

export const dynamic = "force-dynamic";

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "ON") return true;
  if (value === 0 || value === "0" || value === "false" || value === "OFF") return false;
  return fallback;
}

export async function GET() {
  return Response.json({
    ok: true,
    endpoint: "/api/webhook",
    method: "POST",
    example: {
      temperature: 28.4,
      humidity: 64,
      soil: 42,
      waterLevel: 76,
      led1: false,
      led2: false,
      led3: false,
      led4: false
    }
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const now = Date.now();

    const telemetry = {
      temperature: numberOr(body.temperature),
      humidity: numberOr(body.humidity),
      soil: numberOr(body.soil),
      waterLevel: numberOr(body.waterLevel),
      led1: boolOr(body.led1),
      led2: boolOr(body.led2),
      led3: boolOr(body.led3),
      led4: boolOr(body.led4),
      updatedAt: now
    };

    await firebasePatch(`devices/${DEVICE_ID}`, {
      telemetry,
      status: {
        online: true,
        lastSeen: now
      }
    });

    // Store history using timestamp as the key for easy chronological retrieval.
    await firebasePut(`devices/${DEVICE_ID}/history/${now}`, telemetry);

    const commands = (await firebaseGet(`devices/${DEVICE_ID}/commands`)) || {};

    return Response.json({
      ok: true,
      deviceId: DEVICE_ID,
      receivedAt: now,
      commands: {
        led2: Boolean(commands.led2),
        led3: Boolean(commands.led3),
        led4: Boolean(commands.led4)
      }
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return Response.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
