import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (the "" prefix includes non-VITE_ keys). DAILY_API_KEY is
  // read here in the Node dev server only, so it never lands in the client bundle.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: "/",
    server: {
      port: 3000,
      // Proxy the Presence REST API through the dev server so the domain API key
      // stays server-side. The browser calls /api/presence with no auth header;
      // we add the Bearer token here before forwarding to api.daily.co.
      proxy: {
        "/api/presence": {
          target: "https://api.daily.co/v1",
          changeOrigin: true,
          rewrite: () => "/presence",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader(
                "Authorization",
                `Bearer ${env.DAILY_API_KEY ?? ""}`,
              );
            });
          },
        },
      },
    },
    plugins: [react()],
  };
});
