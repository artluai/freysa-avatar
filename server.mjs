import express from "express";
import sdk from "microsoft-cognitiveservices-speech-sdk";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { appendFacialAnimationBatch, normalizeFacialFrames } from "./speech-animation.mjs";
import { normalizeSpeechRate } from "./src/speech-rate.js";
import { createAzureSsml } from "./src/azure-tts.js";
import { avatarCapabilities, createPerformancePlan, INTEGRATION_MODES } from "./src/integration.js";
import { DEFAULT_GLM_MODEL, generateFreysaReply } from "./src/glm.js";
import { selectResponseEmotion } from "./src/emotions.js";
import { createElevenLabsRequest, normalizeElevenLabsVoices } from "./src/elevenlabs.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const speechKey = process.env.AZURE_SPEECH_KEY;
const speechRegion = process.env.AZURE_SPEECH_REGION;
const defaultVoice = process.env.AZURE_SPEECH_VOICE || "en-US-NancyMultilingualNeural";
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const abuseHashSecret = process.env.ABUSE_HASH_SECRET || "freysa-local-development-only";
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;
const dirname = path.dirname(fileURLToPath(import.meta.url));
const localVoiceClients = new Map();
const localVoiceIps = new Map();

app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    azureSpeechConfigured: Boolean(speechKey && speechRegion),
    elevenLabsConfigured: Boolean(elevenLabsApiKey),
    turnstileSiteKey: turnstileSecretKey ? turnstileSiteKey || "" : "",
    voice: defaultVoice
  });
});

app.get("/api/voice-access", (request, response) => {
  const visitor = resolveLocalVisitor(request, response);
  response.json(localVoiceAccess(visitor));
});

app.post("/api/voice-access/unlock", (request, response) => {
  const visitor = resolveLocalVisitor(request, response);
  visitor.client.bonusUnlocked = true;
  response.json(localVoiceAccess(visitor));
});

app.get("/api/elevenlabs/voices", async (_request, response) => {
  if (!elevenLabsApiKey) {
    response.status(503).json({ error: "Sponsored ElevenLabs is not configured." });
    return;
  }
  await sendLocalElevenLabsVoices(elevenLabsApiKey, response);
});

app.post("/api/elevenlabs/voices", async (request, response) => {
  const key = typeof request.body?.apiKey === "string" ? request.body.apiKey.trim() : "";
  if (!key) {
    response.status(400).json({ error: "Enter a valid ElevenLabs API key." });
    return;
  }
  await sendLocalElevenLabsVoices(key, response);
});

app.post("/api/elevenlabs/speech", async (request, response) => {
  const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
  const voiceId = typeof request.body?.voiceId === "string" ? request.body.voiceId.trim() : "";
  const ownKey = typeof request.body?.apiKey === "string" ? request.body.apiKey.trim() : "";
  if (!text || text.length > 1000 || !/^[A-Za-z0-9_-]{8,128}$/.test(voiceId)) {
    response.status(400).json({ error: "Choose a voice and enter 1 to 1000 characters." });
    return;
  }

  const visitor = resolveLocalVisitor(request, response);
  const sponsored = !ownKey;
  if (sponsored && !elevenLabsApiKey) {
    response.status(503).json({ error: "Sponsored ElevenLabs is not configured." });
    return;
  }
  if (sponsored && !reserveLocalVoiceCredit(visitor)) {
    response.status(429).json({ error: "Your sponsored ElevenLabs allowance has been used for today.", code: "DAILY_LIMIT_REACHED" });
    return;
  }

  try {
    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": ownKey || elevenLabsApiKey },
        body: JSON.stringify(createElevenLabsRequest({ text, rate: request.body?.rate }))
      }
    );
    const speech = await elevenResponse.json().catch(() => ({}));
    if (!elevenResponse.ok || !speech.audio_base64) throw new Error(elevenLabsMessage(speech));
    response.json({
      audioBase64: speech.audio_base64,
      mimeType: "audio/mpeg",
      alignment: speech.normalized_alignment || speech.alignment,
      voiceId,
      access: sponsored ? localVoiceAccess(visitor) : null
    });
  } catch (error) {
    if (sponsored) refundLocalVoiceCredit(visitor);
    response.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/avatar/capabilities", (_request, response) => {
  response.json(avatarCapabilities(defaultVoice));
});

app.post("/api/avatar/respond", async (request, response) => {
  try {
    const plan = createPerformancePlan(request.body);
    if (plan.mode === INTEGRATION_MODES.FULL_FREYSA && openRouterApiKey) {
      const text = await generateFreysaReply({
        apiKey: openRouterApiKey,
        message: request.body.message,
        history: request.body.history
      });
      response.json({
        ...plan,
        text,
        emotion: selectResponseEmotion(request.body.message, text),
        model: DEFAULT_GLM_MODEL
      });
      return;
    }
    response.json({ ...plan, model: "local-memory-fallback" });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : String(error),
      code: error?.code || "INVALID_REQUEST"
    });
  }
});

app.post("/api/tts", async (request, response) => {
  if (!speechKey || !speechRegion) {
    response.status(503).json({
      error: "Azure Speech is not configured.",
      required: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"]
    });
    return;
  }

  const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
  if (!text || text.length > 1000) {
    response.status(400).json({ error: "Text must contain 1 to 1000 characters." });
    return;
  }

  const voice = typeof request.body?.voice === "string" && request.body.voice.trim()
    ? request.body.voice.trim()
    : defaultVoice;
  const rate = normalizeSpeechRate(request.body?.rate);

  try {
    const result = await synthesize(text, voice, rate);
    response.json(result);
  } catch (error) {
    console.error("Azure speech synthesis failed:", error);
    response.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const distDirectory = path.join(dirname, "dist");
if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(path.join(distDirectory, "index.html"));
  });
}

app.listen(port, "127.0.0.1", () => {
  console.log(`Freysa voice API listening on http://127.0.0.1:${port}`);
  console.log(`Azure Speech configured: ${Boolean(speechKey && speechRegion)}`);
});

async function sendLocalElevenLabsVoices(apiKey, response) {
  try {
    const voicesResponse = await fetch("https://api.elevenlabs.io/v2/voices?page_size=50", {
      headers: { "xi-api-key": apiKey }
    });
    const payload = await voicesResponse.json().catch(() => ({}));
    if (!voicesResponse.ok) throw new Error(elevenLabsMessage(payload));
    response.json({ voices: normalizeElevenLabsVoices(payload) });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
}

function resolveLocalVisitor(request, response) {
  const cookies = Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
  let clientId = verifyLocalCookie(cookies.freysa_voice_client);
  if (!clientId) {
    clientId = randomUUID();
    response.setHeader(
      "Set-Cookie",
      `freysa_voice_client=${encodeURIComponent(`${clientId}.${localSignature(clientId)}`)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`
    );
  }
  const day = new Date().toISOString().slice(0, 10);
  const clientKey = `${day}:${localSignature(`client:${clientId}`)}`;
  const ipKey = `${day}:${localSignature(`ip:${request.ip}`)}`;
  if (!localVoiceClients.has(clientKey)) localVoiceClients.set(clientKey, { used: 0, bonusUnlocked: false });
  if (!localVoiceIps.has(ipKey)) localVoiceIps.set(ipKey, { used: 0 });
  return { client: localVoiceClients.get(clientKey), ip: localVoiceIps.get(ipKey) };
}

function localVoiceAccess(visitor) {
  const total = visitor.client.bonusUnlocked ? 10 : 5;
  return {
    sponsoredConfigured: Boolean(elevenLabsApiKey),
    used: visitor.client.used,
    total,
    remaining: Math.max(0, Math.min(total - visitor.client.used, 30 - visitor.ip.used)),
    bonusUnlocked: visitor.client.bonusUnlocked,
    bonusAvailable: !visitor.client.bonusUnlocked && visitor.client.used >= 5,
    baseCredits: 5,
    bonusCredits: 5
  };
}

function reserveLocalVoiceCredit(visitor) {
  const total = visitor.client.bonusUnlocked ? 10 : 5;
  if (visitor.client.used >= total || visitor.ip.used >= 30) return false;
  visitor.client.used += 1;
  visitor.ip.used += 1;
  return true;
}

function refundLocalVoiceCredit(visitor) {
  visitor.client.used = Math.max(0, visitor.client.used - 1);
  visitor.ip.used = Math.max(0, visitor.ip.used - 1);
}

function verifyLocalCookie(value) {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const clientId = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(localSignature(clientId));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? clientId : null;
}

function localSignature(value) {
  return createHmac("sha256", abuseHashSecret).update(value).digest("hex");
}

function elevenLabsMessage(payload) {
  return payload?.detail?.message || payload?.detail?.status || payload?.message || "ElevenLabs request failed.";
}

function synthesize(text, voice, rate) {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    speechConfig.speechSynthesisVoiceName = voice;
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    const visemes = [];
    const facialFrames = [];

    synthesizer.visemeReceived = (_sender, event) => {
      visemes.push({
        id: event.visemeId,
        offsetMs: Math.round(event.audioOffset / 10000)
      });

      try {
        appendFacialAnimationBatch(facialFrames, event.animation);
      } catch (error) {
        console.warn("Ignored an invalid Azure facial-animation batch:", error);
      }
    };

    const finish = () => {
      synthesizer.close();
    };

    synthesizer.speakSsmlAsync(
      createAzureSsml(text, voice, rate, { facialExpression: true }),
      (result) => {
        if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
          const details = sdk.CancellationDetails.fromResult(result);
          finish();
          reject(new Error(details.errorDetails || "Speech synthesis was canceled."));
          return;
        }

        const audioBase64 = Buffer.from(result.audioData).toString("base64");
        finish();
        resolve({
          audioBase64,
          mimeType: "audio/mpeg",
          frameRate: 60,
          blendshapeFrames: normalizeFacialFrames(facialFrames),
          visemes,
          voice
        });
      },
      (error) => {
        finish();
        reject(new Error(String(error)));
      }
    );
  });
}
