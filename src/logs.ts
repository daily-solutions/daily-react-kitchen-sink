#!/usr/bin/env node

interface Meeting {
  id: string;
  room: string;
  start_time: number;
  duration: number;
  ongoing: boolean;
  participants: Record<
    string,
    {
      user_name: string;
      join_time: number;
      duration: number;
    }
  >;
}

interface MeetingsResponse {
  data: Meeting[];
  total_count: number;
}

async function getRecentMeetings(): Promise<Meeting[]> {
  const apiKey = process.env.DAILY_API_KEY;

  if (!apiKey) {
    console.error("DAILY_API_KEY environment variable is required");
    process.exit(1);
  }

  const baseUrl = "https://api.daily.co/v1/meetings";
  const allMeetings: Meeting[] = [];
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
    `Fetching meetings from ${monthName} (${previousMonthStart.toISOString()} to ${previousMonthEnd.toISOString()})...`
  );

  // Fetch meetings with time-based filtering
  let hasMoreMeetings = true;
  let requestCount = 0;
  const startTime = Date.now();

  while (hasMoreMeetings) {
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
    url.searchParams.append("timeframe_start", timeframeStart.toString());
    url.searchParams.append("timeframe_end", timeframeEnd.toString());
    url.searchParams.append("no_participants", "true"); // Don't fetch participant details for performance

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
          console.log("No meetings found or endpoint not available");
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
        `Failed to fetch meetings after ${maxRetries + 1} attempts`
      );
    }

    const data = (await response.json()) as MeetingsResponse;

    if (!data.data || data.data.length === 0) {
      console.log("No more meetings available, ending pagination");
      hasMoreMeetings = false;
      break;
    }

    allMeetings.push(...data.data);
    console.log(
      `Fetched ${data.data.length} meetings (total: ${allMeetings.length})`
    );

    // Use the last item's ID as the cursor for the next page
    startingAfter = data.data[data.data.length - 1].id;

    // If we got fewer results than the limit, we've reached the end
    if (data.data.length < limit) {
      console.log("Received fewer results than limit, reached end of data");
      hasMoreMeetings = false;
      break;
    }
  }

  return allMeetings;
}

async function main(): Promise<void> {
  console.log("Fetching meetings from the previous month...");

  const meetings = await getRecentMeetings();

  // Calculate total duration in seconds
  const totalDurationSeconds = meetings.reduce(
    (total, meeting) => total + meeting.duration,
    0
  );

  // Convert to hours and minutes for better readability
  const totalHours = Math.floor(totalDurationSeconds / 3600);
  const remainingMinutes = Math.floor((totalDurationSeconds % 3600) / 60);
  const remainingSeconds = totalDurationSeconds % 60;

  console.log(
    `\nFinal result: ${meetings.length} meetings found from previous month`
  );
  console.log(
    `Total duration: ${totalDurationSeconds} seconds (${totalHours}h ${remainingMinutes}m ${remainingSeconds}s)`
  );
  console.log("\nLast 10 meetings (oldest first):");

  // Show last 10 meetings with detailed info (oldest first)
  const lastTen = meetings.slice(-10);
  lastTen.forEach((meeting: Meeting, index: number) => {
    const startTime = new Date(meeting.start_time * 1000).toISOString();
    const durationMinutes = Math.floor(meeting.duration / 60);
    const durationSeconds = meeting.duration % 60;

    console.log(
      `${index + 1}. ${meeting.room} (${
        meeting.id
      }) - Started: ${startTime} - Duration: ${durationMinutes}m ${durationSeconds}s ${
        meeting.ongoing ? "(ongoing)" : ""
      }`
    );
  });

  if (meetings.length > 10) {
    console.log(`\n... and ${meetings.length - 10} more meetings before these`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
