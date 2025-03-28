import * as comp from "@daily-co/vcs-composition-daily-baseline-web";
import { useEffect, useRef } from "react";

interface VCSComposition {
  startDOMOutputAsync(
    rootEl: HTMLElement,
    width: number,
    height: number,
    sources: VCSSources,
    options: VCSOptions
  ): Promise<VCSApi>;
}
interface VCSApi {
  setActiveVideoInputSlots(slots: (ActiveVideoSlot | boolean)[]): void;
  setParamValue(key: string, value: any): void;
  setScaleFactor(scaleFactor: number): void;
  stop(): void;
  updateImageSources(sources: VCSSources): void;
  setRoomPeerDescriptionsById(peers: Map<string, VCSPeer>): void;
}
export const VCSPlayer = () => {
  const vcsApi = comp as VCSComposition;

  const rootEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      if (rootEl.current) {
        const res = await vcsApi.startDOMOutputAsync(
          rootEl.current,
          1280,
          720,
          {},
          {
            errorCb: () => {
              console.error("VCS startDOMOutputAsync error");
            },
            getAssetUrlCb: (name: string, namespace: string, type: string) => {
              switch (type) {
                case "font":
                  return `/vcs/res/fonts/${name}`; // Not used
                case "image":
                  return namespace === "composition"
                    ? `/vcs/composition-assets/${name}`
                    : `/vcs/res/test-assets/${name}`;
                default:
                  return name;
              }
            },
            fps: 30,
            scaleFactor: 1,
            enablePreload: true,
          }
        );
        console.log(res);
      }
    };
    init().catch(console.error);
  });

  return <div ref={rootEl} />;
};
