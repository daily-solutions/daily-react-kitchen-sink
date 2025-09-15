# GitHub Copilot Instructions for Daily React Kitchen Sink Demo

## Project Context

This is a comprehensive Daily.js React demo application showcasing video calling capabilities. Follow these guidelines when suggesting code or making changes.

## Code Style & Patterns

### TypeScript Conventions
- Use strict TypeScript with proper typing
- Prefer `useCallback` for event handlers and functions passed as props
- Use explicit return types for complex functions
- Handle async operations with proper error catching

### Daily.js Integration
- Always use Daily React hooks instead of direct event listeners when possible
- Prefer `useDailyError()` over `useDailyEvent("error")` for error handling
- Log all Daily events through the `logEvent` callback for debugging
- Include comprehensive error handling for all Daily.js operations

### React Patterns
- Use functional components with hooks
- Implement proper dependency arrays for `useCallback` and `useEffect`
- Handle loading and error states appropriately
- Maintain consistent state management patterns

## Key Daily React Hooks

When working with Daily.js features, prefer these hooks:
- `useDaily()` - Core call object access
- `useDailyError()` - Error handling (prefer over event listeners)
- `useDevices()` - Camera, microphone, speaker management
- `useInputSettings()` - Audio/video processing controls
- `useRecording()` - Recording functionality
- `useScreenShare()` - Screen sharing
- `useTranscription()` - Meeting transcription
- `useParticipantIds()` - Participant management
- `useCPULoad()` - Performance monitoring
- `useNetwork()` - Connection quality

## Feature Implementation Guidelines

### Error Handling
- Always include try-catch blocks for Daily.js operations
- Log errors through the `logEvent` callback
- Provide user-friendly error messages
- Handle both fatal and non-fatal errors appropriately

### Device Management
- Check device availability before operations
- Handle permission requests gracefully
- Provide fallbacks for device failures
- Test with various device configurations

### Audio Processing
- Monitor CPU load when using Krisp noise cancellation
- Implement automatic fallbacks for high CPU usage
- Handle audio processor errors (especially Krisp system overload)
- Provide visual feedback for processing states

### Recording Features
- Use `updateRecording()` API for advanced recording control
- Generate proper instance IDs for recording operations
- Handle recording state changes appropriately
- Implement mute/unmute functionality without stopping recordings

## Code Examples

### Event Logging Pattern
```typescript
const logEvent = useCallback((evt: DailyEventObject) => {
  if ("action" in evt) {
    console.log(`logEvent: ${evt.action}`, evt);
  } else {
    console.log("logEvent:", evt);
  }
}, []);
```

### Error Handling Pattern
```typescript
const { meetingError, nonFatalError } = useDailyError();
if (meetingError) {
  logEvent(meetingError);
}
if (nonFatalError) {
  logEvent(nonFatalError);
}
```

### Device Selection Pattern
```typescript
const handleChangeDevice = useCallback(
  (ev: React.ChangeEvent<HTMLSelectElement>) => {
    setDevice(ev.target.value)?.catch((err) => {
      console.error("Error setting device", err);
    });
  },
  [setDevice]
);
```

## Testing Considerations

- Test with various network conditions
- Verify device permission handling
- Test audio processing with different CPU loads
- Validate recording functionality across scenarios
- Check screen sharing with multiple displays

## Performance Guidelines

- Monitor CPU load and network quality
- Implement automatic quality adjustments
- Use background processing controls appropriately
- Optimize for various device capabilities

## Security Best Practices

- Generate meeting tokens server-side
- Validate room URLs before joining
- Handle device permissions gracefully
- Avoid storing sensitive data in localStorage

## Common Patterns to Avoid

- Don't use direct Daily event listeners when hooks are available
- Avoid blocking UI operations during async Daily.js calls
- Don't ignore error states in user interface
- Avoid hardcoded device IDs or room URLs in production code

## Debugging Tips

- Use `window.callObject` for console debugging
- Monitor comprehensive event logging
- Check network quality and CPU load indicators
- Verify device enumeration and status display
