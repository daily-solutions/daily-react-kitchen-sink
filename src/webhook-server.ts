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

interface BatchProcessorResponse {
  id: string;
}

// This is an example, replace with your own processing function
async function processRecordingSummary(roomName: string, recordingId: string) {
  console.log(
    `Processing recording summary for Room: ${roomName}, Recording ID: ${recordingId}`
  );
  // Use the Daily Batch Processor API to generate a transcription
  try {
    await submitTranscriptionJob(recordingId, roomName);
  } catch (error) {
    console.error("Failed to submit transcription job:", error);
  }
}

async function submitTranscriptionJob(
  recordingId: string,
  roomName: string
): Promise<BatchProcessorResponse> {
  try {
    console.log(
      `🎯 Submitting transcription job for recording: ${recordingId}`
    );

    const response = await fetch("https://api.daily.co/v1/batch-processor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        preset: "transcript",
        inParams: {
          sourceType: "recordingId",
          recordingId: recordingId,
          language: "en",
        },
        outParams: {
          s3Config: {
            s3KeyTemplate: `transcript-${roomName}-{epoch_time}`,
            useReplacement: true,
          },
        },
        transformParams: {
          transcript: {
            punctuate: true,
            profanity_filter: false,
            model: "general",
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to submit transcription job: ${response.status} ${response.statusText}`
      );
    }

    const result = (await response.json()) as BatchProcessorResponse;
    console.log(
      `✅ Transcription job submitted successfully! Job ID: ${result.id}`
    );
    console.log(
      `📝 Transcript will be saved as: transcript-${roomName}-{epoch_time}`
    );

    return result;
  } catch (error) {
    console.error("❌ Error submitting transcription job:", error);
    throw error;
  }
}

// Health check endpoint for webhook verification
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Webhook server is running" });
});

// Catch-all webhook endpoint for debugging
// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.post("/webhooks/*", async (req, res) => {
  if (!process.env.DAILY_API_KEY) {
    console.error("ℹ️  DAILY_API_KEY not set - skipping webhook processing");
    res.status(400).json({ error: "Set DAILY_API_KEY environment variable" });
    return;
  }

  try {
    console.log("\n📥 WEBHOOK RECEIVED");
    console.log("===========================");
    console.log("Path:", req.path);

    const webhook = req.body as DailyWebhook;

    if (webhook.type === "recording.ready-to-download") {
      console.log("\n🎉 RECORDING READY TO DOWNLOAD");

      const startTs = webhook.payload.start_ts;
      const startTime = new Date(startTs * 1000);
      console.log(
        "Recording Started:",
        startTs,
        "(" + startTime.toISOString() + ")"
      );

      // Process recording summary (includes transcription)
      await processRecordingSummary(
        webhook.payload.room_name,
        webhook.payload.recording_id
      );
    }

    console.log("\nFull payload:");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("===========================\n");

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
function startWebhookServer() {
  app.listen(PORT, () => {
    console.log("\n🚀 Daily Webhook Server Started");
    console.log("=========================================");
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Webhook endpoints:");
    console.log(`  📥 All Events: http://localhost:${PORT}/webhooks/*`);
    console.log("Supported events:");
    console.log("  🎉 recording.ready-to-download");
    console.log("=========================================\n");
  });
}

export { startWebhookServer };
