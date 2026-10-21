import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { bg: "#0b0f19", card: "#121826", accent: "#f59e0b" } } },
  plugins: [],
};
export default config;
