import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.argv[2] ?? 8420);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
};

createServer((request, response) => {
  const requestPath = request.url === "/" ? "index.html" : request.url.slice(1);
  const file = normalize(join(root, requestPath));
  if (!file.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  const stream = createReadStream(file);
  stream.on("error", () => response.writeHead(404).end("Not found"));
  response.writeHead(200, {
    "Content-Type": types[extname(file)] ?? "application/octet-stream",
  });
  stream.pipe(response);
}).listen(port, "127.0.0.1");
