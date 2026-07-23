# Daily React Kitchen Sink Demo

This project console logs every event listener for Daily React. This is a great
way to debug exactly what events are fired when trying to reproduce an issue.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

## Presence + webhooks demo

This branch shows how to keep a live roster of who is in your Daily rooms using
two sources together:

- The [`/presence` REST API](https://docs.daily.co/reference/rest-api/presence)
  for the snapshot on page load, plus a full reconcile every 10 seconds (the
  authoritative safety net).
- [Webhooks](https://docs.daily.co/reference/rest-api/webhooks) (`participant.joined`
  and `participant.left`) for the fast "in between" updates, pushed to the browser
  over a WebSocket so the roster changes within a second or two instead of waiting
  for the next poll.

Presence gives correctness; webhooks give speed. The panel tags each event with
its source (`webhook` or `presence`) so you can see the difference.

### How it fits together

```
Browser (PresencePanel)
  GET /api/presence   -> snapshot on load + reconcile every 10s
  WebSocket /ws       <- live joined/left pushed by the server
        |
Vite dev server  -- proxies /api and /ws -->  Node server (server/index.ts)
                                                holds DAILY_API_KEY, calls /presence
                                                POST /api/daily-webhook  <- Daily (via ngrok)
                                                verifies the hmac, 200 fast, broadcasts on /ws
```

The domain API key and the webhook hmac live only on the server. The browser
never talks to `api.daily.co` and never sees a secret.

The server files are TypeScript run directly by Node (v24+ strips types), so
there is no build step for the backend.

### Setup

1. Copy `.env.example` to `.env.local` and set `DAILY_API_KEY` to your domain key
   from [dashboard.daily.co/developers](https://dashboard.daily.co/developers).
   `.env.local` is gitignored.
2. Start the app and the backend together:
   ```
   npm run dev:all
   ```
   (or run `npm run server` and `npm run dev` in two terminals). Open
   [http://localhost:3000](http://localhost:3000). At this point the presence
   snapshot and 10s reconcile already work.
3. Expose the backend so Daily can reach it, and register the webhook:
   ```
   ngrok http 4000
   node server/register-webhook.ts --url https://<your-ngrok>.ngrok.app/api/daily-webhook
   ```
   Copy the `hmac` it prints into `.env.local` as `DAILY_WEBHOOK_HMAC`, then
   restart the server.
4. Join a room on your domain, then join the same room in a second tab. The roster
   updates within a second or two from a `webhook` event, and the 10s reconcile
   confirms it. Leave in one tab and a `left` event appears just as fast.
5. Clean up when done (webhooks are domain-wide and persist):
   ```
   node server/register-webhook.ts --list
   node server/register-webhook.ts --delete <uuid>
   ```

Note: this is a local dev setup (ngrok tunnel + Vite proxy). In production you
would run the receiver and WebSocket on your own backend.
