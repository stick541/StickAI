# Deploying StickAI to Cloudflare

## Why the build failed
`Could not resolve entry for router entry: router in /opt/buildhome/repo/src` means TanStack Start looked for
`src/router.tsx` in the GitHub repo and it wasn't there. The project itself contains it (and `src/server.ts`,
`src/start.ts`, `src/routes/`, `src/styles.css`), so the GitHub copy is incomplete. Typical causes: a web-browser
upload (GitHub allows 100 files per upload and hides dotfiles), or the zip's top folder `stickai/` was uploaded
as a sub-folder instead of its contents. This could not be checked directly (the repo was not reachable from
the tool used to prepare this ZIP), so verify on github.com that `src/router.tsx` exists after you push.

## 1. Put the complete project on GitHub
Use git (most reliable):
```bash
git clone https://github.com/stick541/StickAI.git
cd StickAI
# delete everything except the hidden .git folder, then copy ALL files from this ZIP in (including hidden ones)
git add -A
git status          # must list src/router.tsx, src/server.ts, src/routes/..., wrangler.jsonc, .gitignore
git commit -m "Complete StickAI project"
git push
```
`.env` is in `.gitignore`; check `git status` does NOT list it. Never commit it.
If you must use the website: upload in batches under 100 files (src/ first), and confirm `src/router.tsx` is listed.

## 2. Cloudflare settings (Workers, not Pages)
Workers & Pages -> your Worker -> Settings -> Builds:

| Setting | Value |
|---|---|
| Root directory | `/` (repo root, where package.json is) |
| Build command | `npm run build` (this runs `vite build`; remove any `npm run dev`) |
| Deploy command | `npx wrangler deploy` |
| Fallback deploy command | `npm run deploy:direct` (only if the line above says it can't find an entry point) |
| Worker name | must equal `"name"` in `wrangler.jsonc` (currently `stickai`) |

Node 22 is selected by `.nvmrc`. Nitro's `cloudflare_module` output goes to `.output/`.
Add the variables below under Settings -> Variables and Secrets (use **Secret** for keys). `VITE_*` values are read
at **build** time, so add them under the Builds section's variables too.

## 3. Environment variables
| Variable | Needed | Description (placeholder example) |
|---|---|---|
| `SESSION_SECRET` | yes | long random string, signs logins and encrypts plugin tokens (`<32+ random characters>`) |
| `APP_URL` | yes | public address, no trailing slash (`https://stickai.example.workers.dev`) |
| `STICK_API_URL` | yes | OpenAI-compatible base URL (`https://generativelanguage.googleapis.com/v1beta/openai`) |
| `STICK_API_KEY` | yes | model key, also used for images unless overridden (`<your key>`) |
| `STICK_MODEL_MAP` | yes | JSON mapping Stick model ids to provider model names |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | yes | **without these accounts and chats are lost** (Workers memory is not persistent) |
| `STICK_IMAGE_PROVIDER`, `STICK_IMAGE_MODEL` | for images | `gemini`, a Gemini image model name |
| `GEMINI_API_KEY` / `STICK_IMAGE_KEY` | optional | separate image key |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | Gmail/Calendar/Drive plugins and "Continue with Google" |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | optional | Slack plugin |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | optional | "Continue with Apple" |
| `STICK_CHAT_LIMIT_PER_HOUR` | optional | messages per person per hour (default 60) |
| `VITE_SITE_URL` | build-time | same as `APP_URL`, used for Google search metadata |
| `VITE_GOOGLE_SITE_VERIFICATION` | build-time, optional | Search Console code |

Do **not** set `STICK_ALLOW_GUESTS` in production.

## 4. After deploying, verify (needs your accounts)
1. Open the site: sign-in screen appears. Create an account, sign out, sign in again (proves Upstash works).
2. Send a chat message: a real model answer (not a "preview" notice).
3. Images tab: create an image.
4. Plugins: connect Google/Slack (redirect URLs: `{APP_URL}/api/oauth/google/callback`, `{APP_URL}/api/oauth/slack/callback`, `{APP_URL}/api/auth/google/callback`, `{APP_URL}/api/auth/apple/callback`).
5. If sign-up fails or times out on the free Workers plan, password hashing may exceed its 10 ms CPU limit; use the paid Workers plan.
