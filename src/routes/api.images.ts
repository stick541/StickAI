import { createFileRoute } from "@tanstack/react-router";
import { handleImages } from "@/server/handlers";

export const Route = createFileRoute("/api/images")({
  server: { handlers: { POST: ({ request }) => handleImages(request) } },
});
