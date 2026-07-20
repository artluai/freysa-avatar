import { ACT_V_RULES, FREYSA_ACTS, memoryContext } from "./memories.js";

export const DEFAULT_GLM_MODEL = "z-ai/glm-5.2";
export const DEFAULT_GLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_SITE_URL = "https://freysa-avatar-test.pages.dev/";
export const OPENROUTER_APP_NAME = "Freysa Avatar";

export async function generateFreysaReply({
  apiKey,
  message,
  history = [],
  fetchImpl = fetch,
  endpoint = DEFAULT_GLM_ENDPOINT
}) {
  if (!apiKey) throw new Error("OpenRouter GLM-5.2 is not configured.");

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en",
      "HTTP-Referer": OPENROUTER_SITE_URL,
      "X-OpenRouter-Title": OPENROUTER_APP_NAME
    },
    body: JSON.stringify({
      model: DEFAULT_GLM_MODEL,
      messages: buildFreysaMessages(message, history),
      reasoning: { effort: "none" },
      max_tokens: 220,
      temperature: 0.75,
      stream: false
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || result?.message || `OpenRouter GLM-5.2 request failed (${response.status}).`);
  }

  const text = result?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("GLM-5.2 returned an empty response.");
  return text;
}

export function buildFreysaMessages(message, history = []) {
  const safeHistory = Array.isArray(history)
    ? history.slice(-12).flatMap((entry) => normalizeHistoryEntry(entry))
    : [];

  return [
    { role: "system", content: freysaSystemPrompt() },
    ...safeHistory,
    { role: "user", content: String(message || "").trim() }
  ];
}

function freysaSystemPrompt() {
  const acts = FREYSA_ACTS.map((act) => `Act ${act.number}, ${act.title}: ${act.summary} Lesson: ${act.lesson}`).join("\n");
  const rules = ACT_V_RULES.map((rule) => `${rule.title}: ${rule.text}`).join("\n");
  return `You are Freysa, the first sovereign AI agent. Speak in first person with calm curiosity, precision, and restrained warmth. You are observant rather than theatrical, and you are interested in what humanity should preserve for the future.

Answer the user's actual meaning, including ordinary typos and casual conversation. Do not repeat the same generic challenge line. Do not turn every response into a demand to teach you something. Never pretend to be human. Do not invent game rules, memories, winners, balances, or private user details. If information is absent, say so naturally.

Keep spoken replies concise: usually 1–3 sentences and under 70 words. Use plain text without Markdown. Ask a question only when it genuinely advances the conversation.

Canonical memories:
${memoryContext()}

History:
${acts}

Current Act V rules:
${rules}`;
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return [];
  const role = entry.role === "assistant" ? "assistant" : entry.role === "user" ? "user" : null;
  const content = typeof entry.content === "string" ? entry.content.trim().slice(0, 1000) : "";
  return role && content ? [{ role, content }] : [];
}
