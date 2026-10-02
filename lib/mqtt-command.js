import mqtt from "mqtt";

import { firebaseGet, firebasePut } from "./firebase-rest";
import { DEVICE_ID, MQTT_TOPICS, MQTT_WS_URL } from "./mqtt-config";
import { MOTOR_KEYS } from "./schedule-utils";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanMotorState(value) {
  return {
    led2: Boolean(value?.led2),
    led3: Boolean(value?.led3),
    led4: Boolean(value?.led4),
  };
}

function mergeMotorState(target, source) {
  if (!source || typeof source !== "object") return target;
  for (const key of ["led2", "led3", "led4"]) {
    if (typeof source[key] === "boolean") target[key] = source[key];
  }
  return target;
}

export async function executeMotorCommand({
  motor,
  turnOn,
  source = "server-schedule",
  scheduleId = null,
  phase = null,
  occurrenceId = null,
  scheduledFor = null,
}) {
  const key = MOTOR_KEYS[Number(motor)];
  if (!key) throw new Error("Invalid motor. Use 1, 2 or 3.");

  // Firebase is only a fallback state cache. The retained MQTT state/desired
  // messages are preferred so a scheduled action never silently resets another
  // motor that was changed manually from the web/mobile app.
  let state = cleanMotorState(
    (await firebaseGet(`devices/${DEVICE_ID}/commands`).catch(() => null)) || {},
  );

  const client = mqtt.connect(MQTT_WS_URL, {
    clientId: `AGRO_SERVER_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    keepalive: 20,
    connectTimeout: 4_000,
    reconnectPeriod: 0,
    protocolVersion: 4,
  });

  let latestDesired = null;
  let latestHardware = null;
  const waiters = new Map();

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MQTT connection timeout")), 4_500);
      client.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
      client.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    client.on("message", (topic, payload) => {
      let data;
      try {
        data = JSON.parse(payload.toString());
      } catch {
        return;
      }

      if (topic === MQTT_TOPICS.desired) {
        latestDesired = data;
        return;
      }

      if (topic === MQTT_TOPICS.state) {
        latestHardware = data;
        const commandId = data?.ackCommandId;
        if (commandId && waiters.has(commandId)) {
          waiters.get(commandId)(data);
          waiters.delete(commandId);
        }
      }
    });

    await Promise.all([
      new Promise((resolve, reject) => {
        client.subscribe(MQTT_TOPICS.desired, { qos: 1 }, (error) =>
          error ? reject(error) : resolve(),
        );
      }),
      new Promise((resolve, reject) => {
        client.subscribe(MQTT_TOPICS.state, { qos: 1 }, (error) =>
          error ? reject(error) : resolve(),
        );
      }),
    ]);

    // Public EMQX retained packets normally arrive almost immediately.
    // A short window is enough to capture the current three-motor state.
    await delay(350);

    state = mergeMotorState(state, latestDesired);
    state = mergeMotorState(state, latestHardware);
    state[key] = Boolean(turnOn);

    const commandId = `srv_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const sentAt = Date.now();
    const message = {
      commandId,
      led2: Boolean(state.led2),
      led3: Boolean(state.led3),
      led4: Boolean(state.led4),
      sentAt,
      source,
      scheduleId,
      schedulePhase: phase,
      occurrenceId,
      scheduledFor,
    };

    const ackPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        waiters.delete(commandId);
        resolve(null);
      }, 2_500);

      waiters.set(commandId, (ack) => {
        clearTimeout(timeout);
        resolve(ack);
      });
    });

    await new Promise((resolve, reject) => {
      client.publish(
        MQTT_TOPICS.desired,
        JSON.stringify(message),
        { qos: 1, retain: true },
        (error) => (error ? reject(error) : resolve()),
      );
    });

    const ack = await ackPromise;
    const completedAt = Date.now();

    // Keep Firebase command cache aligned for webhook/diagnostics and as a
    // fallback if a retained packet is temporarily unavailable later.
    await firebasePut(`devices/${DEVICE_ID}/commands`, {
      led2: Boolean(state.led2),
      led3: Boolean(state.led3),
      led4: Boolean(state.led4),
      updatedAt: completedAt,
      source,
      lastCommandId: commandId,
    }).catch(() => null);

    return {
      ok: Boolean(ack),
      published: true,
      acknowledged: Boolean(ack),
      commandId,
      sentAt,
      completedAt,
      latencyMs: ack ? completedAt - sentAt : null,
      requestedState: state,
      hardwareState: ack || null,
    };
  } finally {
    for (const resolve of waiters.values()) resolve(null);
    waiters.clear();
    client.removeAllListeners();
    client.end(true);
  }
}
