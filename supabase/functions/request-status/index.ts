import {
  clientIp,
  consumeRateLimit,
  createAdminClient,
  handleOptions,
  hasPublishableKey,
  jsonResponse,
  readJson,
} from "../_shared/security.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!hasPublishableKey(request)) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await readJson(request);
  const trackingCode = typeof body?.trackingCode === "string" ? body.trackingCode.trim().toUpperCase() : "";
  const memberNo = typeof body?.memberNo === "string" ? body.memberNo.trim() : "";
  if (!/^[0-9A-F]{10}$/.test(trackingCode) || memberNo.length < 1 || memberNo.length > 30) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  const ip = clientIp(request);
  if (!ip) return jsonResponse({ error: "lookup_unavailable" }, 503);

  try {
    const admin = createAdminClient();
    if (!await consumeRateLimit(admin, ip, "request_lookup", 20, 600)) {
      return jsonResponse({ error: "too_many_lookups" }, 429);
    }

    const { data, error } = await admin
      .from("print_requests")
      .select("status,printer:printers(name),created_at")
      .eq("tracking_code", trackingCode)
      .eq("member_no", memberNo)
      .maybeSingle();
    if (error) return jsonResponse({ error: "lookup_unavailable" }, 503);
    if (!data) return jsonResponse({ error: "not_found" }, 404);

    const printer = Array.isArray(data.printer) ? data.printer[0] : data.printer;
    return jsonResponse({
      status: data.status,
      printerName: printer?.name ?? null,
      createdAt: data.created_at,
    });
  } catch {
    return jsonResponse({ error: "lookup_unavailable" }, 503);
  }
});
