"use client";

import { useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import {
  Droplets,
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
import { DEVICE_ID, MQTT_TOPICS, MQTT_WS_URL } from "@/lib/mqtt-config";

const initialTelemetry = {
  temperature: 0,
  humidity: 0,
  soil: 0,
  waterLevel: 0,
  relay: false,
  led1: false,
  led2: false,
  led3: false,
  led4: false,
  seq: 0,
  uptimeMs: 0,
};

export default function Dashboard() {
  const clientRef = useRef(null);
  const pendingRef = useRef(new Map());
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [commands, setCommands] = useState({ led2: false, led3: false, led4: false });
  const [mqttConnected, setMqttConnected] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [latency, setLatency] = useState(null);
  const [writing, setWriting] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    const clientId = `AGRO_CONNECT_WEB_${Math.random().toString(16).slice(2, 10)}`;
    const client = mqtt.connect(MQTT_WS_URL, {
      clientId,
      clean: true,
      keepalive: 30,
      connectTimeout: 10_000,
      reconnectPeriod: 1_000,
      resubscribe: true,
      protocolVersion: 4,
    });
    clientRef.current = client;

    client.on("connect", () => {
      if (disposed) return;
      setMqttConnected(true);
      setError("");
      Object.values(MQTT_TOPICS).forEach((topic) => {
        client.subscribe(topic, { qos: topic === MQTT_TOPICS.telemetry ? 0 : 1 });
      });
    });

    client.on("reconnect", () => !disposed && setMqttConnected(false));
    client.on("offline", () => !disposed && setMqttConnected(false));
    client.on("close", () => !disposed && setMqttConnected(false));
    client.on("error", (err) => !disposed && setError(err?.message || "MQTT connection error"));

    client.on("message", (topic, payload) => {
      if (disposed) return;
      let data;
      try {
        data = JSON.parse(payload.toString());
      } catch {
        return;
      }

      if (topic === MQTT_TOPICS.telemetry) {
        setTelemetry((old) => ({ ...old, ...data }));
        setLastSeen(Date.now());
        setDeviceOnline(true);
        return;
      }

      if (topic === MQTT_TOPICS.state) {
        setTelemetry((old) => ({
          ...old,
          led1: Boolean(data.led1),
          led2: Boolean(data.led2),
          led3: Boolean(data.led3),
          led4: Boolean(data.led4),
          relay: typeof data.relay === "boolean" ? data.relay : old.relay,
        }));
        const commandId = data.ackCommandId;
        const pending = commandId ? pendingRef.current.get(commandId) : null;
        if (pending) {
          setLatency(Math.round(performance.now() - pending.startedAt));
          pendingRef.current.delete(commandId);
          setWriting(null);
        }
        return;
      }

      if (topic === MQTT_TOPICS.desired) {
        setCommands((old) => ({
          led2: typeof data.led2 === "boolean" ? data.led2 : old.led2,
          led3: typeof data.led3 === "boolean" ? data.led3 : old.led3,
          led4: typeof data.led4 === "boolean" ? data.led4 : old.led4,
        }));
        return;
      }

      if (topic === MQTT_TOPICS.status) setDeviceOnline(Boolean(data.online));
    });

    return () => {
      disposed = true;
      pendingRef.current.clear();
      client.removeAllListeners();
      client.end(true);
      if (clientRef.current === client) clientRef.current = null;
    };
  }, []);

  const online = mqttConnected && deviceOnline && lastSeen > 0 && now - lastSeen < 5_000;

  function updateCommand(key, value) {
    const client = clientRef.current;
    if (!client?.connected) {
      setError("MQTT broker is not connected");
      return;
    }

    const next = { ...commands, [key]: value };
    const commandId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const message = {
      commandId,
      led2: Boolean(next.led2),
      led3: Boolean(next.led3),
      led4: Boolean(next.led4),
      sentAt: Date.now(),
      source: "web-dashboard",
    };

    setCommands(next);
    setWriting(key);
    setError("");
    pendingRef.current.set(commandId, { startedAt: performance.now() });

    client.publish(MQTT_TOPICS.desired, JSON.stringify(message), { qos: 1, retain: true }, (err) => {
      if (!err) return;
      pendingRef.current.delete(commandId);
      setWriting(null);
      setError(err.message);
    });

    setTimeout(() => {
      if (!pendingRef.current.has(commandId)) return;
      pendingRef.current.delete(commandId);
      setWriting(null);
      setError("ESP32 command ACK timeout");
    }, 5_000);
  }

  const motors = [
    { number: 1, key: "led2", color: "Green", pin: "D14" },
    { number: 2, key: "led3", color: "Orange", pin: "D23" },
    { number: 3, key: "led4", color: "Red", pin: "D22" },
  ];

  return (
    <main className="grid-bg min-h-[calc(100vh-65px)]">
      <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-7 md:py-7">
        <header className="glass flex flex-col justify-between gap-5 rounded-[28px] px-5 py-5 md:flex-row md:items-center md:px-7">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold md:text-2xl">Live Farm Control</h1>
              <span className="rounded-full border border-emerald-300/10 bg-emerald-300/5 px-2 py-1 text-[10px] text-emerald-200/60">MQTT LIVE</span>
            </div>
            <p className="mt-1 text-sm text-emerald-50/42">Sensors, automatic irrigation relay and independent motor controls</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-white/8 bg-white/[.035] px-4 py-3">
              <p className="text-[10px] uppercase text-white/35">Device</p>
              <p className="mt-1 text-sm font-medium">{DEVICE_ID}</p>
            </div>
            <div className="min-w-[150px] rounded-2xl border border-white/8 bg-white/[.035] px-4 py-3">
              <p className="text-[10px] uppercase text-white/35">ESP32</p>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${online ? "pulse-dot bg-emerald-400" : "bg-red-400"}`} />
                {online ? "Online" : "Offline"}
              </div>
            </div>
          </div>
        </header>

        {error && <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-200">{error}</div>}

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<ThermometerSun size={21} />} label="Temperature" value={Number(telemetry.temperature || 0).toFixed(1)} unit="°C" hint="DHT11 · D15" />
          <MetricCard icon={<Droplets size={21} />} label="Humidity" value={Math.round(telemetry.humidity || 0)} unit="%" hint="DHT11 · D15" />
          <MetricCard icon={<Leaf size={21} />} label="Soil Moisture" value={Math.round(telemetry.soil || 0)} unit="%" hint="ADC · D34" />
          <MetricCard icon={<Waves size={21} />} label="Water Level" value={Math.round(telemetry.waterLevel || 0)} unit="%" hint="HC-SR04 · D5/D18" />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <div className="glass rounded-3xl p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/40">Realtime Control</p>
                <h2 className="mt-1 text-xl font-semibold">Motors</h2>
              </div>
              <Zap className="text-emerald-300" />
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.035] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Automatic irrigation relay · D25</p>
                  <p className="mt-1 text-xs text-white/35">Controlled only by soil moisture — manual motor controls do not affect it.</p>
                </div>
                <span className={telemetry.relay || telemetry.led1 ? "font-semibold text-emerald-300" : "text-white/35"}>
                  {telemetry.relay || telemetry.led1 ? "ON" : "OFF"}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {motors.map((motor) => (
                <div key={motor.key} className="rounded-2xl border border-white/8 bg-white/[.025] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">Motor {motor.number}</p>
                      <p className="mt-1 text-xs text-white/35">{motor.color} · {motor.pin}</p>
                    </div>
                    <Toggle checked={commands[motor.key]} disabled={writing !== null} onChange={(value) => updateCommand(motor.key, value)} />
                  </div>
                  <p className="mt-4 text-xs text-white/35">Hardware: <span className={telemetry[motor.key] ? "text-emerald-300" : "text-white/45"}>{telemetry[motor.key] ? "ON" : "OFF"}</span></p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3">
              <Radio className="text-emerald-300" size={21} />
              <h2 className="text-lg font-semibold">System</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <StatusRow label="Browser MQTT" value={mqttConnected ? "Connected" : "Disconnected"} good={mqttConnected} />
              <StatusRow label="ESP32" value={online ? "Online" : "Offline"} good={online} />
              <StatusRow label="Last command RTT" value={latency == null ? "—" : `${latency} ms`} good={latency != null && latency < 500} neutral={latency == null} />
              <StatusRow label="Sequence" value={String(telemetry.seq || 0)} neutral />
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/7 bg-white/[.025] p-3 text-xs text-white/38">
              {online ? <Wifi size={16} className="text-emerald-300" /> : <WifiOff size={16} className="text-red-300" />}
              Plan automation is separate from soil-relay automation.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusRow({ label, value, good, neutral }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/6 bg-white/[.02] px-3 py-3">
      <span className="text-white/40">{label}</span>
      <span className={neutral ? "text-white/65" : good ? "text-emerald-300" : "text-red-300"}>{value}</span>
    </div>
  );
}
