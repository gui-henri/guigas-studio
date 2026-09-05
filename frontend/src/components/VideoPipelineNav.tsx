import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Film,
  Headphones,
  Layers,
  Mic,
} from "lucide-react";

import { VideoStatus } from "../gen/app/studio/v1/video_pb";
import { presentStatus, statusGroupClasses } from "../lib/videoStatus";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

export type PipelineStage = "roteiro" | "estudio" | "voz" | "cenas" | "final";

interface StageItem {
  id: PipelineStage;
  label: string;
  sublabel: string;
  icon: typeof FileText;
  getPath: (videoId: string, slug: string) => string;
}

const STAGES: StageItem[] = [
  {
    id: "roteiro",
    label: "Roteiro",
    sublabel: "Aprovação & Edição",
    icon: FileText,
    getPath: (id, slug) => `/videos/${id || slug}`,
  },
  {
    id: "estudio",
    label: "Estúdio",
    sublabel: "Gravação de Takes",
    icon: Mic,
    getPath: (_id, slug) => `/videos/${slug}/studio`,
  },
  {
    id: "voz",
    label: "Voz",
    sublabel: "Timelines & Visemes",
    icon: Headphones,
    getPath: (id, slug) => `/videos/${id || slug}/voz`,
  },
  {
    id: "cenas",
    label: "Cenas",
    sublabel: "Preview Remotion",
    icon: Layers,
    getPath: (id, slug) => `/videos/${id || slug}/scenes`,
  },
  {
    id: "final",
    label: "Corte Final",
    sublabel: "Aprovação & Releases",
    icon: Film,
    getPath: (id, slug) => `/videos/${id || slug}/final`,
  },
];

interface VideoPipelineNavProps {
  videoId: string;
  videoSlug?: string;
  status?: VideoStatus;
  currentStage: PipelineStage;
  actions?: ReactNode;
  extraMeta?: ReactNode;
}

export default function VideoPipelineNav({
  videoId,
  videoSlug,
  status,
  currentStage,
  actions,
  extraMeta,
}: VideoPipelineNavProps) {
  const displaySlug = videoSlug || videoId || "vídeo";
  const presentation = status !== undefined ? presentStatus(status) : null;
  const badgeClass = presentation
    ? statusGroupClasses[presentation.group]
    : "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs">
      {/* Linha superior: Breadcrumb, título, status e ações da etapa */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            title="Voltar ao Pipeline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Fila</span>
          </Link>
          <span className="text-muted-foreground/40 font-mono">/</span>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {displaySlug}
          </h1>
          {presentation && (
            <Badge
              variant="outline"
              className={cn("text-xs font-medium border px-2.5 py-0.5", badgeClass)}
            >
              {presentation.label}
            </Badge>
          )}
          {extraMeta}
        </div>

        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>

      {/* Stepper / Abas das 5 etapas */}
      <nav
        className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5"
        aria-label="Etapas de produção"
      >
        {STAGES.map((stage, idx) => {
          const isActive = stage.id === currentStage;
          const Icon = stage.icon;
          const href = stage.getPath(videoId, displaySlug);

          return (
            <Link
              key={stage.id}
              to={href}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-mono",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-card"
                )}
              >
                {idx + 1}
              </span>
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span>{stage.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
