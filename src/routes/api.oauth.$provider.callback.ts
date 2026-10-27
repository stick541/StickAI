import { createFileRoute } from "@tanstack/react-router";
import { handleOAuthCallback } from "@/server/handlers";

export const Route = createFileRoute("/api/oauth/$provider/callback")({
  server: { handlers: { GET: ({ request, params }) => handleOAuthCallback(request, params.provider) } },
});
