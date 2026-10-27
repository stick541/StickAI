import { createFileRoute } from "@tanstack/react-router";
import { handleOAuthStart } from "@/server/handlers";

export const Route = createFileRoute("/api/oauth/$provider/start")({
  server: { handlers: { GET: ({ request, params }) => handleOAuthStart(request, params.provider) } },
});
