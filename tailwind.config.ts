import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "JetBrains Mono", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        lifecycle: {
          draft: {
            bg: "#F1F5F9",
            text: "#334155",
            border: "#CBD5E1",
          },
          pending: {
            bg: "#FEF3C7",
            text: "#92400E",
            border: "#FCD34D",
          },
          approved: {
            bg: "#E0F2FE",
            text: "#075985",
            border: "#7DD3FC",
          },
          published: {
            bg: "#DCFCE7",
            text: "#166534",
            border: "#86EFAC",
          },
          superseded: {
            bg: "#F3E8FF",
            text: "#6B21A8",
            border: "#D8B4FE",
          },
          retired: {
            bg: "#FEE2E2",
            text: "#991B1B",
            border: "#FCA5A5",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      maxWidth: {
        "read-well": "48rem", // 768px (max-w-3xl) for SOP prose
        "workspace": "80rem",  // 1280px (max-w-7xl)
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
