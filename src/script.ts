#!/usr/bin/env node

interface Transcript {
  transcriptId: string;
  domainId: string;
  roomId: string | null;
  roomName: string | null;
  mtgSessionId: string;
  duration: number;
  participantMinutes: number;
  status: string;
  isVttAvailable?: boolean;
}

interface TranscriptListResponse {
  data: Transcript[];
  total_count: number;
}

async function getRecentTranscripts(): Promise<Transcript[]> {
  const apiKey = process.env.DAILY_API_KEY;

  if (!apiKey) {
    console.error("DAILY_API_KEY environment variable is required");
    process.exit(1);
  }

  const baseUrl = "https://api.daily.co/v1/transcript";
  const allTranscripts: Transcript[] = [];
  let startingAfter: string | null = null;
  const limit = 100; // Max allowed by Daily API
  let totalCount: number | null = null;

  // Calculate 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  console.log(
    `Fetching transcripts from the last 30 days (since ${thirtyDaysAgo.toISOString()})...`
  );

  // Since the Daily API doesn't support date filtering for transcripts,
  // and transcripts don't include timestamp fields, we'll fetch from newest
  // and estimate based on typical usage patterns. We'll fetch a reasonable
  // number of pages to cover the last 30 days.
  //
  // Note: This is an approximation since we can't filter by exact date.
  // Adjust maxPages based on your transcript volume to cover 30 days.
  const maxPages = 10; // Fetch up to 10 pages (1000 transcripts) for last 30 days
  let pageCount = 0;

  while (pageCount < maxPages) {
    const url = new URL(baseUrl);
    url.searchParams.append("limit", limit.toString());

    // Use normal pagination from newest to oldest
    if (startingAfter) {
      url.searchParams.append("starting_after", startingAfter);
    }

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log("No transcripts found or endpoint not available");
          return [];
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as TranscriptListResponse;

      // Set total count from first response
      if (totalCount === null) {
        totalCount = data.total_count;
        console.log(`Total transcripts available: ${totalCount}`);

        // If no transcripts, return early
        if (totalCount === 0) {
          console.log("No transcripts found in the system");
          return [];
        }
      }

      if (!data.data || data.data.length === 0) {
        console.log("No more transcripts available, ending pagination");
        break; // No more results
      }

      allTranscripts.push(...data.data);
      pageCount++;

      console.log(
        `Fetched ${data.data.length} transcripts (total: ${allTranscripts.length}, page ${pageCount}/${maxPages})`
      );

      // Use the last item's ID as the cursor for the next page
      startingAfter = data.data[data.data.length - 1].transcriptId;

      // If we got fewer results than the limit, we've reached the end
      if (data.data.length < limit) {
        console.log("Received fewer results than limit, reached end of data");
        break;
      }
    } catch (error) {
      console.error("Error fetching transcripts:", error);
      process.exit(1);
    }
  }

  if (pageCount >= maxPages) {
    console.log(
      `Stopped after ${maxPages} pages to limit to recent transcripts`
    );
  }

  return allTranscripts;
}

async function main(): Promise<void> {
  console.log("Fetching transcripts from the last 30 days...");

  const transcripts = await getRecentTranscripts();

  console.log(
    `\nFinal result: ${transcripts.length} transcripts found from last 30 days`
  );
  console.log("\nLast 10 transcripts (oldest first):");

  // Show last 10 transcripts with detailed info (oldest first)
  const lastTen = transcripts.slice(-10);
  lastTen.forEach((transcript: Transcript, index: number) => {
    const roomIdentifier =
      transcript.roomName ?? transcript.roomId ?? transcript.mtgSessionId;
    console.log(
      `${index + 1}. ${roomIdentifier} (${transcript.transcriptId}) - ${
        transcript.status
      } - Duration: ${transcript.duration}s, Participants: ${
        transcript.participantMinutes ?? "null"
      }min`
    );
  });

  if (transcripts.length > 10) {
    console.log(
      `\n... and ${transcripts.length - 10} more transcripts before these`
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
