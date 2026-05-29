import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        poppins: ["var(--font-poppins)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        // Core palette
        void: "#080A0F",
        surface: "#0D1117",
        panel: "#111827",
        border: "#1F2937",
        muted: "#374151",
        // Accent
        acid: "#00FF88",
        "acid-dim": "#00FF8822",
        plasma: "#FF3B6B",
        "plasma-dim": "#FF3B6B22",
        gold: "#F59E0B",
        ice: "#38BDF8",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        flicker: "flicker 0.15s ease-in-out",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
