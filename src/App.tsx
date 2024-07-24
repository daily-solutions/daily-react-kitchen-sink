import React, { useCallback, useState } from "react";
import Daily, {
  DailyEventObject,
  DailyEventObjectParticipant,
} from "@daily-co/daily-js";

import {
  DailyAudio,
  DailyVideo,
  useAudioTrack,
  useCPULoad,
  useDaily,
  useDailyError,
  useDailyEvent,
  useDevices,
  useInputSettings,
  useLocalSessionId,
  useNetwork,
  useParticipantCounts,
  useParticipantIds,
  useRecording,
  useScreenShare,
  useTranscription,
} from "@daily-co/daily-react";

import "./styles.css";

console.info("Daily version: %s", Daily.version());
console.info("Daily supported Browser:");
console.dir(Daily.supportedBrowser());

export default function App() {
  const callObject = useDaily();
  // @ts-expect-error add callObject to window for debugging
  window.callObject = callObject;

  const [inputSettingsUpdated, setInputSettingsUpdated] = useState(false);
  const [enableBlurClicked, setEnableBlurClicked] = useState(false);
  const [enableBackgroundClicked, setEnableBackgroundClicked] = useState(false);
  const [dailyRoomUrl, setDailyRoomUrl] = useState("");
  const [dailyMeetingToken, setDailyMeetingToken] = useState("");

  const {
    cameras,
    setCamera,
    microphones,
    setMicrophone,
    speakers,
    setSpeaker,
    cameraError,
  } = useDevices();

  if (cameraError) {
    console.error("Camera error:", cameraError);
  }

  const localSessionId = useLocalSessionId();

  const audioTrack = useAudioTrack(localSessionId);

  console.log("audioTrack state", audioTrack.state);

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
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

  const participantIds = useParticipantIds({
    onParticipantJoined: useCallback(
      (ev: DailyEventObjectParticipant) => {
        logEvent(ev);

        if (!callObject) return;

        callObject.updateParticipant(ev.participant.session_id, {
          setSubscribedTracks: {
            audio: true,
            video: true,
            custom: true,
            screenAudio: true,
            screenVideo: true,
          },
        });
      },
      [callObject]
    ),
    onParticipantLeft: logEvent,
    onParticipantUpdated: logEvent,
    onActiveSpeakerChange: logEvent,
  });

  const { startTranscription, stopTranscription } = useTranscription({
    onTranscriptionAppData: logEvent,
    onTranscriptionError: logEvent,
    onTranscriptionStarted: logEvent,
    onTranscriptionStopped: logEvent,
  });

  const network = useNetwork({
    // onNetworkConnection: logEvent,
    // onNetworkQualityChange: logEvent,
  });

  const cpuLoad = useCPULoad({
    onCPULoadChange: logEvent,
  });

  if (cpuLoad.state !== "low") {
    console.log("CPU Load:", cpuLoad);
  }

  const { startRecording, stopRecording } = useRecording({
    onRecordingData: logEvent,
    onRecordingError: logEvent,
    onRecordingStarted: logEvent,
    onRecordingStopped: logEvent,
  });

  useDailyEvent("joining-meeting", logEvent);
  useDailyEvent("track-started", logEvent);
  useDailyEvent("track-stopped", logEvent);
  useDailyEvent("started-camera", logEvent);
  useDailyEvent("input-settings-updated", logEvent);
  useDailyEvent("loading", logEvent);
  useDailyEvent("loaded", logEvent);
  useDailyEvent("load-attempt-failed", logEvent);
  useDailyEvent("receive-settings-updated", logEvent);
  useDailyEvent("left-meeting", logEvent);

  useDailyEvent("error", logEvent);

  const { meetingError, nonFatalError } = useDailyError();
  if (meetingError) {
    logEvent(meetingError);
  }
  if (nonFatalError) {
    logEvent(nonFatalError);
  }

  // Error logging for background effects
  useDailyEvent("input-settings-updated", logEvent);

  const enableBlur = () => {
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
    })?.catch((err) => {
      console.error("Error enabling blur", err);
    });
  };

  const enableBackground = () => {
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
    })?.catch((err) => {
      console.error("Error enabling background image", err);
    });
  };

  // Join the room with the generated token
  const joinRoom = () => {
    if (!callObject) {
      return;
    }

    if (!dailyRoomUrl) {
      alert("Please enter a room url (e.g. https://example.daily.co/room)");
    }

    callObject
      .join({
        url: dailyRoomUrl,
        token: dailyMeetingToken,
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
      .startCamera()
      .then((res) => {
        console.log("startCamera: ", res);
      })
      .catch((err) => {
        console.error("Error starting camera", err);
      });
  };

  const startCustomTrack = () => {
    if (!callObject) {
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((customTrack) => {
        return callObject.startCustomTrack({
          track: customTrack.getVideoTracks()[0],
          trackName: "customTrack",
        });
      })
      .catch((err) => {
        console.error("Error enabling customTrack", err);
      });
  };

  const load = () => {
    if (!callObject) {
      return;
    }
    callObject
      .load({
        url: dailyRoomUrl,
      })
      .catch((err) => {
        console.error("Error entering load step", err);
      });
  };

  const preAuth = () => {
    if (!callObject) {
      return;
    }
    callObject
      .preAuth({
        url: dailyRoomUrl,
      })
      .catch((err) => {
        console.error("Error entering preAuth", err);
      });
  };

  // Remove video elements and leave the room
  const leaveRoom = () => {
    if (!callObject) {
      return;
    }
    callObject.leave().catch((err) => {
      console.error("Error leaving room:", err);
    });
  };

  // change video device
  const handleChangeVideoDevice = (
    ev: React.ChangeEvent<HTMLSelectElement>
  ) => {
    console.log("--- changing video device");
    setCamera(ev.target.value)?.catch((err) => {
      console.error("Error setting camera", err);
    });
  };

  // change mic device
  const handleChangeMicDevice = (ev: React.ChangeEvent<HTMLSelectElement>) => {
    setMicrophone(ev.target.value)?.catch((err) => {
      console.error("Error setting microphone", err);
    });
  };

  // change speaker device
  const handleChangeSpeakerDevice = (
    ev: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setSpeaker(ev?.target?.value)?.catch((err) => {
      console.error("Error setting speaker", err);
    });
  };

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

  const { hidden, present } = useParticipantCounts({
    onParticipantCountsUpdated: logEvent,
  });

  const participantCounts = hidden + present;

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
        <button onClick={() => startCustomTrack()}>Start Custom Track</button>
        <br />
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
      {participantIds.map((id) => (
        // @ts-expect-error This works just fine but gives a typescript error
        <DailyVideo type="customTrack" key={id} automirror sessionId={id} />
      ))}
      <DailyAudio />
      <div id="meetingState">Meeting State: {callObject?.meetingState()}</div>
      {inputSettingsUpdated && <div>Input settings updated</div>}
      {errorMsg && <div id="errorMsg">{errorMsg}</div>}
      <div id="participantCount">Participant Counts: {participantCounts}</div>
      <div>Network quality: {network.quality}</div>
    </>
  );
}
