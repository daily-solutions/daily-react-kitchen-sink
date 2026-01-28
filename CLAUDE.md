# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Daily.js React demo that logs every Daily event to the console, useful for debugging and understanding event flow. Serves as a reference implementation for Daily React integration.

## Commands

```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # TypeScript check + Vite production build
npm run serve    # Preview production build
npm test         # Run ESLint checks
```

## Architecture

**Single-component architecture**: The main application logic lives in `src/App.tsx`, which demonstrates all Daily.js features in one file. This is intentional - it serves as a comprehensive reference rather than a production-ready architecture.

**DailyProvider pattern**: The app is wrapped with `<DailyProvider>` in `src/index.tsx`, which provides the Daily call object and hooks to the entire component tree.

**Prebuilt alternative**: Access `?prebuilt=true` to use Daily's prebuilt iframe UI instead of the custom implementation.

## Daily React Integration Patterns

Always prefer Daily React hooks over direct event listeners:
- `useDailyError()` for errors (not `useDailyEvent("error")`)
- `useDevices()` for camera/mic/speaker management
- `useInputSettings()` for audio/video processing (blur, background, Krisp)
- `useRecording()`, `useScreenShare()`, `useTranscription()` for features

**Event logging**: All Daily events must be logged through the `logEvent` callback pattern:
```typescript
const logEvent = useCallback((evt: DailyEventObject) => {
  if ("action" in evt) {
    console.log(`logEvent: ${evt.action}`, evt);
  } else {
    console.log("logEvent:", evt);
  }
}, []);
```

**CPU-aware audio processing**: Krisp noise cancellation monitors CPU load and automatically disables when system is overloaded. Handle `nonFatalError` events for audio processor issues.

**Debugging**: Call object is exposed to `window.callObject` for console debugging.

## Important Guidelines

- Always upgrade to latest daily-js and daily-react versions before making changes
- Reference https://docs.daily.co/reference/daily-react when debugging
- Use Daily's [Network Test](https://network-test-v2.daily.co/) for connection issues
- Handle async Daily operations with `.catch()` blocks
