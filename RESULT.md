# T-4009 demo result: startCustomTrack does NOT reach the recording. startScreenShare DOES.

Run date: 2026-09-14. Room hush.daily.co/demo. daily-js 0.92.2 (customer is on 0.91.0).
Repo daily-react-kitchen-sink, branch prebuilt-whiteboard-recording, PR #118.
Recording started via REST every time. Cloud recording, 1920x1080.

## Setup common to all runs
A SECOND daily-js instance in call object mode, created with
`allowMultipleCallInstances: true`, joined the same room as a non-owner with
startVideoOff/startAudioOff, publishing a 1280x720 canvas that draws an incrementing
frame counter and an ISO timestamp from a Web Worker tick at 30fps.
The publish half always worked: `startCustomTrack` resolved, track state "playable",
local `track-started` fired, and Prebuilt counted 2 participants.

## The four runs

| run | what was published | recording layout | whiteboard in the mp4? |
|-|-|-|-|
| 1  0d791432-aab6-4ce1-b465-66b37b4e1ba1 | custom track only | default (empty REST body) | NO |
| 2  adca9c0d-8732-42e3-bf39-3a2db76f1ad5 | custom track only | explicit VCS: preset custom, daily:baseline, mode grid, labels on | NO |
| 3  222fc558-9fbf-4667-b613-cfae35e44272 | custom track AND screen share | default (empty REST body) | YES, dominant tile |
| 4  42cf7fc1-32e5-4b20-a655-d17deab747ee | screen share ONLY (custom track stopped first) | default (empty REST body) | YES, dominant tile |

Run 1: 107.9s, 108 frames at 1fps, OCR found no counter in any frame, pixel scan for the
canvas background found no region above 3% of frame area. Camera only, full bleed.
Run 2: 56.6s. The "James Hush" participant label rendered, so VCS definitely ran and the
params took effect. Whiteboard still absent. This rules out "it just needed layout config".
Run 4 is the decisive one: `stopCustomTrack('whiteboard')` first, then
`startScreenShare({ mediaStream: canvas.captureStream(30) })`. Verified before recording that
local tracks were ["audio","video","screenVideo","screenAudio"], screenVideo "playable",
whiteboard "gone". The whiteboard is the large tile with the camera as a thumbnail top-right.
Counter reads 1201 at t=8s and 1929 at t=32s: 728 frames over 24s = 30.3fps. Live, not frozen,
and the Worker tick held up.

## Conclusions

1. A custom track published by a second call-object instance is NOT composited into a Daily
   cloud recording, with or without an explicit VCS layout.
2. `startScreenShare({ mediaStream })` from that same second instance IS composited, with the
   DEFAULT layout and no VCS config at all.
3. Negative control: `startCustomTrack` on the PREBUILT instance REJECTS. It does not silently
   no-op the way `startScreenShare({ mediaStream })` does on Prebuilt. The rejection is
   `{"error":"Cannot read properties of undefined (reading 'kind')"}`, which is the
   DAILY_CUSTOM_TRACK sentinel failing to resolve inside the iframe and the code then reading
   `.kind` off undefined. A confusing internal TypeError, not a clear "not supported" error.

## What this overturns

The round-2 source read concluded custom tracks reach the recording because
StreamingSender.ts:313-375 does not filter on mediaTag and rs/gst/vcs/src/lib.rs:764-768 maps
any non-cam-video track to "screenshare". WRONG in practice. Something between the SFU producer
map and the VCS videoInputs list drops custom tracks. The MediaSenderCommon.ts:576-590
allow-list, which the source read dismissed as a no-op because its clauses are joined with &&,
is the first thing to re-read.

The first version of the customer draft recommended `startCustomTrack`. That recommendation
would not have worked. Corrected in draft.md.

## Docs angle

https://docs.daily.co/docs/daily-js/features/screen-sharing#screenshare-streams-vs-custom-tracks
tells developers to use `startCustomTrack()` for a canvas and reserve `startScreenShare()` for
screen content. That advice is sound on its own terms (it is about muted-signal suppression),
but it steers you straight into the one path that never reaches a cloud recording. The page
should say that custom tracks are not composited into cloud recordings.
Convenient side effect: screen-share muted-suppression is actually what a mostly-static
whiteboard wants, so the working path is also the more robust one here.

---

# Follow-up: the VCS WebFrame path. It WORKS, at about 1.8fps.

Run date: 2026-09-14. Same room, same canvas drawing code, same OCR method.
Recording 3f985c51-8db8-4932-a3f4-04d203459dba, 126.4s, 1920x1080.

## Setup
- Built the app with every VITE_ secret blanked, served only `webframe-dist/` from a local
  static server, and exposed THAT through ngrok. Not the dev server: a plain `vite --host`
  tunnel would have published the Prebuilt route whose bundle inlines the meeting token, and
  Vite inlines the whole `import.meta.env` object, so the Daily API key landed in the bundle
  too. Verified the built output contained none of the nine secrets before opening the tunnel.
- `?whiteboard` is a standalone route with NO daily-js in it, so nothing could be published as
  a track. Anything in the recording arrived through WebFrame.
- Exactly ONE participant in the room, camera on, publishing nothing else.
- Recording started with `preset: custom`, `composition_id: daily:baseline`, `mode: dominant`,
  `videoSettings.dominant.includeWebFrame: true`, `webFrame.url`, viewport 1280x720.

## Result: PASS
The whiteboard is the DOMINANT tile with the camera as a chiclet top-right. Text is crisper
than in the screen-share runs. Counter advances throughout.

Measured update rate: 80 readable frames sampled at 10fps over a 10s window, 18 distinct
counter values, so **~1.8 fps**. That matches the documented "about 2fps" and the
`DEFAULT_TIMER_FPS = 2` ceiling at `vcs/server-render/webframe/index.js:117`.

Mid-recording `updateRecording` with viewport 960x540 applied cleanly, no blank gap.

## The tunnel-drop finding, which matters more than it looks
I killed ngrok at 07:36:39 while still recording. At 07:37:02, 23 seconds later, the recording
still showed the counter advancing normally. Exactly what the source predicted
(`webframe/index.js:333-361`): after a successful load, Chrome keeps the DOM and keeps running
the page's JavaScript, and the screenshot loop keeps capturing. The outage is invisible.

Read this carefully before quoting it to a customer. My page is SELF-DRIVING: its counter is
local JS, so of course it kept moving. A real whiteboard fed by a network sync would have
frozen at the last synced state, silently, with no event and no error anywhere. So this run
proves the recording does not notice a dropped source; it does NOT prove content survives one.

## Side by side

| Quality | Screen share (run 4) | WebFrame (this run) |
|-|-|-|
| Whiteboard in the mp4 | yes, dominant tile | yes, dominant tile |
| Effective update rate | 30.3 fps | ~1.8 fps |
| Text legibility after encode | OCR ok on the 120px counter | OCR ok, visibly crisper |
| Extra participant | yes, 1 per lesson | none |
| Extra daily-js instance on the page | yes | none |
| Needs a public URL | no | yes, and no port, no IP literal, must have a TLD |
| Layout config needed | none | preset custom + dominant.includeWebFrame |
| Reconfigurable mid-recording | no | yes, URL and viewport both |
| Failure mode | loud: track-stopped | silent: stale frame, warning in our logs only |
| Works if whiteboard state is browser-local | yes | NO, needs a server-rendered viewer page |

## Which one to recommend
Not a clean win either way, so the draft should present the tradeoff rather than crown one.
- WebFrame is better on cost and architecture: no extra participant, no second daily-js
  instance, reconfigurable mid-recording, sharper text.
- Screen share is better on fidelity and privacy: 30fps against 1.8fps, no public URL, fails
  loudly, and it works with the browser-local canvas the customer already has.

The deciding question is one we have not asked AJ: does their whiteboard have shared/server
state that a standalone URL could render? If it is purely local to the tutor's browser,
WebFrame does not apply at all and screen share is the answer by default.

## Docs gaps this run confirmed (all in pluot-core docs/)
1. `webFrame.zPosition` (foreground|background) exists at
   `vcs/compositions/daily-baseline/params.js:562-567` and is documented nowhere.
2. URL restrictions are undocumented: `vcs/server-render/asset-download/validate-asset-url.js:7-42`
   rejects explicit ports, IP literals, hosts with no TLD, and non-www daily.co subdomains.
   A customer pointing WebFrame at `http://10.0.0.5:8080` gets silence.
3. "composition_id required when starting" in the DailyStreamingLayoutConfig reference is wrong.
   `Validation.ts` only checks it when present and `schema.js:213` has it optional.
4. The 2fps figure reads as approximate in the docs but it is a ceiling, and the loop halves
   its own rate when screenshots are slow (`webframe/index.js:324-328`).
5. Nothing documents what the recording shows when the URL fails or the source drops.
