import { fileURLToPath } from "url";

// Configuration - replace with your actual Daily.co API keys
const DAILY_API_KEYS = [""].filter(Boolean); // Remove undefined values

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
 * Utility function to create chunks from an array
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
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
 * Get all recordings using Daily.co REST API with pagination
 */
async function getRecordings(
  apiKey: string,
  limit = 100
): Promise<Recording[]> {
  const allRecordings: Recording[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  console.log("📥 Fetching recordings with pagination...");

  while (hasMore) {
    try {
      const recordings = await retryWithBackoff(async () => {
        const url = new URL(`${DAILY_API_BASE}/recordings`);
        url.searchParams.append("limit", limit.toString());

        if (startingAfter) {
          url.searchParams.append("starting_after", startingAfter);
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = (await response.json()) as RecordingsResponse;
          return data.data ?? [];
        } else if (response.status === 429) {
          // Rate limited - throw custom error to trigger retry
          throw new RateLimitError(
            429,
            "Rate limited when fetching recordings"
          );
        } else {
          const errorData = await response.text();
          console.error(
            `Failed to fetch recordings: ${response.status} ${response.statusText}`
          );
          console.error("Error details:", errorData);
          return [];
        }
      });

      if (recordings.length === 0) {
        hasMore = false;
        break;
      }

      allRecordings.push(...recordings);
      console.log(
        `📋 Fetched ${recordings.length} recordings (total: ${allRecordings.length})`
      );

      // If we got fewer results than the limit, we've reached the end
      if (recordings.length < limit) {
        hasMore = false;
      } else {
        // Use the last recording ID as the cursor for the next page
        startingAfter = recordings[recordings.length - 1].id;
      }

      // Add a small delay between pagination requests
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.error(
          "❌ Rate limit exceeded when fetching recordings after all retries"
        );
      } else {
        console.error("Error fetching recordings:", error);
      }
      hasMore = false; // Stop pagination on error
    }
  }

  console.log(`📊 Total recordings fetched: ${allRecordings.length}`);
  return allRecordings;
}

/**
 * Delete all recordings for a specific API key with parallel processing
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

    // Process recordings in parallel batches to avoid overwhelming the API
    const batchSize = 20; // Number of parallel deletions per batch
    const batches = chunkArray(recordings, batchSize);

    let successCount = 0;
    let failureCount = 0;
    let processedCount = 0;

    console.log(
      `🚀 Processing ${batches.length} batches of ${batchSize} deletions each...`
    );

    // Process each batch in parallel
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNumber = batchIndex + 1;

      console.log(
        `\n📦 Processing batch ${batchNumber}/${batches.length} (${batch.length} recordings)...`
      );

      // Delete all recordings in this batch in parallel
      const batchPromises = batch.map(async (recording, recordingIndex) => {
        const globalIndex = batchIndex * batchSize + recordingIndex + 1;
        console.log(
          `🗑️  [${globalIndex}/${recordings.length}] Deleting: ${recording.id} (room: ${recording.room_name})`
        );

        const success = await deleteRecording(recording.id, apiKey);
        return { success, recording };
      });

      // Wait for all deletions in this batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Count results from this batch
      const batchSuccess = batchResults.filter((r) => r.success).length;
      const batchFailure = batchResults.filter((r) => !r.success).length;

      successCount += batchSuccess;
      failureCount += batchFailure;
      processedCount += batch.length;

      console.log(
        `✅ Batch ${batchNumber} complete: ${batchSuccess} succeeded, ${batchFailure} failed`
      );
      console.log(
        `📈 Overall progress: ${processedCount}/${recordings.length} processed (${successCount} succeeded, ${failureCount} failed)`
      );

      // Add a delay between batches to be respectful to the API
      if (batchIndex < batches.length - 1) {
        console.log("⏳ Waiting before next batch...");
        await sleep(500); // 500ms delay between batches
      }
    }

    console.log(`\n📈 API Key ${keyIndex + 1} Final Summary:`);
    console.log(`✅ Successfully deleted: ${successCount} recordings`);
    console.log(`❌ Failed to delete: ${failureCount} recordings`);
    console.log(
      `📊 Success rate: ${((successCount / recordings.length) * 100).toFixed(
        1
      )}%`
    );

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
// For ES modules, we need to check if the file path matches
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}
