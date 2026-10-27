import { createFileRoute } from "@tanstack/react-router";
import { isLoginProvider, startSocialLogin } from "@/server/social";

export const Route = createFileRoute("/api/auth/$provider/start")({
  server: { handlers: { GET: ({ request, params }) => (isLoginProvider(params.provider) ? startSocialLogin(request, params.provider) : new Response("Not found", { status: 404 })) } },
});
