import express from "express";

/**
 * Simple Express server to handle Daily recording webhooks
 * This server listens for recording-ready-to-download and recording-error events
 */

const app = express();
const PORT = 4000; // Different port from Vite (3000)

// Middleware to parse JSON payloads
app.use(express.json());

// Health check endpoint for webhook verification
app.get("/health", (req, res) => {
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

  console.log("\n🎉 RECORDING READY TO DOWNLOAD WEBHOOK RECEIVED");
  console.log("================================================");
  console.log("Full payload:", JSON.stringify(req.body, null, 2));
  console.log("================================================\n");
});

/**
 * Webhook endpoint for recording.error events
 * According to Daily docs, this event is sent when an error occurs
 * during recording or before a recording can be started
 */
app.post("/webhooks/recording-error", (req, res) => {
  // Respond immediately with 200 status as recommended by Daily docs
  res.status(200).json({ received: true });

  console.log("\n❌ RECORDING ERROR WEBHOOK RECEIVED");
  console.log("===================================");
  console.log("Full payload:", JSON.stringify(req.body, null, 2));
  console.log("===================================\n");
});

/**
 * Generic webhook endpoint for testing webhook verification
 * Daily sends a POST request to verify the endpoint is active
 */
app.post("/webhooks/test", (req, res) => {
  console.log("\n🔍 WEBHOOK VERIFICATION REQUEST RECEIVED");
  console.log("=======================================");
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("=======================================\n");

  // Return 200 status for webhook verification
  res.status(200).json({ verified: true });
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
    console.log(
      `  ❌ Recording Error:  http://localhost:${PORT}/webhooks/recording-error`
    );
    console.log(`  🔍 Test/Verify:     http://localhost:${PORT}/webhooks/test`);
    console.log(`  ❤️  Health Check:    http://localhost:${PORT}/health`);
    console.log("=========================================\n");
  });
}

export { startWebhookServer };
