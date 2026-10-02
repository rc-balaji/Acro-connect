# Do this first

1. Push this folder to the existing `Acro-connect` GitHub repository and let Vercel deploy it.
2. Open the deployed site and confirm Dashboard + Plan pages load.
3. Deploy `cloudflare-scheduler/` using its README.
4. Set the same `SCHEDULER_SHARED_SECRET` in Cloudflare and Vercel.
5. Set the deployed Worker URL as `SCHEDULER_BASE_URL` in Vercel.
6. Redeploy Vercel.
7. Open **Plan**. Badge must show **Scheduler ready**.
8. Select a motor -> **Quick test**. It starts in ~20 seconds and stops 5 seconds later.

No Vercel cron is used. No schedule/NTP code is needed on ESP32.
