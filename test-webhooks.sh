#!/bin/bash

echo "Testing Daily Recording Webhook Server"
echo "======================================"

echo ""
echo "1. Testing health endpoint..."
echo "GET http://localhost:4000/health"
curl -s http://localhost:4000/health
echo ""
echo ""

echo "2. Testing recording ready webhook..."
echo "POST http://localhost:4000/webhooks/recording-ready"
curl -s -X POST http://localhost:4000/webhooks/recording-ready \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.0",
    "type": "recording.ready-to-download", 
    "id": "rec-rtd-test-123",
    "payload": {
      "recording_id": "test-recording-123",
      "room_name": "test-room",
      "start_ts": 1692124183,
      "status": "finished",
      "max_participants": 2,
      "duration": 120,
      "s3_key": "test-bucket/test-room/1692124183028"
    },
    "event_ts": 1692124192
  }'
echo ""
echo ""

echo "3. Testing recording error webhook..."
echo "POST http://localhost:4000/webhooks/recording-error"
curl -s -X POST http://localhost:4000/webhooks/recording-error \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.0",
    "type": "recording.error",
    "id": "rec-err-test-456", 
    "payload": {
      "action": "cloud-recording-err",
      "error_msg": "Test error message",
      "instance_id": "test-instance-456",
      "room_name": "test-room",
      "timestamp": 1692124192
    },
    "event_ts": 1692124192
  }'
echo ""
echo ""

echo "4. Testing Daily webhook verification endpoint..."
echo "POST http://localhost:4000/webhooks/test"
echo "This simulates Daily's verification request when creating a webhook"
curl -s -X POST http://localhost:4000/webhooks/test \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: test-signature-123" \
  -H "X-Webhook-Timestamp: $(date +%s)" \
  -d '{
    "test": "Daily webhook verification",
    "verification": true,
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
echo ""
echo ""

echo "Testing complete!"
