#!/bin/bash

# Daily API Webhook Configuration Script (Recording Ready Only)
# This script updates an existing webhook to handle recording-ready events

# Configuration
DAILY_API_BASE="https://api.daily.co/v1"
WEBHOOK_URL="https://hush.ngrok.io"
WEBHOOK_PATH="/webhooks/recording-ready"

# Check if DAILY_API_KEY is set
if [ -z "$DAILY_API_KEY" ]; then
    echo "❌ Error: DAILY_API_KEY environment variable is not set"
    echo "Please set your Daily API key:"
    echo "export DAILY_API_KEY=your_api_key_here"
    exit 1
fi

echo "🎣 Daily Recording Webhook Configuration (Recording Ready Only)"
echo "=============================================================="
echo "Webhook URL: $WEBHOOK_URL$WEBHOOK_PATH"
echo "API Endpoint: $DAILY_API_BASE"
echo "Event: recording.ready-to-download"
echo ""

# Step 1: Get existing webhooks
echo "1. Getting list of existing webhooks..."
echo "GET $DAILY_API_BASE/webhooks"

WEBHOOKS_RESPONSE=$(curl -s \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $DAILY_API_KEY" \
    -X GET \
    "$DAILY_API_BASE/webhooks")

echo "Response:"
echo "$WEBHOOKS_RESPONSE" | jq '.' 2>/dev/null || echo "$WEBHOOKS_RESPONSE"
echo ""

# Extract webhook UUID from response
WEBHOOK_UUID=$(echo "$WEBHOOKS_RESPONSE" | jq -r '.[] | .uuid' 2>/dev/null)

if [ -z "$WEBHOOK_UUID" ] || [ "$WEBHOOK_UUID" = "null" ]; then
    echo "❌ No existing webhook found or failed to parse response"
    echo "You may need to create a webhook first using the Daily dashboard or API"
    exit 1
fi

echo "✅ Found webhook with UUID: $WEBHOOK_UUID"
echo ""

# Step 2: Update webhook for recording-ready events
echo "2. Updating webhook for recording-ready events..."
echo "POST $DAILY_API_BASE/webhooks/$WEBHOOK_UUID"
echo "URL: $WEBHOOK_URL$WEBHOOK_PATH"
echo "Event: recording.ready-to-download"

UPDATE_RESPONSE=$(curl -s \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $DAILY_API_KEY" \
    -X POST \
    "$DAILY_API_BASE/webhooks/$WEBHOOK_UUID" \
    -d "{
        \"url\": \"$WEBHOOK_URL$WEBHOOK_PATH\",
        \"eventTypes\": [\"recording.ready-to-download\"]
    }")

echo "Response:"
echo "$UPDATE_RESPONSE" | jq '.' 2>/dev/null || echo "$UPDATE_RESPONSE"
echo ""

# Check if the update was successful
if echo "$UPDATE_RESPONSE" | jq -e '.uuid' >/dev/null 2>&1; then
    echo "✅ Successfully updated webhook for recording-ready events"
    
    # Extract and display updated configuration
    URL=$(echo "$UPDATE_RESPONSE" | jq -r '.url' 2>/dev/null)
    EVENTS=$(echo "$UPDATE_RESPONSE" | jq -r '.eventTypes[]' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    STATE=$(echo "$UPDATE_RESPONSE" | jq -r '.state' 2>/dev/null)
    
    echo "📋 Updated webhook details:"
    echo "  UUID: $WEBHOOK_UUID"
    echo "  URL: $URL"
    echo "  Events: $EVENTS"
    echo "  State: $STATE"
else
    echo "❌ Failed to update webhook"
    echo "Response: $UPDATE_RESPONSE"
    exit 1
fi
echo ""

echo "🎉 Webhook configuration complete!"
echo ""
echo "📝 Next steps:"
echo "1. Make sure your ngrok tunnel is running and pointing to localhost:4000"
echo "2. Start your webhook server with 'npm run dev'"
echo "3. Start a recording in your Daily room"
echo "4. Check the console output for webhook events"
echo ""
echo "🔗 Your webhook endpoint:"
echo "  📥 Recording Ready: $WEBHOOK_URL$WEBHOOK_PATH"
echo ""
echo "ℹ️  Note: This webhook only handles 'recording.ready-to-download' events."
echo "   Recording error events are not configured."
