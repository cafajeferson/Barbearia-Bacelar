export function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <main className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold text-primary">{title}</h1>
      <p className="text-muted-foreground">{note ?? "Essa tela ainda será construída."}</p>
    </main>
  );
}
