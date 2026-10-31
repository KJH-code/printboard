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
  safeUuidFilePath,
} from "../_shared/security.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!hasPublishableKey(request)) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await readJson(request);
  if (body?.action === "cleanup") {
    const path = body.path;
    const ip = clientIp(request);
    if (!safeUuidFilePath(path) || !ip) return jsonResponse({ error: "invalid_request" }, 400);
    try {
      const admin = createAdminClient();
      if (!await consumeRateLimit(admin, ip, "request_cleanup", 20, 600)) {
        return jsonResponse({ error: "too_many_requests" }, 429);
      }
      const { data: existing, error: lookupError } = await admin
        .from("print_requests")
        .select("id")
        .eq("file_path", path)
        .maybeSingle();
      if (lookupError) return jsonResponse({ error: "cleanup_unavailable" }, 503);
      if (!existing) await admin.storage.from(bucketName).remove([path]);
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: "cleanup_unavailable" }, 503);
    }
  }
  const requesterName = typeof body?.requesterName === "string" ? body.requesterName.trim() : "";
  const memberNo = typeof body?.memberNo === "string" ? body.memberNo.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const path = body?.path;
  const reportedSize = body?.fileSize;
  if (
    requesterName.length < 1 || requesterName.length > 60
    || memberNo.length < 1 || memberNo.length > 30
    || note.length > 300
    || !safeUuidFilePath(path)
    || !Number.isSafeInteger(reportedSize) || Number(reportedSize) < 1
  ) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const mimeType = fileMimeType(path);
  if (!mimeType) return jsonResponse({ error: "invalid_file" }, 400);

  const ip = clientIp(request);
  if (!ip) return jsonResponse({ error: "rate_limit_unavailable" }, 503);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return jsonResponse({ error: "submission_unavailable" }, 503);
  }

  const { data: fileInfo, error: fileInfoError } = await admin.storage.from(bucketName).info(path);
  if (fileInfoError || !fileInfo) return jsonResponse({ error: "uploaded_file_not_found" }, 400);
  if (fileInfo.size !== Number(reportedSize) || fileInfo.contentType !== mimeType) {
    await admin.storage.from(bucketName).remove([path]);
    return jsonResponse({ error: "uploaded_file_invalid" }, 400);
  }

  try {
    if (!await consumeRateLimit(admin, ip, "request_submit", 4, 600)) {
      await admin.storage.from(bucketName).remove([path]);
      return jsonResponse({ error: "too_many_requests" }, 429);
    }

    const { data, error } = await admin.from("print_requests").insert({
      requester_name: requesterName,
      member_no: memberNo,
      file_path: path,
      note: note || null,
      status: "pending",
    }).select("id,tracking_code").single();

    if (error || !data) {
      await admin.storage.from(bucketName).remove([path]);
      return jsonResponse({ error: "submission_failed" }, 500);
    }
    return jsonResponse({ requestId: data.id, trackingCode: data.tracking_code });
  } catch {
    await admin.storage.from(bucketName).remove([path]);
    return jsonResponse({ error: "submission_unavailable" }, 503);
  }
});
