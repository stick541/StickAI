import { createFileRoute } from "@tanstack/react-router";
import { handlePluginStatus } from "@/server/handlers";

export const Route = createFileRoute("/api/plugins/status")({
  server: { handlers: { GET: ({ request }) => handlePluginStatus(request) } },
});
