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

// Catch-all webhook endpoint for debugging
app.post("/webhooks/*", (req, res) => {
  console.log("\n📥 WEBHOOK RECEIVED");
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
