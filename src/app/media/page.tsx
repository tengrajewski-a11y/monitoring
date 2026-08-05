export default function MediaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Kolejny etap
        </p>
        <h1 className="mt-2 font-brand text-2xl text-foreground sm:text-3xl">
          Monitoring mediów
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          W pierwszym etapie aplikacja koncentruje się na monitoringu
          legislacyjnym na poziomie prawa krajowego i unijnego. Monitoring
          mediów (prasa, portale branżowe, media społecznościowe) zostanie
          dodany w kolejnym etapie rozwoju — z tym samym podziałem na
          dziedziny i klientów.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
        <p className="text-sm font-medium text-foreground">Wkrótce</p>
        <p className="mt-1 text-sm text-muted">
          Ta sekcja jest przygotowana architektonicznie (źródło danych
          &ldquo;MEDIA&rdquo; istnieje już w modelu danych) i zostanie
          uzupełniona w kolejnej iteracji.
        </p>
      </div>
    </div>
  );
}
