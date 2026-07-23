import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
// The Presence + webhooks demo needs a backend (see server/index.ts) to hold the
// API key, receive Daily webhooks, and push events over a WebSocket. Run it with
// `npm run server` (or `npm run dev:all`). Vite proxies /api and /ws to it, so
// the browser never talks to api.daily.co and never sees the API key.
export default defineConfig({
  base: "/",
  server: {
    port: 3000,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/ws": { target: "http://localhost:4000", ws: true },
    },
  },
  plugins: [react()],
});
