import { createFileRoute } from "@tanstack/react-router";
import { handlePluginDisconnect } from "@/server/handlers";

export const Route = createFileRoute("/api/plugins/disconnect")({
  server: { handlers: { POST: ({ request }) => handlePluginDisconnect(request) } },
});
