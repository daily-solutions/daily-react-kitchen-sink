import React, { useCallback, useState } from "react";
import Daily, {
  DailyEventObject,
  DailyEventObjectParticipant,
} from "@daily-co/daily-js";

import {
  DailyAudio,
  DailyVideo,
  useCPULoad,
  useDaily,
  useDailyError,
  useDailyEvent,
  useDevices,
  useInputSettings,
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

  const [enableBlurClicked, setEnableBlurClicked] = useState(false);
  const [enableBackgroundClicked, setEnableBackgroundClicked] = useState(false);
  const [dailyRoomUrl, setDailyRoomUrl] = useState("https://hush.daily.co/sfu");
  const [dailyMeetingToken, setDailyMeetingToken] = useState("");

  const {
    cameraError,
    cameras,
    currentCam,
    currentSpeaker,
    microphones,
    setCamera,
    setSpeaker,
    speakers,
  } = useDevices();

  if (cameraError) {
    console.error("Camera error:", cameraError);
  }

  const { errorMsg, updateInputSettings, inputSettings } = useInputSettings({
    onError(ev) {
      logEvent(ev);
    },
    onInputSettingsUpdated(ev) {
      logEvent(ev);
    },
  });

  const noiseCancellationEnabled =
    inputSettings?.audio?.processor?.type === "noise-cancellation";

  const { startScreenShare, stopScreenShare, screens, isSharingScreen } =
    useScreenShare();

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

  const { startTranscription, stopTranscription, isTranscribing } =
    useTranscription({
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

  const { startRecording, stopRecording, isRecording } = useRecording({
    onRecordingData: logEvent,
    onRecordingError: logEvent,
    onRecordingStarted: logEvent,
    onRecordingStopped: logEvent,
  });

  useDailyEvent("joining-meeting", logEvent);
  useDailyEvent("track-started", logEvent);
  useDailyEvent("track-stopped", logEvent);
  useDailyEvent("started-camera", logEvent);
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

  const toggleKrisp = () => {
    if (!callObject) {
      return;
    }

    updateInputSettings({
      audio: {
        processor: {
          type: noiseCancellationEnabled ? "none" : "noise-cancellation",
        },
      },
    })?.catch((err) => {
      console.error("Error enabling Krisp", err);
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

  const [browserNoiseSuppressionEnabled, setBrowserNoiseSuppressionEnabled] =
    useState<boolean>(false);

  const setCustomAudioTrack = (
    mic: string | undefined,
    noiseSuppression: boolean
  ) => {
    if (!callObject) return;

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: mic ? { exact: mic } : undefined,
          autoGainControl: false,
          echoCancellation: true,
          noiseSuppression: { exact: noiseSuppression },
        },
      })
      .then((mediaStream) => {
        const audioTracks = mediaStream.getAudioTracks();
        const audioSource = audioTracks[0];

        console.log(
          "Setting custom audio track: noiseSuppression",
          audioSource.getSettings().noiseSuppression
        );

        setBrowserNoiseSuppressionEnabled(
          audioSource.getSettings().noiseSuppression ?? false
        );

        return callObject.setInputDevicesAsync({
          audioSource,
        });
      })
      .catch((err) => {
        console.error("Error getting custom audio track: ", err);

        if (err instanceof OverconstrainedError) {
          console.error("example error: ", err.constraint);
        }
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

  const [currentMic, setMic] = useState("default");

  // change mic device
  const handleChangeMicDevice = (ev: React.ChangeEvent<HTMLSelectElement>) => {
    setCustomAudioTrack(ev.target.value, browserNoiseSuppressionEnabled);
    setMic(ev.target.value);
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

  const toggleMic = () => {
    if (!callObject) {
      return;
    }
    callObject.setLocalAudio(!callObject.localAudio());
  };

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
        <button disabled={!dailyRoomUrl.length} onClick={() => preAuth()}>
          Preauth
        </button>
        <br />
        <button onClick={() => startCamera()}>Start Camera</button> <br />
        <button onClick={() => startCustomTrack()}>Start Custom Track</button>
        <br />
        <button disabled={!dailyRoomUrl.length} onClick={() => joinRoom()}>
          Join call
        </button>
        <br />
        <button onClick={() => leaveRoom()}>Leave call</button>
        <br />
        <hr />
        <br />
        2. Select your device <br />
        <select
          id="video-devices"
          value={currentCam?.device?.deviceId}
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
          value={currentMic}
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
        <button
          onClick={() => {
            setCustomAudioTrack(currentMic, !browserNoiseSuppressionEnabled);
          }}
        >
          Toggle Browser Noise Suppression
        </button>
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
        <button
          disabled={noiseCancellationEnabled}
          onClick={() => toggleKrisp()}
        >
          Toggle Krisp
        </button>
        <br />
        <button
          disabled={isSharingScreen}
          onClick={() => {
            if (isSharingScreen) {
              stopScreenShare();
            } else {
              startScreenShare();
            }
          }}
        >
          Toggle Screen Share
        </button>
        <br />
        <button onClick={() => toggleMic()}>Toggle Mic</button>
        <button onClick={() => stopCamera()}>Camera Off</button>
        <button onClick={() => updateCameraOn()}>Camera On</button> <br />
        <button disabled={isRecording} onClick={() => startRecording()}>
          Start Recording
        </button>
        <button disabled={!isRecording} onClick={() => stopRecording()}>
          Stop Recording
        </button>
        <br />
        <button
          onClick={() => {
            if (isTranscribing) {
              stopTranscription();
            } else {
              startTranscription();
            }
          }}
        >
          Toggle Transcription
        </button>
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
      {inputSettings && <div>Input settings updated</div>}
      {errorMsg && <div id="errorMsg">{errorMsg}</div>}
      <div id="participantCount">Participant Counts: {participantCounts}</div>
      <div>Network quality: {network.quality}</div>
      <div>
        CPU load: {cpuLoad.state} {cpuLoad.reason}
      </div>
    </>
  );
}
