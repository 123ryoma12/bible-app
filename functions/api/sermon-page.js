// Same-origin HTML fetch for sermon pages. Browsers cannot read these pages
// directly because their hosts do not send CORS headers; Pages Functions can.
// Only the two public sermon hosts are accepted so this cannot proxy arbitrary
// URLs supplied by a browser.
function allowedPage(url) {
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  if (url.hostname === "gospelinlife.com" || url.hostname === "www.gospelinlife.com") {
    return true;
  }
  if (url.hostname === "www.cornerstonechurch.com.au") {
    return /^\/[a-z-]+-sermons\/(?:scripture|episode)\//.test(url.pathname);
  }
  return false;
}

export async function onRequestGet({ request }) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw || raw.length > 2048) return new Response("Invalid sermon URL", { status: 400 });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Invalid sermon URL", { status: 400 });
  }
  if (!allowedPage(target)) return new Response("Sermon host not allowed", { status: 400 });

  try {
    for (let redirect = 0; redirect < 4; redirect += 1) {
      const upstream = await fetch(target, {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("Location");
        if (!location) break;
        target = new URL(location, target);
        if (!allowedPage(target)) return new Response("Redirect not allowed", { status: 502 });
        continue;
      }
      if (!upstream.ok || !upstream.headers.get("Content-Type")?.includes("text/html")) {
        return new Response("Sermon page unavailable", { status: 502 });
      }
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch {
    return new Response("Sermon page unavailable", { status: 502 });
  }
  return new Response("Too many redirects", { status: 502 });
}
