import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 이 컴퓨터 안에서만 연다 (D-009)
    host: "127.0.0.1",
    port: 5173,
    // 5173을 이미 쓰고 있으면 다른 번호로 바꾸지 않고 멈춘다
    strictPort: true,
  },
});
