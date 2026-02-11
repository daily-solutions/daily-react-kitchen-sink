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

## Code Style & Patterns

- Use strict TypeScript with proper typing and explicit return types for complex functions
- Use functional components with hooks; prefer `useCallback` for event handlers
- Implement proper dependency arrays for `useCallback` and `useEffect`
- Handle async operations with proper `.catch()` blocks
- Don't use direct Daily event listeners when hooks are available
- Avoid blocking UI operations during async Daily.js calls

## Important Guidelines

- Always upgrade to latest daily-js and daily-react versions before making changes
- Always use the `daily-docs` MCP tool (`ask_daily_question`) to search Daily documentation instead of referencing docs.daily.co URLs directly
- Use Daily's [Network Test](https://network-test-v2.daily.co/) for connection issues
- Generate meeting tokens server-side; avoid storing sensitive data in localStorage
- Use `window.callObject` for console debugging

## Analyzing Daily Call Quality Logs (CSV)

When analyzing exported CSV log files from Daily's Dashboard or `/logs` API:

### Video Quality Issues
- **`[Track]-videoQualityLimReason`**: Look for `bandwidth`, `cpu`, or `other` values
- **`[Track]-videoSendFrame`**: Current video resolution being sent
- **`videoEncoderImpl=ExternalEncoder`**: May indicate hardware acceleration issues

### Network Issues
- **`Connection downlink`**: Values below 3 Mbps indicate poor network conditions
- **`wss is stale`**: Signaling connection issues
- **`network-connection interrupted`**: Repeated occurrences suggest network or CPU issues

### CPU/Device Constraints
- **`deviceMemory`**: Values of 2 or below indicate insufficient RAM
- **`framesEncodedPerSec`**: Low values indicate encoder struggles

### Reference Documentation
- [Logging and Metrics Guide](https://docs.daily.co/guides/architecture-and-monitoring/logging-and-metrics)
- [Corporate Firewalls Guide](https://docs.daily.co/guides/privacy-and-security/corporate-firewalls-nats-allowed-ip-list)

## Network Configuration Troubleshooting

### Required Hostnames (Port 443)
- `*.daily.co`, `*.wss.daily.co`, `b.daily.co`, `c.daily.co`, `gs.daily.co`, `prod-ks.pluot.blue`

### WebRTC Media Requirements
- **STUN**: `stun.cloudflare.com` (UDP/3478, UDP/53), `*.stun.twilio.com`
- **UDP Direct**: `*.wss.daily.co` (TCP/443, UDP/40000-49999)
- **TURN Relay**: `turn.cloudflare.com`, `*.turn.twilio.com`

### Common Network Problems
- Can't load call interface: Check `*.daily.co` access
- Can't connect: Check `*.wss.daily.co`
- No audio/video: Check TURN/STUN servers and UDP traffic
- VPN users: Recommend split tunneling for Daily traffic
