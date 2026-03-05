/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
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
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        crypto: {
          green: "#22c55e",
          red: "#ef4444",
        },
        // Glass colors otimizados
        glass: {
          bg: "rgba(25, 30, 40, 0.95)",
          border: "rgba(255, 255, 255, 0.1)",
          highlight: "rgba(255, 255, 255, 0.05)",
          shadow: "rgba(0, 0, 0, 0.2)",
        },
        liquid: {
          blue: "#3b82f6",
          purple: "#a855f7",
          pink: "#ec4899",
          cyan: "#06b6d4",
          teal: "#14b8a6",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        liquid: "16px",
        "liquid-sm": "10px",
        "liquid-lg": "20px",
      },
      backdropBlur: {
        glass: "8px",
        xs: "2px",
      },
      boxShadow: {
        glass: "0 2px 8px rgba(0, 0, 0, 0.2)",
        "glass-sm": "0 2px 6px rgba(0, 0, 0, 0.15)",
        "glass-lg": "0 4px 16px rgba(0, 0, 0, 0.25)",
        glow: "0 0 12px rgba(59, 130, 246, 0.3)",
        "glow-purple": "0 0 12px rgba(168, 85, 247, 0.3)",
        "glow-green": "0 0 12px rgba(34, 197, 94, 0.3)",
        "glow-red": "0 0 12px rgba(239, 68, 68, 0.3)",
      },
      backgroundImage: {
        "liquid-gradient": "linear-gradient(135deg, hsl(217, 91%, 60%) 0%, hsl(250, 85%, 65%) 100%)",
        "glass-gradient": "linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)",
      },
      // Animações reduzidas - apenas essenciais
      animation: {
        "slide-up": "slideUp 0.3s ease-out forwards",
      },
      keyframes: {
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      transitionTimingFunction: {
        liquid: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
}
