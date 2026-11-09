import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export const LiveStreamViewer = () => {
  const [hlsUrl, setHlsUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
    };
  }, []);

  const handlePlay = () => {
    if (!videoRef.current || !hlsUrl) return;
    setError(null);

    // Clean up previous instance
    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current?.play().catch(() => {
          // Autoplay may be blocked — user can click play manually
        });
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(`HLS error: ${data.type} — ${data.details}`);
          hls.destroy();
          hlsRef.current = null;
        }
      });
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari)
      videoRef.current.src = hlsUrl;
      videoRef.current.play().catch((err: unknown) => {
        console.warn("Native HLS autoplay blocked", err);
      });
    } else {
      setError("Your browser does not support HLS playback.");
    }
  };

  return (
    <div className="viewer-container">
      <h2>Live Stream Viewer</h2>
      <p>Paste the HLS playback URL from your streaming service.</p>
      <div className="viewer-input-row">
        <input
          type="text"
          placeholder="https://...m3u8"
          value={hlsUrl}
          onChange={(e) => setHlsUrl(e.target.value)}
        />
        <button onClick={handlePlay} disabled={!hlsUrl}>
          Play
        </button>
      </div>
      <video ref={videoRef} controls style={{ width: "100%", maxWidth: "800px" }} />
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};
