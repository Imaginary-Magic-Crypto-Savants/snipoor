import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
  // Mirror the webpack DefinePlugin build-time constants so modules that read
  // bundled API keys (keys.ts → provider.ts) load under vitest.
  define: {
    __ALCHEMY_KEY_1__: JSON.stringify(process.env.ALCHEMY_API_KEY_1 || ""),
    __ALCHEMY_KEY_2__: JSON.stringify(process.env.ALCHEMY_API_KEY_2 || ""),
    __ALCHEMY_KEY_3__: JSON.stringify(process.env.ALCHEMY_API_KEY_3 || ""),
    __ETHERSCAN_KEY__: JSON.stringify(process.env.ETHERSCAN_API_KEY || ""),
    __OPENSEA_KEY_1__: JSON.stringify(process.env.OPENSEA_KEY_1 || ""),
    __OPENSEA_KEY_2__: JSON.stringify(process.env.OPENSEA_KEY_2 || ""),
    __LICENSE_API_URL__: JSON.stringify(process.env.LICENSE_API_URL || ""),
    __LICENSE_ENABLED__: JSON.stringify(process.env.LICENSE_ENABLED === "true"),
    __DEV_BYPASS_CODE__: JSON.stringify(process.env.DEV_BYPASS_CODE || ""),
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
