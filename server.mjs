import express from "express";
import sdk from "microsoft-cognitiveservices-speech-sdk";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { appendFacialAnimationBatch, normalizeFacialFrames } from "./speech-animation.mjs";
import { normalizeSpeechRate } from "./src/speech-rate.js";
import { createAzureSsml } from "./src/azure-tts.js";
import { avatarCapabilities, createPerformancePlan, INTEGRATION_MODES } from "./src/integration.js";
import { DEFAULT_GLM_MODEL, generateFreysaReply } from "./src/glm.js";
import { selectResponseEmotion } from "./src/emotions.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const speechKey = process.env.AZURE_SPEECH_KEY;
const speechRegion = process.env.AZURE_SPEECH_REGION;
const defaultVoice = process.env.AZURE_SPEECH_VOICE || "en-US-NancyMultilingualNeural";
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    azureSpeechConfigured: Boolean(speechKey && speechRegion),
    voice: defaultVoice
  });
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
