export const DEVICE_ID = "AGRO-001";

/*
 * ESP32:
 * mqtt://broker.emqx.io:1883
 *
 * Browser:
 * wss://broker.emqx.io:8084/mqtt
 */

export const MQTT_WS_URL = "wss://broker.emqx.io:8084/mqtt";

export const MQTT_TOPICS = {
  telemetry: `agroconnect/${DEVICE_ID}/telemetry`,
  desired: `agroconnect/${DEVICE_ID}/desired`,
  state: `agroconnect/${DEVICE_ID}/state`,
  status: `agroconnect/${DEVICE_ID}/status`,
};
