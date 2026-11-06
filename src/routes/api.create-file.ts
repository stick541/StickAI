import { createFileRoute } from "@tanstack/react-router";
import { handleCreateFile } from "@/server/handlers";

export const Route = createFileRoute("/api/create-file")({
  server: { handlers: { POST: ({ request }) => handleCreateFile(request) } },
});
