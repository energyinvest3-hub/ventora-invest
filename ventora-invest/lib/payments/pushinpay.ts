import "server-only";
import { timingSafeEqual } from "node:crypto";

type PushinPayCharge = {
  id: string;
  qr_code: string;
  status: string;
  value: number;
  webhook_url?: string | null;
  qr_code_base64: string;
  end_to_end_id?: string | null;
  payer_name?: string | null;
  payer_national_registration?: string | null;
};

type PushinPayTransaction = {
  id: string;
  status: string;
  value: number;
  end_to_end_id?: string | null;
};

export type PushinPayWebhookEvent = {
  id: string;
  value: number;
  status: string;
  end_to_end_id?: string | null;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function providerError(body: unknown, status: number) {
  const obj = asObject(body);
  const message = obj?.message;
  const error = obj?.error;
  if (typeof message === "string" && message.trim()) return message;
  if (typeof error === "string" && error.trim()) return error;
  return `PushinPay retornou HTTP ${status}.`;
}

function parseCharge(body: unknown): PushinPayCharge {
  const obj = asObject(body);
  if (
    !obj ||
    typeof obj.id !== "string" ||
    typeof obj.qr_code !== "string" ||
    typeof obj.qr_code_base64 !== "string" ||
    typeof obj.status !== "string"
  ) {
    throw new Error("PUSHINPAY_INVALID_CHARGE_RESPONSE");
  }
  const value = Number(obj.value);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("PUSHINPAY_INVALID_CHARGE_RESPONSE");
  }
  return {
    id: obj.id,
    qr_code: obj.qr_code,
    qr_code_base64: obj.qr_code_base64,
    status: obj.status,
    value,
    webhook_url: typeof obj.webhook_url === "string" ? obj.webhook_url : null,
    end_to_end_id: typeof obj.end_to_end_id === "string" ? obj.end_to_end_id : null,
    payer_name: typeof obj.payer_name === "string" ? obj.payer_name : null,
    payer_national_registration:
      typeof obj.payer_national_registration === "string"
        ? obj.payer_national_registration
        : null,
  };
}

function parseTransaction(body: unknown): PushinPayTransaction {
  const obj = asObject(body);
  if (!obj || typeof obj.id !== "string" || typeof obj.status !== "string") {
    throw new Error("PUSHINPAY_INVALID_TRANSACTION_RESPONSE");
  }
  const value = Number(obj.value);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("PUSHINPAY_INVALID_TRANSACTION_RESPONSE");
  }
  return {
    id: obj.id,
    status: obj.status,
    value,
    end_to_end_id: typeof obj.end_to_end_id === "string" ? obj.end_to_end_id : null,
  };
}

export function parsePushinPayWebhook(body: unknown): PushinPayWebhookEvent | null {
  const obj = asObject(body);
  if (!obj || typeof obj.id !== "string" || typeof obj.status !== "string") return null;
  const value = Number(obj.value);
  if (!Number.isInteger(value) || value < 0) return null;
  return {
    id: obj.id,
    value,
    status: obj.status,
    end_to_end_id: typeof obj.end_to_end_id === "string" ? obj.end_to_end_id : null,
  };
}

export function getPushinPayConfig() {
  const baseUrl =
    process.env.PUSHINPAY_BASE_URL?.trim() ||
    "https://api.pushinpay.com.br/api";

  if (!baseUrl.startsWith("https://")) {
    throw new Error("PUSHINPAY_BASE_URL_INVALID");
  }

  return {
    apiToken: requiredEnv("PUSHINPAY_API_TOKEN"),
    webhookSecret: requiredEnv("PUSHINPAY_WEBHOOK_SECRET"),
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}

export function pushinPayWebhookUrl(request: Request) {
  const { webhookSecret } = getPushinPayConfig();
  const explicit = process.env.PUSHINPAY_WEBHOOK_URL?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = explicit || (siteUrl ? `${siteUrl.replace(/\/+$/, "")}/api/webhooks/pushinpay` : new URL("/api/webhooks/pushinpay", request.url).toString());
  const url = new URL(base);

  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("PUSHINPAY_WEBHOOK_HTTPS_REQUIRED");
  }

  url.searchParams.set("token", webhookSecret);
  return url.toString();
}

export function verifyPushinPayWebhook(request: Request) {
  const { webhookSecret } = getPushinPayConfig();
  const urlSecret = new URL(request.url).searchParams.get("token") ?? "";
  const headerSecret = request.headers.get("x-ventora-webhook-secret") ?? "";
  const candidate = headerSecret || urlSecret;
  return Boolean(candidate) && safeEqual(candidate, webhookSecret);
}

export function normalizePushinPayQr(value: string) {
  return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}

export async function createPushinPayCharge(valueCents: number, webhookUrl: string) {
  const { apiToken, baseUrl } = getPushinPayConfig();
  const response = await fetch(`${baseUrl}/pix/cashIn`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      value: valueCents,
      webhook_url: webhookUrl,
      split_rules: [],
    }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(providerError(body, response.status));
  return parseCharge(body);
}

export async function getPushinPayTransaction(id: string) {
  const { apiToken, baseUrl } = getPushinPayConfig();
  const response = await fetch(`${baseUrl}/transactions/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(providerError(body, response.status));
  return parseTransaction(body);
}
