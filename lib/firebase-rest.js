import { DATABASE_URL, DEVICE_ID } from "./firebase-config";

function cleanBase(url) {
  return url.replace(/\/$/, "");
}

export function firebaseUrl(path) {
  return `${cleanBase(DATABASE_URL)}/${path}.json`;
}

export async function firebaseGet(path) {
  const response = await fetch(firebaseUrl(path), {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Firebase GET failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function firebasePut(path, value) {
  const response = await fetch(firebaseUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Firebase PUT failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function firebasePatch(path, value) {
  const response = await fetch(firebaseUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Firebase PATCH failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function getCommands() {
  const commands = await firebaseGet(`devices/${DEVICE_ID}/commands`);
  return {
    led2: Boolean(commands?.led2),
    led3: Boolean(commands?.led3),
    led4: Boolean(commands?.led4)
  };
}
