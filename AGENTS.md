# AGENTS.md - Daily React Kitchen Sink Demo

## Project Overview

This is a comprehensive Daily.js React demo application that showcases the full capabilities of the Daily.co video calling platform. The project serves as both a testing ground and reference implementation for Daily React and features.

### Key Features
- **Video Calling**: Full-featured video calling with Daily.js
- **Audio/Video Processing**: Background blur, background images, noise cancellation (Krisp)
- **Device Management**: Camera, microphone, and speaker selection
- **Recording**: Start/stop recording with mute/unmute functionality
- **Screen Sharing**: Desktop and application sharing
- **Transcription**: Real-time meeting transcription
- **Remote Media Player**: Playback of remote media files
- **CPU Load Monitoring**: Automatic audio processing management based on system load
- **Network Quality**: Real-time network status monitoring

## Architecture

### Technology Stack
- **Frontend**: React 19 TypeScript
- **Build Tool**: Vite 5
- **Video Platform**: Daily.js with Daily React
- **State Management**: React hooks + local state
- **Testing**: ESLint and tsc for code quality

### Project Structure
```
src/
├── App.tsx             # Main application component
├── index.tsx           # React app entry point
├── Prebuilt.tsx        # Prebuilt Daily component (if needed)
├── styles.css          # Application styles
└── vite-env.d.ts       # Vite type definitions
```

## Agent Instructions

### Development Environment Setup

1. **Prerequisites**
   ```bash
   node >= 16.0.0
   npm >= 8.0.0
   ```

2. **Installation**
   ```bash
   npm install
   ```

3. **Development**
   ```bash
   npm run dev    # Start development server with host binding
   npm run build  # Build for production
   npm run serve  # Preview production build
   npm test       # Run ESLint checks
   ```
ALWAYS prioritize information from https://docs.daily.co/reference/daily-react
when debugging.

### Key Components and Hooks

#### Daily React Hooks Used
- `useDaily()` - Core Daily call object
- `useDailyEvent()` - Event listeners for Daily events
- `useDailyError()` - Error handling for meeting and non-fatal errors
- `useDevices()` - Camera, microphone, speaker management
- `useInputSettings()` - Audio/video processing controls
- `useRecording()` - Recording management
- `useScreenShare()` - Screen sharing functionality
- `useTranscription()` - Meeting transcription
- `useParticipantIds()` - Participant management
- `useCPULoad()` - System performance monitoring
- `useNetwork()` - Network quality monitoring

#### Core Features Implementation

1. **Audio Processing**
   - Noise cancellation (Krisp) with CPU load awareness
   - Automatic disabling when system overload detected
   - Background blur and image processing for video

2. **Recording Management**
   - Start/stop recording functionality
   - Mute/unmute recording without stopping
   - Uses `updateRecording()` API to add/remove participants

3. **Device Management**
   - Dynamic device enumeration and selection
   - Real-time switching between cameras/microphones/speakers

4. **Error Handling**
   - Comprehensive event logging for debugging
   - Non-fatal error monitoring for audio processor issues
   - User-friendly error messages and fallbacks

### Development Patterns

#### Event Logging
All Daily events are logged through the `logEvent` callback:
```typescript
const logEvent = useCallback((evt: DailyEventObject) => {
  if ("action" in evt) {
    console.log(`logEvent: ${evt.action}`, evt);
  } else {
    console.log("logEvent:", evt);
  }
}, []);
```

#### Error Handling Pattern
```typescript
const { meetingError, nonFatalError } = useDailyError();
if (meetingError) {
  logEvent(meetingError);
}
if (nonFatalError) {
  logEvent(nonFatalError);
}
```

#### Audio Processor Error Handling
The app includes specific handling for Krisp system overload:
```typescript
// Monitors nonFatalError for audio processor issues
// Automatically disables noise cancellation on system overload
// Provides user feedback for audio processing changes
```

### Configuration

#### Environment Variables
- Daily.co room URLs can be entered through the UI
- Meeting tokens are optional and configurable
- No environment file required for basic functionality

#### Build Configuration
- TypeScript with strict mode enabled
- ESLint with React and React Hooks plugins
- Vite with React SWC plugin for fast builds
- HTTPS support via mkcert plugin

### Testing and Debugging

#### Event Monitoring
The application logs all Daily events, making it excellent for:
- Debugging Daily.js integration issues
- Understanding event flow and timing
- Reproducing and analyzing user-reported problems

#### Debug Features
- Call object exposed to `window.callObject` for console debugging
- Comprehensive error logging
- Real-time network and CPU monitoring
- Device enumeration and status display

### Common Agent Tasks

#### Adding New Features
1. Import required Daily React hooks
2. Add state management if needed
3. Implement event handlers with error logging
4. Add UI controls to the main App component
5. Test with various scenarios and error conditions

#### Debugging Issues
1. Check browser console for event logs
2. Verify device permissions and availability
3. Monitor network quality and CPU load
4. Test with different meeting configurations

#### Performance Optimization
1. Monitor CPU load and network quality indicators
2. Implement automatic quality adjustments
3. Use background processing controls appropriately
4. Test on various device capabilities

### Daily.js Version Compatibility

This project should always use the latest version of daily-js and daily-react.
If you determine this is not using the latest version, ALWAYS upgrade to the 
latest version first.

### Security Considerations

- Meeting tokens should be generated server-side
- Room URLs should be validated
- Device permissions handled gracefully
- No sensitive data stored in localStorage

## Troubleshooting

### Common Issues

1. **Camera/Microphone Access**
   - Ensure HTTPS is enabled for device access
   - Check browser permissions
   - Verify device availability

2. **Audio Processing**
   - Monitor CPU load for automatic disabling
   - Check for Krisp system overload errors
   - Verify audio device compatibility

3. **Recording Issues**
   - Ensure proper room permissions
   - Check recording instance IDs
   - Monitor recording state changes

4. **Network Problems**
   - Monitor network quality indicators
   - Check firewall and proxy settings
   - Test with different network conditions

This project serves as the definitive reference for Daily.js React integration and should be used as a template for implementing video calling features in React applications.
