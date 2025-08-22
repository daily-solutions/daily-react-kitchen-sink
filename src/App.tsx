import React, { useCallback, useRef, useState } from "react";
import Daily, {
  DailyEventObject,
  DailyEventObjectParticipant,
} from "@daily-co/daily-js";

import {
  DailyAudio,
  DailyVideo,
  useAudioLevelObserver,
  useCPULoad,
  useDaily,
  useDailyError,
  useDailyEvent,
  useDevices,
  useInputSettings,
  useLocalSessionId,
  useMeetingState,
  useNetwork,
  useParticipantCounts,
  useParticipantIds,
  useRecording,
  useScreenShare,
  useTranscription,
} from "@daily-co/daily-react";

import "./styles.css";

// Experimental / non-standard API type shims (CropTarget + cropTo) and DailyVideo customTrack support
type CropTarget = object;
interface CropTargetAPI {
  fromElement(el: Element): Promise<CropTarget>;
}
interface CroppableMediaStreamTrack extends MediaStreamTrack {
  cropTo?: (cropTarget: CropTarget) => Promise<void>;
}

declare global {
  interface Window {
    CropTarget?: CropTargetAPI;
  }
}

// Module augmentation for DailyVideo to allow customTrack (pending upstream types)
// If upstream adds this, the augmentation will harmlessly merge.
declare module "@daily-co/daily-react" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DailyVideoProps {
    // extend accepted types
    type?: "video" | "screenVideo" | "rmpVideo" | "customTrack";
    trackName?: string; // for distinguishing multiple custom tracks
  }
}

console.info("Daily version: %s", Daily.version());
console.info("Daily supported Browser:");
console.dir(Daily.supportedBrowser());

const MicVolumeVisualizer = () => {
  const localSessionId = useLocalSessionId();

  const volRef = useRef<HTMLDivElement>(null);

  useAudioLevelObserver(
    localSessionId,
    useCallback((volume) => {
      if (!volRef.current) return;
      // this volume number will be between 0 and 1
      // give it a minimum scale of 0.15 to not completely disappear 👻
      volRef.current.style.transform = `scale(${Math.max(0.15, volume)})`;
    }, [])
  );

  // Your audio track's audio volume visualized in a small circle,
  // whose size changes depending on the volume level
  return (
    <div>
      <div className="vol" ref={volRef} />
      <style>{`
        .vol {
          border: 1px solid black;
          border-radius: 100%;
          height: 128px;
          transition: transform 0.1s ease;
          width: 128px;
        }
      `}</style>
    </div>
  );
};

export default function App() {
  const callObject = useDaily();
  // @ts-expect-error add callObject to window for debugging
  window.callObject = callObject;

  // Ref for iframe to capture
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [enableBlurClicked, setEnableBlurClicked] = useState(false);
  const [enableBackgroundClicked, setEnableBackgroundClicked] = useState(false);
  const [dailyRoomUrl, setDailyRoomUrl] = useState("https://hush.daily.co/sfu");
  const [dailyMeetingToken, setDailyMeetingToken] = useState("");

  const {
    cameraError,
    cameras,
    currentCam,
    currentMic,
    currentSpeaker,
    microphones,
    setCamera,
    setMicrophone,
    setSpeaker,
    speakers,
  } = useDevices();

  if (cameraError) {
    console.error("Camera error:", cameraError);
  }

  const logEvent = useCallback((evt: DailyEventObject) => {
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

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
            // @ts-expect-error rmp is in beta
            rmpAudio: true,
            rmpVideo: true,
          },
        });
      },
      [callObject, logEvent]
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

  useDailyEvent("load-attempt-failed", logEvent);
  useDailyEvent("joining-meeting", logEvent);
  useDailyEvent("joined-meeting", logEvent);
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

  const enableBlur = useCallback(() => {
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
  }, [callObject, updateInputSettings, enableBlurClicked]);

  const enableBackground = useCallback(() => {
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
              "https://assets.timelycare.com/images/provider-video-bg-lg.jpg",
          },
        },
      },
    })?.catch((err) => {
      console.error("Error enabling background image", err);
    });
  }, [callObject, updateInputSettings, enableBackgroundClicked]);

  const toggleKrisp = useCallback(() => {
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
  }, [callObject, noiseCancellationEnabled, updateInputSettings]);

  const rmpParticipantIds = useParticipantIds({
    sort: "joined_at",
    filter: (p) => p.participantType === "remote-media-player",
  });

  const [isRemoteMediaPlayerStarted, setIsRemoteMediaPlayerStarted] =
    useState<boolean>(false);

  useDailyEvent(
    "remote-media-player-stopped",
    useCallback(
      (ev) => {
        if (!ev) return;
        logEvent(ev);
        setIsRemoteMediaPlayerStarted(true);
      },
      [logEvent, setIsRemoteMediaPlayerStarted]
    )
  );
  useDailyEvent(
    "remote-media-player-started",
    useCallback(
      (ev) => {
        if (!ev) return;
        logEvent(ev);
        setIsRemoteMediaPlayerStarted(true);
      },
      [logEvent, setIsRemoteMediaPlayerStarted]
    )
  );
  useDailyEvent("remote-media-player-updated", logEvent);

  const toggleRemoteMedia = useCallback(() => {
    if (!callObject) {
      return;
    }
    if (isRemoteMediaPlayerStarted) {
      rmpParticipantIds.forEach((id) => {
        callObject.stopRemoteMediaPlayer(id).catch((err) => {
          console.error("Error stopping remote media player:", err);
        });
      });
    } else {
      callObject
        .startRemoteMediaPlayer({
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        })
        .catch((err) => {
          console.error("Error starting remote media player:", err);
        });
    }
  }, [callObject, isRemoteMediaPlayerStarted, rmpParticipantIds]);

  // Join the room with the generated token
  const joinRoom = useCallback(() => {
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
  }, [callObject, dailyRoomUrl, dailyMeetingToken]);

  const startCamera = useCallback(() => {
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
  }, [callObject]);

  // --- Iframe (tab region) capture as a custom track ---
  const [iframeTrack, setIframeTrack] = useState<MediaStreamTrack | null>(null);

  const startIframeCustomTrack = useCallback(async () => {
    if (!callObject || iframeTrack) return;
    try {
      const iframe = iframeRef.current;
      if (!iframe) {
        console.warn("No iframe element found to capture");
        return;
      } else {
        console.log("Found iframe to capture", iframe);
      }

      // Capture the current tab (user will be prompted). We request browser surface
      // so that we can crop to the iframe element afterwards (CropTarget API).
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        },
        audio: false,
      });
      const [videoTrack] = stream.getVideoTracks();
      if (!videoTrack) {
        console.error("No video track returned from getDisplayMedia");
        return;
      } else {
        console.log("Found video track to capture", videoTrack);
      }

      // Attempt to crop to the iframe element if the CropTarget API is available.
      try {
        const cropApi = window.CropTarget;
        if (cropApi?.fromElement) {
          const cropTarget = await cropApi.fromElement(iframe);
          const croppable = videoTrack as CroppableMediaStreamTrack;
          if (cropTarget && typeof croppable.cropTo === "function") {
            await croppable.cropTo(cropTarget);
            console.log("Applied cropTo iframe element");
          }
        } else {
          console.warn(
            "CropTarget API not supported in this browser; using full tab stream"
          );
        }
      } catch (cropErr) {
        console.warn(
          "Failed to crop to iframe element; proceeding with full tab stream",
          cropErr
        );
      }

      await callObject.startCustomTrack({
        track: videoTrack,
      });
      setIframeTrack(videoTrack);
      videoTrack.addEventListener("ended", () => {
        setIframeTrack(null);
      });
    } catch (err) {
      console.error("Error starting iframe custom track", err);
    }
  }, [callObject, iframeTrack]);

  const stopIframeCustomTrack = useCallback(async () => {
    if (!callObject || !iframeTrack) return;
    try {
      await callObject.stopCustomTrack("iframeTrack");
    } catch (err) {
      console.error("Error stopping iframe custom track in Daily", err);
    }
    try {
      iframeTrack.stop();
    } catch (err) {
      console.warn("Error stopping underlying iframe track", err);
    }
    setIframeTrack(null);
  }, [callObject, iframeTrack]);

  const load = useCallback(() => {
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
  }, [callObject, dailyRoomUrl]);

  const preAuth = useCallback(() => {
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
  }, [callObject, dailyRoomUrl]);

  // Remove video elements and leave the room
  const leaveRoom = useCallback(() => {
    if (!callObject) {
      return;
    }
    callObject
      .leave()
      ?.then(() => {
        return callObject.destroy();
      })
      .then((res) => {
        console.log(res);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [callObject]);

  // change video device
  const handleChangeVideoDevice = useCallback(
    (ev: React.ChangeEvent<HTMLSelectElement>) => {
      console.log("--- changing video device");
      setCamera(ev.target.value)?.catch((err) => {
        console.error("Error setting camera", err);
      });
    },
    [setCamera]
  );

  // change mic device
  const handleChangeMicDevice = useCallback(
    (ev: React.ChangeEvent<HTMLSelectElement>) => {
      setMicrophone(ev.target.value)?.catch((err) => {
        console.error("Error setting microphone", err);
      });
    },
    [setMicrophone]
  );

  // change speaker device
  const handleChangeSpeakerDevice = useCallback(
    (ev: React.ChangeEvent<HTMLSelectElement>) => {
      setSpeaker(ev?.target?.value)?.catch((err) => {
        console.error("Error setting speaker", err);
      });
    },
    [setSpeaker]
  );

  const stopCamera = useCallback(() => {
    if (!callObject) {
      return;
    }
    callObject.setLocalVideo(false);
  }, [callObject]);

  const updateCameraOn = useCallback(() => {
    if (!callObject) {
      return;
    }
    callObject.setLocalVideo(true);
  }, [callObject]);

  const { hidden, present } = useParticipantCounts({
    onParticipantCountsUpdated: logEvent,
  });

  const participantCounts = hidden + present;

  const meetingState = useMeetingState();

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
        <button onClick={load}>Load</button> <br />
        <button disabled={!dailyRoomUrl.length} onClick={preAuth}>
          Preauth
        </button>
        <br />
        <button onClick={startCamera}>Start Camera</button> <br />
        <br />
        <button
          onClick={() => {
            if (iframeTrack) {
              void stopIframeCustomTrack();
            } else {
              void startIframeCustomTrack();
            }
          }}
        >
          {iframeTrack ? "Stop iFrame Track" : "Start iFrame Track"}
        </button>
        <br />
        <button disabled={!dailyRoomUrl.length} onClick={joinRoom}>
          Join call
        </button>
        <br />
        <button onClick={leaveRoom}>Leave call</button>
        <br />
        <button onClick={toggleRemoteMedia}>Toggle Remote Media Player</button>
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
          value={currentMic?.device?.deviceId}
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
        <button disabled={enableBlurClicked} onClick={enableBlur}>
          Enable Blur
        </button>
        <button disabled={enableBackgroundClicked} onClick={enableBackground}>
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
        <button onClick={stopCamera}>Camera Off</button>
        <button onClick={updateCameraOn}>Camera On</button> <br />
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
      <iframe
        ref={iframeRef}
        id="iframeCustomTrack"
        title="Daily meeting embed"
        // Use the current room URL if provided; fall back to Daily homepage
        src="https://www.example.com"
        width="600"
        height="400"
        allow="camera; microphone; display-capture; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        loading="eager"
        style={{ border: 0 }}
      />
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
      {participantIds.map((id) => {
        return (
          <DailyVideo
            //@ts-expect-error will be fixed in the next release
            type="customTrack"
            key={id + "-customTrack"}
            automirror
            sessionId={id}
          />
        );
      })}
      {participantIds.map((id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        return (
          <DailyVideo
            // @ts-expect-error will be fixed in the next release
            type="customTrack"
            key={id + "-iframeTrack"}
            automirror
            sessionId={id}
          />
        );
      })}
      <DailyAudio />
      <MicVolumeVisualizer />
      <div id="meetingState">Meeting State: {meetingState}</div>
      {inputSettings && <div>Input settings updated</div>}
      {errorMsg && <div id="errorMsg">{errorMsg}</div>}
      <div id="participantCount">Total Participants: {participantCounts}</div>
      <div>Present Participants: {present}</div>
      <div>Hidden Participants: {hidden}</div>
      <div>Network quality: {network.quality}</div>
      <div>
        CPU load: {cpuLoad.state} {cpuLoad.reason}
      </div>
    </>
  );
}
