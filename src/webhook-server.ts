import express from "express";

/**
 * TypeScript interfaces for Daily webhook payloads
 */
interface DailyWebhookBase {
  version: string;
  type: string;
  id: string;
  event_ts: number;
}

interface RecordingReadyPayload {
  recording_id: string;
  room_name: string;
  start_ts: number;
  status: string;
  max_participants: number;
  duration: number;
  s3_key: string;
  share_token?: string;
  tracks?: unknown[];
}

interface RecordingReadyWebhook extends DailyWebhookBase {
  type: "recording.ready-to-download";
  payload: RecordingReadyPayload;
}

/**
 * Simple Express server to handle Daily recording webhooks
 * This server listens for recording-ready-to-download events
 */

const app = express();
const PORT = 4000; // Different port from Vite (3000)

// Middleware to parse JSON payloads
app.use(express.json());

// Health check endpoint for webhook verification
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Webhook server is running" });
});

/**
 * Webhook endpoint for recording.ready-to-download events
 * According to Daily docs, this event is sent when a recording enters
 * a "finished" state with a non-zero duration
 */
app.post("/webhooks/recording-ready", (req, res) => {
  // Respond immediately with 200 status as recommended by Daily docs
  res.status(200).json({ received: true });

  const webhook = req.body as RecordingReadyWebhook;

  console.log("\n🎉 RECORDING READY TO DOWNLOAD WEBHOOK RECEIVED");
  console.log("================================================");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Event Type:", webhook.type);
  console.log("Event ID:", webhook.id);
  console.log("Recording ID:", webhook.payload?.recording_id);
  console.log("Room Name:", webhook.payload?.room_name);
  console.log("Duration:", webhook.payload?.duration, "seconds");
  console.log("Status:", webhook.payload?.status);
  console.log("S3 Key:", webhook.payload?.s3_key);
  console.log("Max Participants:", webhook.payload?.max_participants);
  console.log("Full payload:", JSON.stringify(req.body, null, 2));
  console.log("================================================\n");
});

/**
 * Daily webhook verification endpoint
 * When creating a webhook via POST /webhooks, Daily sends a verification request
 * to ensure the endpoint is active and responds with a 200 status code
 */
app.post("/webhooks/test", (req, res) => {
  // Respond immediately with 200 status as required by Daily
  res.status(200).json({
    verified: true,
    message: "Daily webhook endpoint verified successfully",
    timestamp: new Date().toISOString(),
  });

  console.log("\n🔍 DAILY WEBHOOK VERIFICATION REQUEST");
  console.log("====================================");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Method:", req.method);
  console.log("Path:", req.path);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  // Check for Daily webhook signature headers
  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];

  if (signature && timestamp) {
    console.log("✅ Daily signature headers present:");
    console.log("  X-Webhook-Signature:", signature);
    console.log("  X-Webhook-Timestamp:", timestamp);
  } else {
    console.log(
      "ℹ️  No Daily signature headers found (normal for verification)"
    );
  }

  console.log("✅ Responded with 200 OK for Daily verification");
  console.log("====================================\n");
});

// Catch-all webhook endpoint for debugging
app.post("/webhooks/*", (req, res) => {
  console.log("\n📥 UNKNOWN WEBHOOK RECEIVED");
  console.log("===========================");
  console.log("Path:", req.path);
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("===========================\n");

  res.status(200).json({ received: true });
});

// Start the server
function startWebhookServer() {
  app.listen(PORT, () => {
    console.log("\n🚀 Daily Recording Webhook Server Started");
    console.log("=========================================");
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Webhook endpoints:");
    console.log(
      `  📥 Recording Ready: http://localhost:${PORT}/webhooks/recording-ready`
    );
    console.log(`  🔍 Test/Verify:     http://localhost:${PORT}/webhooks/test`);
    console.log(`  ❤️  Health Check:    http://localhost:${PORT}/health`);
    console.log("=========================================\n");
  });
}

export { startWebhookServer };
