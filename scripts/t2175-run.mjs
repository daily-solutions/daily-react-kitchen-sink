// T-2175 zemplar repro: automated one-shot run.
//
// - Creates/updates the room + owner token (scripts/t2175-setup.mjs)
// - Starts the vite dev server
// - Launches Chromium (playwright-core, uses the cached ms-playwright build)
//   with a SILENT fake microphone and auto-selected tab capture (with audio)
// - Joins, waits for transcription-started, then starts a screen share so a
//   second Deepgram stream opens on the new screen-audio track
// - Writes every T2175LOG entry to a JSON file and prints a summary
//
// Usage: node scripts/t2175-run.mjs [output.json]

import { spawn } from "node:child_process";
import { writeFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createRoomAndToken } from "./t2175-setup.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = process.argv[2] ?? join(repoRoot, "t2175-run-log.json");

function findChromium() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const dir = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .pop();
  if (!dir) throw new Error("No cached Playwright Chromium found");
  const candidates = [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  ].map((p) => join(cache, dir, p));
  const exe = candidates.find((p) => existsSync(p));
  if (!exe) throw new Error(`Chromium binary not found under ${dir}`);
  return exe;
}

function writeSilentWav(path, seconds = 5) {
  const sampleRate = 8000;
  const numSamples = sampleRate * seconds;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize); // samples default to 0 = silence
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  writeFileSync(path, buf);
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server not reachable at ${url}`);
}

async function waitForLogAction(page, action, timeoutMs) {
  await page.waitForFunction(
    (a) => (window.__t2175Log ?? []).some((e) => e.action === a),
    action,
    { timeout: timeoutMs }
  );
}

async function main() {
  console.log("Creating room + token...");
  const { roomUrl, appUrl } = await createRoomAndToken();
  console.log("Room:", roomUrl);

  console.log("Starting vite dev server...");
  const vite = spawn("npm", ["run", "dev"], { cwd: repoRoot, stdio: "ignore" });
  let browser;
  try {
    await waitForServer("http://localhost:3000/");

    const silenceWav = join(repoRoot, "t2175-silence.wav");
    writeSilentWav(silenceWav);

    console.log("Launching Chromium...");
    browser = await chromium.launch({
      executablePath: findChromium(),
      headless: false, // tab capture needs a real (headed) browser
      args: [
        "--use-fake-ui-for-media-devices",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${silenceWav}`,
        "--auto-select-tab-capture-source-by-title=T2175 Zemplar Repro",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
    const page = await browser.newPage();
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.startsWith("T2175LOG")) console.log(text);
    });

    await page.goto(appUrl);

    console.log("Waiting for join + transcription-started...");
    await waitForLogAction(page, "joined-meeting", 60000);
    await waitForLogAction(page, "transcription-started", 60000);

    console.log("Transcription running. 8s of silence before screen share...");
    await page.waitForTimeout(8000);

    console.log("Starting screen share (new audio track -> new Deepgram ws)...");
    await page.click("#start-share");
    await waitForLogAction(page, "local-screen-share-started", 30000);

    console.log("Screen share started. Listening 45s for captions...");
    await page.waitForTimeout(45000);

    const log = await page.evaluate(() => window.__t2175Log);
    writeFileSync(outPath, JSON.stringify(log, null, 2));
    console.log(`\nWrote ${log.length} log entries to ${outPath}`);

    const messages = log.filter((e) => e.action === "transcription-message");
    console.log(`transcription-message events: ${messages.length}`);
    for (const m of messages) {
      console.log(`  [${m.trackType}] "${m.text}"`);
    }
    if (messages.length === 0) {
      console.log(
        "No captions at all this run (room was silent). The bug is intermittent; rerun to retry."
      );
    }
    const zemplar = messages.some((m) => /zemplar/i.test(String(m.text)));
    console.log(zemplar ? "*** ZEMPLAR REPRODUCED ***" : "No 'zemplar' this run.");
  } finally {
    await browser?.close().catch(() => {});
    vite.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
