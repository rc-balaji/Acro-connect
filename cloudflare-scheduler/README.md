# AGRO CONNECT - Cloudflare Schedule Engine

This tiny Worker is the exact-time execution engine for the AGRO CONNECT **Plan** feature.

It does **not** replace Firebase. Firebase Realtime Database remains the application database and source of truth. The Durable Object stores only the minimum alarm state required to sleep and wake at the requested future timestamp.

## Why this exists

Vercel hosts the Next.js website/API, but the free Vercel cron tier is not suitable for arbitrary second-level motor schedules. Cloudflare Durable Object alarms accept future epoch timestamps in milliseconds, so the Worker can wake up at the planned start and stop times without polling every minute.

## Deploy

1. Make sure the Next.js project is already deployed on Vercel.
2. If your Vercel URL is not `https://acro-connect.vercel.app`, edit `NEXT_API_BASE_URL` in `wrangler.jsonc`.
3. Install and log in:

```bash
cd cloudflare-scheduler
npm install
npx wrangler login
```

4. Create one long random secret. Example:

```bash
openssl rand -hex 32
```

5. Add that secret to Cloudflare:

```bash
npx wrangler secret put SCHEDULER_SHARED_SECRET
```

Paste the generated secret when Wrangler asks.

6. Deploy:

```bash
npm run deploy
```

Wrangler prints a URL similar to:

```text
https://agro-connect-scheduler.<your-subdomain>.workers.dev
```

7. In Vercel -> Project -> Settings -> Environment Variables add:

```text
SCHEDULER_BASE_URL=https://agro-connect-scheduler.<your-subdomain>.workers.dev
SCHEDULER_SHARED_SECRET=<the exact same secret>
```

8. Redeploy the Vercel project.

## Test

Open:

```text
https://<worker-url>/health
```

Then open the web app -> **Plan**. The top badge should say **Scheduler ready**.

Select one motor and press **Quick test**. The app creates a one-time plan that starts in about 20 seconds and stops after 5 seconds.

## Execution model

For a plan such as:

```text
Motor 2
19:30:15 IST
45 seconds
```

The Worker stores one alarm for the START timestamp. When START fires it calls the Vercel API, which publishes the same MQTT command shape used by manual control. The Worker then sets its next alarm for 45 seconds later. STOP calls the same API again with Motor 2 OFF.

Editing, disabling, or deleting a plan while its scheduled motor is currently ON sends a cleanup STOP before cancelling/replacing the alarm, preventing a motor from being left ON.
