import type { IncomingMessage } from "node:http";
import type { Pool } from "pg";
import {
  normalizeAuthClientAddress,
  type AuthAbuseLimiter,
} from "../auth-abuse-limiter.js";
import { PostgresAuthAbuseLimiter } from "./postgres-auth-abuse-limiter.js";

export function createSelfHostAuthAbuseLimiter(pool: Pool): AuthAbuseLimiter {
  return new PostgresAuthAbuseLimiter(pool);
}

export function createTrustedSocketClientAddressResolver(
  incoming: Pick<IncomingMessage, "socket">,
): (_request: Request) => string {
  const socketPeerAddress = incoming.socket.remoteAddress;
  return () => normalizeAuthClientAddress(socketPeerAddress ?? "");
}
