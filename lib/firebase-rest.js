import { DATABASE_URL, DEVICE_ID } from "./firebase-config";

function cleanBase(url) {
  return String(url || "").replace(/\/$/, "");
}

export function firebaseUrl(path) {
  return `${cleanBase(DATABASE_URL)}/${String(path).replace(/^\/+/, "")}.json`;
}

async function ensureOk(response, operation) {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firebase ${operation} failed: ${response.status} ${detail}`);
  }
  return response;
}

export async function firebaseGet(path) {
  const response = await fetch(firebaseUrl(path), {
    method: "GET",
    cache: "no-store",
  });
  await ensureOk(response, "GET");
  return response.json();
}

export async function firebasePut(path, value) {
  const response = await fetch(firebaseUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store",
  });
  await ensureOk(response, "PUT");
  return response.json();
}

export async function firebasePatch(path, value) {
  const response = await fetch(firebaseUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store",
  });
  await ensureOk(response, "PATCH");
  return response.json();
}

export async function firebaseDelete(path) {
  const response = await fetch(firebaseUrl(path), {
    method: "DELETE",
    cache: "no-store",
  });
  await ensureOk(response, "DELETE");
  return true;
}

// Claims one concrete START/STOP occurrence using Firebase ETag compare-and-swap.
// Cloudflare Durable Object alarms are at-least-once, so this prevents a retry
// from publishing the same motor command twice after an already completed call.
export async function firebaseClaimExecution(path, claim) {
  const url = firebaseUrl(path);
  const getResponse = await fetch(url, {
    method: "GET",
    headers: { "X-Firebase-ETag": "true" },
    cache: "no-store",
  });
  await ensureOk(getResponse, "CLAIM GET");

  const etag = getResponse.headers.get("etag");
  const existing = await getResponse.json();

  if (["success", "published_no_ack"].includes(existing?.status)) {
    return { claimed: false, existing };
  }

  if (
    existing?.status === "claimed" &&
    Number(existing.claimedAt || 0) > Date.now() - 30_000
  ) {
    return { claimed: false, existing };
  }

  const next = {
    ...(existing || {}),
    ...claim,
    status: "claimed",
    claimedAt: Date.now(),
    attempts: Number(existing?.attempts || 0) + 1,
  };

  const putResponse = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": etag || "null_etag",
    },
    body: JSON.stringify(next),
    cache: "no-store",
  });

  if (putResponse.status === 412) {
    const latest = await firebaseGet(path);
    return { claimed: false, existing: latest };
  }

  await ensureOk(putResponse, "CLAIM PUT");
  return { claimed: true, existing: next };
}

export async function getCommands() {
  const commands = await firebaseGet(`devices/${DEVICE_ID}/commands`);
  return {
    led2: Boolean(commands?.led2),
    led3: Boolean(commands?.led3),
    led4: Boolean(commands?.led4),
  };
}
