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

interface MeetingEndedPayload {
  start_ts: number;
  end_ts: number;
  meeting_id: string;
  room: string;
}

interface RecordingReadyWebhook extends DailyWebhookBase {
  type: "recording.ready-to-download";
  payload: RecordingReadyPayload;
}

interface MeetingEndedWebhook extends DailyWebhookBase {
  type: "meeting.ended";
  payload: MeetingEndedPayload;
}

type DailyWebhook = RecordingReadyWebhook | MeetingEndedWebhook;

/**
 * Simple Express server to handle Daily webhooks
 * This server listens for recording-ready-to-download and meeting-ended events
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
  // Use an async IIFE to handle the async operations
  (async () => {
    console.log("\n📥 WEBHOOK RECEIVED");
    console.log("===========================");
    console.log("Path:", req.path);

    const webhook = req.body as DailyWebhook;
    console.log("Event Type:", webhook.type);
    console.log("Event ID:", webhook.id);

    if (webhook.type === "recording.ready-to-download") {
      console.log("\n🎉 RECORDING READY TO DOWNLOAD");
      console.log("Recording ID:", webhook.payload.recording_id);
      console.log("Room Name:", webhook.payload.room_name);
      console.log("Status:", webhook.payload.status);
      console.log("Duration:", webhook.payload.duration, "seconds");
      console.log("S3 Key:", webhook.payload.s3_key);
      console.log("Max Participants:", webhook.payload.max_participants);

      const startTs = webhook.payload.start_ts;
      const startTime = new Date(startTs * 1000);
      console.log(
        "Recording Started:",
        startTs,
        "(" + startTime.toISOString() + ")"
      );

      // Fetch recording information from Daily API
      const recordingId = webhook.payload.recording_id;
      if (recordingId && process.env.DAILY_API_KEY) {
        try {
          const response = await fetch(
            `https://api.daily.co/v1/recordings/${recordingId}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (response.ok) {
            const recordingInfo: unknown = await response.json();
            console.log("📋 Recording Information from Daily API:");
            console.log(JSON.stringify(recordingInfo, null, 2));
          } else {
            console.log(
              "❌ Failed to fetch recording info:",
              response.status,
              response.statusText
            );
          }
        } catch (error) {
          console.log("❌ Error fetching recording info:", error);
        }
      } else if (!process.env.DAILY_API_KEY) {
        console.log(
          "ℹ️  DAILY_API_KEY not set - skipping recording info fetch"
        );
      }
    } else if (webhook.type === "meeting.ended") {
      console.log("\n🏁 MEETING ENDED");
      console.log("Meeting ID:", webhook.payload.meeting_id);
      console.log("Room:", webhook.payload.room);

      const startTs = webhook.payload.start_ts;
      const endTs = webhook.payload.end_ts;
      const startTime = new Date(startTs * 1000);
      const endTime = new Date(endTs * 1000);
      const durationSeconds = Math.round(endTs - startTs);
      const meetingId = webhook.payload.meeting_id;
      const room = webhook.payload.room;

      console.log(
        "Meeting Started:",
        startTs,
        "(" + startTime.toISOString() + ")"
      );
      console.log("Meeting Ended:", endTs, "(" + endTime.toISOString() + ")");
      console.log("Meeting Duration:", durationSeconds, "seconds");
      console.log("Meeting ID:", meetingId);

      // Fetch recordings for this room from Daily API
      if (room && process.env.DAILY_API_KEY) {
        try {
          const response = await fetch(
            `https://api.daily.co/v1/recordings?room_name=${encodeURIComponent(
              room
            )}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (response.ok) {
            const recordingsData: unknown = await response.json();
            console.log("📋 Recordings for room from Daily API:");
            console.log(JSON.stringify(recordingsData, null, 2));
          } else {
            console.log(
              "❌ Failed to fetch recordings:",
              response.status,
              response.statusText
            );
          }
        } catch (error) {
          console.log("❌ Error fetching recordings:", error);
        }
      } else if (!process.env.DAILY_API_KEY) {
        console.log("ℹ️  DAILY_API_KEY not set - skipping recordings fetch");
      }
    } else {
      const unknownWebhook = req.body as { type?: string };
      console.log(
        "⚠️  Unknown webhook type:",
        unknownWebhook.type ?? "undefined"
      );
    }

    console.log("\nFull payload:");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("===========================\n");
  })().catch((error) => {
    console.error("❌ Async operation failed:", error);
  });

  res.status(200).json({ received: true });
});

// Start the server
function startWebhookServer() {
  app.listen(PORT, () => {
    console.log("\n🚀 Daily Webhook Server Started");
    console.log("=========================================");
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Webhook endpoints:");
    console.log(`  📥 All Events: http://localhost:${PORT}/webhooks/*`);
    console.log(`  🔍 Test/Verify: http://localhost:${PORT}/webhooks/test`);
    console.log(`  ❤️  Health Check: http://localhost:${PORT}/health`);
    console.log("Supported events:");
    console.log("  🎉 recording.ready-to-download");
    console.log("  🏁 meeting.ended");
    console.log("=========================================\n");
  });
}

export { startWebhookServer };
