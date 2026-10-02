# AGRO CONNECT — Next.js + Firebase + MQTT + Plan

Complete web/server build for the AGRO CONNECT prototype.

## Architecture

- ESP32 / MicroPython -> MQTT broker (`broker.emqx.io`)
- Web dashboard -> MQTT WebSocket for realtime telemetry/manual motor controls
- **Plan** page -> Next.js API -> Firebase Realtime Database
- Vercel Cron -> `/api/cron/schedules` -> MQTT -> Motor 1/2/3
- Soil moisture automatic relay remains fully independent and is not scheduled.

## Motor mapping

- Motor 1 -> `led2` -> D14 Green indicator
- Motor 2 -> `led3` -> D23 Orange indicator
- Motor 3 -> `led4` -> D22 Red indicator
- Automatic soil relay -> D25 (not controlled by Plan)

## Plan behavior

A plan stores:
- motor 1/2/3
- start date
- start time (IST / Asia-Kolkata)
- duration in minutes
- one date only / daily / selected weekdays
- optional end date
- enabled / disabled

At the start time, the selected motor turns ON. At `start + duration`, it turns OFF.

## Firebase paths

```text
devices/AGRO-001/
  schedules/<planId>/...
  scheduleExecutions/<executionId>/...
  commands/led2|led3|led4
```

The execution ID is deterministic per plan occurrence and phase. Firebase ETag claims are used so duplicate cron invocations do not normally fire the same occurrence twice.

## Conflict checking

When creating or editing an enabled plan, the server checks the next 90 days for overlapping plans on the same motor. A conflict returns HTTP 409.

## Deploy

```bash
npm install
npm run dev
```

Push the whole folder to GitHub and deploy it on Vercel.

`vercel.json` requests a once-per-minute cron:

```json
{
  "crons": [{ "path": "/api/cron/schedules", "schedule": "* * * * *" }]
}
```

The scheduler uses a 5-minute catch-up window. Exact scheduler frequency depends on what your Vercel plan permits. If Vercel rejects a 1-minute cron, use a Vercel tier that permits it or call `/api/cron/schedules` every minute from a scheduler service.

### Optional cron protection

Set a Vercel environment variable:

```text
CRON_SECRET=some-random-value
```

When configured, `/api/cron/schedules` accepts only `Authorization: Bearer <CRON_SECRET>`.

## Firebase

This repo uses the existing Realtime Database:

`agro-connect-29b39-default-rtdb.asia-southeast1.firebasedatabase.app`

For this prototype the existing public Firebase rules can continue to work. Do not use open rules for a production deployment.

## Endpoints

- `GET /api/health`
- `GET /api/schedules`
- `POST /api/schedules`
- `PATCH /api/schedules/:id`
- `DELETE /api/schedules/:id`
- `GET /api/cron/schedules`
- `GET /api/commands`
- `POST /api/webhook`

## ESP32 requirement

The current MicroPython callback must accept partial or full `led2/led3/led4` command fields and publish an ACK to the state topic using `ackCommandId`. The current AGRO CONNECT code already follows that model.
