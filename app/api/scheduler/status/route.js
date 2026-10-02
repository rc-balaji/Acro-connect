import { getSchedulerHealth, schedulerConfigured } from "@/lib/scheduler-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const health = await getSchedulerHealth();
  return Response.json({
    ok: Boolean(health.ok),
    configured: schedulerConfigured(),
    scheduler: health,
    timestamp: Date.now(),
  });
}
