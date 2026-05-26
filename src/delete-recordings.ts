import { fileURLToPath } from "url";

// Configuration - replace with your actual Daily.co API keys
const DAILY_API_KEYS: string[] = [].filter(Boolean); // Remove undefined values

// Fallback for single API key (backwards compatibility)
if (DAILY_API_KEYS.length === 0 && process.env.DAILY_API_KEY) {
  DAILY_API_KEYS.push(process.env.DAILY_API_KEY);
}

const DAILY_API_BASE = "https://api.daily.co/v1";

// Delete recordings that started before this date (ISO 8601: YYYY-MM-DD or full timestamp).
// Set to null to delete all recordings regardless of start date.
const DELETE_RECORDINGS_BEFORE_DATE: string | null = "2025-09-02";
// const DELETE_RECORDINGS_BEFORE_DATE: string | null = "2025-10-31";

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
  startingAfter?: string,
): Promise<Recording[]> {
  return retryWithBackoff(async () => {
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
      throw new RateLimitError(429, "Rate limited when fetching recordings");
    } else {
      // Throw instead of returning [] so transient errors don't masquerade as
      // end-of-pagination and silently abort the run mid-stream.
      const errorData = await response.text();
      throw new Error(
        `Failed to fetch recordings: ${response.status} ${response.statusText} — ${errorData}`,
      );
    }
  });
}

async function fetchAndDeleteAllRecordings(
  apiKey: string,
  cutoffDate: string | null,
  limit = 100,
): Promise<{ success: number; failure: number; skipped: number }> {
  let totalSuccess = 0;
  let totalFailure = 0;
  let totalSkipped = 0;
  let totalProcessed = 0;

  // start_ts from the Daily API is Unix seconds; convert cutoff to ms for comparison.
  // Treat null and "" the same (no filter). Throw on anything truthy that fails to
  // parse so callers see a non-zero exit rather than a silent zero-deletion run.
  const cutoffMs =
    cutoffDate === null || cutoffDate === ""
      ? null
      : new Date(cutoffDate).getTime();
  if (cutoffMs !== null && !Number.isFinite(cutoffMs)) {
    throw new Error(
      `Invalid DELETE_RECORDINGS_BEFORE_DATE: "${cutoffDate}" did not parse as a date`,
    );
  }

  console.log("📥 Fetching and deleting recordings...");
  if (cutoffMs !== null) {
    // Log the resolved instant so the operator can verify timezone semantics.
    // `new Date("YYYY-MM-DD")` is UTC midnight per ECMA-262; bare timestamps
    // without `Z` are parsed as LOCAL. The resolved ISO instant disambiguates.
    console.log(
      `🗓️  Only deleting recordings that started before ${cutoffDate} (resolved to ${new Date(cutoffMs).toISOString()})`,
    );
  }

  let recordings = await fetchRecordingsPage(apiKey, limit);

  while (recordings.length > 0) {
    const lastIdInPage = recordings[recordings.length - 1].id;

    // Guard against missing/non-numeric start_ts so an in-progress recording with
    // no timestamp doesn't get filtered as "older than any cutoff" (0 < cutoffMs).
    const toDelete =
      cutoffMs !== null
        ? recordings.filter(
            (r) => Number.isFinite(r.start_ts) && r.start_ts * 1000 < cutoffMs,
          )
        : recordings;
    const pageSkipped = recordings.length - toDelete.length;
    totalSkipped += pageSkipped;

    console.log(
      `📋 Fetched ${recordings.length} recordings${
        cutoffMs !== null
          ? `, ${toDelete.length} before cutoff (skipping ${pageSkipped})`
          : ""
      }${toDelete.length > 0 ? ", deleting now..." : ", nothing to delete this page"}`,
    );

    const results = await runWithConcurrency(
      toDelete,
      30,
      async (recording) => {
        totalProcessed++;
        console.log(
          `🗑️  [${totalProcessed}] Deleting: ${recording.id} (room: ${recording.room_name})`,
        );
        return deleteRecording(recording.id, apiKey);
      },
    );

    totalSuccess += results.filter(Boolean).length;
    totalFailure += results.filter((r) => !r).length;

    console.log(
      `📈 Progress: ${totalSuccess} succeeded, ${totalFailure} failed${
        cutoffMs !== null ? `, ${totalSkipped} skipped` : ""
      }`,
    );

    const wasFullPage = recordings.length >= limit;
    if (!wasFullPage) break;

    // Inter-page throttle so we don't hammer the API between batches.
    await sleep(50);

    // Fetch next page AFTER deletes finish. With a cutoff we paginate by cursor
    // (filtered-out recordings stay on the server so a cursor-less fetch would
    // loop on the same page). Without a cutoff, deletion advances the head and
    // no cursor is needed.
    recordings = await fetchRecordingsPage(
      apiKey,
      limit,
      cutoffMs !== null ? lastIdInPage : undefined,
    );
  }

  console.log(
    `📊 Total processed: ${totalSuccess} succeeded, ${totalFailure} failed${
      cutoffMs !== null ? `, ${totalSkipped} skipped` : ""
    }`,
  );
  return {
    success: totalSuccess,
    failure: totalFailure,
    skipped: totalSkipped,
  };
}

/**
 * Delete all recordings for a specific API key
 */
async function deleteRecordingsForApiKey(
  apiKey: string,
  keyIndex: number,
): Promise<{ success: number; failure: number; skipped: number }> {
  console.log(
    `\n🔑 Processing API key ${keyIndex + 1}/${DAILY_API_KEYS.length}...`,
  );

  const result = await fetchAndDeleteAllRecordings(
    apiKey,
    DELETE_RECORDINGS_BEFORE_DATE,
  );

  console.log(`\n📈 API Key ${keyIndex + 1} Final Summary:`);
  console.log(`✅ Successfully deleted: ${result.success} recordings`);
  console.log(`❌ Failed to delete: ${result.failure} recordings`);
  if (DELETE_RECORDINGS_BEFORE_DATE) {
    console.log(`⏭️  Skipped (after cutoff): ${result.skipped} recordings`);
  }

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

  if (DELETE_RECORDINGS_BEFORE_DATE) {
    console.log(
      `🗓️  Date filter enabled: Only deleting recordings that started before ${DELETE_RECORDINGS_BEFORE_DATE}`,
    );
  } else {
    console.log("⚠️  No date filter: Will delete ALL recordings");
  }

  let totalSuccess = 0;
  let totalFailure = 0;
  let totalSkipped = 0;
  let erroredKeys = 0;

  // Process all API keys concurrently. They are separate accounts.
  // allSettled so one key's fatal error doesn't discard the others' counters.
  const settled = await Promise.allSettled(
    DAILY_API_KEYS.map((apiKey, i) => deleteRecordingsForApiKey(apiKey, i)),
  );

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      totalSuccess += outcome.value.success;
      totalFailure += outcome.value.failure;
      totalSkipped += outcome.value.skipped;
    } else {
      erroredKeys++;
      console.error(`❌ API key ${i + 1} aborted:`, outcome.reason);
    }
  }

  console.log("\n🎉 Final Summary Across All API Keys:");
  console.log(`✅ Total successfully deleted: ${totalSuccess} recordings`);
  console.log(`❌ Total failed to delete: ${totalFailure} recordings`);
  if (DELETE_RECORDINGS_BEFORE_DATE) {
    console.log(`⏭️  Total skipped (after cutoff): ${totalSkipped} recordings`);
  }
  if (erroredKeys > 0) {
    console.log(`🚨 API keys that aborted mid-run: ${erroredKeys}`);
  }
  console.log("🏁 Finished deleting recordings from all accounts");

  if (erroredKeys > 0) {
    throw new Error(`${erroredKeys} API key(s) aborted mid-run`);
  }
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
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
