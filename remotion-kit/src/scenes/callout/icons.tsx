// Minimal hand-drawn inline SVG icons — no icon library, stroke inherits
// from the ink token. Deterministic and dependency-free.
import React from "react";

export type CalloutIconName = "info" | "warn" | "success" | "idea";

const PATHS: Record<CalloutIconName, React.ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="10.5" x2="12" y2="16.5" />
      <circle cx="12" cy="7.5" r="0.4" fill="currentColor" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3 L22 20 L2 20 Z" />
      <line x1="12" y1="9.5" x2="12" y2="14.5" />
      <circle cx="12" cy="17.2" r="0.4" fill="currentColor" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="7.5,12.5 10.5,15.5 16.5,8.5" />
    </>
  ),
  idea: (
    <>
      <path d="M12 3 a6 6 0 0 1 3.5 10.9 c-0.8 0.6 -1 1.3 -1 2.1 h-5 c0 -0.8 -0.2 -1.5 -1 -2.1 A6 6 0 0 1 12 3 Z" />
      <line x1="9.8" y1="19" x2="14.2" y2="19" />
      <line x1="10.5" y1="21" x2="13.5" y2="21" />
    </>
  ),
};

export const CalloutIcon: React.FC<{
  name: CalloutIconName;
  size?: string;
}> = ({ name, size = "2.2vw" }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {PATHS[name]}
  </svg>
);
