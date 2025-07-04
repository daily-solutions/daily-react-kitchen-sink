import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import {
  DailyProvider,
  useCallFrame,
  useCPULoad,
  useDailyError,
  useMeetingState,
  useNetwork,
  useParticipantIds,
} from "@daily-co/daily-react";
import {
  DailyEventObject,
  DailyEventObjectParticipantLeft,
} from "@daily-co/daily-js";

// Stub objects to keep TypeScript happy
const datadogRum = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addAction: (_action: string, _data: unknown) => {
    // Stub implementation
  },
};

const sanitizeDailyEventData = (event: unknown) => event;

const logException = (message: string | undefined) => {
  if (!message) return;
  console.error(message);
};

const toasts = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  add: (message: string, _options: unknown) => {
    console.log(message);
  },
};

interface UseDailyQualityMetricsParams {
  analyticsContext: string;
  providerId?: number;
  userJoinedAs?: string | null;
}

export function useDailyQualityMetrics({
  analyticsContext,
  providerId,
  userJoinedAs,
}: UseDailyQualityMetricsParams) {
  // NOTE FROM JAMES: I'd recommend removing all of this. These logs are all sent
  // to Daily anyways. This is performing double work, and can lead to discrepancies
  // between what Daily reports and what's in Datadog. If you'd like to corelate
  // logs between Daily and Datadog, you can use the `session_id` to get logs from
  // this API: https://docs.daily.co/reference/rest-api/logs/list-logs .

  // The main use case for these APIs is to update your product's UI based on issues.
  // That being said, Prebuilt's UI already updates based on these issues, so I believe
  // you can remove this entire hook.

  // Track last seen states so that we can detect degradations.
  const lastNetworkStateRef = useRef<"good" | "low" | "very-low" | null>(null);
  const lastCpuLoadStateRef = useRef<"low" | "high" | null>(null);

  // Use the network hook
  const network = useNetwork({
    onNetworkConnection: useCallback(
      (connectionEvent: DailyEventObject<"network-connection">) => {
        datadogRum.addAction(
          `${analyticsContext}_network_connection_${connectionEvent.event}`,
          {
            user_joined_as: userJoinedAs,
            provider_id: providerId,
            event_type: "network-connection",
            connection_type: connectionEvent.type,
            session_id: connectionEvent.session_id,
            sfu_id: connectionEvent.sfu_id,
          }
        );
      },
      [analyticsContext, providerId, userJoinedAs]
    ),
  });

  // Use the CPU load hook
  const cpuLoad = useCPULoad();

  // Effect to track network quality changes
  useEffect(() => {
    const prevState = lastNetworkStateRef.current;
    const nextState = network.threshold; // 'good' | 'low' | 'very-low'

    if (prevState === nextState) return; // No change

    // Determine if this is a degradation
    const ranking: Record<string, number> = {
      good: 0,
      low: 1,
      "very-low": 2,
    };
    const isDegradation =
      prevState === null || ranking[nextState] > ranking[prevState];
    const isImprovement =
      prevState !== null && ranking[nextState] < ranking[prevState];

    if (isDegradation) {
      datadogRum.addAction(`${analyticsContext}_network_quality_degradation`, {
        user_joined_as: userJoinedAs,
        provider_id: providerId,
        event_type: "network-quality-change",
        change_type: "degradation",
        prev_network_state: prevState,
        new_network_state: nextState,
        network_quality_score: network.quality,
      });
    }

    if (isImprovement) {
      datadogRum.addAction(`${analyticsContext}_network_quality_improvement`, {
        user_joined_as: userJoinedAs,
        provider_id: providerId,
        event_type: "network-quality-change",
        change_type: "improvement",
        prev_network_state: prevState,
        new_network_state: nextState,
        network_quality_score: network.quality,
      });
    }

    lastNetworkStateRef.current = nextState;
  }, [
    network.threshold,
    network.quality,
    analyticsContext,
    providerId,
    userJoinedAs,
  ]);

  // Effect to track CPU load changes
  useEffect(() => {
    const prevState = lastCpuLoadStateRef.current;
    const nextState = cpuLoad.state; // 'low' | 'high'

    if (prevState === nextState) return; // No change

    // Degradation: transition into "high".
    if (nextState === "high" && prevState !== "high") {
      datadogRum.addAction(`${analyticsContext}_cpu_load_high`, {
        user_joined_as: userJoinedAs,
        provider_id: providerId,
        event_type: "cpu-load-change",
        change_type: "degradation",
        prev_cpu_load_state: prevState,
        new_cpu_load_state: nextState,
        reason: cpuLoad.reason,
      });
    }

    // Improvement: transition back to "low" after being "high".
    if (nextState === "low" && prevState === "high") {
      datadogRum.addAction(`${analyticsContext}_cpu_load_improvement`, {
        user_joined_as: userJoinedAs,
        provider_id: providerId,
        event_type: "cpu-load-change",
        change_type: "improvement",
        prev_cpu_load_state: prevState,
        new_cpu_load_state: nextState,
        reason: cpuLoad.reason,
      });
    }

    lastCpuLoadStateRef.current = nextState;
  }, [
    cpuLoad.state,
    cpuLoad.reason,
    analyticsContext,
    providerId,
    userJoinedAs,
  ]);
}

interface UseDailyLifecycleMetricsParams {
  userJoinedAs?: string | null;
  analyticsContext: string;
  errorMessage: string;
  joinedTitle: string;
  leftTitle: string;
  providerId?: number;
}

export function useDailyLifecycleMetrics({
  userJoinedAs,
  analyticsContext,
  errorMessage,
  joinedTitle,
  leftTitle,
  providerId,
}: UseDailyLifecycleMetricsParams) {
  useParticipantIds({
    onParticipantLeft: useCallback(
      (event: DailyEventObjectParticipantLeft) => {
        datadogRum.addAction(`${analyticsContext}_daily_call`, {
          user_joined_as: userJoinedAs,
          event_type: "participant-left",
          daily_event_data: sanitizeDailyEventData(event),
          provider_id: providerId,
        });
      },
      [analyticsContext, providerId, userJoinedAs]
    ),
  });

  const meetingState = useMeetingState();
  switch (meetingState) {
    case "loaded":
      datadogRum.addAction(`${analyticsContext}_daily_call`, {
        user_joined_as: userJoinedAs,
        event_type: "loaded",
        daily_event_data: sanitizeDailyEventData(event),
        provider_id: providerId,
      });
      break;
    case "joined-meeting":
      datadogRum.addAction(`${analyticsContext}_daily_call`, {
        user_joined_as: userJoinedAs,
        event_type: "joined-meeting",
        daily_event_data: sanitizeDailyEventData(event),
        provider_id: providerId,
      });
      document.title = joinedTitle;
      break;
    case "left-meeting":
      datadogRum.addAction(`${analyticsContext}_daily_call`, {
        user_joined_as: userJoinedAs,
        event_type: "left-meeting",
        provider_id: providerId,
      });
      document.title = leftTitle;
      break;
    default:
      document.title = "Telehealth Call";
      break;
  }

  const { meetingError, nonFatalError } = useDailyError();

  if (meetingError) {
    datadogRum.addAction(`${analyticsContext}_daily_call`, {
      user_joined_as: userJoinedAs,
      event_type: "error",
      error_message: meetingError?.errorMsg,
      daily_event_data: sanitizeDailyEventData(event),
      provider_id: providerId,
    });
    logException(meetingError?.errorMsg);

    toasts.add(errorMessage, {
      variant: "negative",
    });
  }

  // I believe you'll want to log this too
  if (nonFatalError) {
    datadogRum.addAction(`${analyticsContext}_daily_call`, {
      user_joined_as: userJoinedAs,
      event_type: "non-fatal-error",
      error_message: nonFatalError?.errorMsg,
      daily_event_data: sanitizeDailyEventData(event),
      provider_id: providerId,
    });
    logException(nonFatalError?.errorMsg);
  }
}

export const Prebuilt = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const url = urlParams.get("url") ?? "https://hush.daily.co/demo";
  const token = urlParams.get("token") ?? "";
  const userName = urlParams.get("userName") ?? "Guest";
  const callRef = useRef<HTMLDivElement>(document.createElement("div"));

  const callFrame = useCallFrame({
    parentElRef: callRef,
    options: {
      iframeStyle: {
        width: "100vw",
        height: "100vh",
        border: "0",
      },
      url,
      token,
      userName,
    },
    shouldCreateInstance: useCallback(() => Boolean(callRef.current), []),
  });

  useEffect(() => {
    if (!callFrame) return;
    callFrame?.join().catch((err) => {
      console.error("Error joining call", err);
    });
  }, [callFrame]);

  return (
    <div className="flex min-h-screen flex-col">
      <header>Example</header>
      <main className="flex max-w-screen-lg flex-grow flex-col">
        <div className="flex h-full flex-1 flex-col">
          {/* Video iframe */}
          <DailyProvider callObject={callFrame}>
            <div
              className="relative w-full flex-1"
              ref={callRef}
              data-testid="telehealth-call-container"
            />
          </DailyProvider>
        </div>
      </main>
    </div>
  );
};
