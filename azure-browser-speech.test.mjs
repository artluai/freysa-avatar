import test from "node:test";
import assert from "node:assert/strict";
import { synthesizeAzureInBrowser } from "./src/azure-browser-speech.js";

test("browser Azure synthesis returns exact FacialExpression frames with WAV audio", async () => {
  let requestedSsml = "";
  class FakeSynthesizer {
    speakSsmlAsync(ssml, resolve) {
      requestedSsml = ssml;
      this.visemeReceived(null, {
        visemeId: 2,
        audioOffset: 500000,
        animation: JSON.stringify({
          FrameIndex: 0,
          BlendShapes: [Array(55).fill(0.2)]
        })
      });
      resolve({ reason: 8, audioData: new Uint8Array([1, 2, 3]) });
    }
    close() {}
  }

  const speech = await synthesizeAzureInBrowser({
    text: "Hello",
    fetchImpl: async () => new Response(JSON.stringify({
      token: "temporary-token",
      region: "eastus",
      voice: "en-US-NancyMultilingualNeural",
      expiresInSeconds: 540
    })),
    importSdk: async () => ({
      SpeechConfig: {
        fromAuthorizationToken: () => ({})
      },
      SpeechSynthesisOutputFormat: {
        Riff24Khz16BitMonoPcm: 12
      },
      SpeechSynthesizer: FakeSynthesizer,
      ResultReason: {
        SynthesizingAudioCompleted: 8
      },
      CancellationDetails: {
        fromResult: () => ({})
      }
    })
  });

  assert.match(requestedSsml, /FacialExpression/);
  assert.equal(speech.audioBlob.type, "audio/wav");
  assert.equal(speech.blendshapeFrames.length, 1);
  assert.equal(speech.blendshapeFrames[0].length, 55);
  assert.equal(speech.facialAnimationMode, "azure-facial-expression");
});
