import { EMOTION_NAMES, selectResponseEmotion } from "./emotions.js";
import { createMemoryGroundedResponse } from "./responses.js";

export const AVATAR_API_VERSION = "1.0";

export const INTEGRATION_MODES = Object.freeze({
  DIRECTED: "directed",
  EMOTION_ASSIST: "emotion-assist",
  FULL_FREYSA: "full-freysa"
});

export function createPerformancePlan(payload = {}) {
  const mode = String(payload.mode || "").trim();

  if (mode === INTEGRATION_MODES.DIRECTED) {
    const text = requireText(payload.text, "text");
    return {
      version: AVATAR_API_VERSION,
      mode,
      text,
      emotion: normalizeDirectedEmotion(payload.emotion),
      conversationId: normalizeConversationId(payload.conversationId),
      controlledBy: { script: "host", emotion: "host" }
    };
  }

  if (mode === INTEGRATION_MODES.EMOTION_ASSIST) {
    const text = requireText(payload.text, "text");
    return {
      version: AVATAR_API_VERSION,
      mode,
      text,
      emotion: selectResponseEmotion("", text),
      conversationId: normalizeConversationId(payload.conversationId),
      controlledBy: { script: "host", emotion: "freysa" }
    };
  }

  if (mode === INTEGRATION_MODES.FULL_FREYSA) {
    const message = requireText(payload.message, "message");
    const text = createMemoryGroundedResponse(message);
    return {
      version: AVATAR_API_VERSION,
      mode,
      text,
      emotion: selectResponseEmotion(message, text),
      conversationId: normalizeConversationId(payload.conversationId),
      controlledBy: { script: "freysa", emotion: "freysa" }
    };
  }

  throw integrationError(
    "INVALID_MODE",
    `mode must be one of: ${Object.values(INTEGRATION_MODES).join(", ")}`
  );
}

export function avatarCapabilities(voice) {
  return {
    version: AVATAR_API_VERSION,
    modes: Object.values(INTEGRATION_MODES),
    emotions: EMOTION_NAMES,
    voice,
    limits: {
      textCharacters: 1000,
      speechRate: { minimum: 0.75, maximum: 1.25, default: 1 }
    }
  };
}

function normalizeDirectedEmotion(value) {
  const source = typeof value === "string" ? { name: value } : value;
  if (!source || typeof source !== "object") {
    throw integrationError("EMOTION_REQUIRED", "directed mode requires an emotion");
  }

  const name = String(source.name || "").trim().toLowerCase();
  if (!EMOTION_NAMES.includes(name)) {
    throw integrationError("INVALID_EMOTION", `emotion must be one of: ${EMOTION_NAMES.join(", ")}`);
  }

  const defaultIntensity = name === "neutral" ? 0 : 0.9;
  const numericIntensity = source.intensity === undefined ? defaultIntensity : Number(source.intensity);
  if (!Number.isFinite(numericIntensity)) {
    throw integrationError("INVALID_EMOTION_INTENSITY", "emotion intensity must be a number from 0 to 1");
  }

  return {
    name,
    intensity: name === "neutral" ? 0 : Math.min(1, Math.max(0, numericIntensity))
  };
}

function requireText(value, field) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 1000) {
    throw integrationError("INVALID_TEXT", `${field} must contain 1 to 1000 characters`);
  }
  return text;
}

function normalizeConversationId(value) {
  if (value === undefined || value === null || value === "") return null;
  const conversationId = String(value).trim();
  if (!conversationId || conversationId.length > 128) {
    throw integrationError("INVALID_CONVERSATION_ID", "conversationId must contain 1 to 128 characters");
  }
  return conversationId;
}

function integrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
