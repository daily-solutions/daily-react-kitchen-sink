/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { useCallback, useEffect, useRef, useMemo } from "react";
import { useDaily, useDevices } from "@daily-co/daily-react";
import { DailyVCSWebRenderer, Params } from "@daily-co/daily-vcs-web";
// @ts-expect-error no typescript types
import * as comp from "@daily-co/vcs-composition-daily-baseline-web";

const getAssetUrlCb = (name: string, namespace: string, type: string) => {
  switch (type) {
    case "font":
      return `/vcs/res/fonts/Roboto-Regular.ttf`;
    case "image":
      return namespace === "composition"
        ? `/vcs/composition-assets/${name}`
        : `/vcs/res/test-assets/${name}`;
    default:
      return name;
  }
};

interface Props {
  aspectRatio: number;
  orderedParticipantIds: string[];
}

export const useVCS = ({ aspectRatio, orderedParticipantIds }: Props) => {
  const callObject = useDaily();
  const { currentCam, currentMic } = useDevices();
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  const vcsCompRef = useRef<DailyVCSWebRenderer | null>(null);
  const vcsContainerRef = useRef<HTMLDivElement | null>(null);

  // VCS params
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const params: Params = useMemo<Params>(
    () => ({
      preset: "custom",
      "videoSettings.showParticipantLabels": true,
      "videoSettings.omitPausedVideo": true,
    }),
    []
  );

  const createVCSView = useCallback(() => {
    if (!vcsContainerRef.current || !callObject) return;

    if (vcsCompRef.current) {
      vcsCompRef.current.stop();
      vcsCompRef.current = null;
    }

    vcsCompRef.current = new DailyVCSWebRenderer(
      callObject,
      comp,
      vcsContainerRef.current,
      {
        getAssetUrlCb,
        viewportSize: { w: 1280, h: 720 },
        defaultParams: params,
        participantIds: orderedParticipantIds,
        callbacks: {
          onParamsChanged() {
            // console.log("VCS Params Changed: ", params);
          },
          onStart() {
            console.log("VCS Started");
          },
          onStop() {
            console.log("VCS Stopped");
          },
          onError(error) {
            console.error("VCS Error: ", error);
          },
        },
      }
    );
  }, [callObject, params, orderedParticipantIds]);

  useEffect(() => {
    if (vcsCompRef.current) return;

    createVCSView();
  }, [createVCSView]);

  useEffect(() => {
    if (!vcsCompRef.current) return;

    const images = {};

    vcsCompRef.current.updateImageSources(images).catch((err) => {
      console.error(err);
    });
  }, []);

  useEffect(() => {
    // if (!vcsCompRef.current || dequal(vcsCompRef.current?.params, params)) {
    //   console.log("params are the same skipping");
    //   return;
    // }

    if (!vcsCompRef.current) return;

    vcsCompRef.current.sendParams(params, "replace");
  }, [params, currentCam, currentMic]);

  useEffect(() => {
    if (!vcsCompRef.current) return;

    vcsCompRef.current.updateParticipantIds(orderedParticipantIds);
  }, [orderedParticipantIds]);

  useEffect(() => {
    if (!vcsCompRef.current || vcsCompRef.current.ratio === aspectRatio) return;

    vcsCompRef.current?.updateAspectRatio(aspectRatio);
  }, [aspectRatio]);

  useEffect(() => {
    const vcsComp = vcsCompRef.current;

    return () => vcsComp?.stop();
  }, [vcsCompRef]);

  return { vcsCompRef, vcsContainerRef };
};
