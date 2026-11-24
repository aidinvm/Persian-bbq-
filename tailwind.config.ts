import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: "#FDFBF7",
          100: "#FAF6EE",
          200: "#F3EBDC",
          300: "#E7D9C1",
        },
        charcoal: {
          950: "#0F0D0C",
          900: "#181513",
          800: "#24201C",
          700: "#342E29",
          600: "#4D453E",
        },
        saffron: {
          400: "#E4B24C",
          500: "#C8922A",
          600: "#A8741A",
          700: "#855A11",
        },
        ember: {
          500: "#D15324",
          600: "#B84318",
          700: "#943412",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        persian: ["var(--font-persian)", "Tahoma", "sans-serif"],
      },
      boxShadow: {
        warm: "0 10px 30px -10px rgba(24, 21, 19, 0.08)",
        "warm-lg": "0 20px 45px -15px rgba(24, 21, 19, 0.14)",
        gold: "0 10px 25px -8px rgba(200, 146, 42, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
