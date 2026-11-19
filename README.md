# Daily React Kitchen Sink Demo

This project console logs every event listener for Daily React. This is a great
way to debug exactly what events are fired when trying to reproduce an issue.

## Deployment

Deployed on Vercel: https://daily-react-kitchen-sink.vercel.app

Every branch push gets a preview deployment, and every PR gets a preview URL
comment from the Vercel bot. Production tracks `main`.

## Branded URL demo: Daily Prebuilt on your own domain

Want links like `https://video.example.com/my-room` instead of
`https://your-domain.daily.co/my-room`? Host this app on your domain. Any path
is treated as a room name and opens that Daily room in a full-page Prebuilt
iframe (see `src/BrandedPrebuilt.tsx`). Nothing about Prebuilt changes.

1. Set `VITE_DAILY_DOMAIN=your-domain` in `.env.local`. If it is unset or blank, it defaults to `hush`.
2. `npm run dev`, then open `http://localhost:3000/<room-name>`.
3. Private room? Add the meeting token: `/<room-name>?t=<token>`.

When you deploy, your host must serve `index.html` for every path (SPA
fallback). On Vercel that is a rewrite of `/(.*)` to `/index.html`.

Note: the browser shows your domain, but the call still runs on
`your-domain.daily.co`. Daily's logs and dashboard will show the Daily room URL.

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
