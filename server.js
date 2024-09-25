import express from "express";
import ViteExpress from "vite-express";

// MAKE SURE YOU HAVE ADDED YOUR API KEY IN THE .env file
const DAILY_API_KEY = process.env.DAILY_API_KEY;

if (!DAILY_API_KEY) {
  console.error("DAILY_API_KEY is missing in .env file");
  process.exit(1);
}

const app = express();

app.use(express.json());

app.post("/rooms", async (request, response) => {
  const roomProperties = { ...request.body };

  // Use fetch to send a POST request to Daily API to create a room
  const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify(roomProperties),
  });

  // Parse the response from Daily API
  const dailyRoom = await dailyResponse.json();

  // Send the response back to the client

  response.json(dailyRoom);
});

app.post("/meeting-tokens", async (request, response) => {
  console.log("request.body", request.body);
  const tokenProperties = { ...request.body };

  // Use fetch to send a POST request to Daily API to create a meeting token
  const dailyResponse = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify(tokenProperties),
  });

  // Parse the response from Daily API
  const dailyRoom = await dailyResponse.json();

  // Send the response back to the client

  response.json(dailyRoom);
});

async function getPageOfRecordings(endingBefore, startingAfter) {
  const params = new URLSearchParams({
    ending_before: endingBefore,
    limit: "100",
  });

  if (startingAfter) {
    params.set("starting_after", startingAfter);
  }
  console.debug("params", params.toString());

  let retries = 5; // Maximum number of retries
  let backoff = 1000; // Initial backoff time in milliseconds

  while (retries > 0) {
    try {
      const res = await fetch(`https://api.daily.co/v1/recordings?${params}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DAILY_API_KEY}`,
        },
      });

      if (res.status === 429) {
        // Rate limit error
        console.log("Rate limit hit. Retrying after backoff... ", retries);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff *= 2; // Exponential backoff
        retries--;
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const json = await res.json();
      console.log("json", json);
      return json;
    } catch (error) {
      console.error("Error fetching recordings:", error);
      if (retries === 1) {
        throw error; // Rethrow error if no retries are left
      }
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff *= 2; // Exponential backoff
      retries--;
    }
  }

  throw new Error("Failed to fetch recordings after retries.");
}

app.get("/get-recordings", async (request, response) => {
  // Parse the response from Daily API
  const dailyRecordings = await getPageOfRecordings("OLDEST");

  let lastRecordingId =
    dailyRecordings.data[dailyRecordings.data.length - 1].id;
  let firstRecordingId = dailyRecordings.data[0].id || "OLDEST";
  let responseJson = [...dailyRecordings.data];

  console.log("firstRecordingId", firstRecordingId);
  console.log("lastRecordingId", lastRecordingId);

  while (lastRecordingId) {
    const recordingsPage = await getPageOfRecordings(
      firstRecordingId,
      lastRecordingId
    );

    if (recordingsPage.data.length === 0) {
      break;
    }
    const lastRecording = recordingsPage.data[recordingsPage.data.length - 1];
    const lastRecordingDate = lastRecording.start_ts;
    lastRecordingId = lastRecording.id;
    firstRecordingId = recordingsPage.data[0].id;

    const limitTimeStamp = Math.floor(
      new Date("2025-05-08T00:00:00Z").getTime() / 1000
    );
    const lastRecordingReadableDate = new Date(lastRecordingDate * 1000); // Multiply by 1000 to convert seconds to milliseconds

    const limitTimestapReadableDate = new Date(limitTimeStamp * 1000); // Multiply by 1000 to convert seconds to milliseconds
    if (lastRecordingDate > limitTimeStamp) {
      console.log("Recording date is after limit date. Stopping...");
      responseJson = [];
      break;
    }

    const ids = recordingsPage.data.map((recording) => recording.id);

    const deleteResult = await deleteRecordings(ids);

    responseJson = [...responseJson, ...recordingsPage.data];
  }

  // Send the response back to the client

  response.json(responseJson);
});

async function deleteRecordings(recordingIds) {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 5000; // 5 seconds

  const deleteRecording = async (recordingId, retries = MAX_RETRIES) => {
    console.log(
      `Deleting recording with ID ${recordingId}. Retries left: ${retries}`
    );
    try {
      const response = await fetch(
        `https://api.daily.co/v1/recordings/${recordingId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DAILY_API_KEY}`,
          },
        }
      );

      if (response.status === 429 && retries > 0) {
        // Rate limit error
        console.log(
          `Rate limit hit for recording ID ${recordingId}. Retrying in ${
            RETRY_DELAY / 1000
          } seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return deleteRecording(recordingId, retries - 1);
      }

      if (!response.ok) {
        console.error(
          `Failed to delete recording with ID ${recordingId}: ${response.statusText}`
        );
        return { recordingId, success: false };
      }

      // console.log(`Successfully deleted recording with ID ${recordingId}`);
      return { recordingId, success: true };
    } catch (error) {
      console.error(`Error deleting recording with ID ${recordingId}:`, error);
      if (retries > 0) {
        console.warn(
          `Retrying recording ID ${recordingId} in ${
            RETRY_DELAY / 1000
          } seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return deleteRecording(recordingId, retries - 1);
      }
      return { recordingId, success: false };
    }
  };

  const results = await Promise.all(
    recordingIds.map((id) => deleteRecording(id))
  );
  return results;
}

ViteExpress.listen(app, 3000, () => console.log("Server is listening..."));
