import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// Import our webhook server
import { startWebhookServer } from "./src/webhook-server";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  server: {
    port: 3000,
  },
  plugins: [
    react(),
    // Custom plugin to start the webhook server alongside Vite
    {
      name: "webhook-server",
      configureServer() {
        // Start the webhook server when Vite dev server starts
        startWebhookServer();
      },
    },
  ],
});
