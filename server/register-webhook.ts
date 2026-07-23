import dotenv from "dotenv";

// Load env from .env.local first, then .env.
dotenv.config({ path: [".env.local", ".env"] });

const API = "https://api.daily.co/v1/webhooks";
const DAILY_API_KEY = process.env.DAILY_API_KEY;

const EVENT_TYPES = ["participant.joined", "participant.left"];

function authHeaders(): Record<string, string> {
  if (!DAILY_API_KEY) {
    console.error("DAILY_API_KEY is not set (put it in .env.local).");
    process.exit(1);
  }
  return {
    Authorization: `Bearer ${DAILY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function printHmacNextSteps(data: { uuid?: string; hmac?: string }): void {
  console.log(`  uuid: ${data.uuid ?? "(none)"}`);
  console.log(`  hmac: ${data.hmac ?? "(none)"}`);
  console.log("");
  console.log("Next: add this line to .env.local, then restart the server:");
  console.log(`  DAILY_WEBHOOK_HMAC=${data.hmac ?? ""}`);
}

async function create(url: string): Promise<void> {
  const res = await fetch(API, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ url, eventTypes: EVENT_TYPES }),
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    // Daily allows only one webhook per domain. If one already exists, point the
    // caller at --list / --update instead of failing silently.
    const err = data as { info?: string };
    if (res.status === 400 && err.info?.includes("only 1 webhook")) {
      console.error("A webhook already exists for this domain.");
      console.error("Run `--list` to see it, then `--update <uuid>` to repoint");
      console.error("it at your URL, or `--delete <uuid>` to remove it.");
      process.exit(1);
    }
    console.error(`Create failed (HTTP ${res.status}):`, data);
    process.exit(1);
  }
  console.log("Webhook created.");
  printHmacNextSteps(data as { uuid?: string; hmac?: string });
}

async function update(uuid: string, url: string): Promise<void> {
  const res = await fetch(`${API}/${uuid}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ url, eventTypes: EVENT_TYPES }),
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    console.error(`Update failed (HTTP ${res.status}):`, data);
    process.exit(1);
  }
  console.log(`Webhook ${uuid} updated.`);
  printHmacNextSteps(data as { uuid?: string; hmac?: string });
}

async function list(): Promise<void> {
  const res = await fetch(API, { headers: authHeaders() });
  const data: unknown = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

async function remove(uuid: string): Promise<void> {
  const res = await fetch(`${API}/${uuid}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    console.error(`Delete failed (HTTP ${res.status}):`, data);
    process.exit(1);
  }
  console.log(`Deleted webhook ${uuid}.`);
}

async function main(): Promise<void> {
  const url = getArg("--url");
  const del = getArg("--delete");
  const upd = getArg("--update");

  if (process.argv.includes("--list")) {
    await list();
  } else if (del) {
    await remove(del);
  } else if (upd) {
    if (!url) {
      console.error("--update <uuid> also needs --url <endpoint>.");
      process.exit(1);
    }
    await update(upd, url);
  } else if (url) {
    await create(url);
  } else {
    console.log("Usage:");
    console.log(
      "  node server/register-webhook.ts --url https://<ngrok>.ngrok.app/api/daily-webhook",
    );
    console.log(
      "  node server/register-webhook.ts --update <uuid> --url https://<ngrok>.ngrok.app/api/daily-webhook",
    );
    console.log("  node server/register-webhook.ts --list");
    console.log("  node server/register-webhook.ts --delete <uuid>");
    process.exit(1);
  }
}

void main();
