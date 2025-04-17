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
    starting_after: startingAfter,
    limit: "100",
  });

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
        console.warn("Rate limit hit. Retrying after backoff...");
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff *= 2; // Exponential backoff
        retries--;
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const json = await res.json();
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
  const dailyRecordings = await getPageOfRecordings("OLDEST", null);

  let lastRecordingId =
    dailyRecordings.data[dailyRecordings.data.length - 1].id;
  let firstRecordingId = dailyRecordings.data[0].id || "OLDEST";
  let responseJson = [...dailyRecordings.data];

  while (lastRecordingId) {
    const dailyRoom = await getPageOfRecordings(
      firstRecordingId,
      lastRecordingId
    );

    if (dailyRoom.data.length === 0) {
      break;
    }

    lastRecordingId = dailyRoom.data[dailyRoom.data.length - 1].id;
    firstRecordingId = dailyRoom.data[0].id || "OLDEST";
    responseJson = [...responseJson, ...dailyRoom.data];
  }

  // Send the response back to the client

  response.json(responseJson);
});

ViteExpress.listen(app, 3000, () => console.log("Server is listening..."));
