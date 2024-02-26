import React, { useCallback, useState } from "react";
import Daily, { DailyEventObject } from "@daily-co/daily-js";

import {
  useDaily,
  useDevices,
  useDailyEvent,
  useScreenShare,
  DailyVideo,
  useParticipantIds,
  DailyAudio,
  useInputSettings,
  useNetwork,
  useRecording,
  useTranscription,
  useMeetingState,
  useMediaTrack,
  useLocalSessionId,
} from "@daily-co/daily-react";

import "./styles.css";

console.info("Daily version: %s", Daily.version());
console.info("Daily supported Browser:");
console.dir(Daily.supportedBrowser());

export default function App() {
  const callObject = useDaily();
  // @ts-expect-error add callObject to window for debugging
  window.callObject = callObject;
  const participantIds = useParticipantIds();

  const [inputSettingsUpdated, setInputSettingsUpdated] = useState(false);
  const [enableBlurClicked, setEnableBlurClicked] = useState(false);
  const [enableBackgroundClicked, setEnableBackgroundClicked] = useState(false);

  const {
    cameras,
    setCamera,
    microphones,
    setMicrophone,
    speakers,
    setSpeaker,
    camState,
  } = useDevices();

  const { errorMsg, updateInputSettings } = useInputSettings({
    onError(ev) {
      console.log("Input settings error (daily-react)", ev);
    },
    onInputSettingsUpdated(ev) {
      setInputSettingsUpdated(true);
      console.log("Input settings updated (daily-react)", ev);
    },
  });

  const { startScreenShare, stopScreenShare, screens } = useScreenShare();

  const logEvent = useCallback((evt: DailyEventObject) => {
    console.log("logEvent: " + evt.action, evt);
  }, []);

  const network = useNetwork({
    // onNetworkConnection: logEvent,
    //onNetworkQualityChange: logEvent,
  });

  const { startRecording, stopRecording } = useRecording({
    onRecordingData: logEvent,
    onRecordingError: logEvent,
    onRecordingStarted: logEvent,
    onRecordingStopped: logEvent,
  });

  useDailyEvent("participant-joined", logEvent);
  useDailyEvent("joining-meeting", logEvent);
  useDailyEvent("joined-meeting", logEvent);
  useDailyEvent("participant-updated", logEvent);
  useDailyEvent("track-started", logEvent);
  useDailyEvent("track-stopped", logEvent);
  useDailyEvent("started-camera", logEvent);
  useDailyEvent("input-settings-updated", logEvent);
  useDailyEvent("loading", logEvent);
  useDailyEvent("loaded", logEvent);
  useDailyEvent("load-attempt-failed", logEvent);
  useDailyEvent("receive-settings-updated", logEvent);
  useDailyEvent("left-meeting", logEvent);
  useDailyEvent("participant-left", logEvent);

  useDailyEvent("camera-error", logEvent);
  useDailyEvent("error", (evt) => logEvent);

  // Error logging for background effects
  useDailyEvent("input-settings-updated", logEvent);
  useDailyEvent("nonfatal-error", logEvent);

  function enableBlur() {
    if (!callObject || enableBlurClicked) {
      return;
    }

    setEnableBlurClicked(true);
    setEnableBackgroundClicked(false);

    updateInputSettings({
      video: {
        processor: {
          type: "background-blur",
          config: { strength: 0.5 },
        },
      },
    });
  }

  function enableBackground() {
    if (!callObject || enableBackgroundClicked) {
      return;
    }

    setEnableBackgroundClicked(true);
    setEnableBlurClicked(false);

    updateInputSettings({
      video: {
        processor: {
          type: "background-image",
          config: {
            source:
              "https://docs.daily.co/assets/guides-large-meetings-hero.jpeg",
          },
        },
      },
    });
  }

  // Join the room with the generated token
  const joinRoom = () => {
    if (!callObject) {
      return;
    }

    if (!dailyRoomUrl) {
      alert("Please enter a room url (e.g. https://example.daily.co/room)");
    }

    // callObject.setLocalVideo(false);

    callObject
      .join({
        url: dailyRoomUrl,
        token: dailyMeetingToken,
        startVideoOff: true,
      })
      .catch((err) => {
        console.error("Error joining room:", err);
      });
    console.log("joined!");
  };

  const startCamera = () => {
    if (!callObject) {
      return;
    }

    callObject
      .startCamera({
        dailyConfig: {
          alwaysIncludeMicInPermissionPrompt: false,
        },
      })
      .then((res) => {
        console.log("startCamera: ", res);

        // Comment these three lines out to see the difference
        if (camState === "granted") {
          callObject.setLocalVideo(true);
        }
      });
  };

  const load = () => {
    if (!callObject) {
      return;
    }
    callObject.load({
      url: dailyRoomUrl,
    });
  };

  const preAuth = () => {
    if (!callObject) {
      return;
    }
    callObject.preAuth({
      url: dailyRoomUrl,
    });
  };

  // Remove video elements and leave the room
  function leaveRoom() {
    if (!callObject) {
      return;
    }
    callObject.leave().catch((err) => {
      console.error("Error leaving room:", err);
    });
  }

  // change video device
  function handleChangeVideoDevice(ev: React.ChangeEvent<HTMLSelectElement>) {
    console.log("--- changing video device");
    setCamera(ev.target.value);
  }

  // change mic device
  function handleChangeMicDevice(ev: React.ChangeEvent<HTMLSelectElement>) {
    console.log("--- changing mic device");
    setMicrophone(ev.target.value);
  }

  // change speaker device
  function handleChangeSpeakerDevice(ev: React.ChangeEvent<HTMLSelectElement>) {
    console.log("--- changing speaker device");
    setSpeaker(ev?.target?.value);
  }

  const stopCamera = () => {
    if (!callObject) {
      return;
    }
    callObject.setLocalVideo(false);
  };

  const updateCameraOn = () => {
    if (!callObject) {
      return;
    }
    callObject.setLocalVideo(true);
  };

  const currentCamera = cameras.find((c) => c.selected);
  const currentMicrophone = microphones.find((m) => m.selected);
  const currentSpeaker = speakers.find((s) => s.selected);

  const hiddenParticipantCount = callObject?.participantCounts().hidden ?? 0;
  const presentParticipantCount = callObject?.participantCounts().present ?? 0;

  const participantCounts = hiddenParticipantCount + presentParticipantCount;

  const [dailyRoomUrl, setDailyRoomUrl] = useState("https://hush.daily.co/sfu");
  const [dailyMeetingToken, setDailyMeetingToken] = useState("");

  const { startTranscription, stopTranscription } = useTranscription({
    onTranscriptionAppData: logEvent,
    onTranscriptionError: logEvent,
    onTranscriptionStarted: logEvent,
    onTranscriptionStopped: logEvent,
  });

  const meetingState = useMeetingState();

  const localId = useLocalSessionId();
  const mediaTrack = useMediaTrack(localId, "video");

  return (
    <>
      <div className="App">
        <br />
        1. Join the call
        <br />
        <input
          type="text"
          value={dailyRoomUrl}
          onChange={(event) => {
            setDailyRoomUrl(event.target.value);
          }}
        />
        <p>
          {dailyRoomUrl
            ? dailyRoomUrl
            : "Please enter a room url (e.g. https://example.daily.co/room)"}
        </p>
        2. Use a meeting token (optional).
        <br />
        <input
          type="text"
          value={dailyMeetingToken}
          onChange={(event) => {
            setDailyMeetingToken(event.target.value);
          }}
        />
        <br />
        <button onClick={() => load()}>Load</button> <br />
        <button onClick={() => preAuth()}>Preauth</button> <br />
        <button onClick={() => startCamera()}>Start Camera</button> <br />
        <button onClick={() => joinRoom()}>Join call</button> <br />
        <button onClick={() => leaveRoom()}>Leave call</button>
        <br />
        <hr />
        <br />
        2. Select your device <br />
        <select
          id="video-devices"
          value={currentCamera?.device?.deviceId}
          onChange={handleChangeVideoDevice}
        >
          {cameras.map((cam) => (
            <option key={cam.device.deviceId} value={cam.device.deviceId}>
              {cam.device.label}
            </option>
          ))}
        </select>
        <br />
        <select
          id="mic-devices"
          value={currentMicrophone?.device?.deviceId}
          onChange={handleChangeMicDevice}
        >
          {microphones.map((microphone) => (
            <option
              key={microphone.device.deviceId}
              value={microphone.device.deviceId}
            >
              {microphone.device.label}
            </option>
          ))}
        </select>
        <br />
        <select
          id="speaker-devices"
          value={currentSpeaker?.device?.deviceId}
          onChange={handleChangeSpeakerDevice}
        >
          {speakers.map((speakers) => (
            <option
              key={speakers.device.deviceId}
              value={speakers.device.deviceId}
            >
              {speakers.device.label}
            </option>
          ))}
        </select>
        <br />
        <br />
        <button disabled={enableBlurClicked} onClick={() => enableBlur()}>
          Enable Blur
        </button>
        <button
          disabled={enableBackgroundClicked}
          onClick={() => enableBackground()}
        >
          Enable Background
        </button>
        <br />
        <button onClick={() => startScreenShare()}>Start Screen Share</button>
        <button onClick={() => stopScreenShare()}>Stop Screen Share</button>
        <br />
        <button onClick={() => stopCamera()}>Camera Off</button>
        <button onClick={() => updateCameraOn()}>Camera On</button> <br />
        <button onClick={() => startRecording()}>Start Recording</button>
        <button onClick={() => stopRecording()}>Stop Recording</button>
        <br />
        <button onClick={() => startTranscription()}>
          Start Transcription
        </button>
        <button onClick={() => stopTranscription()}>Stop Transcription</button>
      </div>
      {participantIds.map((id) => (
        <DailyVideo type="video" key={id} automirror sessionId={id} />
      ))}
      {screens.map((screen) => (
        <DailyVideo
          type="screenVideo"
          key={screen.screenId}
          automirror
          sessionId={screen.session_id}
        />
      ))}
      <DailyAudio />
      <div id="meetingState">Meeting State: {meetingState}</div>
      <div id="cameraState">Camera State: {camState}</div>
      <div id="mediaState">Media Track State: {JSON.stringify(mediaTrack)}</div>
      {inputSettingsUpdated && <div>Input settings updated</div>}
      {errorMsg && <div id="errorMsg">{errorMsg}</div>}
      <div id="participantCount">Participant Counts: {participantCounts}</div>
      <div>Network quality: {network.quality}</div>
    </>
  );
}
