# Daily React Kitchen Sink Demo

This project console logs every event listener for Daily React. This is a great
way to debug exactly what events are fired when trying to reproduce an issue.

## Deployment

Deployed on Vercel: https://daily-react-kitchen-sink.vercel.app

Every branch push gets a preview deployment, and every PR gets a preview URL
comment from the Vercel bot. Production tracks `main`.

### Serverless API routes

The `api/` folder holds Vercel serverless functions. They keep the Daily API
key off the client: `api/token.ts` mints meeting tokens and `api/eject.ts`
removes and bans a participant.

Set `DAILY_API_KEY` (no `VITE_` prefix, so Vite never bundles it) in the
Vercel project settings, and in `.env.local` for local runs. The plain Vite
dev server does not serve `api/`, so run the app with `npx vercel dev` when
you need those routes.

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
