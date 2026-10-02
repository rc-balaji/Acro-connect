import mqtt from "mqtt";
import { MQTT_TCP_URL, MQTT_TOPICS } from "./mqtt-config";
import { MOTOR_KEYS } from "./schedule-utils";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMotorEvents(events, fallbackState) {
  if (!events.length) return { results: [], finalState: fallbackState };

  const client = mqtt.connect(MQTT_TCP_URL, {
    clientId: `AGRO_SCHED_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 7)}`,
    clean: true,
    keepalive: 20,
    connectTimeout: 6_000,
    reconnectPeriod: 0,
    protocolVersion: 4,
  });

  const state = {
    led2: Boolean(fallbackState?.led2),
    led3: Boolean(fallbackState?.led3),
    led4: Boolean(fallbackState?.led4),
  };

  const waiters = new Map();

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MQTT scheduler connection timeout")), 7_000);
      client.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      client.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    await new Promise((resolve, reject) => {
      client.subscribe(MQTT_TOPICS.state, { qos: 1 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    client.on("message", (topic, payload) => {
      if (topic !== MQTT_TOPICS.state) return;
      try {
        const data = JSON.parse(payload.toString());
        if (typeof data.led2 === "boolean") state.led2 = data.led2;
        if (typeof data.led3 === "boolean") state.led3 = data.led3;
        if (typeof data.led4 === "boolean") state.led4 = data.led4;

        const id = data.ackCommandId;
        if (id && waiters.has(id)) {
          waiters.get(id)(data);
          waiters.delete(id);
        }
      } catch {
        // Ignore malformed packets from a public broker.
      }
    });

    // Give retained hardware state a short chance to arrive.
    await delay(450);

    const results = [];

    for (const event of events) {
      const key = MOTOR_KEYS[event.motor];
      if (!key) {
        results.push({ executionId: event.executionId, ok: false, error: "Invalid motor" });
        continue;
      }

      state[key] = Boolean(event.turnOn);
      const commandId = `plan_${event.executionId}_${Date.now()}`;
      const message = {
        commandId,
        led2: Boolean(state.led2),
        led3: Boolean(state.led3),
        led4: Boolean(state.led4),
        sentAt: Date.now(),
        source: "vercel-plan",
        scheduleId: event.scheduleId,
        schedulePhase: event.type,
      };

      const ackPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiters.delete(commandId);
          resolve(null);
        }, 2_500);
        waiters.set(commandId, (data) => {
          clearTimeout(timer);
          resolve(data);
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
      results.push({
        executionId: event.executionId,
        ok: Boolean(ack),
        published: true,
        acknowledged: Boolean(ack),
        commandId,
        hardwareState: ack || null,
      });

      await delay(100);
    }

    return { results, finalState: state };
  } finally {
    for (const resolve of waiters.values()) resolve(null);
    waiters.clear();
    client.end(true);
  }
}
