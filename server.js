import express from "express";
import ViteExpress from "vite-express";

// MAKE SURE YOU HAVE ADDED YOUR API KEY IN THE .env file
const DAILY_API_KEY = process.env.DAILY_API_KEY;

if (!DAILY_API_KEY) {
  console.error("DAILY_API_KEY is missing in .env file");
  process.exit(1);
}

const app = express();

// EXAMPLE appending a customerId to every room created
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

ViteExpress.listen(app, 3000, () => console.log("Server is listening..."));
