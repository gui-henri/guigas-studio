import { useEffect, useRef } from "react";

/** Horizontal level bar with peak hold; driven imperatively (no re-renders). */
export default function LevelMeter({
  registerLevel,
}: {
  registerLevel: (fn: (dbfs: number) => void) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let peakDbfs = -100;
    let peakAt = 0;
    const apply = (dbfs: number) => {
      const clamped = Math.max(-60, Math.min(0, dbfs));
      if (clamped > peakDbfs || performance.now() - peakAt > 1500) {
        peakDbfs = clamped;
        peakAt = performance.now();
      }
      if (barRef.current) barRef.current.style.width = `${((clamped + 60) / 60) * 100}%`;
      if (peakRef.current)
        peakRef.current.style.left = `${((peakDbfs + 60) / 60) * 100}%`;
    };
    registerLevel(apply);
  }, [registerLevel]);

  return (
    <div className="relative h-3 w-full overflow-hidden rounded border border-input bg-muted">
      <div
        ref={barRef}
        className="h-full bg-emerald-600 transition-[width] duration-75"
        style={{ width: "0%" }}
      />
      <div ref={peakRef} className="absolute top-0 h-full w-0.5 bg-accent" style={{ left: "0%" }} />
    </div>
  );
}
