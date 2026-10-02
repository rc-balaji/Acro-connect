import { IST_TIMEZONE, dateKeyInIST, timeKeyInIST } from "@/lib/schedule-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  return Response.json({
    ok: true,
    service: "AGRO CONNECT",
    timezone: IST_TIMEZONE,
    istDate: dateKeyInIST(now),
    istTime: timeKeyInIST(now),
    timestamp: Date.now(),
  });
}
