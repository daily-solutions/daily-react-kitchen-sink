# Daily React Kitchen Sink Demo

## Project Overview
A comprehensive Daily.js React demo showcasing video calling, audio processing, recording, screen sharing, and transcription features.

## Key Technologies
- React 19.1.1 with TypeScript
- The latest version of Daily.js with the latest version of Daily React
- Vite 5.2.11 for build tooling
- ESLint for code quality

## Main Features
- Video calling with device management
- Background blur/image processing
- Krisp noise cancellation with CPU monitoring
- Recording with mute/unmute functionality
- Screen sharing and transcription
- Remote media player support
- Real-time network quality monitoring

## Development Setup
```bash
npm install
npm run dev    # Development server
npm run build  # Production build
npm test       # ESLint checks
```

## Key Files
- `src/App.tsx` - Main application component with all Daily.js integrations
- `src/index.tsx` - React app entry point
- `vite.config.ts` - Vite configuration with HTTPS support
- `AGENTS.md` - Comprehensive development documentation

## Daily React Hooks Used
- useDaily, useDailyError, useDailyEvent
- useDevices, useInputSettings, useRecording
- useScreenShare, useTranscription, useParticipantIds
- useCPULoad, useNetwork, useMeetingState

## Architecture Notes
- All Daily events are logged for debugging
- Comprehensive error handling with user feedback
- Automatic CPU load monitoring for audio processing
- Device management with real-time switching
- Recording control with participant management

This project serves as a complete reference implementation for Daily.js React integration.
