import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { bg: "#090d16", card: "#151c2b", accent: "#ff9f1c", ai: "#598bff", success: "#34d399" } } },
  plugins: [],
};
export default config;
