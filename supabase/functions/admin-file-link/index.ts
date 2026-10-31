import {
  bucketName,
  clientIp,
  consumeRateLimit,
  createAdminClient,
  handleOptions,
  hasPublishableKey,
  jsonResponse,
  readJson,
  safeUuidFilePath,
} from "../_shared/security.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!hasPublishableKey(request)) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await readJson(request);
  const password = body?.password;
  const path = body?.path;
  if (typeof password !== "string" || !password || password.length > 72 || !safeUuidFilePath(path)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const ip = clientIp(request);
  if (!ip) return jsonResponse({ error: "rate_limit_unavailable" }, 503);

  try {
    const admin = createAdminClient();
    const { data: passwordMatches, error: passwordError } = await admin.rpc("printboard_admin_password_matches", {
      pw: password,
      p_client_ip: ip,
    });
    if (passwordError?.code === "P0001") return jsonResponse({ error: "too_many_attempts" }, 429);
    if (passwordError || passwordMatches !== true) return jsonResponse({ error: "unauthorized" }, 401);

    const { data: requestRow, error: requestError } = await admin
      .from("print_requests")
      .select("id")
      .eq("file_path", path)
      .maybeSingle();
    if (requestError || !requestRow) return jsonResponse({ error: "file_not_found" }, 404);

    const { data, error } = await admin.storage.from(bucketName).createSignedUrl(path, 120, { download: true });
    if (error || !data?.signedUrl) return jsonResponse({ error: "file_unavailable" }, 503);
    return jsonResponse({ signedUrl: data.signedUrl, expiresIn: 120 });
  } catch {
    return jsonResponse({ error: "file_unavailable" }, 503);
  }
});
