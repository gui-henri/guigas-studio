export default function StyleDemoPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-4xl font-bold">Warm paper &amp; muted ink</h1>
        <p className="mt-2 text-ink/70">
          Tokens do blog aplicados ao Studio. Títulos em serif display, código em mono,
          superfícies de papel quente com tinta suave e acento âmbar.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Tipografia</h2>
        <p className="text-base leading-relaxed">
          Corpo de texto em tinta sobre papel. A leitura longa deve ser confortável e
          calma, sem contraste agressivo.
        </p>
        <blockquote className="border-l-2 border-accent pl-4 italic text-ink/80">
          Uma citação destacada com o acento da marca na borda.
        </blockquote>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Código</h2>
        <pre className="rounded-lg border border-ink/10 bg-ink/5 p-4 font-mono text-sm">
          <code>{`const studio = await guigas.studio.v1;\nconsole.log(studio.status);`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Ações</h2>
        <div className="flex gap-3">
          <button type="button" className="rounded bg-accent px-4 py-2 text-sm text-paper hover:opacity-90">
            Primário (accent)
          </button>
          <button type="button" className="rounded border border-ink/20 px-4 py-2 text-sm hover:bg-ink/5">
            Secundário (outline)
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white/40 p-6 shadow-sm">
        <h3 className="text-xl font-semibold">Card com borda suave</h3>
        <p className="mt-2 text-sm text-ink/70">
          Superfícies elevadas usam papel mais claro com borda de tinta a 10%.
        </p>
      </section>

      <footer className="flex gap-2 border-t border-ink/10 pt-4">
        {["bg-paper", "bg-ink", "bg-accent"].map((cls) => (
          <span key={cls} className={`${cls} h-8 w-8 rounded-full border border-ink/10`} title={cls} />
        ))}
        <span className="font-mono text-xs text-ink/50">#f6f1e7 · #2a2520 · #b45309</span>
      </footer>
    </div>
  );
}
