import { env } from "./env";
import { checkPassword, hashPassword, randomId, sign, verifySig } from "./crypto";
import { kv } from "./kv";
import { PLUGIN_PROVIDER, authorizeUrl, deleteToken, exchangeCode, isConfigured, loadToken, moveTokens, revoke, saveToken } from "./providers";
import { loginProviders } from "./social";
import { clientIp, loginRequired, requireAccount, throttle } from "./limits";
import { HttpError, clearCookie, cookieFor, fail, getSession, getUser, json, requireSameOrigin, secret, withCookie, type User } from "./session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readJson<T>(request: Request): Promise<T> {
  try { return (await request.json()) as T; } catch { throw new HttpError(400, "Invalid request."); }
}

/* ------------------------------ auth ------------------------------ */

export async function handleAuth(request: Request, action: string): Promise<Response> {
  try {
    requireSameOrigin(request);
    const store = kv();
    const { session, setCookie } = await getSession(request);

    if (action === "me") {
      const user = await getUser(session.uid);
      return withCookie(json({ user: user ? { email: user.email } : null, persistent: store.persistent, requireLogin: loginRequired(), providers: loginProviders() }), setCookie);
    }
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");

    if (action === "logout") {
      return json({ ok: true }, 200, { "set-cookie": clearCookie() });
    }

    if (action === "register" || action === "login") {
      const { email: rawEmail, password } = await readJson<{ email?: string; password?: string }>(request);
      const email = String(rawEmail ?? "").trim().toLowerCase();
      const pw = String(password ?? "");
      if (!EMAIL.test(email) || email.length > 200) throw new HttpError(400, "Enter a valid email address.");
      await throttle(`rl:${action}:${email}`, 10, 900, "Too many attempts. Try again in a few minutes.");
      if (action === "register") await throttle(`rl:reg-ip:${clientIp(request)}`, 10, 3600, "Too many new accounts from this network. Try again later.");

      let user: User | null = null;
      if (action === "register") {
        if (pw.length < 8 || pw.length > 200) throw new HttpError(400, "Use a password with at least 8 characters.");
        if (await store.get(`user:email:${email}`)) throw new HttpError(409, "An account with that email already exists. Try signing in.");
        user = { id: "u_" + randomId(16), email, hash: await hashPassword(pw), createdAt: Date.now() };
        await store.set(`user:${user.id}`, user);
        await store.set(`user:email:${email}`, user.id);
      } else {
        const id = await store.get<string>(`user:email:${email}`);
        user = id ? await store.get<User>(`user:${id}`) : null;
        if (!user || !(await checkPassword(pw, user.hash))) throw new HttpError(401, "Wrong email or password.");
      }
      if (!session.registered) await moveTokens(session.uid, user.id);
      return json({ user: { email: user.email }, persistent: store.persistent, requireLogin: loginRequired() }, 200, { "set-cookie": await cookieFor(request, user.id) });
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------ cloud sync ------------------------------ */

export async function handleSync(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const { session, setCookie } = await getSession(request);
    if (!session.registered) throw new HttpError(401, "Sign in to sync.");
    const key = `sync:${session.uid}`;
    if (request.method === "GET") return withCookie(json((await kv().get(key)) ?? { conversations: [], projects: [], tombstones: [] }), setCookie);
    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > 900_000) throw new HttpError(413, "Too much data to sync.");
      const b = JSON.parse(text) as { conversations?: unknown; projects?: unknown; tombstones?: unknown };
      if (!Array.isArray(b.conversations) || !Array.isArray(b.projects) || !Array.isArray(b.tombstones)) throw new HttpError(400, "Invalid data.");
      await kv().set(key, { conversations: b.conversations, projects: b.projects, tombstones: b.tombstones, updatedAt: Date.now() });
      return withCookie(json({ ok: true }), setCookie);
    }
    throw new HttpError(405, "Method not allowed.");
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------ plugins ------------------------------ */

export async function handlePluginStatus(request: Request): Promise<Response> {
  try {
    const { session, setCookie } = await getSession(request);
    const out: Record<string, { configured: boolean; connected: boolean }> = {};
    for (const [plugin, provider] of Object.entries(PLUGIN_PROVIDER)) {
      out[plugin] = { configured: isConfigured(provider), connected: !!(await loadToken(session.uid, plugin)) };
    }
    return withCookie(json(out), setCookie);
  } catch (e) {
    return fail(e);
  }
}

export async function handlePluginDisconnect(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const { session } = await getSession(request);
    const { plugin } = await readJson<{ plugin?: string }>(request);
    if (!plugin || !PLUGIN_PROVIDER[plugin]) throw new HttpError(400, "Unknown plugin.");
    await revoke(session.uid, plugin);
    await deleteToken(session.uid, plugin);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

async function packState(payload: { uid: string; plugin: string; exp: number; n: string }) {
  const data = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  return `${data}.${await sign(secret(), data)}`;
}

export async function handleOAuthStart(request: Request, provider: string): Promise<Response> {
  try {
    const url = new URL(request.url);
    const plugin = url.searchParams.get("plugin") ?? "";
    if (!PLUGIN_PROVIDER[plugin] || PLUGIN_PROVIDER[plugin] !== provider) throw new HttpError(400, "Unknown plugin.");
    if (!isConfigured(PLUGIN_PROVIDER[plugin])) throw new HttpError(501, `${provider} sign-in isn't set up on this server yet.`);
    const { session, setCookie } = await getSession(request);
    const state = await packState({ uid: session.uid, plugin, exp: Date.now() + 10 * 60_000, n: randomId(8) });
    return withCookie(new Response(null, { status: 302, headers: { location: authorizeUrl(request, plugin, state) } }), setCookie);
  } catch (e) {
    return fail(e);
  }
}

export async function handleOAuthCallback(request: Request, provider: string): Promise<Response> {
  const home = (q: string) => new Response(null, { status: 302, headers: { location: `${env("APP_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin}/?${q}` } });
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("error")) return home(`plugin_error=${encodeURIComponent("Access was not granted.")}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";
    const [data, sig] = state.split(".");
    if (!code || !data || !sig || !(await verifySig(secret(), data, sig))) throw new HttpError(400, "Invalid sign-in state.");
    const st = JSON.parse(atob(data)) as { uid: string; plugin: string; exp: number };
    if (st.exp < Date.now() || PLUGIN_PROVIDER[st.plugin] !== provider) throw new HttpError(400, "That sign-in link expired. Try again.");
    const { session } = await getSession(request);
    if (session.uid !== st.uid) throw new HttpError(400, "Session changed during sign-in. Try again.");
    await saveToken(st.uid, st.plugin, await exchangeCode(request, st.plugin, code));
    return home(`plugin_connected=${encodeURIComponent(st.plugin)}`);
  } catch (e) {
    return home(`plugin_error=${encodeURIComponent(e instanceof HttpError ? e.message : "Couldn't connect the plugin.")}`);
  }
}

/* ------------------------------ images ------------------------------ */

type ImageOut = { src: string };

/** Gemini image models (e.g. "Nano Banana") use Google's native generateContent API, not /images/generations. */
async function geminiImage(prompt: string): Promise<ImageOut> {
  const base = (env("STICK_IMAGE_URL") ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const key = env("STICK_IMAGE_KEY") ?? env("GEMINI_API_KEY") ?? env("STICK_API_KEY");
  if (!key) throw new HttpError(501, "not_configured");
  const model = env("STICK_IMAGE_MODEL") ?? "gemini-3.1-flash-image-preview";
  const res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message;
    throw new HttpError(502, `The image model returned an error (${res.status})${detail ? `: ${detail.slice(0, 160)}` : "."}`);
  }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }[] } }[]; promptFeedback?: { blockReason?: string } };
  for (const part of j.candidates?.[0]?.content?.parts ?? []) {
    const d = part.inlineData ?? (part.inline_data && { mimeType: part.inline_data.mime_type, data: part.inline_data.data });
    if (d?.data) return { src: `data:${d.mimeType ?? "image/png"};base64,${d.data}` };
  }
  throw new HttpError(422, j.promptFeedback?.blockReason ? "That request was blocked by the image model's safety filter. Try rewording it." : "The image model didn't return an image. Try describing it differently.");
}

async function openAiImage(prompt: string): Promise<ImageOut> {
  const base = (env("STICK_IMAGE_URL") ?? env("STICK_API_URL"))?.replace(/\/$/, "");
  if (!base) throw new HttpError(501, "not_configured");
  const key = env("STICK_IMAGE_KEY") ?? env("STICK_API_KEY");
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: env("STICK_IMAGE_MODEL") ?? "stick-image", prompt, n: 1, size: "1024x1024", response_format: "b64_json" }),
  });
  if (!res.ok) throw new HttpError(502, `The image model returned an error (${res.status}).`);
  const item = ((await res.json()) as { data?: { b64_json?: string; url?: string }[] }).data?.[0];
  const src = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
  if (!src) throw new HttpError(502, "The image model returned no image.");
  return { src };
}

export async function handleImages(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const gemini = env("STICK_IMAGE_PROVIDER")?.toLowerCase() === "gemini";
    if (!gemini && !(env("STICK_IMAGE_URL") ?? env("STICK_API_URL"))) return json({ error: "not_configured" }, 501);
    const { session, setCookie } = await getSession(request);
    requireAccount(session);
    await throttle(`rl:img:${session.uid}`, 20, 3600, "You've reached the hourly image limit. Try again later.");
    const { prompt } = await readJson<{ prompt?: string }>(request);
    const text = String(prompt ?? "").trim().slice(0, 2000);
    if (!text) throw new HttpError(400, "Describe the image you want.");
    const out = gemini ? await geminiImage(text) : await openAiImage(text);
    return withCookie(json(out), setCookie);
  } catch (e) {
    if (e instanceof HttpError && e.message === "not_configured") return json({ error: "not_configured" }, 501);
    return fail(e);
  }
}


/* ------------------------------ photo-to-file ------------------------------ */

export async function handleCreateFile(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 6_000_000) throw new HttpError(413, "That image is too large.");
    const { session, setCookie } = await getSession(request);
    requireAccount(session);
    await throttle(`rl:file:${session.uid}`, 10, 3600, "You've reached the hourly file-creation limit. Try again later.");

    const body = await readJson<{ prompt?: string; images?: string[] }>(request);
    const prompt = String(body.prompt ?? "").trim().slice(0, 4000);
    const images = (body.images ?? []).filter((v) => typeof v === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(v)).slice(0, 3);
    if (!prompt || !images.length) throw new HttpError(400, "Add a picture and describe the file you want Stick to create.");

    const base = env("STICK_API_URL")?.replace(/\/$/, "");
    if (!base) throw new HttpError(501, "File creation isn't connected to an AI provider yet.");
    const key = env("STICK_API_KEY");
    let model = "stick-build";
    try {
      const map = JSON.parse(env("STICK_MODEL_MAP") ?? "{}") as Record<string, string>;
      model = map["stick-build"] ?? map["stick-2-1"] ?? map["stick-2"] ?? model;
    } catch { /* use the configured Stick Build model id */ }

    const parts: { type: string; text?: string; image_url?: { url: string } }[] = [
      { type: "text", text: `Create the actual file requested by the user from the attached reference image(s). User request: ${prompt}

Return ONLY a valid JSON object with exactly these fields: filename, mimeType, content, summary.
Choose a useful real file format based on the request. Supported formats: .md, .txt, .html, .css, .js, .ts, .tsx, .jsx, .py, .json, .csv, .svg, .xml, .sql, .yaml, .yml.
The content field must contain the complete file contents, not an explanation or placeholder. For notes, faithfully transcribe visible text and organize it cleanly. For drawings/designs, recreate the requested result in the most suitable editable format (for example SVG, HTML/CSS, or code). Preserve important details from the image; mark genuinely unreadable text rather than guessing. Make the file complete and ready to use. Do not wrap the JSON in markdown fences.` },
      ...images.map((url) => ({ type: "image_url", image_url: { url } })),
    ];
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: "system", content: "You are Stick Build's file-generation engine. You create complete, usable files from user instructions and visual references. Output strict JSON only." }, { role: "user", content: parts }], temperature: 0.2, max_tokens: 16000 }),
    });
    if (!res.ok) throw new HttpError(502, `The file-generation model returned an error (${res.status}).`);
    const upstream = (await res.json()) as { choices?: { message?: { content?: string | { text?: string }[] } }[] };
    const raw = upstream.choices?.[0]?.message?.content;
    let text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p) => p.text ?? "").join("") : "";
    text = text.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
    const parsed = JSON.parse(text) as { filename?: string; mimeType?: string; content?: string; summary?: string };
    const allowed = /\.(md|txt|html|css|js|ts|tsx|jsx|py|json|csv|svg|xml|sql|yaml|yml)$/i;
    const filename = String(parsed.filename ?? "stick-created-file.md").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 100);
    if (!allowed.test(filename) || typeof parsed.content !== "string" || !parsed.content.trim()) throw new HttpError(502, "The model didn't return a valid, complete file. Try asking for a specific format.");
    if (parsed.content.length > 1_000_000) throw new HttpError(413, "The generated file is too large.");
    const mimeByExt: Record<string, string> = { md: "text/markdown", txt: "text/plain", html: "text/html", css: "text/css", js: "text/javascript", ts: "text/plain", tsx: "text/plain", jsx: "text/plain", py: "text/x-python", json: "application/json", csv: "text/csv", svg: "image/svg+xml", xml: "application/xml", sql: "text/plain", yaml: "text/yaml", yml: "text/yaml" };
    const ext = filename.split(".").pop()!.toLowerCase();
    return withCookie(json({ filename, mimeType: mimeByExt[ext], content: parsed.content, summary: String(parsed.summary ?? "Your file is ready.") }), setCookie);
  } catch (e) {
    return fail(e);
  }
}
