"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import mqtt from "mqtt";

import {
  Droplets,
  Gauge,
  Leaf,
  Radio,
  ThermometerSun,
  Waves,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

import MetricCard from "@/components/MetricCard";
import Toggle from "@/components/Toggle";

import { DEVICE_ID, MQTT_WS_URL, MQTT_TOPICS } from "@/lib/mqtt-config";

const initialTelemetry = {
  temperature: 0,
  humidity: 0,
  soil: 0,
  waterLevel: 0,

  led1: false,
  led2: false,
  led3: false,
  led4: false,

  seq: 0,
  uptimeMs: 0,
};

function formatAge(timestamp) {
  if (!timestamp) {
    return "No data yet";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 2) {
    return "Just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  return new Date(timestamp).toLocaleTimeString();
}

export default function Dashboard() {
  // =========================================================
  // REFERENCES
  // =========================================================

  const mqttClientRef = useRef(null);

  const pendingCommandsRef = useRef(new Map());

  // =========================================================
  // STATE
  // =========================================================

  const [telemetry, setTelemetry] = useState(initialTelemetry);

  const [commands, setCommands] = useState({
    led2: false,
    led3: false,
    led4: false,
  });

  const [history, setHistory] = useState([]);

  const [mqttConnected, setMqttConnected] = useState(false);

  const [deviceOnline, setDeviceOnline] = useState(false);

  const [lastSeen, setLastSeen] = useState(0);

  const [now, setNow] = useState(Date.now());

  const [latencyMs, setLatencyMs] = useState(null);

  const [lastCommandId, setLastCommandId] = useState("");

  const [writing, setWriting] = useState(null);

  const [error, setError] = useState("");

  // =========================================================
  // UI CLOCK
  // =========================================================

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, []);

  // =========================================================
  // MQTT CONNECTION
  // =========================================================

  useEffect(() => {
    let disposed = false;

    let client = null;

    // Browser client ID must be different
    // from ESP32 client ID.

    const browserClientId =
      "AGRO_CONNECT_WEB_" + Math.random().toString(16).slice(2, 10);

    console.log("[MQTT] Connecting:", MQTT_WS_URL);

    console.log("[MQTT] Browser Client ID:", browserClientId);

    try {
      // =====================================================
      // CONNECT
      // =====================================================

      client = mqtt.connect(MQTT_WS_URL, {
        clientId: browserClientId,

        clean: true,

        keepalive: 30,

        connectTimeout: 10000,

        reconnectPeriod: 1000,

        resubscribe: true,

        protocolVersion: 4,
      });

      mqttClientRef.current = client;

      // =====================================================
      // CONNECTED
      // =====================================================

      client.on("connect", () => {
        if (disposed) {
          return;
        }

        console.log("[MQTT] Dashboard connected");

        setMqttConnected(true);

        setError("");

        // -----------------------------------------------
        // Subscribe TELEMETRY
        // -----------------------------------------------

        client.subscribe(
          MQTT_TOPICS.telemetry,
          {
            qos: 0,
          },
          (err) => {
            if (err) {
              console.error("[MQTT] Telemetry subscription error:", err);
            } else {
              console.log("[MQTT] Subscribed:", MQTT_TOPICS.telemetry);
            }
          },
        );

        // -----------------------------------------------
        // Subscribe STATE / ACK
        // -----------------------------------------------

        client.subscribe(
          MQTT_TOPICS.state,
          {
            qos: 1,
          },
          (err) => {
            if (err) {
              console.error("[MQTT] State subscription error:", err);
            } else {
              console.log("[MQTT] Subscribed:", MQTT_TOPICS.state);
            }
          },
        );

        // -----------------------------------------------
        // Subscribe DEVICE STATUS
        // -----------------------------------------------

        client.subscribe(
          MQTT_TOPICS.status,
          {
            qos: 1,
          },
          (err) => {
            if (err) {
              console.error("[MQTT] Status subscription error:", err);
            } else {
              console.log("[MQTT] Subscribed:", MQTT_TOPICS.status);
            }
          },
        );

        // -----------------------------------------------
        // Subscribe DESIRED STATE
        // -----------------------------------------------

        client.subscribe(
          MQTT_TOPICS.desired,
          {
            qos: 1,
          },
          (err) => {
            if (err) {
              console.error("[MQTT] Desired subscription error:", err);
            } else {
              console.log("[MQTT] Subscribed:", MQTT_TOPICS.desired);
            }
          },
        );
      });

      // =====================================================
      // RECONNECTING
      // =====================================================

      client.on("reconnect", () => {
        if (disposed) {
          return;
        }

        console.log("[MQTT] Reconnecting...");

        setMqttConnected(false);
      });

      // =====================================================
      // OFFLINE
      // =====================================================

      client.on("offline", () => {
        if (disposed) {
          return;
        }

        console.log("[MQTT] Browser client offline");

        setMqttConnected(false);
      });

      // =====================================================
      // CLOSE
      // =====================================================

      client.on("close", () => {
        if (disposed) {
          return;
        }

        console.log("[MQTT] Connection closed");

        setMqttConnected(false);
      });

      // =====================================================
      // ERROR
      // =====================================================

      client.on("error", (err) => {
        if (disposed) {
          return;
        }

        console.error("[MQTT ERROR]", err);

        setError(err?.message || "MQTT connection error");
      });

      // =====================================================
      // MQTT MESSAGE
      // =====================================================

      client.on("message", (topic, payload) => {
        if (disposed) {
          return;
        }

        let data;

        try {
          data = JSON.parse(payload.toString());
        } catch (err) {
          console.error("[MQTT] Invalid JSON:", payload.toString());

          return;
        }

        // =================================================
        // TELEMETRY
        // =================================================

        if (topic === MQTT_TOPICS.telemetry) {
          const receivedAt = Date.now();

          const packet = {
            ...initialTelemetry,
            ...data,
            receivedAt,
          };

          setTelemetry((previous) => ({
            ...previous,
            ...packet,
          }));

          setLastSeen(receivedAt);

          setDeviceOnline(true);

          setHistory((previous) => {
            const next = [...previous, packet];

            if (next.length > 60) {
              return next.slice(-60);
            }

            return next;
          });

          return;
        }

        // =================================================
        // OUTPUT STATE + ACK
        // =================================================

        if (topic === MQTT_TOPICS.state) {
          setTelemetry((previous) => ({
            ...previous,

            led1: Boolean(data.led1),

            led2: Boolean(data.led2),

            led3: Boolean(data.led3),

            led4: Boolean(data.led4),
          }));

          const commandId = data.ackCommandId;

          if (commandId) {
            const pending = pendingCommandsRef.current.get(commandId);

            if (pending) {
              const roundTrip = performance.now() - pending.startedAt;

              const rounded = Math.round(roundTrip);

              console.log("[MQTT RTT]", rounded, "ms");

              setLatencyMs(rounded);

              setLastCommandId(commandId);

              pendingCommandsRef.current.delete(commandId);

              setWriting(null);
            }
          }

          return;
        }

        // =================================================
        // DESIRED STATE
        // =================================================

        if (topic === MQTT_TOPICS.desired) {
          setCommands({
            led2: Boolean(data.led2),

            led3: Boolean(data.led3),

            led4: Boolean(data.led4),
          });

          return;
        }

        // =================================================
        // DEVICE STATUS
        // =================================================

        if (topic === MQTT_TOPICS.status) {
          const online = Boolean(data.online);

          setDeviceOnline(online);

          console.log("[MQTT DEVICE]", online ? "ONLINE" : "OFFLINE");
        }
      });
    } catch (err) {
      console.error("[MQTT STARTUP ERROR]", err);

      setError(err?.message || "MQTT startup failed");
    }

    // =======================================================
    // CLEANUP
    // =======================================================

    return () => {
      disposed = true;

      console.log("[MQTT] Cleanup");

      pendingCommandsRef.current.clear();

      if (client) {
        try {
          client.removeAllListeners();

          client.end(true);
        } catch (err) {
          console.warn("[MQTT CLEANUP ERROR]", err);
        }
      }

      if (mqttClientRef.current === client) {
        mqttClientRef.current = null;
      }
    };
  }, []);

  // =========================================================
  // ONLINE STATUS
  // =========================================================

  const online =
    mqttConnected && deviceOnline && lastSeen > 0 && now - lastSeen < 5000;

  // =========================================================
  // CHART SERIES
  // =========================================================

  const series = useMemo(
    () => ({
      temperature: history.map((item) => Number(item.temperature || 0)),

      humidity: history.map((item) => Number(item.humidity || 0)),

      soil: history.map((item) => Number(item.soil || 0)),

      water: history.map((item) => Number(item.waterLevel || 0)),
    }),
    [history],
  );

  // =========================================================
  // SEND COMMAND
  // =========================================================

  function updateCommand(key, value) {
    const client = mqttClientRef.current;

    if (!client || !client.connected) {
      setError("MQTT broker is not connected");

      return;
    }

    const nextCommands = {
      ...commands,

      [key]: value,
    };

    const commandId =
      Date.now().toString() + "_" + Math.random().toString(16).slice(2, 8);

    const message = {
      commandId,

      led2: Boolean(nextCommands.led2),

      led3: Boolean(nextCommands.led3),

      led4: Boolean(nextCommands.led4),

      sentAt: Date.now(),
    };

    console.log("[MQTT COMMAND SEND]", message);

    setCommands(nextCommands);

    setWriting(key);

    setError("");

    pendingCommandsRef.current.set(commandId, {
      startedAt: performance.now(),

      key,
    });

    client.publish(
      MQTT_TOPICS.desired,

      JSON.stringify(message),

      {
        qos: 1,

        retain: true,
      },

      (err) => {
        if (err) {
          console.error("[MQTT PUBLISH ERROR]", err);

          pendingCommandsRef.current.delete(commandId);

          setWriting(null);

          setError(err.message);

          return;
        }

        console.log("[MQTT] Command published");
      },
    );

    // ACK timeout protection

    setTimeout(() => {
      const pending = pendingCommandsRef.current.get(commandId);

      if (!pending) {
        return;
      }

      pendingCommandsRef.current.delete(commandId);

      setWriting(null);

      setError("ESP32 command ACK timeout");

      console.warn("[MQTT] Command ACK timeout:", commandId);
    }, 5000);
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <main
      className="
        grid-bg
        min-h-screen
      "
    >
      <div
        className="
          mx-auto
          max-w-[1500px]
          px-4
          py-5
          md:px-7
          md:py-7
        "
      >
        {/* HEADER */}

        <header
          className="
            glass
            rounded-[28px]
            px-5
            py-5
            md:px-7

            flex
            flex-col
            md:flex-row
            md:items-center
            justify-between

            gap-5
          "
        >
          <div
            className="
              flex
              items-center
              gap-4
            "
          >
            <div
              className="
                h-12
                w-12

                rounded-2xl

                bg-emerald-400
                text-emerald-950

                grid
                place-items-center
              "
            >
              <Leaf size={25} />
            </div>

            <div>
              <div
                className="
                  flex
                  items-center
                  gap-2
                "
              >
                <h1
                  className="
                    text-xl
                    md:text-2xl
                    font-semibold
                  "
                >
                  AGRO CONNECT
                </h1>

                <span
                  className="
                    rounded-full
                    border
                    border-emerald-300/10
                    bg-emerald-300/5
                    px-2
                    py-1
                    text-[10px]
                    text-emerald-200/60
                  "
                >
                  MQTT LIVE
                </span>
              </div>

              <p
                className="
                  mt-1
                  text-sm
                  text-emerald-50/42
                "
              >
                Real-time Smart Farming Control
              </p>
            </div>
          </div>

          <div
            className="
              flex
              flex-wrap
              items-center
              gap-3
            "
          >
            <div
              className="
                rounded-2xl
                border
                border-white/8
                bg-white/[.035]
                px-4
                py-3
              "
            >
              <p
                className="
                  text-[10px]
                  uppercase
                  text-white/35
                "
              >
                Device
              </p>

              <p
                className="
                  mt-1
                  text-sm
                  font-medium
                "
              >
                {DEVICE_ID}
              </p>
            </div>

            <div
              className="
                rounded-2xl
                border
                border-white/8
                bg-white/[.035]
                px-4
                py-3
                min-w-[150px]
              "
            >
              <p
                className="
                  text-[10px]
                  uppercase
                  text-white/35
                "
              >
                ESP32
              </p>

              <div
                className="
                  mt-1
                  flex
                  items-center
                  gap-2
                  text-sm
                "
              >
                <span
                  className={`
                    h-2.5
                    w-2.5
                    rounded-full

                    ${online ? "bg-emerald-400 pulse-dot" : "bg-red-400"}
                  `}
                />

                {online ? "Online" : "Offline"}
              </div>
            </div>
          </div>
        </header>

        {/* ERROR */}

        {error && (
          <div
            className="
                mt-4
                rounded-2xl
                border
                border-red-400/20
                bg-red-400/8
                px-4
                py-3
                text-sm
                text-red-200
              "
          >
            MQTT: {error}
          </div>
        )}

        {/* SENSOR CARDS */}

        <section
          className="
            mt-5
            grid
            gap-4
            sm:grid-cols-2
            xl:grid-cols-4
          "
        >
          <MetricCard
            icon={<ThermometerSun size={21} />}
            label="Temperature"
            value={Number(telemetry.temperature || 0).toFixed(1)}
            unit="°C"
            hint="MQTT · DHT22"
            history={series.temperature}
            accent="rose"
          />

          <MetricCard
            icon={<Droplets size={21} />}
            label="Humidity"
            value={Math.round(telemetry.humidity || 0)}
            unit="%"
            hint="MQTT · DHT22"
            history={series.humidity}
            accent="blue"
          />

          <MetricCard
            icon={<Leaf size={21} />}
            label="Soil Moisture"
            value={Math.round(telemetry.soil || 0)}
            unit="%"
            hint="MQTT · GPIO34"
            history={series.soil}
            accent="green"
          />

          <MetricCard
            icon={<Waves size={21} />}
            label="Water Level"
            value={Math.round(telemetry.waterLevel || 0)}
            unit="%"
            hint="MQTT · HC-SR04"
            history={series.water}
            accent="blue"
          />
        </section>

        {/* CONTROL + HEALTH */}

        <section
          className="
            mt-4
            grid
            gap-4
            xl:grid-cols-[1.35fr_.65fr]
          "
        >
          {/* CONTROL PANEL */}

          <div
            className="
              glass
              rounded-3xl
              p-5
              md:p-6
            "
          >
            <div
              className="
                flex
                items-center
                justify-between
              "
            >
              <div>
                <p
                  className="
                    text-sm
                    text-white/40
                  "
                >
                  Realtime Control
                </p>

                <h2
                  className="
                    mt-1
                    text-xl
                    font-semibold
                  "
                >
                  MQTT Outputs
                </h2>
              </div>

              <Zap
                className="
                  text-emerald-300
                "
              />
            </div>

            <div
              className="
                mt-5
                grid
                gap-3
                md:grid-cols-2
              "
            >
              {/* LED 1 */}

              <div
                className="
                  rounded-2xl
                  border
                  border-emerald-300/10
                  bg-emerald-300/[.035]
                  p-4

                  flex
                  items-center
                  justify-between
                "
              >
                <div>
                  <p
                    className="
                      font-medium
                    "
                  >
                    LED 1 · Soil Auto
                  </p>

                  <p
                    className="
                      mt-1
                      text-xs
                      text-white/35
                    "
                  >
                    ESP32 automatic control
                  </p>
                </div>

                <span
                  className={
                    telemetry.led1
                      ? "text-emerald-300 font-semibold"
                      : "text-white/35"
                  }
                >
                  {telemetry.led1 ? "ON" : "OFF"}
                </span>
              </div>

              {/* LED 2 / LED 3 / LED 4 */}

              {[2, 3, 4].map((number) => {
                const key = `led${number}`;

                return (
                  <div
                    key={key}
                    className="
                          rounded-2xl
                          border
                          border-white/8
                          bg-white/[.025]
                          p-4

                          flex
                          items-center
                          justify-between

                          gap-4
                        "
                  >
                    <div>
                      <p
                        className="
                              font-medium
                            "
                      >
                        LED {number}
                      </p>

                      <p
                        className="
                              mt-1
                              text-xs
                              text-white/35
                            "
                      >
                        Hardware: {telemetry[key] ? "ON" : "OFF"}
                      </p>
                    </div>

                    <Toggle
                      checked={commands[key]}
                      disabled={writing !== null}
                      onChange={(value) => updateCommand(key, value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* SYSTEM HEALTH */}

          <div
            className="
              glass
              rounded-3xl
              p-5
              md:p-6
            "
          >
            <div
              className="
                flex
                items-center
                justify-between
              "
            >
              <div>
                <p
                  className="
                    text-sm
                    text-white/40
                  "
                >
                  System Health
                </p>

                <h2
                  className="
                    mt-1
                    text-xl
                    font-semibold
                  "
                >
                  Live Status
                </h2>
              </div>

              {online ? (
                <Wifi
                  className="
                        text-emerald-300
                      "
                />
              ) : (
                <WifiOff
                  className="
                        text-red-300
                      "
                />
              )}
            </div>

            {/* LATENCY */}

            <div
              className="
                mt-5
                rounded-2xl
                border
                border-emerald-300/10
                bg-emerald-300/[.035]
                p-4
              "
            >
              <div
                className="
                  flex
                  items-center
                  gap-3
                "
              >
                <Gauge
                  className="
                    text-emerald-300
                  "
                />

                <div>
                  <p
                    className="
                      text-xs
                      text-white/35
                    "
                  >
                    Command Round Trip
                  </p>

                  <p
                    className="
                      mt-1
                      text-2xl
                      font-semibold
                    "
                  >
                    {latencyMs === null ? "--" : `${latencyMs} ms`}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="
                mt-4
                space-y-3
                text-sm
              "
            >
              <div
                className="
                  flex
                  justify-between
                  border-b
                  border-white/6
                  pb-3
                "
              >
                <span
                  className="
                    text-white/35
                  "
                >
                  MQTT Broker
                </span>

                <span>{mqttConnected ? "Connected" : "Disconnected"}</span>
              </div>

              <div
                className="
                  flex
                  justify-between
                  border-b
                  border-white/6
                  pb-3
                "
              >
                <span
                  className="
                    text-white/35
                  "
                >
                  ESP32
                </span>

                <span>{online ? "Online" : "Offline"}</span>
              </div>

              <div
                className="
                  flex
                  justify-between
                  border-b
                  border-white/6
                  pb-3
                "
              >
                <span
                  className="
                    text-white/35
                  "
                >
                  Last Packet
                </span>

                <span>{formatAge(lastSeen)}</span>
              </div>

              <div
                className="
                  flex
                  justify-between
                  border-b
                  border-white/6
                  pb-3
                "
              >
                <span
                  className="
                    text-white/35
                  "
                >
                  Transport
                </span>

                <span>MQTT / WSS</span>
              </div>

              <div
                className="
                  flex
                  justify-between
                  border-b
                  border-white/6
                  pb-3
                "
              >
                <span
                  className="
                    text-white/35
                  "
                >
                  Packets
                </span>

                <span>{history.length}</span>
              </div>

              <div
                className="
                  flex
                  justify-between
                "
              >
                <span
                  className="
                    text-white/35
                  "
                >
                  Last Command
                </span>

                <span
                  className="
                    max-w-[140px]
                    truncate
                  "
                >
                  {lastCommandId || "--"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* TELEMETRY */}

        <section
          className="
            mt-4
            glass
            rounded-3xl
            p-5
          "
        >
          <div
            className="
              flex
              items-center
              justify-between
            "
          >
            <div>
              <p
                className="
                  text-sm
                  text-white/40
                "
              >
                Recent Telemetry
              </p>

              <h2
                className="
                  mt-1
                  text-xl
                  font-semibold
                "
              >
                MQTT Sensor Stream
              </h2>
            </div>

            <Radio
              className="
                text-emerald-300
              "
            />
          </div>

          <div
            className="
              mt-5
              overflow-x-auto
            "
          >
            <table
              className="
                w-full
                min-w-[760px]
                text-sm
              "
            >
              <thead
                className="
                  text-left
                  text-xs
                  uppercase
                  text-white/28
                "
              >
                <tr>
                  <th className="pb-3">Time</th>

                  <th className="pb-3">Temp</th>

                  <th className="pb-3">Humidity</th>

                  <th className="pb-3">Soil</th>

                  <th className="pb-3">Water</th>

                  <th className="pb-3">L1</th>

                  <th className="pb-3">L2</th>

                  <th className="pb-3">L3</th>

                  <th className="pb-3">L4</th>
                </tr>
              </thead>

              <tbody>
                {history
                  .slice(-8)
                  .reverse()
                  .map((row, index) => (
                    <tr
                      key={`${row.receivedAt}-${index}`}
                      className="
                            border-t
                            border-white/5
                          "
                    >
                      <td
                        className="
                              py-3
                            "
                      >
                        {new Date(row.receivedAt).toLocaleTimeString()}
                      </td>

                      <td>{Number(row.temperature || 0).toFixed(1)}°C</td>

                      <td>{Math.round(row.humidity || 0)}%</td>

                      <td>{Math.round(row.soil || 0)}%</td>

                      <td>{Math.round(row.waterLevel || 0)}%</td>

                      <td>{row.led1 ? "ON" : "OFF"}</td>

                      <td>{row.led2 ? "ON" : "OFF"}</td>

                      <td>{row.led3 ? "ON" : "OFF"}</td>

                      <td>{row.led4 ? "ON" : "OFF"}</td>
                    </tr>
                  ))}

                {!history.length && (
                  <tr>
                    <td
                      colSpan="9"
                      className="
                          py-8
                          text-center
                          text-white/30
                        "
                    >
                      Waiting for ESP32 MQTT packets...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* MQTT TOPICS */}

        <section
          className="
            mt-4
            glass
            rounded-3xl
            p-5
          "
        >
          <p
            className="
              text-xs
              text-white/35
            "
          >
            MQTT Topics
          </p>

          <div
            className="
              mt-3
              grid
              gap-2
              md:grid-cols-2
            "
          >
            <code
              className="
                rounded-xl
                bg-black/20
                p-3
                text-xs
                text-emerald-200
              "
            >
              {MQTT_TOPICS.telemetry}
            </code>

            <code
              className="
                rounded-xl
                bg-black/20
                p-3
                text-xs
                text-emerald-200
              "
            >
              {MQTT_TOPICS.desired}
            </code>

            <code
              className="
                rounded-xl
                bg-black/20
                p-3
                text-xs
                text-emerald-200
              "
            >
              {MQTT_TOPICS.state}
            </code>

            <code
              className="
                rounded-xl
                bg-black/20
                p-3
                text-xs
                text-emerald-200
              "
            >
              {MQTT_TOPICS.status}
            </code>
          </div>
        </section>

        <footer
          className="
            py-7
            text-xs
            text-white/25
          "
        >
          AGRO CONNECT · Direct MQTT Realtime Architecture
        </footer>
      </div>
    </main>
  );
}
