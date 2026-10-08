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

export class PushinPayHttpError extends Error {
  status: number;
  providerMessage?: string;
  constructor(status: number, providerMessage?: string) {
    super(`PUSHINPAY_HTTP_${status}`);
    this.name = "PushinPayHttpError";
    this.status = status;
    this.providerMessage = providerMessage;
  }
}

function providerMessage(body: unknown) {
  const obj = asObject(body);
  const message = obj?.message;
  const error = obj?.error;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return undefined;
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
  if (!response.ok) throw new PushinPayHttpError(response.status, providerMessage(body));
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
  if (!response.ok) throw new PushinPayHttpError(response.status, providerMessage(body));
  return parseTransaction(body);
}

// === VENTORA PUSHINPAY CASHOUT v1 ===
type PushinPayCashOut = {
  id: string;
  status: string;
  value: number;
  end_to_end_id?: string | null;
  receiver_name?: string | null;
};

export class PushinPayCashOutError extends Error {
  retrySafe: boolean;
  httpStatus?: number;
  constructor(message: string, options: { retrySafe: boolean; httpStatus?: number }) {
    super(message);
    this.name = "PushinPayCashOutError";
    this.retrySafe = options.retrySafe;
    this.httpStatus = options.httpStatus;
  }
}

function normalizeCashOutPix(rawType: string, rawKey: string) {
  const type = rawType.trim().toLowerCase();
  const key = rawKey.trim();
  const digits = key.replace(/\D/g, "");
  if (type === "cpf") {
    if (digits.length !== 11) throw new Error("A chave CPF precisa ter 11 dígitos.");
    return { providerType: "national_registration", pixKey: digits, document: digits };
  }
  if (type === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) throw new Error("Informe um e-mail PIX válido.");
    return { providerType: "email", pixKey: key.toLowerCase(), document: "" };
  }
  if (type === "phone") {
    const phone = key.replace(/[^\d+]/g, "");
    if (!/^\+?55\d{10,11}$/.test(phone)) throw new Error("Informe o telefone PIX com DDI +55.");
    return { providerType: "phone", pixKey: phone.startsWith("+") ? phone : `+${phone}`, document: "" };
  }
  if (type === "random") {
    if (!/^[0-9a-f-]{32,36}$/i.test(key)) throw new Error("Informe uma chave aleatória PIX válida.");
    return { providerType: "evp", pixKey: key.toLowerCase(), document: "" };
  }
  throw new Error("Tipo de chave PIX inválido.");
}

export async function createPushinPayCashOut(input: {
  valueCents: number;
  pixKeyType: string;
  pixKey: string;
  receiverNationalRegistration: string;
  webhookUrl: string;
}) {
  const { apiToken, baseUrl } = getPushinPayConfig();
  const normalized = normalizeCashOutPix(input.pixKeyType, input.pixKey);
  const providedDocument = input.receiverNationalRegistration.replace(/\D/g, "");
  const document = normalized.document || providedDocument;

  if (![11,14].includes(document.length)) throw new Error("Informe o CPF ou CNPJ do titular da chave PIX.");
  if (normalized.document && providedDocument && normalized.document !== providedDocument) {
    throw new Error("O CPF do titular precisa ser igual à chave PIX CPF.");
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/pix/cashOut`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: input.valueCents,
        receiver_national_registration: document,
        pix_key_type: normalized.providerType,
        pix_key: normalized.pixKey,
        webhook_url: input.webhookUrl,
        device: Number(process.env.PUSHINPAY_DEVICE_ID?.trim() || "1"),
      }),
      cache: "no-store",
    });
  } catch {
    throw new PushinPayCashOutError(
      "Não foi possível confirmar se a PushinPay recebeu o saque. O valor ficou reservado para revisão.",
      { retrySafe: false },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PushinPayCashOutError(
      providerMessage(body) || `A PushinPay recusou o saque (HTTP ${response.status}).`,
      { retrySafe: true, httpStatus: response.status },
    );
  }

  const obj = asObject(body);
  const value = Number(obj?.value);
  if (!obj || typeof obj.id !== "string" || typeof obj.status !== "string" || !Number.isInteger(value) || value <= 0) {
    throw new PushinPayCashOutError(
      "A PushinPay confirmou o envio, mas respondeu em formato inesperado. Revise antes de tentar novamente.",
      { retrySafe: false },
    );
  }

  return {
    id: obj.id,
    status: obj.status,
    value,
    end_to_end_id: typeof obj.end_to_end_id === "string" ? obj.end_to_end_id : null,
    receiver_name: typeof obj.receiver_name === "string" ? obj.receiver_name : null,
  } satisfies PushinPayCashOut;
}
// === END VENTORA PUSHINPAY CASHOUT v1 ===
