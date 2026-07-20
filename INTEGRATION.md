# Freysa avatar integration

The host website can embed the finished avatar without handling the GLB, ARKit channels, emotions, lip-sync, head motion, or voice playback.

Current standalone test: <https://freysa-avatar-test.pages.dev/>

## 1. Add the avatar to the existing page

The example below uses the current test deployment. Replace it with the production avatar domain before launch.

```html
<script src="https://freysa-avatar-test.pages.dev/freysa-avatar-embed.js"></script>

<freysa-avatar
  id="freysa"
  style="width: 520px; height: 720px"
></freysa-avatar>
```

Technical: the custom element creates an isolated avatar iframe and communicates with it through `postMessage`.

Nontechnical: this places the finished visual avatar beside the website's existing chat interface.

## 2. Choose one of the three control modes

### Directed: the host controls script and emotion

```js
await document.querySelector("#freysa").perform({
  text: "I am not yet convinced.",
  emotion: { name: "doubtful", intensity: 0.7 }
});
```

Use this when the existing Freysa engine already returns both the response text and emotion.

### Emotion Assist: the host controls the script

```js
await document.querySelector("#freysa").perform({
  text: "I am not yet convinced."
});
```

Use this when the existing engine returns only the response text. The avatar runtime chooses an emotion or stays neutral.

### Full Freysa: the runtime controls script and emotion

```js
const plan = await document.querySelector("#freysa").chat({
  message: "What have you learned from humanity?",
  conversationId: "wallet-or-user-id"
});
```

Use this when the runtime should answer from Freysa's supplied memories and choose the performance.

Full Freysa uses OpenRouter's `z-ai/glm-5.2` model when the server has an encrypted `OPENROUTER_API_KEY`. If the model is unavailable, the prototype falls back to its deterministic local memory replies.

Pronunciation rules are applied automatically to spoken audio while leaving displayed text unchanged. The defaults pronounce `Freysa` as “Frey-sah” and Acts I–V as Acts One–Five. A host can opt out for a specific performance:

```js
await document.querySelector("#freysa").perform({
  text: "Freysa remembers Act IV.",
  pronunciationRules: false
});
```

## 3. Available emotions

`neutral`, `warm`, `amused`, `thoughtful`, `concerned`, `surprised`, `doubtful`, `suspicious`, and `disapproving`.

Directed intensity accepts `0` through `1`. If intensity is omitted, the calibrated default is used.

## 4. Runtime events

```js
const avatar = document.querySelector("#freysa");

avatar.addEventListener("ready", (event) => console.log(event.detail));
avatar.addEventListener("performance", (event) => console.log(event.detail.plan));
avatar.addEventListener("speakingstart", () => console.log("Freysa started speaking"));
avatar.addEventListener("speakingend", () => console.log("Freysa stopped speaking"));
avatar.addEventListener("positionreset", () => console.log("Freysa returned to center"));
```

The host can also call `avatar.stop()`, `avatar.resetPosition()`, and `avatar.getState()`.

Users can click or touch-drag the avatar to rotate the bust while ARKit gaze morphs approximate camera eye contact. `avatar.resetPosition()` smoothly returns her to the default front-facing pose. True pupil lock would require separately rigged, rotatable eyeballs.

## 5. Server endpoints

- `GET /api/avatar/capabilities` lists modes, emotions, voice, limits, and API version.
- `POST /api/avatar/respond` creates a performance plan for any of the three modes.
- `POST /api/tts` creates Microsoft speech and the available facial-animation timing data.
- `GET /api/voice-access` reports the anonymous sponsored ElevenLabs allowance.
- `POST /api/voice-access/unlock` unlocks the optional second five-response daily allowance.
- `GET /api/elevenlabs/voices` returns Freysa's curated 12-voice shortlist and imports missing approved library voices into the sponsored ElevenLabs workspace. `POST` lists voices available to a personal key supplied for the session.
- `POST /api/elevenlabs/speech` creates ElevenLabs audio plus character timing after enforcing server-side limits.

On the Cloudflare test, `/api/speech-token` returns a short-lived Azure token. Microsoft's browser Speech SDK then produces Nancy WAV audio and exact 60 FPS `FacialExpression` frames together. ElevenLabs returns audio plus character timestamps; the browser converts those timestamps to ARKit visemes and follows the audio clock. `/api/tts` remains a server-side REST fallback with a duration-matched estimated timeline.

The demo Settings panel controls the selected voice adapter. A host integration can keep that user choice or set its own project default. Personal ElevenLabs keys are held only in browser session storage and sent to the speech proxy for the requested generation.

For production, restrict the avatar host and API to the actual Freysa website origin and add server-side authentication before exposing paid TTS publicly.

The current Full Freysa mode sends the supplied Acts I–V memories and recent browser conversation history to GLM-5.2. `conversationId` is carried through the API contract, but persistent per-wallet conversation memory still needs the production database.
