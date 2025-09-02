#!/bin/bash

# Daily API Webhook Configuration Script
# This script gets existing webhooks and updates them to use the ngrok URL

# Configuration
DAILY_API_BASE="https://api.daily.co/v1"
WEBHOOK_URL="https://hush.ngrok.io"
RECORDING_READY_PATH="/webhooks/recording-ready"

# Check if DAILY_API_KEY is set
if [ -z "$DAILY_API_KEY" ]; then
    echo "❌ Error: DAILY_API_KEY environment variable is not set"
    echo "Please set your Daily API key:"
    echo "export DAILY_API_KEY=your_api_key_here"
    exit 1
fi

echo "🎣 Daily Recording Webhook Configuration"
echo "======================================="
echo "Webhook Base URL: $WEBHOOK_URL"
echo "API Endpoint: $DAILY_API_BASE"
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
echo "URL: $WEBHOOK_URL$RECORDING_READY_PATH"

RECORDING_READY_RESPONSE=$(curl -s \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $DAILY_API_KEY" \
    -X POST \
    "$DAILY_API_BASE/webhooks/$WEBHOOK_UUID" \
    -d "{
        \"url\": \"$WEBHOOK_URL$RECORDING_READY_PATH\",
        \"eventTypes\": [\"recording.ready-to-download\"]
    }")

echo "Response:"
echo "$RECORDING_READY_RESPONSE" | jq '.' 2>/dev/null || echo "$RECORDING_READY_RESPONSE"
echo ""

# Check if the update was successful
if echo "$RECORDING_READY_RESPONSE" | jq -e '.uuid' >/dev/null 2>&1; then
    echo "✅ Successfully updated webhook for recording-ready events"
else
    echo "❌ Failed to update webhook for recording-ready events"
    echo "Response: $RECORDING_READY_RESPONSE"
fi
echo ""

# Step 3: Verify final webhook configuration
echo "3. Verifying final webhook configuration..."
echo "GET $DAILY_API_BASE/webhooks"

FINAL_WEBHOOKS_RESPONSE=$(curl -s \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $DAILY_API_KEY" \
    -X GET \
    "$DAILY_API_BASE/webhooks")

echo "Final webhook configuration:"
echo "$FINAL_WEBHOOKS_RESPONSE" | jq '.' 2>/dev/null || echo "$FINAL_WEBHOOKS_RESPONSE"
echo ""

echo "🎉 Webhook configuration complete!"
echo ""
echo "📝 Next steps:"
echo "1. Start a recording in your Daily room"
echo "2. Check the console output where you ran 'npm run dev'"
echo "3. You should see webhook events logged when recording finishes"
echo ""
echo "🔗 Your webhook endpoint:"
echo "  📥 Recording Ready: $WEBHOOK_URL$RECORDING_READY_PATH"
