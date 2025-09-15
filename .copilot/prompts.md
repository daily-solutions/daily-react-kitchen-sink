# Daily.js Kitchen Sink Demo - Prompt Library

## Code Generation Prompts

### Adding New Daily Features
```
Add a new Daily.js feature to the kitchen sink demo:
- Use appropriate Daily React hooks
- Include comprehensive error handling with logEvent
- Add UI controls to the main App component
- Follow existing patterns for state management
- Include TypeScript types and proper error boundaries
```

### Device Management
```
Implement device management functionality:
- Use useDevices hook for enumeration
- Handle device permissions gracefully
- Provide real-time device switching
- Include error handling for device failures
- Add proper TypeScript typing for device objects
```

### Audio Processing Features
```
Add audio processing capabilities:
- Monitor CPU load with useCPULoad hook
- Implement automatic fallbacks for high CPU usage
- Handle Krisp noise cancellation with error detection
- Provide visual feedback for processing states
- Include audio processor error handling
```

### Recording Controls
```
Implement advanced recording features:
- Use useRecording hook for state management
- Add mute/unmute functionality with updateRecording API
- Generate proper instance IDs for recording operations
- Handle recording state changes with proper UI feedback
- Include comprehensive error handling
```

## Debugging Prompts

### Event Analysis
```
Debug Daily.js event flow:
- Check console logs for event patterns
- Verify event listener registrations
- Analyze event timing and sequence
- Look for missing or duplicate events
- Use window.callObject for runtime inspection
```

### Performance Investigation
```
Investigate performance issues:
- Monitor CPU load and network quality indicators
- Check audio processing overhead
- Analyze device enumeration performance
- Verify memory usage and cleanup
- Test with various device configurations
```

### Error Troubleshooting
```
Troubleshoot Daily.js integration errors:
- Check meetingError and nonFatalError states
- Verify device permissions and availability
- Analyze network connectivity issues
- Debug audio processor errors (especially Krisp)
- Validate room URLs and meeting tokens
```

## Code Review Prompts

### Quality Check
```
Review Daily.js integration code for:
- Proper use of Daily React hooks vs direct event listeners
- Comprehensive error handling patterns
- TypeScript compliance and type safety
- Performance optimization opportunities
- Security considerations for production use
```

### Pattern Compliance
```
Ensure code follows project patterns:
- Event logging through logEvent callback
- Consistent error handling with useDailyError
- Proper useCallback usage for event handlers
- Appropriate state management with React hooks
- Correct dependency arrays for effects and callbacks
```

## Testing Prompts

### Feature Testing
```
Test Daily.js features comprehensively:
- Verify functionality across different browsers
- Test with various network conditions
- Validate device permission handling
- Check audio processing with different CPU loads
- Test recording functionality across scenarios
```

### Integration Testing
```
Test Daily.js integration points:
- Verify hook interactions and state synchronization
- Test error boundary behavior
- Validate event listener cleanup
- Check memory leaks and performance impact
- Test with multiple concurrent features
```

## Documentation Prompts

### API Documentation
```
Document Daily.js integration:
- Explain hook usage patterns and best practices
- Document error handling strategies
- Provide examples for common use cases
- Include troubleshooting guides
- Document performance considerations
```

### Code Comments
```
Add comprehensive code comments:
- Explain complex Daily.js operations
- Document hook dependency relationships
- Clarify error handling logic
- Explain performance optimizations
- Document security considerations
```
