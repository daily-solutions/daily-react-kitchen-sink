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

interface RecordingAccessLink {
  download_link: string;
  expires: number;
}

interface RecordingWithLink extends Recording {
  download_link?: string;
  expires?: number;
  error?: string;
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
 * Get access link for a specific recording by ID using Daily.co REST API
 */
async function getRecordingAccessLink(
  recordingId: string,
  apiKey: string,
  validForSecs = 3600
): Promise<RecordingAccessLink | null> {
  try {
    return await retryWithBackoff(async () => {
      const response = await fetch(
        `${DAILY_API_BASE}/recordings/${recordingId}/access-link?valid_for_secs=${validForSecs}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = (await response.json()) as RecordingAccessLink;
        console.log(
          `✅ Successfully got access link for recording: ${recordingId}`
        );
        return data;
      } else if (response.status === 429) {
        // Rate limited - throw custom error to trigger retry
        throw new RateLimitError(
          429,
          `Rate limited when getting access link for recording ${recordingId}`
        );
      } else {
        const errorData = await response.text();
        console.error(
          `❌ Failed to get access link for recording ${recordingId}: ${response.status} ${response.statusText}`
        );
        console.error("Error details:", errorData);
        return null;
      }
    });
  } catch (error) {
    if (error instanceof RateLimitError && error.status === 429) {
      console.error(
        `❌ Rate limit exceeded for recording ${recordingId} after all retries`
      );
    } else {
      console.error(
        `❌ Error getting access link for recording ${recordingId}:`,
        error
      );
    }
    return null;
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
 * Get recording links for a specific API key with parallel processing
 */
async function getRecordingLinksForApiKey(
  apiKey: string,
  keyIndex: number,
  validForSecs = 3600
): Promise<RecordingWithLink[]> {
  console.log(
    `\n🔑 Processing API key ${keyIndex + 1}/${DAILY_API_KEYS.length}...`
  );

  try {
    const recordings = await getRecordings(apiKey);

    if (recordings.length === 0) {
      console.log(`✨ No recordings found for API key ${keyIndex + 1}`);
      return [];
    }

    console.log(
      `📊 Found ${recordings.length} recordings to get links for API key ${
        keyIndex + 1
      }`
    );

    // Process recordings in parallel batches to avoid overwhelming the API
    const batchSize = 20; // Number of parallel requests per batch
    const batches = chunkArray(recordings, batchSize);

    const recordingsWithLinks: RecordingWithLink[] = [];
    let processedCount = 0;

    console.log(
      `🚀 Processing ${batches.length} batches of ${batchSize} recordings each...`
    );

    // Process each batch in parallel
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNumber = batchIndex + 1;

      console.log(
        `\n📦 Processing batch ${batchNumber}/${batches.length} (${batch.length} recordings)...`
      );

      // Get access links for all recordings in this batch in parallel
      const batchPromises = batch.map(async (recording, recordingIndex) => {
        const globalIndex = batchIndex * batchSize + recordingIndex + 1;
        console.log(
          `� [${globalIndex}/${recordings.length}] Getting link: ${recording.id} (room: ${recording.room_name})`
        );

        const accessLink = await getRecordingAccessLink(
          recording.id,
          apiKey,
          validForSecs
        );

        if (accessLink) {
          return {
            ...recording,
            download_link: accessLink.download_link,
            expires: accessLink.expires,
          } as RecordingWithLink;
        } else {
          return {
            ...recording,
            error: "Failed to get access link",
          } as RecordingWithLink;
        }
      });

      // Wait for all requests in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      recordingsWithLinks.push(...batchResults);

      processedCount += batch.length;

      const successCount = batchResults.filter((r) => r.download_link).length;
      const failureCount = batchResults.filter((r) => r.error).length;

      console.log(
        `✅ Batch ${batchNumber} complete: ${successCount} succeeded, ${failureCount} failed`
      );
      console.log(
        `📈 Overall progress: ${processedCount}/${recordings.length} processed`
      );

      // Add a delay between batches to be respectful to the API
      if (batchIndex < batches.length - 1) {
        console.log("⏳ Waiting before next batch...");
        await sleep(500); // 500ms delay between batches
      }
    }

    const successCount = recordingsWithLinks.filter(
      (r) => r.download_link
    ).length;
    const failureCount = recordingsWithLinks.filter((r) => r.error).length;

    console.log(`\n📈 API Key ${keyIndex + 1} Final Summary:`);
    console.log(`✅ Successfully got links for: ${successCount} recordings`);
    console.log(`❌ Failed to get links for: ${failureCount} recordings`);
    console.log(
      `📊 Success rate: ${((successCount / recordings.length) * 100).toFixed(
        1
      )}%`
    );

    return recordingsWithLinks;
  } catch (error) {
    console.error(`❌ Error processing API key ${keyIndex + 1}:`, error);
    return [];
  }
}

/**
 * Generate recording links across all API keys
 */
async function main(): Promise<void> {
  console.log("🚀 Starting recording link generation process...");

  if (DAILY_API_KEYS.length === 0) {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variables (DAILY_API_KEY_1, DAILY_API_KEY_2, etc.) or DAILY_API_KEY"
    );
    return;
  }

  console.log(`🔑 Found ${DAILY_API_KEYS.length} API key(s) to process`);

  const allRecordingsWithLinks: RecordingWithLink[] = [];

  // Process each API key
  for (let i = 0; i < DAILY_API_KEYS.length; i++) {
    const apiKey = DAILY_API_KEYS[i];
    if (!apiKey) continue;

    const recordingsWithLinks = await getRecordingLinksForApiKey(apiKey, i);
    allRecordingsWithLinks.push(...recordingsWithLinks);

    // Add a delay between API keys to be respectful
    if (i < DAILY_API_KEYS.length - 1) {
      console.log("⏳ Waiting before processing next API key...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const successCount = allRecordingsWithLinks.filter(
    (r) => r.download_link
  ).length;
  const failureCount = allRecordingsWithLinks.filter((r) => r.error).length;

  console.log("\n🎉 Final Summary Across All API Keys:");
  console.log(`✅ Total recordings with links: ${successCount}`);
  console.log(`❌ Total failed to get links: ${failureCount}`);
  console.log(
    `📊 Total recordings processed: ${allRecordingsWithLinks.length}`
  );

  // Output the links in a readable format
  console.log("\n📋 Recording Links:");
  console.log("=".repeat(80));

  allRecordingsWithLinks.forEach((recording, index) => {
    console.log(`\n${index + 1}. Recording ID: ${recording.id}`);
    console.log(`   Room: ${recording.room_name}`);
    console.log(`   Status: ${recording.status}`);
    console.log(`   Duration: ${recording.duration} seconds`);
    console.log(
      `   Start Time: ${new Date(recording.start_ts * 1000).toISOString()}`
    );

    if (recording.download_link) {
      console.log(`   Download Link: ${recording.download_link}`);
      console.log(
        `   Expires: ${new Date(recording.expires! * 1000).toISOString()}`
      );
    } else if (recording.error) {
      console.log(`   ❌ Error: ${recording.error}`);
    }
  });

  console.log("\n" + "=".repeat(80));
  console.log("🏁 Finished generating recording links from all accounts");

  // Optionally write to a JSON file for easy import
  const outputData = {
    generated_at: new Date().toISOString(),
    total_recordings: allRecordingsWithLinks.length,
    successful: successCount,
    failed: failureCount,
    recordings: allRecordingsWithLinks,
  };

  console.log("\n📄 Recording data (JSON format):");
  console.log(JSON.stringify(outputData, null, 2));
}

/**
 * Get access link for a single recording by ID using the first available API key
 */
async function getSingleRecordingLink(
  recordingId: string,
  apiKeyIndex = 0,
  validForSecs = 3600
): Promise<RecordingAccessLink | null> {
  console.log(`� Getting link for single recording: ${recordingId}`);

  if (DAILY_API_KEYS.length === 0) {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variables or update the script"
    );
    return null;
  }

  const apiKey = DAILY_API_KEYS[apiKeyIndex];
  if (!apiKey) {
    console.error(`❌ API key at index ${apiKeyIndex} is not available`);
    return null;
  }

  return await getRecordingAccessLink(recordingId, apiKey, validForSecs);
}

// Export functions for use in other modules
export {
  getRecordingAccessLink,
  getRecordings,
  getRecordingLinksForApiKey,
  getSingleRecordingLink,
};

// Run the generate recording links script if this file is executed directly
// For ES modules, we need to check if the file path matches
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}
