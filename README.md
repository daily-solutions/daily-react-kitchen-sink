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

## Remove participant demo (`?demo=remove-participant`)

Shows how to remove and mute participants in Daily Prebuilt WITHOUT the built-in
"Remove from call..." menu or its "may rejoin" notice.

How it works:

- The admin joins with a **non-admin** meeting token (no `canAdmin`). Because of
  that, Prebuilt never shows the built-in remove menu or the rejoin notice.
- A custom tray button (`updateCustomTrayButtons`) opens a small panel listing the
  other participants.
- Eject and mute run through a tiny dev-server proxy in `vite.config.ts`
  (`/api/eject`, `/api/mute`, `/api/session`). The proxy holds the Daily API key,
  so the key never ships to the browser.
- "Ask to mute" is the lighter, cooperative path: it sends an app message and the
  target's own client mutes itself with `setLocalAudio(false)`.

### Setup

Add your Daily API key to `.env.local`, server-side (no `VITE_` prefix so it is
never bundled):

```
DAILY_API_KEY=your-daily-api-key
```

If only `VITE_DAILY_API_KEY` is set, the proxy falls back to it, but the
un-prefixed key is the safer choice.

### Run it

1. `npm run dev`
2. Open two windows (use two profiles or one normal + one incognito so they are
   distinct participants):
   - Admin: <http://localhost:3000/?demo=remove-participant&admin=true>
   - Guest: <http://localhost:3000/?demo=remove-participant>
3. Join both, click **Manage participants** in the admin tray, then try Eject,
   Mute mic, Stop camera, Restore, and Ask to mute on the guest. Watch the console
   for `participant-left` / `participant-updated`, and the Network tab for the
   `/api/*` calls.

Add `&builtinAdmin=true` to an admin window to mint an admin token and SEE the
built-in remove menu + rejoin notice the customer is trying to avoid.

### Notes

- The proxy only runs under `npm run dev`, not `vite preview`.
- "Admin" here is app-level only (the `?admin=true` flag controls the UI). In
  production you would gate that behind your own auth and have your backend
  authorize the eject/mute calls. This demo is not an authorization model.
