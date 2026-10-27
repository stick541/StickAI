import { createFileRoute } from "@tanstack/react-router";
import { handleAuth } from "@/server/handlers";

export const Route = createFileRoute("/api/auth/$action")({
  server: { handlers: { GET: ({ request, params }) => handleAuth(request, params.action), POST: ({ request, params }) => handleAuth(request, params.action) } },
});
