import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* "Nebula" palette — refined purple / violet / blue gradient mix.
         * Deeper base for stronger panel contrast, more luminous accents. */
        bg:       "#0a0e22",   /* deep indigo-navy */
        panel:    "#161b3a",   /* glass panel base */
        panelHi:  "#222a54",
        border:   "#2c3563",   /* soft blue-violet border */
        accent:   "#838dfb",   /* luminous indigo */
        accent2:  "#5b9dff",   /* bright blue */
        violet:   "#a855f7",   /* purple */
        ok:       "#34d399",   /* emerald */
        warn:     "#fbbf24",   /* amber */
        crit:     "#fb6f92",   /* rose */
        info:     "#c084fc",   /* light purple */
        gold:     "#fcd34d",   /* solar gold */
        dim:      "#a3aed4",   /* readable muted text */
        muted:    "#7480ac",
      },
      fontFamily: {
        sans:  ["Inter", "ui-sans-serif", "system-ui"],
        mono:  ["JetBrains Mono", "ui-monospace", "Menlo"],
      },
      boxShadow: {
        /* softer, more diffuse glows */
        glow:     "0 0 30px rgba(131,141,251,.34)",
        glowOk:   "0 0 20px rgba(52,211,153,.40)",
        glowCrit: "0 0 28px rgba(251,111,146,.44)",
        glowWarn: "0 0 20px rgba(251,191,36,.40)",
        glowGold: "0 0 22px rgba(252,211,77,.46)",
        glowViolet:"0 0 26px rgba(168,85,247,.40)",
        /* panel depth elevation */
        elev:     "0 12px 34px -16px rgba(0,0,0,.65)",
      },
      animation: {
        pulse2:    "pulse2 2s ease-in-out infinite",
        beat:      "beat 1s ease-in-out infinite",
        twinkle:   "twinkle 4s ease-in-out infinite",
        slideDown: "slideDown .35s ease-out both",
        fadeIn:    "fadeIn .4s ease-out both",
        riseIn:    "riseIn .45s cubic-bezier(.2,.9,.3,1.2) both",
        blinkHard: "blinkHard 1s steps(2,start) infinite",
        shimmer:   "shimmer 2.4s linear infinite",
      },
      keyframes: {
        pulse2:    { "50%": { opacity: ".4", transform: "scale(.7)" } },
        beat:      { "50%": { boxShadow: "0 0 24px #f87171" } },
        twinkle:   { "0%,100%": { opacity: ".15" }, "50%": { opacity: ".9" } },
        slideDown: { from: { transform: "translateY(-100%)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        fadeIn:    { from: { opacity: "0" }, to: { opacity: "1" } },
        riseIn:    { from: { opacity: "0", transform: "translateY(10px) scale(.98)" }, to: { opacity: "1", transform: "translateY(0) scale(1)" } },
        blinkHard: { "50%": { opacity: "0" } },
        shimmer:   { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
      },
    },
  },
  plugins: [],
} satisfies Config;
