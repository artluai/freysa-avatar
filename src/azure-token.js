export const AZURE_SPEECH_TOKEN_LIFETIME_SECONDS = 540;

export async function issueAzureSpeechToken({ key, region, fetchImpl = fetch }) {
  if (!key || !region) throw new Error("Azure Speech is not configured.");
  if (!/^[a-z0-9-]+$/i.test(region)) throw new Error("Azure Speech region is invalid.");

  const response = await fetchImpl(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Length": "0"
      }
    }
  );

  const token = await response.text();
  if (!response.ok || !token.trim()) {
    throw new Error(token.trim() || `Azure Speech token request failed (${response.status}).`);
  }

  return {
    token: token.trim(),
    region,
    expiresInSeconds: AZURE_SPEECH_TOKEN_LIFETIME_SECONDS
  };
}
