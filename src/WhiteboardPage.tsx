import { useEffect, useRef } from "react";
import { startDrawing } from "./WhiteboardPublisher";

/**
 * T-4009: the page the VCS WebFrame loads. Deliberately has NO Daily call in it.
 * If a whiteboard shows up in the recording from this route, it came through
 * WebFrame and not through a published track.
 *
 * Reuses startDrawing so the frame counter, ISO timestamp and hue block are
 * pixel-identical to the screen-share runs, which keeps the OCR check valid
 * across both approaches.
 */
export const WhiteboardPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startDrawing(canvas, "via WebFrame", 30);
  }, []);

  return (
    <div style={{ margin: 0, background: "#12121c" }}>
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        style={{ display: "block", width: "100vw", height: "100vh" }}
      />
    </div>
  );
};
