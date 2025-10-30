import { fileURLToPath } from "url";

// Configuration - replace with your actual Daily.co API keys
const DAILY_API_KEYS = [""].filter(Boolean); // Remove undefined values

// Fallback for single API key (backwards compatibility)
if (DAILY_API_KEYS.length === 0 && process.env.DAILY_API_KEY) {
  DAILY_API_KEYS.push(process.env.DAILY_API_KEY);
}

const DAILY_API_BASE = "https://api.daily.co/v1";

// Delete rooms created before this date (ISO 8601 format: YYYY-MM-DD or full timestamp)
// Set to null to delete all rooms regardless of creation date
const DELETE_ROOMS_BEFORE_DATE: string | null = "2022-07-11"; // Example: Delete rooms created before Jan 1, 2025

interface Room {
  id: string;
  name: string;
  api_created: boolean;
  privacy: string;
  url: string;
  created_at: string;
  config: Record<string, unknown>;
}

interface RoomsResponse {
  total_count: number;
  data: Room[];
}

interface BatchDeleteResponse {
  deleted_count: number;
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
 * Filter rooms based on creation date
 * Only returns rooms created before the specified cutoff date
 */
function filterRoomsByDate(rooms: Room[], cutoffDate: string | null): Room[] {
  if (!cutoffDate) {
    return rooms; // No filtering if cutoff date is not set
  }

  const cutoffTimestamp = new Date(cutoffDate).getTime();
  const filteredRooms = rooms.filter((room) => {
    const roomCreatedAt = new Date(room.created_at).getTime();
    return roomCreatedAt < cutoffTimestamp;
  });

  return filteredRooms;
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
 * Delete rooms in batch using Daily.co REST API
 * Maximum of 1000 rooms can be deleted per call
 * Returns the count of deleted rooms
 */
async function batchDeleteRooms(
  roomNames: string[],
  apiKey: string
): Promise<number> {
  try {
    return await retryWithBackoff(async () => {
      const response = await fetch(`${DAILY_API_BASE}/batch/rooms`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_names: roomNames,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as BatchDeleteResponse;
        const deletedCount = data.deleted_count ?? 0;
        console.log(`✅ Successfully deleted ${deletedCount} rooms`);
        return deletedCount;
      } else if (response.status === 429) {
        // Rate limited - throw custom error to trigger retry
        throw new RateLimitError(429, "Rate limited when deleting rooms");
      } else {
        const errorData = await response.text();
        console.error(
          `❌ Failed to delete rooms batch: ${response.status} ${response.statusText}`
        );
        console.error("Error details:", errorData);
        return 0;
      }
    });
  } catch (error) {
    if (error instanceof RateLimitError && error.status === 429) {
      console.error(
        "❌ Rate limit exceeded for batch room deletion after all retries"
      );
    } else {
      console.error("❌ Error deleting rooms batch:", error);
    }
    return 0;
  }
}

/**
 * Get all rooms using Daily.co REST API with pagination
 */
async function getRooms(apiKey: string, limit = 100): Promise<Room[]> {
  const allRooms: Room[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  console.log("📥 Fetching rooms with pagination...");

  while (hasMore) {
    try {
      const rooms = await retryWithBackoff(async () => {
        const url = new URL(`${DAILY_API_BASE}/rooms`);
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
          const data = (await response.json()) as RoomsResponse;
          return data.data ?? [];
        } else if (response.status === 429) {
          // Rate limited - throw custom error to trigger retry
          throw new RateLimitError(429, "Rate limited when fetching rooms");
        } else {
          const errorData = await response.text();
          console.error(
            `Failed to fetch rooms: ${response.status} ${response.statusText}`
          );
          console.error("Error details:", errorData);
          return [];
        }
      });

      if (rooms.length === 0) {
        hasMore = false;
        break;
      }

      allRooms.push(...rooms);
      console.log(
        `📋 Fetched ${rooms.length} rooms (total: ${allRooms.length})`
      );

      // If we got fewer results than the limit, we've reached the end
      if (rooms.length < limit) {
        hasMore = false;
      } else {
        // Use the last room ID as the cursor for the next page
        startingAfter = rooms[rooms.length - 1].id;
      }

      // Add a small delay between pagination requests
      if (hasMore) {
        await sleep(100);
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.error(
          "❌ Rate limit exceeded when fetching rooms after all retries"
        );
      } else {
        console.error("Error fetching rooms:", error);
      }
      hasMore = false; // Stop pagination on error
    }
  }

  console.log(`📊 Total rooms fetched: ${allRooms.length}`);
  return allRooms;
}

/**
 * Delete all rooms for a specific API key with batch processing
 */
async function deleteRoomsForApiKey(
  apiKey: string,
  keyIndex: number
): Promise<{ success: number; failure: number }> {
  console.log(
    `\n🔑 Processing API key ${keyIndex + 1}/${DAILY_API_KEYS.length}...`
  );

  try {
    const rooms = await getRooms(apiKey);

    if (rooms.length === 0) {
      console.log(`✨ No rooms found for API key ${keyIndex + 1}`);
      return { success: 0, failure: 0 };
    }

    console.log(
      `📊 Found ${rooms.length} total rooms for API key ${keyIndex + 1}`
    );

    // Filter rooms by creation date
    const roomsToDelete = filterRoomsByDate(rooms, DELETE_ROOMS_BEFORE_DATE);

    if (DELETE_ROOMS_BEFORE_DATE) {
      console.log(
        `🗓️  Filtering rooms created before ${DELETE_ROOMS_BEFORE_DATE}`
      );
      console.log(
        `📋 ${roomsToDelete.length} rooms match the date filter (${
          rooms.length - roomsToDelete.length
        } rooms excluded)`
      );
    }

    if (roomsToDelete.length === 0) {
      console.log(
        `✨ No rooms to delete for API key ${
          keyIndex + 1
        } (after date filtering)`
      );
      return { success: 0, failure: 0 };
    }

    console.log(
      `🎯 Will delete ${roomsToDelete.length} rooms for API key ${keyIndex + 1}`
    );

    // Process rooms in batches of 1000 (API limit)
    const batchSize = 1000;
    const batches = chunkArray(roomsToDelete, batchSize);

    let successCount = 0;
    let failureCount = 0;

    console.log(
      `🚀 Processing ${batches.length} batch(es) of up to ${batchSize} rooms each...`
    );

    // Process each batch sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNumber = batchIndex + 1;

      console.log(
        `\n📦 Processing batch ${batchNumber}/${batches.length} (${batch.length} rooms)...`
      );

      // Extract room names for batch deletion
      const roomNames = batch.map((room) => room.name);

      console.log(
        `🗑️  Deleting batch of ${roomNames.length} rooms: ${roomNames
          .slice(0, 5)
          .join(", ")}${roomNames.length > 5 ? "..." : ""}`
      );

      const deletedCount = await batchDeleteRooms(roomNames, apiKey);

      const batchSuccess = deletedCount;
      const batchFailure = batch.length - deletedCount;

      successCount += batchSuccess;
      failureCount += batchFailure;

      console.log(
        `✅ Batch ${batchNumber} complete: ${batchSuccess} succeeded, ${batchFailure} failed`
      );
      console.log(
        `📈 Overall progress: ${successCount + failureCount}/${
          roomsToDelete.length
        } processed (${successCount} succeeded, ${failureCount} failed)`
      );

      // Add a delay between batches to be respectful to the API
      if (batchIndex < batches.length - 1) {
        console.log("⏳ Waiting before next batch...");
        await sleep(500); // 500ms delay between batches
      }
    }

    console.log(`\n📈 API Key ${keyIndex + 1} Final Summary:`);
    console.log(`✅ Successfully deleted: ${successCount} rooms`);
    console.log(`❌ Failed to delete: ${failureCount} rooms`);
    console.log(
      `📊 Success rate: ${((successCount / roomsToDelete.length) * 100).toFixed(
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
 * Delete all rooms across all API keys
 */
async function main(): Promise<void> {
  console.log("🚀 Starting room deletion process...");

  if (DAILY_API_KEYS.length === 0) {
    console.error(
      "❌ Please set your DAILY_API_KEY environment variables (DAILY_API_KEY_1, DAILY_API_KEY_2, etc.) or DAILY_API_KEY"
    );
    return;
  }

  console.log(`🔑 Found ${DAILY_API_KEYS.length} API key(s) to process`);

  if (DELETE_ROOMS_BEFORE_DATE) {
    console.log(
      `🗓️  Date filter enabled: Only deleting rooms created before ${DELETE_ROOMS_BEFORE_DATE}`
    );
  } else {
    console.log("⚠️  No date filter: Will delete ALL rooms");
  }

  let totalSuccess = 0;
  let totalFailure = 0;

  // Process each API key
  for (let i = 0; i < DAILY_API_KEYS.length; i++) {
    const apiKey = DAILY_API_KEYS[i];
    if (!apiKey) continue;

    const result = await deleteRoomsForApiKey(apiKey, i);
    totalSuccess += result.success;
    totalFailure += result.failure;

    // Add a delay between API keys to be respectful
    if (i < DAILY_API_KEYS.length - 1) {
      console.log("⏳ Waiting before processing next API key...");
      await sleep(1000);
    }
  }

  console.log("\n🎉 Final Summary Across All API Keys:");
  console.log(`✅ Total successfully deleted: ${totalSuccess} rooms`);
  console.log(`❌ Total failed to delete: ${totalFailure} rooms`);
  console.log("🏁 Finished deleting rooms from all accounts");
}

/**
 * Delete a batch of rooms by names using the first available API key
 */
async function deleteBatchOfRooms(
  roomNames: string[],
  apiKeyIndex = 0
): Promise<void> {
  console.log(`🗑️  Deleting batch of ${roomNames.length} rooms`);

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

  if (roomNames.length > 1000) {
    console.error(
      `❌ Cannot delete more than 1000 rooms in a single batch. Provided: ${roomNames.length}`
    );
    return;
  }

  await batchDeleteRooms(roomNames, apiKey);
}

// Export functions for use in other modules
export { batchDeleteRooms, getRooms, deleteRoomsForApiKey, deleteBatchOfRooms };

// Run the deletion script if this file is executed directly
// For ES modules, we need to check if the file path matches
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}
