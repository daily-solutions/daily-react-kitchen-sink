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

## Presence API demo

This branch adds a small panel that shows who is in your Daily rooms using the
[`/presence` REST API](https://docs.daily.co/reference/rest-api/presence) instead
of `participant.joined` / `participant.left` webhooks.

It polls `/presence` every 15 seconds, lists the 10 most recently active rooms
with their participants, and derives "joined" / "left" events by comparing each
snapshot to the last one. That diff is the direct replacement for the two
participant webhooks.

The Presence API needs your domain API key, and that key must never be in browser
code. So the request goes to `/api/presence`, which the Vite dev server proxies to
`api.daily.co` with the `Authorization` header added server-side (see
`vite.config.ts`). The key is never bundled into the client.

### Setup

1. Copy `.env.example` to `.env.local` and set `DAILY_API_KEY` to your domain key
   from [dashboard.daily.co/developers](https://dashboard.daily.co/developers).
   `.env.local` is gitignored.
2. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).
3. Join a room on that domain. Open the same room (or another room) in a second
   tab or device.
4. Within ~15 seconds the panel shows the rooms and their participants, and the
   events feed logs a `joined` event. Leave in one tab and a `left` event appears.
   The same events also print to the browser console.

Note: this is a dev-server pattern. In production you would call `/presence` from
your own backend.
