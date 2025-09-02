# Daily Recording Webhooks Demo

This demo demonstrates how to set up and handle Daily's recording webhooks, specifically:
- `recording.ready-to-download` - fired when a recording is finished and ready for download

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start the development server (this will automatically start both Vite and the webhook server):
```bash
npm run dev
```

This will start:
- **Vite dev server** on `http://localhost:3000` (for the React app)
- **Webhook server** on `http://localhost:4000` (for handling Daily webhooks)

## Configuring Real Daily Webhooks

To use this demo with real Daily webhooks, you'll need to:

1. **Set up ngrok tunnel** (for local development):
```bash
# Install ngrok if you haven't already
# Then run:
ngrok http 4000
```

2. **Set your Daily API key**:
```bash
export DAILY_API_KEY=your_daily_api_key_here
```

3. **Configure webhooks** using one of the provided scripts:

### Option A: Single Webhook (Recommended)
Use `configure-webhook-single.sh` to set up one webhook for recording-ready events:
```bash
./configure-webhook-single.sh
```

### Option B: Separate Webhooks  
Use `test-webhooks.sh` to set up separate webhooks for each event type:
```bash
./test-webhooks.sh
```

**Important**: Update the webhook URL in the scripts to match your ngrok URL:
- Edit the `WEBHOOK_URL` variable in the script
- Replace `https://hush.ngrok.io` with your actual ngrok URL

## Webhook Endpoints

The webhook server provides the following endpoints:

- `http://localhost:4000/webhooks/recording-ready` - Handle recording ready events
- `http://localhost:4000/webhooks/test` - **Daily webhook verification endpoint**
- `http://localhost:4000/health` - Health check endpoint

### Daily Webhook Verification

When you create a webhook using the Daily REST API (`POST /webhooks`), Daily automatically sends a verification request to your webhook endpoint to ensure it's active and responds with a `200` status code. The `/webhooks/test` endpoint is specifically designed to handle this verification process.

**What happens during verification:**
1. You make a `POST` request to `https://api.daily.co/v1/webhooks` with your webhook URL
2. Daily immediately sends a `POST` request to your webhook URL to verify it's working
3. Your endpoint must respond with a `200` status code within a few seconds
4. If verification succeeds, Daily creates the webhook; if it fails, you get a `400` error

The test endpoint logs all verification requests with headers and body for debugging.

### Webhook Security

Daily provides HMAC-SHA256 signature verification for webhook security. When Daily sends webhook events, it includes these headers:

- `X-Webhook-Signature` - HMAC-SHA256 signature of the request body
- `X-Webhook-Timestamp` - Timestamp when the webhook was sent

The webhook server logs these headers when present. In a production environment, you should verify the signature using your webhook's HMAC secret to ensure the request came from Daily.

**Example signature verification** (not implemented in this demo):
```javascript
const crypto = require('crypto');

function verifySignature(body, signature, secret, timestamp) {
  const expectedSignature = crypto
    .createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(timestamp + '.' + JSON.stringify(body))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

## Setting Up Webhooks in Daily

To configure webhooks in your Daily domain, use the Daily REST API:

```bash
curl -X POST 'https://api.daily.co/v1/webhooks' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "http://your-public-domain.com:4000/webhooks/recording-ready",
    "events": ["recording.ready-to-download"]
  }'
```

## Testing Webhooks Locally

For local testing, you can use tools like:
- [ngrok](https://ngrok.com/) to expose your local server to the internet
- [webhook.site](https://webhook.site/) for quick webhook testing

Example with ngrok:
```bash
# In a separate terminal
ngrok http 4000

# Use the ngrok URL in your webhook configuration
# e.g., https://abc123.ngrok.io/webhooks/recording-ready
```

## Webhook Event Examples

### recording.ready-to-download
```json
{
  "version": "1.0.0",
  "type": "recording.ready-to-download",
  "id": "rec-rtd-c3df927c-f738-4471-a2b7-066fa7e95a6b-1692124192",
  "payload": {
    "recording_id": "08fa0b24-9220-44c5-846c-3f116cf8e738",
    "room_name": "Xcm97xRZ08b2dePKb78g",
    "start_ts": 1692124183,
    "status": "finished",
    "max_participants": 1,
    "duration": 9,
    "s3_key": "api-test-1j8fizhzd30c/Xcm97xRZ08b2dePKb78g/1692124183028"
  },
  "event_ts": 1692124192
}
```

## Documentation References

- [Daily Webhooks Overview](https://docs.daily.co/reference/rest-api/webhooks)
- [Recording Ready to Download Event](https://docs.daily.co/reference/rest-api/webhooks/events/recording-ready-to-download)
