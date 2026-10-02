// Shared helpers for the serverless routes in this folder. Vercel skips
// files that start with an underscore, so this is not itself a route.

// The Prebuilt room this demo joins. Must match ROOM_URL in src/Prebuilt.tsx.
export const ROOM_NAME = "demo";

// Server-only env var (no VITE_ prefix), so Vite never bundles it into the
// browser. Set it in .env.local for `vercel dev` and in the Vercel project
// settings for deployments.
const DAILY_API_KEY = process.env.DAILY_API_KEY;

export const dailyApi = (path: string, init: RequestInit = {}): Promise<Response> => {
  if (!DAILY_API_KEY) {
    throw new Error("DAILY_API_KEY is not set");
  }
  return fetch(`https://api.daily.co/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
};

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
