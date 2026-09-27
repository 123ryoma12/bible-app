// Protect every Pages route, including exported Bible assets and the app shell.
// Set PWA_PASSWORD as an encrypted Cloudflare Pages secret before deployment.
const COOKIE_NAME = "bible_pwa_session";
const SESSION_SECONDS = 365 * 24 * 60 * 60;
const RENEW_WITHIN_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

function noStoreHeaders(contentType) {
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (contentType.startsWith("text/html")) {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'";
  }
  return headers;
}

function loginPage(error = false) {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#121212"><title>Unlock Bible</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:#121212;color:#fff;font-family:system-ui,sans-serif}
  main{width:min(100%,380px)}h1{font-size:28px;margin:0 0 10px}p{color:#b8b8b8;line-height:1.5;margin:0 0 26px}
  label{display:block;margin-bottom:8px;font-weight:600}input,button{width:100%;font:inherit;border-radius:10px;padding:14px 16px}
  input{background:#242424;border:1px solid #666;color:#fff}input:focus{outline:2px solid #bda06c;outline-offset:2px}
  button{margin-top:16px;border:0;background:#bda06c;color:#17120a;font-weight:700;cursor:pointer}
  .error{color:#ff9b9b;margin:0 0 14px}
</style></head><body><main><h1>Private Bible</h1><p>Enter the password to open your Bible on this device.</p>
${error ? '<p class="error" role="alert">Incorrect password. Try again.</p>' : ""}
<form method="post" action="/__unlock"><label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Unlock</button></form></main></body></html>`, {
    status: error ? 401 : 200,
    headers: noStoreHeaders("text/html; charset=utf-8"),
  });
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    return base64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

async function signingKey(password) {
  return crypto.subtle.importKey(
    "raw", encoder.encode(`bible-pwa-session:${password}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

function sessionMessage(expires, nonce, hostname) {
  return encoder.encode(`v1:${expires}:${nonce}:${hostname}`);
}

async function readSession(request, password) {
  const cookie = request.headers.get("Cookie")?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  const parts = cookie.slice(COOKIE_NAME.length + 1).split(".");
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0])) return null;
  const [expires, nonce, signature] = parts;
  const signatureBytes = fromBase64Url(signature);
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(nonce) || !signatureBytes || signatureBytes.length !== 32) return null;
  const expiresAt = Number(expires);
  if (expiresAt <= Date.now()) return null;
  const key = await signingKey(password);
  const valid = await crypto.subtle.verify(
    "HMAC", key, signatureBytes,
    sessionMessage(expires, nonce, new URL(request.url).hostname)
  );
  return valid ? expiresAt : null;
}

async function createSession(request, password) {
  const expires = String(Date.now() + SESSION_SECONDS * 1000);
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const key = await signingKey(password);
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, sessionMessage(expires, nonce, new URL(request.url).hostname)
  )));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${expires}.${nonce}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

async function passwordsMatch(submitted, expected) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(submitted)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function onRequest(context) {
  const { request } = context;
  const password = context.env.PWA_PASSWORD;
  if (!password) {
    return new Response("PWA password protection is not configured.", {
      status: 503,
      headers: noStoreHeaders("text/plain; charset=utf-8"),
    });
  }

  const path = new URL(request.url).pathname;
  if (path === "/__unlock") {
    if (request.method === "GET") return loginPage();
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 2048 || !request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded")) {
      return loginPage(true);
    }
    const submitted = new URLSearchParams((await request.text()).slice(0, 2048)).get("password") || "";
    if (!(await passwordsMatch(submitted, password))) return loginPage(true);
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": await createSession(request, password),
        "Cache-Control": "no-store",
      },
    });
  }

  const expiresAt = await readSession(request, password);
  if (!expiresAt) {
    const wantsHtml = request.method === "GET" &&
      (request.headers.get("Accept")?.includes("text/html") || request.mode === "navigate");
    return wantsHtml ? loginPage() : new Response("Unauthorized", {
      status: 401,
      headers: noStoreHeaders("text/plain; charset=utf-8"),
    });
  }

  const response = await context.next();
  if (request.mode !== "navigate" || expiresAt - Date.now() > RENEW_WITHIN_SECONDS * 1000) return response;
  const renewed = new Response(response.body, response);
  renewed.headers.set("Set-Cookie", await createSession(request, password));
  renewed.headers.set("Cache-Control", "private, no-store");
  return renewed;
}
