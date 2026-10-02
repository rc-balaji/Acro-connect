function schedulerConfig() {
  const baseUrl = String(process.env.SCHEDULER_BASE_URL || "").replace(/\/$/, "");
  const secret = String(process.env.SCHEDULER_SHARED_SECRET || "");
  return { baseUrl, secret };
}

export function schedulerConfigured() {
  const { baseUrl, secret } = schedulerConfig();
  return Boolean(baseUrl && secret);
}

async function schedulerFetch(path, options = {}) {
  const { baseUrl, secret } = schedulerConfig();
  if (!baseUrl || !secret) {
    throw new Error(
      "Scheduler is not configured. Set SCHEDULER_BASE_URL and SCHEDULER_SHARED_SECRET in Vercel.",
    );
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = { ok: false, error: await response.text() };
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Scheduler request failed (${response.status})`);
  }

  return data;
}

export function syncScheduleToScheduler(schedule) {
  return schedulerFetch("/sync", {
    method: "POST",
    body: JSON.stringify({ schedule }),
  });
}

export function deleteScheduleFromScheduler(scheduleId) {
  return schedulerFetch(`/schedule/${encodeURIComponent(scheduleId)}`, {
    method: "DELETE",
  });
}

export async function getSchedulerHealth() {
  const { baseUrl } = schedulerConfig();
  if (!baseUrl) return { ok: false, configured: false, error: "SCHEDULER_BASE_URL missing" };

  try {
    const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    const data = await response.json();
    return { ...data, configured: schedulerConfigured() };
  } catch (error) {
    return { ok: false, configured: schedulerConfigured(), error: error.message };
  }
}
