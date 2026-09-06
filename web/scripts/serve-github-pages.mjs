import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..", "dist", "pages");
const hostname = process.env.PAGES_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PAGES_PORT ?? "48142", 10);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeCandidate(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  const fromRoot = path.relative(root, candidate);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) return null;
  return candidate;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${hostname}:${port}`);
    let candidate = safeCandidate(url.pathname);
    if (!candidate) {
      response.writeHead(400).end("Bad request");
      return;
    }

    if (await exists(candidate)) {
      const candidateStat = await stat(candidate);
      if (candidateStat.isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          response.writeHead(308, { location: `${url.pathname}/${url.search}` }).end();
          return;
        }
        candidate = path.join(candidate, "index.html");
      }
    } else if (!path.extname(candidate)) {
      candidate = path.join(candidate, "index.html");
    }

    if (!(await exists(candidate))) {
      candidate = path.join(root, "404.html");
      response.statusCode = 404;
    }
    const extension = path.extname(candidate).toLowerCase();
    response.setHeader(
      "content-type",
      contentTypes.get(extension) ?? "application/octet-stream",
    );
    response.setHeader("cache-control", "no-store");
    createReadStream(candidate).pipe(response);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Unknown error");
  }
});

server.listen(port, hostname, () => {
  console.log(`Project 42 GitHub Pages artifact: http://${hostname}:${port}`);
});
