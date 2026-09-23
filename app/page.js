useEffect(() => {
  let disposed = false;
  let client = null;

  const browserClientId =
    "AGRO_CONNECT_WEB_" + Math.random().toString(16).slice(2, 10);

  console.log("[MQTT] Connecting:", MQTT_WS_URL);

  try {
    client = mqttConnect(MQTT_WS_URL, {
      clientId: browserClientId,

      clean: true,

      keepalive: 30,

      connectTimeout: 10000,

      reconnectPeriod: 1000,

      resubscribe: true,

      protocolVersion: 4,
    });

    mqttClientRef.current = client;

    // ======================================================
    // CONNECT
    // ======================================================

    client.on("connect", () => {
      if (disposed) return;

      console.log("[MQTT] Dashboard connected");

      setMqttConnected(true);

      setError("");

      client.subscribe(MQTT_TOPICS.telemetry, {
        qos: 0,
      });

      client.subscribe(MQTT_TOPICS.state, {
        qos: 1,
      });

      client.subscribe(MQTT_TOPICS.status, {
        qos: 1,
      });

      client.subscribe(MQTT_TOPICS.desired, {
        qos: 1,
      });
    });

    // ======================================================
    // RECONNECT
    // ======================================================

    client.on("reconnect", () => {
      if (disposed) return;

      console.log("[MQTT] Reconnecting...");

      setMqttConnected(false);
    });

    // ======================================================
    // CLOSE
    // ======================================================

    client.on("close", () => {
      if (disposed) return;

      console.log("[MQTT] Connection closed");

      setMqttConnected(false);
    });

    // ======================================================
    // OFFLINE
    // ======================================================

    client.on("offline", () => {
      if (disposed) return;

      setMqttConnected(false);
    });

    // ======================================================
    // ERROR
    // ======================================================

    client.on("error", (err) => {
      if (disposed) return;

      console.error("[MQTT ERROR]", err);

      setError(err?.message || "MQTT connection error");
    });

    // ======================================================
    // MESSAGE
    // ======================================================

    client.on("message", (topic, payload) => {
      if (disposed) return;

      let data;

      try {
        data = JSON.parse(payload.toString());
      } catch (err) {
        console.error("[MQTT] Invalid JSON", err);

        return;
      }

      // ==================================================
      // TELEMETRY
      // ==================================================

      if (topic === MQTT_TOPICS.telemetry) {
        const packet = {
          ...initialTelemetry,

          ...data,

          receivedAt: Date.now(),
        };

        setTelemetry((previous) => ({
          ...previous,
          ...packet,
        }));

        setLastSeen(Date.now());

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

      // ==================================================
      // STATE / ACK
      // ==================================================

      if (topic === MQTT_TOPICS.state) {
        setTelemetry((previous) => ({
          ...previous,

          led1: Boolean(data.led1),

          led2: Boolean(data.led2),

          led3: Boolean(data.led3),

          led4: Boolean(data.led4),
        }));

        if (data.ackCommandId) {
          const commandId = data.ackCommandId;

          const startedAt = pendingCommandsRef.current.get(commandId);

          if (startedAt !== undefined) {
            const latency = performance.now() - startedAt;

            setLatencyMs(Math.round(latency));

            pendingCommandsRef.current.delete(commandId);

            setLastCommandId(commandId);

            console.log("[MQTT RTT]", Math.round(latency), "ms");
          }
        }

        return;
      }

      // ==================================================
      // DESIRED
      // ==================================================

      if (topic === MQTT_TOPICS.desired) {
        setCommands({
          led2: Boolean(data.led2),

          led3: Boolean(data.led3),

          led4: Boolean(data.led4),
        });

        return;
      }

      // ==================================================
      // STATUS
      // ==================================================

      if (topic === MQTT_TOPICS.status) {
        setDeviceOnline(Boolean(data.online));
      }
    });
  } catch (err) {
    console.error("[MQTT STARTUP ERROR]", err);

    setError(err?.message || "MQTT startup failed");
  }

  // ========================================================
  // CLEANUP
  // ========================================================

  return () => {
    disposed = true;

    if (client) {
      try {
        client.removeAllListeners();

        client.end(true);
      } catch (err) {
        console.warn("[MQTT CLEANUP]", err);
      }
    }

    if (mqttClientRef.current === client) {
      mqttClientRef.current = null;
    }
  };
}, []);
