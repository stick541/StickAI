import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/stick/AppShell";
import { BRAND, DESCRIPTION, TAGLINE, seo } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => seo(),
  component: Index,
});

/**
 * The chat itself only runs in the browser, so this part is what search engines
 * (and people with JavaScript off) see: the brand name and "Made by Stick".
 */
function Landing() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <img src="/stick-logo.png" alt="" width={72} height={72} className="size-[72px] rounded-2xl" />
      <h1 className="text-4xl font-semibold tracking-tight">{BRAND}</h1>
      <p className="text-lg text-primary">{TAGLINE}</p>
      <p className="max-w-md text-sm text-muted-foreground">{DESCRIPTION}</p>
      <noscript><p className="text-sm text-muted-foreground">Turn on JavaScript to chat with {BRAND}.</p></noscript>
    </main>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<Landing />}>
      <AppShell />
    </ClientOnly>
  );
}
