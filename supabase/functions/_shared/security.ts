import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const bucketName = "print-files";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response("ok", { headers: corsHeaders });
}

function equalConstantTime(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

export function hasPublishableKey(request: Request): boolean {
  const supplied = request.headers.get("apikey") ?? "";
  let expected = "";
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    expected = values.default ?? "";
  } catch {
    return false;
  }
  expected ||= Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  return Boolean(expected && supplied && equalConstantTime(supplied, expected));
}

export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    key ||= values.default ?? "";
  } catch {
    // Fall through to the legacy runtime variable for older projects.
  }
  key ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function clientIp(request: Request): string | null {
  // The hosted Edge Function ingress is behind Cloudflare. Require its
  // client-address header instead of trusting a caller-controlled fallback.
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  if (!ip || ip.length > 64 || /[\s,]/.test(ip)) return null;
  return ip;
}

export async function consumeRateLimit(
  client: SupabaseClient,
  ip: string,
  scope: "request_upload" | "request_submit" | "request_cleanup" | "request_lookup" | "admin",
  maxHits: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await client.rpc("consume_printboard_rate_limit", {
    p_scope: scope,
    p_client_ip: ip,
    p_max_hits: maxHits,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Request limit could not be checked.");
  return data === true;
}

export async function requirePrivatePrintBucket(client: SupabaseClient, mimeType: string): Promise<void> {
  const { data, error } = await client.storage.getBucket(bucketName);
  if (error || !data || data.public !== false) throw new Error("Private file storage is not configured.");
  if (!data.allowed_mime_types?.includes(mimeType)) throw new Error("File type is not allowed by storage settings.");
}

export function fileMimeType(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "3mf") return "application/vnd.ms-package.3dmanufacturing-3dmodel+xml";
  if (extension === "stl") return "model/stl";
  return null;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 16_384) return null;
  try {
    const value: unknown = await request.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function safeUuidFilePath(path: unknown): path is string {
  return typeof path === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(3mf|stl)$/i.test(path);
}
