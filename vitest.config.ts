import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 泡立ち計算は純粋ロジックなので DOM は不要。
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
