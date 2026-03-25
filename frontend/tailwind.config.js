/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        bg: {
          deep:    "#040711",
          panel:   "#080f1e",
          card:    "#0d1729",
          border:  "#1a2640",
        },
        accent: {
          cyan:    "#00e5ff",
          green:   "#00e676",
          red:     "#ff1744",
          amber:   "#ffc400",
          purple:  "#aa00ff",
        },
        text: {
          primary: "#e8edf5",
          muted:   "#64748b",
          dim:     "#334155",
        },
      },
      boxShadow: {
        "glow-cyan":  "0 0 24px rgba(0, 229, 255, 0.18)",
        "glow-green": "0 0 24px rgba(0, 230, 118, 0.18)",
        "glow-red":   "0 0 24px rgba(255, 23, 68, 0.18)",
      },
      animation: {
        pulse_slow: "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        fadeIn: "fadeIn 0.3s ease-out",
        slideUp: "slideUp 0.4s ease-out",
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 },         to: { opacity: 1 } },
        slideUp: { from: { transform: "translateY(12px)", opacity: 0 },
                   to:   { transform: "translateY(0)",    opacity: 1 } },
      },
    },
  },
  plugins: [],
};
