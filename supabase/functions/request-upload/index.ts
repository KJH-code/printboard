import {
  bucketName,
  clientIp,
  consumeRateLimit,
  createAdminClient,
  fileMimeType,
  handleOptions,
  hasPublishableKey,
  jsonResponse,
  readJson,
  requirePrivatePrintBucket,
} from "../_shared/security.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!hasPublishableKey(request)) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await readJson(request);
  const fileName = body?.fileName;
  const fileSize = body?.fileSize;
  if (typeof fileName !== "string" || fileName.length > 255 || !Number.isSafeInteger(fileSize) || Number(fileSize) < 1) {
    return jsonResponse({ error: "invalid_file" }, 400);
  }

  const mimeType = fileMimeType(fileName);
  if (!mimeType) return jsonResponse({ error: "only_3mf_and_stl" }, 415);

  const ip = clientIp(request);
  if (!ip) return jsonResponse({ error: "rate_limit_unavailable" }, 503);

  try {
    const admin = createAdminClient();
    if (!await consumeRateLimit(admin, ip, "request_upload", 5, 600)) {
      return jsonResponse({ error: "too_many_uploads" }, 429);
    }
    await requirePrivatePrintBucket(admin, mimeType);

    const path = `${crypto.randomUUID()}.${mimeType.endsWith("xml") ? "3mf" : "stl"}`;
    const { data, error } = await admin.storage.from(bucketName).createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) return jsonResponse({ error: "upload_unavailable" }, 503);

    return jsonResponse({ path, token: data.token, mimeType });
  } catch {
    return jsonResponse({ error: "upload_unavailable" }, 503);
  }
});
