import { useEffect, useRef } from "react";

interface Props {
  audioUrl: string;
  height?: number;
}

/**
 * Minimal peak waveform for replay (no audio libs): decodes a copy of the
 * blob into ~160 min/max peak pairs and draws bars; click seeks the player.
 */
export default function Waveform({ audioUrl, height = 64 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<{ min: number; max: number }[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(audioUrl);
        const raw = await resp.arrayBuffer();
        // decodeAudioData consumes the buffer — pass a copy.
        const copy = raw.slice(0);
        const Ctx = window.AudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(copy);
        void ctx.close();

        if (cancelled) return;
        const data = decoded.getChannelData(0);
        const buckets = 160;
        const per = Math.max(1, Math.floor(data.length / buckets));
        const peaks: { min: number; max: number }[] = [];
        for (let b = 0; b < buckets; b++) {
          let min = 1;
          let max = -1;
          const start = b * per;
          for (let i = start; i < Math.min(start + per, data.length); i++) {
            const v = data[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          peaks.push({ min, max });
        }
        peaksRef.current = peaks;
        draw();
      } catch {
        /* undecodable take: waveform stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const peaks = peaksRef.current;
    if (peaks.length === 0) return;
    const barWidth = width / peaks.length;
    const mid = height / 2;
    ctx.fillStyle = "#b45309";
    peaks.forEach((p, i) => {
      const yMin = mid - p.max * mid;
      const yMax = mid - p.min * mid;
      ctx.fillRect(i * barWidth + 0.5, yMin, Math.max(1, barWidth - 1), Math.max(1.5, yMax - yMin));
    });
  };

  useEffect(() => {
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        onClick={(e) => {
          const audio = audioRef.current;
          const peaks = peaksRef.current;
          if (!audio || !isFinite(audio.duration)) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          audio.currentTime = frac * audio.duration;
          void peaks;
        }}
      />
      <audio ref={audioRef} src={audioUrl} controls className="w-full" />
    </div>
  );
}
