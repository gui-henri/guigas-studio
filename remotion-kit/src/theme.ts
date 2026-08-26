// Blog design tokens (SPEC §2 #10) — single source of style for ALL scene
// components. Mirrors frontend/src/index.css @theme (S0-11). No component may
// hardcode a hex value or font family; everything resolves from here.

export const theme = {
  color: {
    paper: "#f6f1e7",
    ink: "#2a2520",
    accent: "#b45309",
    muted: "#8a7f72",
    line: "#e3d9c8",
    surface: "#fffdf8",
    added: "#2f6b3a",
    removed: "#a13c3c",
    codeNumber: "#7c5cbf",
    codeFunction: "#3b6ea5",
  } as const,

  font: {
    display:
      '"Iowan Old Style", Georgia, serif',
    sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "JetBrains Mono", "Cascadia Code", monospace',
  } as const,
} as const;

export type Theme = typeof theme;
