# Daily React Kitchen Sink Demo

This project console logs every event listener for Daily React. This is a great
way to debug exactly what events are fired when trying to reproduce an issue.

## 🎣 Daily Recording Webhooks Demo

This project now includes a **Daily Recording Webhooks Demo** that demonstrates how to handle Daily's recording webhooks. When you run the development server, it automatically starts:

- **React App** on http://localhost:3000 (Daily video call interface)
- **Webhook Server** on http://localhost:4000 (Handles recording webhooks)

### Webhook Endpoints

- `POST /webhooks/recording-ready` - Handles `recording.ready-to-download` events
- `POST /webhooks/recording-error` - Handles `recording.error` events  
- `POST /webhooks/test` - General webhook verification endpoint
- `GET /health` - Health check endpoint

### Quick Start

1. Install dependencies: `npm install`
2. Start the demo: `npm run dev` 
3. Open http://localhost:3000 in your browser
4. Join a Daily room and start a recording to see webhook events logged in the console

For detailed webhook setup instructions, see [WEBHOOK_DEMO.md](./WEBHOOK_DEMO.md)

## Available Scripts

In the project directory, you can run:

### `npm run dev`

Runs the app in development mode with webhook server.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.\
Webhook server runs on [http://localhost:4000](http://localhost:4000).

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
