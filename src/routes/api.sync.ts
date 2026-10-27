import { createFileRoute } from "@tanstack/react-router";
import { handleSync } from "@/server/handlers";

export const Route = createFileRoute("/api/sync")({
  server: { handlers: { GET: ({ request }) => handleSync(request), PUT: ({ request }) => handleSync(request) } },
});
