import { VideoStatus } from "../gen/app/studio/v1/video_pb";

export type StatusGroup =
  | "novo"
  | "roteiro"
  | "gravação"
  | "voz/cenas"
  | "montagem"
  | "lançado"
  | "bloqueado";

export interface StatusPresentation {
  label: string;
  group: StatusGroup;
}

// Colors are assigned per semantic group (not per state) to keep the UI calm.
export const statusGroupClasses: Record<StatusGroup, string> = {
  novo: "bg-neutral-100 text-neutral-700 border-neutral-300",
  roteiro: "bg-sky-50 text-sky-800 border-sky-200",
  "gravação": "bg-violet-50 text-violet-800 border-violet-200",
  "voz/cenas": "bg-teal-50 text-teal-800 border-teal-200",
  montagem: "bg-indigo-50 text-indigo-800 border-indigo-200",
  lançado: "bg-emerald-50 text-emerald-800 border-emerald-200",
  bloqueado: "bg-amber-100 text-amber-900 border-amber-400 font-semibold",
};

export const videoStatusMap: Record<VideoStatus, StatusPresentation> = {
  [VideoStatus.UNSPECIFIED]: { label: "—", group: "novo" },
  [VideoStatus.NEW]: { label: "Novo", group: "novo" },
  [VideoStatus.SCRIPT_PENDING]: { label: "Roteiro pendente", group: "roteiro" },
  [VideoStatus.SCRIPT_REVIEW]: { label: "Roteiro em revisão", group: "roteiro" },
  [VideoStatus.SCRIPT_APPROVED]: { label: "Roteiro aprovado", group: "roteiro" },
  [VideoStatus.RECORDING]: { label: "Gravando", group: "gravação" },
  [VideoStatus.VOICE_PROCESSING]: { label: "Processando voz", group: "voz/cenas" },
  [VideoStatus.SCENES_PENDING]: { label: "Cenas pendentes", group: "voz/cenas" },
  [VideoStatus.SCENES_REVIEW]: { label: "Cenas em revisão", group: "voz/cenas" },
  [VideoStatus.QUEUED]: { label: "Na fila de render", group: "montagem" },
  [VideoStatus.RENDERING]: { label: "Renderizando", group: "montagem" },
  [VideoStatus.FINAL_REVIEW]: { label: "Revisão final", group: "montagem" },
  [VideoStatus.RELEASED]: { label: "Lançado", group: "lançado" },
  [VideoStatus.BLOCKED]: { label: "Bloqueado", group: "bloqueado" },
};

export function presentStatus(status: VideoStatus): StatusPresentation {
  return videoStatusMap[status] ?? { label: `desconhecido (${status})`, group: "novo" };
}

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "";
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 3600e3],
    ["month", 30 * 24 * 3600e3],
    ["week", 7 * 24 * 3600e3],
    ["day", 24 * 3600e3],
    ["hour", 3600e3],
    ["minute", 60e3],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(Math.round(diffMs / 1e3), "second");
}
