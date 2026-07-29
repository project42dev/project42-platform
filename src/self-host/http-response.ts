import type { ServerResponse } from "node:http";

export async function writeWebResponseToNode(
  outgoing: ServerResponse,
  response: Response,
): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") {
      outgoing.setHeader(name, value);
    }
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    outgoing.setHeader("set-cookie", cookies);
  }
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}
