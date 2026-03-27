import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        panel: "#111827",
        card: "#1f2937",
        accent: "#7aa2ff",
      },
    },
  },
  plugins: [],
};

export default config;
