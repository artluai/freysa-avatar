import { accessError } from "./voice-access.js";

export async function verifyTurnstileIfConfigured({ env, request, token }) {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (!token || typeof token !== "string" || token.length > 2048) {
    throw accessError("BOT_CHECK_REQUIRED", "Please complete the quick human check and try again.", 403);
  }

  const remoteIp = request.headers.get("CF-Connecting-IP") || "";
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw accessError("BOT_CHECK_FAILED", "The human check expired or could not be verified. Please try again.", 403);
  }
}
