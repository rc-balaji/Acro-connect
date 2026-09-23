"use client";

import { useEffect, useMemo, useState } from "react";
import { onValue, query, limitToLast, orderByKey, ref, set } from "firebase/database";
import {
  Activity,
  CloudSun,
  Droplets,
  Gauge,
  Leaf,
  Radio,
  RefreshCw,
  ThermometerSun,
  Waves,
  Wifi,
  WifiOff,
  Zap
} from "lucide-react";
import { database } from "@/lib/firebase";
import { DEVICE_ID } from "@/lib/firebase-config";
import MetricCard from "@/components/MetricCard";
import Toggle from "@/components/Toggle";

const initialTelemetry = {
  temperature: 0,
  humidity: 0,
  soil: 0,
  waterLevel: 0,
  led1: false,
  led2: false,
  led3: false,
  led4: false,
  updatedAt: 0
};

function formatAge(ts) {
  if (!ts) return "No data yet";
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(ts).toLocaleString();
}

function healthText(soil, water) {
  if (water < 15) return "Tank water is low";
  if (soil < 30) return "Soil is dry — irrigation output active";
  if (soil < 45) return "Soil moisture is slightly low";
  return "Farm conditions look stable";
}

export default function Dashboard() {
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [commands, setCommands] = useState({ led2: false, led3: false, led4: false });
  const [history, setHistory] = useState([]);
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [writing, setWriting] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const telemetryRef = ref(database, `devices/${DEVICE_ID}/telemetry`);
    const statusRef = ref(database, `devices/${DEVICE_ID}/status`);
    const commandsRef = ref(database, `devices/${DEVICE_ID}/commands`);
    const historyRef = query(
      ref(database, `devices/${DEVICE_ID}/history`),
      orderByKey(),
      limitToLast(30)
    );

    const unsubTelemetry = onValue(
      telemetryRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setTelemetry((old) => ({ ...old, ...snapshot.val() }));
        }
        setError("");
      },
      (err) => setError(err.message)
    );

    const unsubStatus = onValue(statusRef, (snapshot) => {
      setLastSeen(snapshot.val()?.lastSeen || 0);
    });

    const unsubCommands = onValue(commandsRef, (snapshot) => {
      const value = snapshot.val() || {};
      setCommands({
        led2: Boolean(value.led2),
        led3: Boolean(value.led3),
        led4: Boolean(value.led4)
      });
    });

    const unsubHistory = onValue(historyRef, (snapshot) => {
      const value = snapshot.val() || {};
      const rows = Object.entries(value)
        .map(([timestamp, row]) => ({ timestamp: Number(timestamp), ...row }))
        .sort((a, b) => a.timestamp - b.timestamp);
      setHistory(rows);
    });

    return () => {
      unsubTelemetry();
      unsubStatus();
      unsubCommands();
      unsubHistory();
    };
  }, []);

  const online = lastSeen > 0 && now - lastSeen < 12000;

  const series = useMemo(() => ({
    temperature: history.map((x) => x.temperature),
    humidity: history.map((x) => x.humidity),
    soil: history.map((x) => x.soil),
    water: history.map((x) => x.waterLevel)
  }), [history]);

  async function updateCommand(key, value) {
    setWriting(key);
    setError("");
    try {
      await set(ref(database, `devices/${DEVICE_ID}/commands/${key}`), value);
    } catch (err) {
      setError(err.message);
    } finally {
      setWriting(null);
    }
  }

  return (
    <main className="grid-bg min-h-screen">
      <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-7 md:py-7">
        <header className="glass rounded-[28px] px-5 py-5 md:px-7 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-400 text-emerald-950 grid place-items-center shadow-[0_0_36px_rgba(52,211,153,.20)]">
              <Leaf size={25} strokeWidth={2.4} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight">AGRO CONNECT</h1>
                <span className="rounded-full border border-emerald-300/10 bg-emerald-300/5 px-2 py-1 text-[10px] tracking-[.18em] text-emerald-200/60">LIVE</span>
              </div>
              <p className="mt-1 text-sm text-emerald-50/42">AI-powered smart farming & crop monitoring</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-white/8 bg-white/[.035] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[.18em] text-emerald-50/35">Device</p>
              <p className="mt-1 text-sm font-medium">{DEVICE_ID}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[.035] px-4 py-3 min-w-[156px]">
              <p className="text-[10px] uppercase tracking-[.18em] text-emerald-50/35">Connection</p>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400 pulse-dot" : "bg-red-400"}`} />
                {online ? "Online" : "Offline"}
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-200">
            Firebase error: {error}
          </div>
        ) : null}

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<ThermometerSun size={21} />}
            label="Temperature"
            value={Number(telemetry.temperature || 0).toFixed(1)}
            unit="°C"
            hint="Live DHT22 temperature"
            history={series.temperature}
            accent="rose"
          />
          <MetricCard
            icon={<Droplets size={21} />}
            label="Humidity"
            value={Math.round(telemetry.humidity || 0)}
            unit="%"
            hint="Live atmospheric humidity"
            history={series.humidity}
            accent="blue"
          />
          <MetricCard
            icon={<Leaf size={21} />}
            label="Soil Moisture"
            value={Math.round(telemetry.soil || 0)}
            unit="%"
            hint="Potentiometer / moisture sensor"
            history={series.soil}
            accent="green"
          />
          <MetricCard
            icon={<Waves size={21} />}
            label="Water Level"
            value={Math.round(telemetry.waterLevel || 0)}
            unit="%"
            hint="HC-SR04 tank level"
            history={series.water}
            accent="blue"
          />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <div className="glass rounded-3xl p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-emerald-50/45">Field Control</p>
                <h2 className="mt-1 text-xl font-semibold">Outputs & irrigation channels</h2>
              </div>
              <Zap className="text-emerald-300/70" size={22} />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[.035] p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl grid place-items-center ${telemetry.led1 ? "bg-emerald-400 text-emerald-950" : "bg-white/5 text-white/35"}`}>
                    <Leaf size={19} />
                  </div>
                  <div>
                    <p className="font-medium">LED 1 · Soil Auto</p>
                    <p className="mt-1 text-xs text-emerald-50/35">ESP32 automation output · read only</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${telemetry.led1 ? "text-emerald-300" : "text-white/38"}`}>{telemetry.led1 ? "ON" : "OFF"}</p>
                  <p className="text-[10px] text-white/25">AUTO</p>
                </div>
              </div>

              {[2, 3, 4].map((number) => {
                const key = `led${number}`;
                return (
                  <div key={key} className="rounded-2xl border border-white/8 bg-white/[.025] p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl grid place-items-center ${telemetry[key] ? "bg-emerald-400 text-emerald-950" : "bg-white/5 text-white/35"}`}>
                        <Zap size={18} />
                      </div>
                      <div>
                        <p className="font-medium">LED {number}</p>
                        <p className="mt-1 text-xs text-emerald-50/35">Remote manual control</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs ${telemetry[key] ? "text-emerald-300" : "text-white/35"}`}>
                        HW {telemetry[key] ? "ON" : "OFF"}
                      </span>
                      <Toggle
                        checked={commands[key]}
                        disabled={writing === key}
                        onChange={(value) => updateCommand(key, value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass rounded-3xl p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-50/45">System Health</p>
                <h2 className="mt-1 text-xl font-semibold">Farm status</h2>
              </div>
              {online ? <Wifi className="text-emerald-300" /> : <WifiOff className="text-red-300" />}
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.035] p-4">
              <div className="flex gap-3">
                <Activity className="mt-0.5 text-emerald-300" size={19} />
                <div>
                  <p className="text-sm font-medium">{healthText(telemetry.soil, telemetry.waterLevel)}</p>
                  <p className="mt-1 text-xs text-emerald-50/35">Calculated from the latest device packet</p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-white/6 pb-3">
                <span className="text-white/35">Last device packet</span>
                <span>{formatAge(lastSeen)}</span>
              </div>
              <div className="flex justify-between border-b border-white/6 pb-3">
                <span className="text-white/35">History points</span>
                <span>{history.length}</span>
              </div>
              <div className="flex justify-between border-b border-white/6 pb-3">
                <span className="text-white/35">Transport</span>
                <span>HTTPS Webhook</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/35">Realtime layer</span>
                <span>Firebase RTDB</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="glass rounded-3xl p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-emerald-50/45">Recent Telemetry</p>
                <h2 className="mt-1 text-xl font-semibold">Latest sensor packets</h2>
              </div>
              <RefreshCw size={19} className="text-emerald-300/55" />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[660px] text-sm">
                <thead className="text-left text-xs uppercase tracking-[.12em] text-white/28">
                  <tr>
                    <th className="pb-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Temp</th>
                    <th className="pb-3 font-medium">Humidity</th>
                    <th className="pb-3 font-medium">Soil</th>
                    <th className="pb-3 font-medium">Water</th>
                    <th className="pb-3 font-medium">LED1</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(-7).reverse().map((row) => (
                    <tr key={row.timestamp} className="border-t border-white/5 text-emerald-50/72">
                      <td className="py-3">{new Date(row.timestamp).toLocaleTimeString()}</td>
                      <td>{Number(row.temperature || 0).toFixed(1)}°C</td>
                      <td>{Math.round(row.humidity || 0)}%</td>
                      <td>{Math.round(row.soil || 0)}%</td>
                      <td>{Math.round(row.waterLevel || 0)}%</td>
                      <td>{row.led1 ? "ON" : "OFF"}</td>
                    </tr>
                  ))}
                  {!history.length ? (
                    <tr><td colSpan="6" className="py-8 text-center text-white/30">No webhook data received yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-50/45">Integration</p>
                <h2 className="mt-1 text-xl font-semibold">Webhook ready</h2>
              </div>
              <Radio className="text-emerald-300" />
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-black/20 border border-white/6 p-4">
                <p className="text-[10px] uppercase tracking-[.14em] text-white/30">Telemetry + commands</p>
                <code className="mt-2 block break-all text-xs text-emerald-200">POST /api/webhook</code>
              </div>
              <div className="rounded-2xl bg-black/20 border border-white/6 p-4">
                <p className="text-[10px] uppercase tracking-[.14em] text-white/30">Commands only</p>
                <code className="mt-2 block break-all text-xs text-emerald-200">GET /api/commands</code>
              </div>
              <div className="rounded-2xl bg-black/20 border border-white/6 p-4">
                <p className="text-[10px] uppercase tracking-[.14em] text-white/30">Health check</p>
                <code className="mt-2 block break-all text-xs text-emerald-200">GET /api/health</code>
              </div>
            </div>
          </div>
        </section>

        <footer className="py-7 flex flex-col sm:flex-row gap-3 sm:items-center justify-between text-xs text-white/25">
          <span>AGRO CONNECT · Smart Farming Prototype</span>
          <span className="flex items-center gap-2"><CloudSun size={14} /> Firebase RTDB + Next.js + Vercel</span>
        </footer>
      </div>
    </main>
  );
}
