import { fileURLToPath } from "url";

// Configuration - replace with your actual Daily.co API keys
const DAILY_API_KEYS = [].filter(Boolean); // Remove undefined values

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
 * Run async tasks with a concurrency limit.
 * Keeps `concurrency` tasks in-flight at all times until the input is exhausted.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
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
  baseDelay = 1000,
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
          })`,
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
  apiKey: string,
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
        },
      );

      if (response.ok) {
        console.log(`✅ Successfully deleted recording: ${recordingId}`);
        return true;
      } else if (response.status === 429) {
        // Rate limited - throw custom error to trigger retry
        throw new RateLimitError(
          429,
          `Rate limited when deleting recording ${recordingId}`,
        );
      } else {
        const errorData = await response.text();
        console.error(
          `❌ Failed to delete recording ${recordingId}: ${response.status} ${response.statusText}`,
        );
        console.error("Error details:", errorData);
        return false;
      }
    });
  } catch (error) {
    if (error instanceof RateLimitError && error.status === 429) {
      console.error(
        `❌ Rate limit exceeded for recording ${recordingId} after all retries`,
      );
    } else {
      console.error(`❌ Error deleting recording ${recordingId}:`, error);
    }
    return false;
  }
}

/**
 * Fetch and delete all recordings using Daily.co REST API with pagination.
 * Deletes each page of recordings as it is fetched.
 */
async function fetchRecordingsPage(
  apiKey: string,
  limit: number,
): Promise<Recording[]> {
  return retryWithBackoff(async () => {
    const url = new URL(`${DAILY_API_BASE}/recordings`);
    url.searchParams.append("limit", limit.toString());

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
      throw new RateLimitError(429, "Rate limited when fetching recordings");
    } else {
      const errorData = await response.text();
      console.error(
        `Failed to fetch recordings: ${response.status} ${response.statusText}`,
      );
      console.error("Error details:", errorData);
      return [];
    }
  });
}

async function fetchAndDeleteAllRecordings(
  apiKey: string,
  limit = 100,
): Promise<{ success: number; failure: number }> {
  let totalSuccess = 0;
  let totalFailure = 0;
  let totalProcessed = 0;

  console.log("📥 Fetching and deleting recordings...");

  try {
    let recordings = await fetchRecordingsPage(apiKey, limit);

    while (recordings.length > 0) {
      console.log(
        `📋 Fetched ${recordings.length} recordings, deleting now...`,
      );

      const wasFullPage = recordings.length >= limit;

      // Start deleting current page (concurrency-limited) and prefetching next page
      const nextPagePromise = wasFullPage
        ? fetchRecordingsPage(apiKey, limit)
        : Promise.resolve([]);

      const deleteResults = runWithConcurrency(
        recordings,
        30,
        async (recording) => {
          totalProcessed++;
          console.log(
            `🗑️  [${totalProcessed}] Deleting: ${recording.id} (room: ${recording.room_name})`,
          );
          return deleteRecording(recording.id, apiKey);
        },
      );

      const [results, nextPage] = await Promise.all([
        deleteResults,
        nextPagePromise,
      ]);

      totalSuccess += results.filter(Boolean).length;
      totalFailure += results.filter((r) => !r).length;

      console.log(
        `📈 Progress: ${totalSuccess} succeeded, ${totalFailure} failed`,
      );

      recordings = nextPage;
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error(
        "❌ Rate limit exceeded when fetching recordings after all retries",
      );
    } else {
      console.error("Error fetching recordings:", error);
    }
  }

  console.log(
    `📊 Total processed: ${totalSuccess} succeeded, ${totalFailure} failed`,
  );
  return { success: totalSuccess, failure: totalFailure };
}

/**
 * Delete all recordings for a specific API key
 */
async function deleteRecordingsForApiKey(
  apiKey: string,
  keyIndex: number,
): Promise<{ success: number; failure: number }> {
  console.log(
    `\n🔑 Processing API key ${keyIndex + 1}/${DAILY_API_KEYS.length}...`,
  );

  const result = await fetchAndDeleteAllRecordings(apiKey);

  console.log(`\n📈 API Key ${keyIndex + 1} Final Summary:`);
  console.log(`✅ Successfully deleted: ${result.success} recordings`);
  console.log(`❌ Failed to delete: ${result.failure} recordings`);

  return result;
}

/**
 * Delete all recordings across all API keys
 */
async function main(): Promise<void> {
  console.log("🚀 Starting recording deletion process...");

  if (DAILY_API_KEYS.length === 0) {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variables (DAILY_API_KEY_1, DAILY_API_KEY_2, etc.) or DAILY_API_KEY",
    );
    return;
  }

  console.log(`🔑 Found ${DAILY_API_KEYS.length} API key(s) to process`);

  let totalSuccess = 0;
  let totalFailure = 0;

  // Process all API keys concurrently — they are separate accounts
  const results = await Promise.all(
    DAILY_API_KEYS.map((apiKey, i) => deleteRecordingsForApiKey(apiKey, i)),
  );

  for (const result of results) {
    totalSuccess += result.success;
    totalFailure += result.failure;
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
  apiKeyIndex = 0,
): Promise<void> {
  console.log(`🗑️  Deleting single recording: ${recordingId}`);

  if (DAILY_API_KEYS.length === 0) {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variables or update the script",
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
  fetchAndDeleteAllRecordings,
  deleteRecordingsForApiKey,
  deleteSingleRecording,
};

// Run the deletion script if this file is executed directly
// For ES modules, we need to check if the file path matches
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}
