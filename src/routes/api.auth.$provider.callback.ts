import { createFileRoute } from "@tanstack/react-router";
import { finishSocialLogin, isLoginProvider } from "@/server/social";

const handle = ({ request, params }: { request: Request; params: { provider: string } }) =>
  isLoginProvider(params.provider) ? finishSocialLogin(request, params.provider) : new Response("Not found", { status: 404 });

// Google comes back with GET, Apple with a form POST.
export const Route = createFileRoute("/api/auth/$provider/callback")({
  server: { handlers: { GET: handle, POST: handle } },
});
