#!/usr/bin/env node

interface Recording {
  id: string;
  room_name: string;
  mtgSessionId: string;
  status: string;
  start_ts: number;
  duration: number;
  max_participants?: number;
  share_token?: string;
  s3key?: string;
  isVttEnabled?: boolean;
  tracks?: unknown[];
}

interface RecordingsResponse {
  data: Recording[];
  total_count: number;
}

async function getRecentRecordings(): Promise<Recording[]> {
  const apiKey = process.env.DAILY_API_KEY;

  if (!apiKey) {
    console.error("DAILY_API_KEY environment variable is required");
    process.exit(1);
  }

  const baseUrl = "https://api.daily.co/v1/recordings";
  const allRecordings: Recording[] = [];
  let startingAfter: string | null = null;
  const limit = 100; // Max allowed by Daily API

  // Calculate previous month's start and end timestamps (Unix timestamp in seconds)
  const now = new Date();
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999
  );

  const timeframeStart = Math.floor(previousMonthStart.getTime() / 1000);
  const timeframeEnd = Math.floor(previousMonthEnd.getTime() / 1000);

  const monthName = previousMonthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  console.log(
    `Fetching recordings from ${monthName} (${previousMonthStart.toISOString()} to ${previousMonthEnd.toISOString()})...`
  );

  // Fetch recordings with pagination
  let hasMoreRecordings = true;
  let requestCount = 0;
  const startTime = Date.now();

  while (hasMoreRecordings) {
    // Rate limiting: 20 requests per second
    requestCount++;
    const elapsedTime = Date.now() - startTime;
    const expectedMinTime = (requestCount - 1) * 50; // 50ms between requests (20 req/sec)

    if (elapsedTime < expectedMinTime) {
      const delayTime = expectedMinTime - elapsedTime;
      console.log(
        `Rate limiting: waiting ${delayTime}ms before next request...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayTime));
    }

    const url = new URL(baseUrl);
    url.searchParams.append("limit", limit.toString());

    if (startingAfter) {
      url.searchParams.append("starting_after", startingAfter);
    }

    let retries = 0;
    const maxRetries = 5;
    let response: Response | undefined;

    // Exponential backoff for rate limiting
    while (retries <= maxRetries) {
      try {
        response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          break; // Success, exit retry loop
        }

        if (response.status === 404) {
          console.log("No recordings found or endpoint not available");
          return [];
        }

        if (response.status === 429) {
          // Rate limit exceeded - implement exponential backoff
          if (retries < maxRetries) {
            const backoffDelay = Math.pow(2, retries) * 1000; // 1s, 2s, 4s, 8s, 16s
            console.log(
              `Rate limit exceeded (429). Retrying in ${
                backoffDelay / 1000
              }s... (attempt ${retries + 1}/${maxRetries + 1})`
            );
            await new Promise((resolve) => setTimeout(resolve, backoffDelay));
            retries++;
            continue;
          } else {
            throw new Error(
              `Rate limit exceeded after ${maxRetries + 1} attempts`
            );
          }
        }

        // Other HTTP errors
        throw new Error(`HTTP error! status: ${response.status}`);
      } catch (error) {
        if (
          retries < maxRetries &&
          (error as Error).message.includes("fetch")
        ) {
          // Network error - retry with exponential backoff
          const backoffDelay = Math.pow(2, retries) * 1000;
          console.log(
            `Network error. Retrying in ${backoffDelay / 1000}s... (attempt ${
              retries + 1
            }/${maxRetries + 1})`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          retries++;
          continue;
        }
        throw error; // Re-throw if not retryable or max retries reached
      }
    }

    // Check if we have a successful response
    if (!response?.ok) {
      throw new Error(
        `Failed to fetch recordings after ${maxRetries + 1} attempts`
      );
    }

    const data = (await response.json()) as RecordingsResponse;

    if (!data.data || data.data.length === 0) {
      console.log("No more recordings available, ending pagination");
      hasMoreRecordings = false;
      break;
    }

    // Filter recordings to only include those from the previous month
    const filteredRecordings = data.data.filter((recording) => {
      return (
        recording.start_ts >= timeframeStart &&
        recording.start_ts <= timeframeEnd
      );
    });

    allRecordings.push(...filteredRecordings);
    console.log(
      `Fetched ${data.data.length} recordings, ${filteredRecordings.length} from target month (total: ${allRecordings.length})`
    );

    // Use the last item's ID as the cursor for the next page
    startingAfter = data.data[data.data.length - 1].id;

    // If we got fewer results than the limit, we've reached the end
    if (data.data.length < limit) {
      console.log("Received fewer results than limit, reached end of data");
      hasMoreRecordings = false;
      break;
    }

    // If no recordings in this batch match our timeframe and we're past the end date,
    // we can stop fetching (since recordings are sorted by start_ts in reverse chronological order)
    if (
      filteredRecordings.length === 0 &&
      data.data.every((r) => r.start_ts < timeframeStart)
    ) {
      console.log("Reached recordings older than target month, stopping");
      hasMoreRecordings = false;
      break;
    }
  }

  return allRecordings;
}

async function main(): Promise<void> {
  console.log("Fetching recordings from the previous month...");

  const recordings = await getRecentRecordings();

  // Calculate total duration in seconds
  const totalDurationSeconds = recordings.reduce(
    (total: number, recording: Recording) => total + recording.duration,
    0
  );

  // Convert to hours and minutes for better readability
  const totalHours = Math.floor(totalDurationSeconds / 3600);
  const remainingMinutes = Math.floor((totalDurationSeconds % 3600) / 60);
  const remainingSeconds = totalDurationSeconds % 60;

  console.log(
    `\nFinal result: ${recordings.length} recordings found from previous month`
  );
  console.log(
    `Total duration: ${totalDurationSeconds} seconds (${totalHours}h ${remainingMinutes}m ${remainingSeconds}s)`
  );
  console.log("\nLast 10 recordings (oldest first):");

  // Show last 10 recordings with detailed info (oldest first)
  const lastTen = recordings.slice(-10);
  lastTen.forEach((recording: Recording, index: number) => {
    const startTime = new Date(recording.start_ts * 1000).toISOString();
    const durationMinutes = Math.floor(recording.duration / 60);
    const durationSeconds = recording.duration % 60;

    console.log(
      `${index + 1}. ${recording.room_name} (${
        recording.id
      }) - Started: ${startTime} - Duration: ${durationMinutes}m ${durationSeconds}s - Status: ${
        recording.status
      }`
    );
  });

  if (recordings.length > 10) {
    console.log(
      `\n... and ${recordings.length - 10} more recordings before these`
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
