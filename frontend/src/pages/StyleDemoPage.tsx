import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function StyleDemoPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">Warm paper &amp; muted ink</h1>
        <p className="mt-2 text-muted-foreground">
          Tokens do blog aplicados ao Studio via shadcn/ui. Títulos em serif display,
          código em mono, superfícies de papel quente com tinta suave e acento âmbar.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Tipografia</h2>
        <p className="text-base leading-relaxed">
          Corpo de texto em tinta sobre papel. A leitura longa deve ser confortável e
          calma, sem contraste agressivo.
        </p>
        <blockquote className="border-l-2 border-ring pl-4 italic text-muted-foreground">
          Uma citação destacada com o acento da marca na borda.
        </blockquote>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Código</h2>
        <pre className="rounded-lg border border-border bg-muted p-4 font-mono text-sm">
          <code>{`const studio = await guigas.studio.v1;\nconsole.log(studio.status);`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Ações</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="accent">Primário (accent)</Button>
          <Button variant="outline">Secundário (outline)</Button>
          <Button variant="destructive">Destrutivo</Button>
          <Button variant="ghost">Fantasma</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>default</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="accent">accent</Badge>
          <Badge variant="outline">outline</Badge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Formulário</h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="demo-input">Rótulo</Label>
              <Input id="demo-input" placeholder="Digite algo…" />
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Card com borda suave</CardTitle>
          <CardDescription>
            Superfícies elevadas usam card claro com borda de tinta a 12%.
          </CardDescription>
        </CardHeader>
      </Card>

      <footer className="flex gap-2 border-t border-border pt-4">
        {["bg-paper", "bg-ink", "bg-accent"].map((cls) => (
          <span key={cls} className={`${cls} h-8 w-8 rounded-full border border-border`} title={cls} />
        ))}
        <span className="font-mono text-xs text-muted-foreground">#f6f1e7 · #2a2520 · #b45309</span>
      </footer>
    </div>
  );
}
