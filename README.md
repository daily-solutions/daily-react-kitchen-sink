# Daily React Kitchen Sink Demo

This project console logs every event listener for Daily React. This is a great
way to debug exactly what events are fired when trying to reproduce an issue.

## Features

### Screen Share Send Settings Demo
This branch (`demo/screenshare-send-settings`) demonstrates how to configure screen share resolution and bitrate settings using Daily.js:

- **720p Screen Share**: 1280x720 resolution with optimized encoding layers
- **1080p Screen Share**: 1920x1080 resolution with high-quality settings  
- **Default Mode**: Uses Daily's motion-optimized preset

#### Implementation Details
- Uses `callObject.startScreenShare()` with custom `displayMediaOptions` and `screenVideoSendSettings`
- Configures simulcast layers for optimal bandwidth usage
- Provides real-time quality selection via dropdown interface
- Console logs show detailed configuration for each quality mode

#### Usage
1. Select desired screen share quality from the dropdown
2. Click "Start Screen Share" to begin with custom settings
3. Monitor console output to see the applied configuration
4. Compare bandwidth usage and visual quality between modes

## Available Scripts

In the project directory, you can run:

### `npm run dev`

Runs the app in development mode with host binding.\
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
