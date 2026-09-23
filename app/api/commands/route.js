import { DEVICE_ID } from "@/lib/firebase-config";
import { firebaseGet } from "@/lib/firebase-rest";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const commands = (await firebaseGet(`devices/${DEVICE_ID}/commands`)) || {};

    return Response.json({
      ok: true,
      deviceId: DEVICE_ID,
      commands: {
        led2: Boolean(commands.led2),
        led3: Boolean(commands.led3),
        led4: Boolean(commands.led4)
      },
      timestamp: Date.now()
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
