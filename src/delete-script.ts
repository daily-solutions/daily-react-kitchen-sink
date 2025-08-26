// Configuration - replace with your actual Daily.co API key
const DAILY_API_KEY = process.env.DAILY_API_KEY ?? "your-api-key-here";
const DAILY_API_BASE = "https://api.daily.co/v1";

interface Recording {
  id: string;
  room_name: string;
  start_ts: number;
  status: string;
  duration: number;
}

interface RecordingsResponse {
  total_count: number;
  data: Recording[];
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Custom error class for rate limiting
 */
class RateLimitError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RateLimitError";
    this.status = status;
  }
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      // Check if it's a rate limit error
      if (error instanceof RateLimitError && error.status === 429) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(
          `⏳ Rate limited. Retrying in ${delay}ms (attempt ${attempt + 1}/${
            maxRetries + 1
          })`
        );
        await sleep(delay);
      } else {
        // For non-rate-limit errors, don't retry
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Delete a specific recording by ID using Daily.co REST API
 */
async function deleteRecording(recordingId: string): Promise<boolean> {
  try {
    return await retryWithBackoff(async () => {
      const response = await fetch(
        `${DAILY_API_BASE}/recordings/${recordingId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${DAILY_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        console.log(`✅ Successfully deleted recording: ${recordingId}`);
        return true;
      } else if (response.status === 429) {
        // Rate limited - throw custom error to trigger retry
        throw new RateLimitError(
          429,
          `Rate limited when deleting recording ${recordingId}`
        );
      } else {
        const errorData = await response.text();
        console.error(
          `❌ Failed to delete recording ${recordingId}: ${response.status} ${response.statusText}`
        );
        console.error("Error details:", errorData);
        return false;
      }
    });
  } catch (error) {
    if (error instanceof RateLimitError && error.status === 429) {
      console.error(
        `❌ Rate limit exceeded for recording ${recordingId} after all retries`
      );
    } else {
      console.error(`❌ Error deleting recording ${recordingId}:`, error);
    }
    return false;
  }
}

/**
 * Get all recordings using Daily.co REST API
 */
async function getRecordings(limit = 100): Promise<Recording[]> {
  try {
    return await retryWithBackoff(async () => {
      const response = await fetch(
        `${DAILY_API_BASE}/recordings?limit=${limit}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${DAILY_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = (await response.json()) as RecordingsResponse;
        return data.data ?? [];
      } else if (response.status === 429) {
        // Rate limited - throw custom error to trigger retry
        throw new RateLimitError(429, "Rate limited when fetching recordings");
      } else {
        const errorData = await response.text();
        console.error(
          `Failed to fetch recordings: ${response.status} ${response.statusText}`
        );
        console.error("Error details:", errorData);
        return [];
      }
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error(
        "❌ Rate limit exceeded when fetching recordings after all retries"
      );
    } else {
      console.error("Error fetching recordings:", error);
    }
    return [];
  }
}

/**
 * Delete all recordings
 */
async function main(): Promise<void> {
  console.log("🚀 Starting recording deletion process...");

  if (!DAILY_API_KEY || DAILY_API_KEY === "your-api-key-here") {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variable or update the script"
    );
    return;
  }

  try {
    const recordings = await getRecordings();

    if (recordings.length === 0) {
      console.log("✨ No recordings found to delete");
      return;
    }

    console.log(`📊 Found ${recordings.length} recordings to delete`);

    let successCount = 0;
    let failureCount = 0;

    // Delete each recording
    for (const recording of recordings) {
      console.log(
        `🗑️  Deleting recording: ${recording.id} (room: ${recording.room_name})`
      );
      const success = await deleteRecording(recording.id);

      if (success) {
        successCount++;
      } else {
        failureCount++;
      }

      // Add a small delay to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log("\n📈 Deletion Summary:");
    console.log(`✅ Successfully deleted: ${successCount} recordings`);
    console.log(`❌ Failed to delete: ${failureCount} recordings`);
    console.log("🎉 Finished deleting recordings");
  } catch (error) {
    console.error("❌ Error in deleteAllRecordings:", error);
  }
}

/**
 * Delete a single recording by ID
 */
async function deleteSingleRecording(recordingId: string): Promise<void> {
  console.log(`🗑️  Deleting single recording: ${recordingId}`);

  if (!DAILY_API_KEY || DAILY_API_KEY === "your-api-key-here") {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variable or update the script"
    );
    return;
  }

  await deleteRecording(recordingId);
}

// Run the deletion script if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
