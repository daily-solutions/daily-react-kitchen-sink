// Small REST helper for the Daily recordings API, used by the VCS overlay-asset
// repro demo (T-2904). It wraps two endpoints:
//   GET /v1/recordings/{id}              -> recording status/metadata
//   GET /v1/recordings/{id}/access-link  -> signed download_link
//
// The API key is read from import.meta.env.VITE_DAILY_API_KEY (set in
// .env.local, which is gitignored). The key value is NEVER logged.

const API_BASE = "https://api.daily.co/v1";

// import.meta.env values come through as `any`; cast once to a typed record so
// the rest of the module stays type-safe.
const env = import.meta.env as unknown as Record<string, string | undefined>;

function authHeaders(): HeadersInit {
  const key = env.VITE_DAILY_API_KEY;
  if (!key) {
    throw new Error(
      "VITE_DAILY_API_KEY is not set. Add it to .env.local before running the VCS repro."
    );
  }
  // Never log `key`.
  return { Authorization: `Bearer ${key}` };
}

export interface DailyRecording {
  id: string;
  // "in-progress" | "finished" | "canceled" | ... (Daily returns a string)
  status: string;
  room_name?: string;
  start_ts?: number;
  duration?: number;
  tracks?: unknown[];
}

export interface DailyRecordingAccessLink {
  download_link: string;
  expires: number;
}

export async function getRecording(id: string): Promise<DailyRecording> {
  const res = await fetch(`${API_BASE}/recordings/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      `getRecording(${id}) failed: ${res.status} ${res.statusText}`
    );
  }
  return (await res.json()) as DailyRecording;
}

export async function getRecordingAccessLink(
  id: string
): Promise<DailyRecordingAccessLink> {
  const res = await fetch(`${API_BASE}/recordings/${id}/access-link`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      `getRecordingAccessLink(${id}) failed: ${res.status} ${res.statusText}`
    );
  }
  return (await res.json()) as DailyRecordingAccessLink;
}
