import { DATABASE_URL, DEVICE_ID } from "./firebase-config";

function cleanBase(url) {
  return url.replace(/\/$/, "");
}

export function firebaseUrl(path) {
  return `${cleanBase(DATABASE_URL)}/${path}.json`;
}

async function ensureOk(response, operation) {
  if (!response.ok) {
    throw new Error(
      `Firebase ${operation} failed: ${response.status} ${await response.text()}`,
    );
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

// Atomic-ish execution claim using Firebase REST ETag / If-Match.
// Prevents two cron invocations from firing the same schedule occurrence twice.
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

  if (existing?.status === "success") return false;
  if (existing?.status === "published_no_ack") return false;

  // A fresh claim means another invocation is currently handling it.
  if (
    existing?.status === "claimed" &&
    Number(existing.claimedAt || 0) > Date.now() - 90_000
  ) {
    return false;
  }

  if (Number(existing?.attempts || 0) >= 3) return false;

  const next = {
    ...existing,
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

  if (putResponse.status === 412) return false;
  await ensureOk(putResponse, "CLAIM PUT");
  return true;
}

export async function getCommands() {
  const commands = await firebaseGet(`devices/${DEVICE_ID}/commands`);
  return {
    led2: Boolean(commands?.led2),
    led3: Boolean(commands?.led3),
    led4: Boolean(commands?.led4),
  };
}
