// Configuration - replace with your actual Daily.co API keys
const DAILY_API_KEYS = [
  process.env.DAILY_API_KEY_1,
  process.env.DAILY_API_KEY_2,
  process.env.DAILY_API_KEY_3,
  // Add more API keys as needed
].filter(Boolean) as string[]; // Remove undefined values

// Fallback for single API key (backwards compatibility)
if (DAILY_API_KEYS.length === 0 && process.env.DAILY_API_KEY) {
  DAILY_API_KEYS.push(process.env.DAILY_API_KEY);
}

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
async function deleteRecording(
  recordingId: string,
  apiKey: string
): Promise<boolean> {
  try {
    return await retryWithBackoff(async () => {
      const response = await fetch(
        `${DAILY_API_BASE}/recordings/${recordingId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
async function getRecordings(
  apiKey: string,
  limit = 100
): Promise<Recording[]> {
  try {
    return await retryWithBackoff(async () => {
      const response = await fetch(
        `${DAILY_API_BASE}/recordings?limit=${limit}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
 * Delete all recordings for a specific API key
 */
async function deleteRecordingsForApiKey(
  apiKey: string,
  keyIndex: number
): Promise<{ success: number; failure: number }> {
  console.log(
    `\n🔑 Processing API key ${keyIndex + 1}/${DAILY_API_KEYS.length}...`
  );

  try {
    const recordings = await getRecordings(apiKey);

    if (recordings.length === 0) {
      console.log(`✨ No recordings found for API key ${keyIndex + 1}`);
      return { success: 0, failure: 0 };
    }

    console.log(
      `📊 Found ${recordings.length} recordings to delete for API key ${
        keyIndex + 1
      }`
    );

    let successCount = 0;
    let failureCount = 0;

    // Delete each recording
    for (const recording of recordings) {
      console.log(
        `🗑️  Deleting recording: ${recording.id} (room: ${recording.room_name})`
      );
      const success = await deleteRecording(recording.id, apiKey);

      if (success) {
        successCount++;
      } else {
        failureCount++;
      }

      // Add a small delay to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log(`\n📈 API Key ${keyIndex + 1} Summary:`);
    console.log(`✅ Successfully deleted: ${successCount} recordings`);
    console.log(`❌ Failed to delete: ${failureCount} recordings`);

    return { success: successCount, failure: failureCount };
  } catch (error) {
    console.error(`❌ Error processing API key ${keyIndex + 1}:`, error);
    return { success: 0, failure: 0 };
  }
}

/**
 * Delete all recordings across all API keys
 */
async function main(): Promise<void> {
  console.log("🚀 Starting recording deletion process...");

  if (DAILY_API_KEYS.length === 0) {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variables (DAILY_API_KEY_1, DAILY_API_KEY_2, etc.) or DAILY_API_KEY"
    );
    return;
  }

  console.log(`🔑 Found ${DAILY_API_KEYS.length} API key(s) to process`);

  let totalSuccess = 0;
  let totalFailure = 0;

  // Process each API key
  for (let i = 0; i < DAILY_API_KEYS.length; i++) {
    const apiKey = DAILY_API_KEYS[i];
    if (!apiKey) continue;

    const result = await deleteRecordingsForApiKey(apiKey, i);
    totalSuccess += result.success;
    totalFailure += result.failure;

    // Add a delay between API keys to be respectful
    if (i < DAILY_API_KEYS.length - 1) {
      console.log("⏳ Waiting before processing next API key...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("\n🎉 Final Summary Across All API Keys:");
  console.log(`✅ Total successfully deleted: ${totalSuccess} recordings`);
  console.log(`❌ Total failed to delete: ${totalFailure} recordings`);
  console.log("🏁 Finished deleting recordings from all accounts");
}

/**
 * Delete a single recording by ID using the first available API key
 */
async function deleteSingleRecording(
  recordingId: string,
  apiKeyIndex = 0
): Promise<void> {
  console.log(`🗑️  Deleting single recording: ${recordingId}`);

  if (DAILY_API_KEYS.length === 0) {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variables or update the script"
    );
    return;
  }

  const apiKey = DAILY_API_KEYS[apiKeyIndex];
  if (!apiKey) {
    console.error(`❌ API key at index ${apiKeyIndex} is not available`);
    return;
  }

  await deleteRecording(recordingId, apiKey);
}

// Export functions for use in other modules
export {
  deleteRecording,
  getRecordings,
  deleteRecordingsForApiKey,
  deleteSingleRecording,
};

// Run the deletion script if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
