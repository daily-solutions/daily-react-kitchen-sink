/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DAILY_ROOM_URL?: string;
  readonly VITE_DAILY_WHITEBOARD_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
