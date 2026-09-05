import { create } from "@bufbuild/protobuf";
import { PlayerHost } from "@guigas/remotion-kit";
import { StudioScriptSchema } from "../gen/app/studio/v1/script_pb";
import { Emotion, Beat } from "../gen/app/studio/v1/script_pb";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const fixtureScript = create(StudioScriptSchema, {
  post: "dev-fixture",
  language: { spoken: "pt-BR", subtitles: "en" },
  target: { durationMin: 8 },
  segments: [
    {
      id: "hook",
      beat: Beat.HOOK,
      emotion: Emotion.SURPRISED,
      narrationPt:
        "Este é o gancho renderizado dentro do bundle da SPA — sem servidor de preview.",
    },
    {
      id: "payoff",
      beat: Beat.PAYOFF,
      emotion: Emotion.THOUGHTFUL,
      narrationPt: "O insight final aparece aqui no segundo segmento do placeholder.",
    },
  ],
});

/** Dev-only page proving PlayerHost runs inside the SPA bundle (S3-06). */
export default function PlayerDevPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-8">
      <Card>
        <CardHeader>
          <CardTitle>PlayerHost — dev</CardTitle>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            fixture local no bundle da SPA <Badge variant="secondary">LongForm</Badge>
          </p>
        </CardHeader>
        <CardContent>
          <PlayerHost
            compositionId="LongForm"
            maxWidth={960}
            props={{
              title: "Guigas Studio — fixture",
              durationMs: 20000,
              script: fixtureScript,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
