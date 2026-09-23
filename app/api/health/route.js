import { DATABASE_URL, DEVICE_ID } from "@/lib/firebase-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    service: "AGRO CONNECT",
    deviceId: DEVICE_ID,
    databaseURL: DATABASE_URL,
    timestamp: Date.now()
  });
}
