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
