# AGRO CONNECT — Firebase + Next.js Dashboard

Deploy-ready realtime smart-farming dashboard for one ESP32/Wokwi prototype.

## Architecture

ESP32/Wokwi -> HTTPS POST -> Vercel `/api/webhook` -> Firebase Realtime Database -> Dashboard realtime listener

Dashboard -> Firebase command values -> ESP32 receives commands from `/api/webhook` response or `/api/commands`

There is intentionally **no login, no API key, no device secret, and no protected database rule** in this prototype build.

## 1. Create Realtime Database

Firebase Console -> Build -> Realtime Database -> Create Database.

Choose a database location and create it.

Copy the exact database URL shown at the top of the Realtime Database Data screen.

Open:

`lib/firebase-config.js`

Check this line:

```js
databaseURL: "https://agro-connect-29b39-default-rtdb.firebaseio.com"
```

If Firebase shows a different URL, replace that line with the exact URL from the console.

## 2. Open the database rules

Firebase Console -> Realtime Database -> Rules

Paste:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Click **Publish**.

These rules make the entire database publicly readable/writable. This is intentional for this demo/prototype. Do not use these rules for a public production system.

## 3. Optional initial data

You do not need to manually create database records. The webhook and dashboard will create them.

If you want initial values, the file is:

`firebase/sample-data.json`

## 4. Run locally

```bash
npm install
npm run dev
```

Open:

`http://localhost:3000`

## 5. Push to GitHub

```bash
git init
git add .
git commit -m "AGRO CONNECT dashboard"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 6. Deploy on Vercel

- Log into Vercel
- Add New -> Project
- Import the GitHub repository
- Framework should detect **Next.js** automatically
- No environment variables are required
- Deploy

After deployment, test:

`https://YOUR-VERCEL-URL.vercel.app/api/health`

You should receive JSON with `ok: true`.

## 7. Test webhook manually

Send POST to:

`https://YOUR-VERCEL-URL.vercel.app/api/webhook`

JSON body:

```json
{
  "temperature": 28.4,
  "humidity": 65,
  "soil": 42,
  "waterLevel": 76,
  "led1": false,
  "led2": false,
  "led3": false,
  "led4": false
}
```

The response also returns the latest dashboard commands:

```json
{
  "ok": true,
  "deviceId": "AGRO-001",
  "commands": {
    "led2": false,
    "led3": true,
    "led4": false
  }
}
```

This means the same ESP32 request can upload sensor data and receive LED commands.

## 8. ESP32 integration endpoints

### Send telemetry and receive commands

`POST https://YOUR-VERCEL-URL.vercel.app/api/webhook`

### Read commands only

`GET https://YOUR-VERCEL-URL.vercel.app/api/commands`

### Health check

`GET https://YOUR-VERCEL-URL.vercel.app/api/health`

## Data structure

```text
devices/
  AGRO-001/
    telemetry/
      temperature
      humidity
      soil
      waterLevel
      led1
      led2
      led3
      led4
      updatedAt

    commands/
      led2
      led3
      led4

    status/
      online
      lastSeen

    history/
      <timestamp>/...
```

LED1 is intentionally read-only in the web dashboard. It is controlled by the ESP32 soil-moisture automation.

LED2, LED3, and LED4 are remotely controlled from the dashboard.

## Next step

After Vercel deployment, send the deployed base URL. The existing Wokwi MicroPython code can then be updated to:

1. connect to Wi-Fi,
2. POST temperature/humidity/soil/water/LED state to `/api/webhook`,
3. read the returned LED2/3/4 commands,
4. apply those commands to the ESP32 GPIO outputs,
5. continue showing DHT, soil and water values on the LCD.
