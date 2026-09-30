import "server-only";
import { createHash } from "node:crypto";

const MAX_JSON_BYTES = 16 * 1024;

type LimitConfig = { limit: number; windowSeconds: number };
type Bucket = { count: number; expiresAt: number };

const memoryBuckets = new Map<string, Bucket>();

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Muitas tentativas. Aguarde e tente novamente.");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  ).slice(0, 80);
}

export function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function isTrustedMutationRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return false;
  }

  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");

  if (!host) return process.env.NODE_ENV !== "production";
  if (!origin) return process.env.NODE_ENV !== "production";

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw || "{}");
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_JSON");
  }
  return value as Record<string, unknown>;
}

async function distributedRateLimit(key: string, cfg: LimitConfig) {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(cfg.windowSeconds), "NX"],
      ["TTL", key],
    ]),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("RATE_LIMIT_BACKEND_UNAVAILABLE");
  const data = (await response.json()) as Array<{ result?: number }>;
  const count = Number(data?.[0]?.result ?? 0);
  const ttl = Math.max(1, Number(data?.[2]?.result ?? cfg.windowSeconds));
  return { allowed: count <= cfg.limit, retryAfter: ttl };
}

function localRateLimit(key: string, cfg: LimitConfig) {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryBuckets.set(key, { count: 1, expiresAt: now + cfg.windowSeconds * 1000 });
    return { allowed: true, retryAfter: cfg.windowSeconds };
  }
  existing.count += 1;
  memoryBuckets.set(key, existing);
  return {
    allowed: existing.count <= cfg.limit,
    retryAfter: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  };
}

export async function rateLimit(key: string, cfg: LimitConfig) {
  let result: { allowed: boolean; retryAfter: number } | null = null;
  try {
    result = await distributedRateLimit(`ventora:${key}`, cfg);
  } catch (error) {
    console.error("Distributed rate limiter unavailable", error);
    if (process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT === "1" && process.env.NODE_ENV === "production") {
      throw new Error("RATE_LIMIT_BACKEND_UNAVAILABLE");
    }
  }

  result ??= localRateLimit(`ventora:${key}`, cfg);
  if (!result.allowed) throw new RateLimitError(result.retryAfter);
}

export function safeApiError(error: unknown) {
  if (error instanceof RateLimitError) {
    return Response.json(
      { error: error.message },
      { status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
    return Response.json({ error: "Requisição muito grande." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof Error && error.message === "INVALID_JSON") {
    return Response.json({ error: "Requisição inválida." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof Error && error.message === "RATE_LIMIT_BACKEND_UNAVAILABLE") {
    return Response.json({ error: "Proteção temporariamente indisponível. Tente novamente em instantes." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  console.error("Unhandled API error", error);
  return Response.json({ error: "Não foi possível concluir." }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
