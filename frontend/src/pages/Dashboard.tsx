import { useQuery } from "@connectrpc/connect-query";
import { listVideos } from "../gen/app/studio/v1/video-VideoService_connectquery";

// Temporary smoke component proving codegen + proxy + transport (replaced by S0-12).
export default function Dashboard() {
  const { data, isLoading, error } = useQuery(listVideos);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">Guigas Studio</h1>
      {isLoading && <p className="mt-4 text-sm opacity-60">Carregando vídeos…</p>}
      {error && (
        <p className="mt-4 text-sm text-red-700">
          Falha ao contatar a API: {error.message}
        </p>
      )}
      {data && (
        <p className="mt-4 text-sm opacity-80">
          {data.videos.length} vídeo(s) no pipeline.
        </p>
      )}
    </div>
  );
}
