# AGRO CONNECT - Next.js + Firebase + MQTT + Server-side Plan Scheduler

This ZIP is the complete web/server build for the current AGRO CONNECT prototype.

It keeps the existing realtime dashboard and adds a **Plan** tab for server-side Motor 1/2/3 schedules with date, `HH:MM:SS`, duration in seconds, one-time/daily/selected-day repeats, edit, duplicate, enable/disable, delete, overlap checking, quick testing, and automatic START/STOP execution.

## Final architecture

```text
Manual control
Web / Flutter -> MQTT desired -> ESP32 -> Motor LED 1/2/3

Plan control
Web / Flutter -> Next.js API -> Firebase RTDB
                            -> Cloudflare Durable Object Alarm
                            -> exact START/STOP callback to Next.js
                            -> MQTT desired -> ESP32 -> Motor LED 1/2/3

Soil automation
Soil D34 -> ESP32 local logic -> Relay D25
```

**Plan never controls Relay D25.** The soil-moisture relay automation remains independent on the ESP32.

## Motor mapping

```text
Motor 1 -> MQTT led2 -> D14 Green
Motor 2 -> MQTT led3 -> D23 Orange
Motor 3 -> MQTT led4 -> D22 Red
```

## Database

Firebase Realtime Database is still the only application database.

```text
devices/
  AGRO-001/
    commands/
      led2
      led3
      led4

    schedules/
      plan_xxx/
        title
        motor
        date
        time              # HH:MM:SS
        durationSec
        repeat            # once | daily | weekly
        weekdays          # 0..6 for selected-day repeat
        endDate
        enabled
        timezone          # Asia/Kolkata
        schedulerStatus
        lastTriggeredAt
        lastResult
        lastPhase

    scheduleExecutions/
      <schedule_occurrence_phase>/
        motor
        phase             # start | stop
        scheduledFor
        status
        commandId
        acknowledged
        latencyMs
```

The Cloudflare Durable Object has tiny internal alarm state only. It is an execution timer, not a replacement app database.

## Plan UX

Open **Plan** from the top navigation.

- `Create new` first asks which motor you want to schedule.
- Selecting Motor 1/2/3 filters the Google-Calendar-style month view to that motor.
- Clicking a calendar day opens the editor with that date preselected.
- Start time accepts seconds (`HH:MM:SS`).
- Duration is stored in seconds; quick values include 10s, 30s, 1m, 5m and 15m.
- Repeat: this date only, every day, or selected weekdays.
- Optional end date for recurring plans.
- Edit, duplicate, enable/disable and delete are included.
- Same-motor overlaps are rejected before saving.
- `Quick test` creates a one-time plan about 20 seconds in the future and runs the selected motor for 5 seconds.

## Accuracy model

There is no polling cron and no ESP32 schedule/NTP code.

The schedule engine uses Cloudflare Durable Object alarms with an epoch-millisecond alarm timestamp. The alarm calls the Next.js API at START, then arms another alarm for `durationSec` later and calls the API again for STOP.

This is appropriate for this prototype and is much more precise than a once-per-minute free cron. It is still cloud infrastructure, so it is not a hard real-time/industrial safety controller.

## 1. Run Next.js locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
http://localhost:3000/plan
```

Without the Cloudflare environment variables, the dashboard works but creating an enabled Plan will report that the scheduler has not been configured.

## 2. Push the Next.js project to GitHub / Vercel

This folder can replace the current repository root.

```bash
git add .
git commit -m "Add server-side motor Plan scheduler"
git push
```

Vercel should detect Next.js automatically.

There is **no Vercel Cron** in this project.

## 3. Deploy the free schedule engine

The included folder is:

```text
cloudflare-scheduler/
```

Follow `cloudflare-scheduler/README.md`.

In short:

```bash
cd cloudflare-scheduler
npm install
npx wrangler login
npx wrangler secret put SCHEDULER_SHARED_SECRET
npm run deploy
```

If your Vercel production domain differs from `https://acro-connect.vercel.app`, edit `cloudflare-scheduler/wrangler.jsonc` first.

## 4. Add Vercel environment variables

After Cloudflare deploys, copy the Worker URL and set these in Vercel:

```text
SCHEDULER_BASE_URL=https://agro-connect-scheduler.<your-subdomain>.workers.dev
SCHEDULER_SHARED_SECRET=<same secret used in Cloudflare>
```

Redeploy Vercel.

Do not commit the real secret. `.env.example` contains placeholders only.

## 5. Verify

Health checks:

```text
GET /api/health
GET /api/scheduler/status
```

In the browser:

1. Open `Plan`.
2. Confirm the badge shows `Scheduler ready`.
3. Select Motor 1, 2 or 3.
4. Press `Quick test`.
5. Wait around 20 seconds.
6. The selected motor indicator should turn ON.
7. Five seconds later it should turn OFF.
8. Firebase `scheduleExecutions` records START and STOP results/ACK information.

## MQTT behavior

The schedule server uses the same MQTT contract as the manual dashboard:

```text
Broker: broker.emqx.io
WebSocket: wss://broker.emqx.io:8084/mqtt
Device: AGRO-001
Desired: agroconnect/AGRO-001/desired
State/ACK: agroconnect/AGRO-001/state
```

Before changing one scheduled motor, the server listens for retained `desired` and `state` packets so it preserves the other two motor states. It changes only the target motor and publishes the complete `led2/led3/led4` desired state.

## Reliability details included

- Firebase overlap checking for the same motor.
- Cloudflare alarm is one future wake-up per schedule; no minute polling.
- START and STOP are separate idempotent occurrences.
- Firebase ETag claim prevents an at-least-once alarm retry from executing the same occurrence twice after completion.
- MQTT command uses a unique command ID and waits for the ESP32 `ackCommandId`.
- Execution result is logged in Firebase.
- Schedule edit/disable/delete re-arms or cancels the Durable Object alarm.
- If a plan is edited/disabled/deleted while its scheduled motor is in the ON window, the scheduler sends a cleanup OFF command first.
- Manual and scheduled commands use the same MQTT `desired` topic and state model.

## Prototype note

The current Firebase configuration and public EMQX broker are appropriate for your exhibition/prototype setup. Before a real farm deployment, use authenticated/private MQTT and restricted Firebase rules.
