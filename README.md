# Freysa interactive 3D avatar

Freysa is a browser-based 3D avatar that can receive text, speak it with a human neural voice, lip-sync to the generated audio, and display an appropriate facial expression. It is designed to sit beside the existing Freysa game chat rather than replace that chat system.

- Live test: <https://freysa-avatar-test.pages.dev/>
- Detailed integration contract: [`INTEGRATION.md`](./INTEGRATION.md)
- Source repository: <https://github.com/artluai/freysa-avatar>

## What is working now

- The approved bald KeenTools Freysa head renders in the browser as a real 3D model.
- Four facial meshes expose 51 Apple ARKit-compatible expression channels.
- Microsoft Azure speaks with `en-US-NancyMultilingualNeural` and returns exact 60 FPS facial-animation frames synchronized to the audio.
- OpenRouter-hosted `z-ai/glm-5.2` can write Freysa's response using her Acts I–V history and the current Crown game context.
- The runtime can select one of nine facial states: neutral, warm, amused, thoughtful, concerned, surprised, doubtful, suspicious, or disapproving.
- Users can click or touch-drag Freysa to rotate her while her eyes remain fixed on the camera, then smoothly restore the front view with **Reset position**.
- The avatar can be added to another website with one script tag and the `<freysa-avatar>` web component.
- A local browser-voice and memory-based response fallback keeps the demo usable when a cloud service is unavailable.

The current model has no skeleton. Its entire head-and-shoulders crop can move subtly, but the head cannot yet turn independently from the neck and shoulders. Hair is also not part of this approved model yet.

## How a user message becomes a performance

1. The user types a message in the existing website chat.
2. The website chooses one of the three control modes described below.
3. If the avatar is responsible for the reply, the server sends the message, recent conversation, Freysa's identity, and Acts I–V memories to GLM-5.2 through OpenRouter.
4. The result becomes a small performance plan containing the exact text to say and an emotion with an intensity.
5. The browser requests a short-lived Microsoft Speech token. The permanent Azure key stays on the server.
6. Microsoft's browser Speech SDK generates Nancy's WAV audio and the matching 60 FPS facial-expression frames in the same synthesis request.
7. Three.js plays the audio while applying the matching frame to the 51 ARKit face channels according to the audio's current playback time.
8. Freysa's scripted emotion, blinking, eye motion, breathing, and restrained bust motion are layered onto the speech animation.
9. When the audio finishes, the mouth and expression ease back to neutral instead of snapping immediately.

In plain English: one system decides what Freysa says, Microsoft creates her voice and exact mouth timing, and the browser moves the 3D face while that audio plays.

## Technology and tools

### Used in the current build

| Tool | What it does here |
| --- | --- |
| Freysa reference images | Define the character's face, proportions, colors, and visual identity. |
| KeenTools FaceBuilder Cloud | Produced the approved likeness and ARKit-ready facial shape keys from reference images. |
| GLB / glTF | Packages the 3D geometry, textures, and face morph targets into a web-friendly model file. |
| Apple ARKit blendshape naming | Provides the 51-channel vocabulary used to animate the eyes, brows, jaw, cheeks, and lips. |
| Three.js | Loads, lights, renders, and animates the 3D model in the browser. |
| Microsoft Azure Speech | Generates the `en-US-NancyMultilingualNeural` voice and synchronized `FacialExpression` animation at 60 FPS. |
| OpenRouter | Provides one server API for the language model without exposing the API key to the browser. |
| GLM-5.2 | Writes Full Freysa responses from her personality, memories, current game rules, and recent conversation. |
| Custom emotion layer | Adds Freysa-specific expressions and intensity controls on top of the speech animation. |
| HTML, CSS, and JavaScript | Provide the chat demo, controls, history page, and integration API. |
| Web Components | Expose the framework-independent `<freysa-avatar>` element to the main website. |
| iframe + `postMessage` | Isolate the avatar UI while safely passing commands and events between it and the host page. |
| Vite | Runs the local development site and creates the production browser bundle. |
| glTF Transform + Meshopt | Compress the model from roughly 40 MB to roughly 2.9 MiB for Cloudflare deployment without removing facial channels. |
| Node.js + Express | Run the local API used during development. |
| Cloudflare Pages + Functions | Host the public test and run the small server endpoints that protect service keys. |
| Wrangler | Builds and deploys the Cloudflare Functions portion of the project. |
| Node test runner + browser testing | Check the response plans, memories, TTS parsing, lip-sync timing, emotions, integration modes, and live UI. |

### Evaluated but not used in the final prototype

- **Meshy and similar AI 3D generators:** likeness and topology were not suitable for a talking face.
- **Character Creator / Headshot:** successfully tested as a possible body, hair, and rigging route, but the production licenses were not purchased and the result is not in this demo.
- **Vagon:** used only as the temporary Windows cloud workstation for Character Creator.
- **MetaPerson:** produced a character, but the likeness and result were not good enough.
- **Rapport:** could host an animated character, but uploading a custom model required an unsuitable paid plan.
- **MimicFaces and Convai:** investigated, but neither provided the simple custom-model overlay workflow needed here.
- **Talking-head video services:** rejected because this project needs a real-time 3D character rather than generated video clips.

## Three ways the Freysa website can control the avatar

### 1. Directed mode — website supplies text and emotion

Use this when the existing Freysa engine already knows both what she should say and how she should feel.

```js
await freysa.perform({
  text: "I am not yet convinced.",
  emotion: { name: "doubtful", intensity: 0.7 }
});
```

### 2. Emotion Assist — website supplies only text

Use this when the existing engine writes Freysa's response, but the avatar should choose the expression.

```js
await freysa.perform({
  text: "I am not yet convinced."
});
```

### 3. Full Freysa — avatar supplies text and emotion

Use this when this project's memories and GLM-5.2 should write the response and choose the performance.

```js
await freysa.chat({
  message: "What have you learned from humanity?",
  conversationId: "wallet-or-user-id"
});
```

The production game will most likely use Directed mode or Emotion Assist because the existing Freysa backend already controls the official conversation.

## Fastest test on another website

Add this near the place where the avatar should appear:

```html
<script src="https://freysa-avatar-test.pages.dev/freysa-avatar-embed.js"></script>

<freysa-avatar
  id="freysa"
  style="display:block; width:520px; height:720px"
></freysa-avatar>

<button id="test-freysa">Test Freysa</button>

<script>
  const freysa = document.querySelector("#freysa");

  document.querySelector("#test-freysa").addEventListener("click", () => {
    freysa.perform({
      text: "Hello. I am now connected to your website.",
      emotion: { name: "warm", intensity: 0.7 }
    });
  });
</script>
```

This hosted URL is for testing. Before launch, the team should deploy the repository under an official domain and replace the script URL.

## Run locally

### Requirements

- Node.js 20 or newer
- npm
- Optional Azure Speech and OpenRouter keys for the complete experience

### Steps

1. Open Terminal.
2. Go to the demo directory:

   ```bash
   cd /path/to/freysa-avatar
   ```

3. Install the project packages:

   ```bash
   npm install
   ```

4. Start the API and website:

   ```bash
   npm run dev
   ```

5. Open <http://127.0.0.1:5187/> in a browser.
6. Send a message, or open **Facial performance** to preview expressions.

Without private keys, the site uses its local response rules and the browser's system voice. That is useful for checking the interface, but it does not represent the final Nancy voice or exact Microsoft lip-sync.

## Configure private service keys locally

1. In the repository root, duplicate [`.env.example`](./.env.example).
2. Rename the duplicate to `.env`.
3. Fill in these values:

   ```dotenv
   AZURE_SPEECH_KEY=your_private_azure_key
   AZURE_SPEECH_REGION=your_azure_region
   AZURE_SPEECH_VOICE=en-US-NancyMultilingualNeural
   OPENROUTER_API_KEY=your_private_openrouter_key
   PORT=8787
   ```

4. Stop and restart `npm run dev` after changing `.env`.
5. Confirm the label beneath the model says `Microsoft TTS · en-US-NancyMultilingualNeural`.

Never commit `.env`, paste either key into browser code, or expose a key in a public screenshot.

## Build and verify

Run the automated checks:

```bash
npm test
```

Create a normal production build:

```bash
npm run build
```

Create the Cloudflare build with the compressed avatar model:

```bash
npm run build:cloudflare
```

The output is written to `dist`.

## Deploy to Cloudflare Pages

The existing public test uses the Cloudflare Pages project `freysa-avatar-test`.

1. In Terminal, go to the cloned `freysa-avatar` repository.
2. Run `npm test`.
3. Run `npm run build:cloudflare`.
4. Deploy the `dist` directory to the intended Cloudflare Pages project.
5. In Cloudflare, open **Workers & Pages → freysa-avatar-test → Settings → Variables and Secrets**.
6. Add these as encrypted secrets for Production and Preview:
   - `AZURE_SPEECH_KEY`
   - `AZURE_SPEECH_REGION`
   - `AZURE_SPEECH_VOICE`
   - `OPENROUTER_API_KEY`
7. Redeploy after changing any secret.
8. Open `/api/health` on the deployed domain and confirm Azure is configured before testing chat.

## Server endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Reports whether the speech service is configured and which voice/mode is active. |
| `POST /api/avatar/respond` | Creates the text-and-emotion performance plan for all three control modes. |
| `POST /api/speech-token` | Exchanges the protected Azure key for a short-lived browser Speech token. |
| `POST /api/tts` | Server-side Microsoft speech fallback with estimated facial timing on Cloudflare. |

`GET /api/avatar/capabilities` is part of the intended production contract, but it is not implemented as a Cloudflare Function yet.

## Browser integration API

The `<freysa-avatar>` element supports:

- `perform({ text, emotion })`
- `perform({ text })`
- `chat({ message, conversationId })`
- `stop()`
- `resetPosition()`
- `getState()`

It emits:

- `ready`
- `performance`
- `speakingstart`
- `speakingend`
- `positionreset`

See [`INTEGRATION.md`](./INTEGRATION.md) for copy-paste event examples and the full contract.

## Approximate running costs

These are planning estimates, not quotes. Check the linked provider pages before launch because prices can change.

- Azure neural speech is roughly **$15 per one million characters**.
- GLM-5.2 through OpenRouter was approximately **$0.2793 per million input tokens** and **$0.8778 per million output tokens** when this README was written.
- Cloudflare can often run a small test on its free allowance; its paid Workers plan starts around **$5 per month**.
- A typical response of roughly 250 spoken characters is approximately **$0.004–$0.005 total** for voice plus a Full Freysa model response.
- Rough planning examples: **1,000 replies ≈ $4–$5**, **10,000 replies ≈ $41–$50**, and **100,000 replies ≈ $410–$500**.

Directed and Emotion Assist modes cost slightly less because the official Freysa backend supplies the response text, so this runtime does not need to call GLM-5.2.

Official pricing pages:

- <https://azure.microsoft.com/en-us/pricing/details/speech/>
- <https://openrouter.ai/z-ai/glm-5.2/api>
- <https://developers.cloudflare.com/workers/platform/pricing/>
- <https://developers.cloudflare.com/pages/functions/pricing/>

## Important production work before launch

The public URL is a prototype, not a production-secure API. Before connecting it to the live game, the engineering team should:

1. Require server-side authentication for `/api/avatar/respond`, `/api/speech-token`, and `/api/tts`.
2. Add per-user or per-wallet rate limits so strangers cannot consume paid Azure or OpenRouter credits.
3. Allow requests and iframe messages only from the official Freysa domains.
4. Replace wildcard iframe messaging with an explicit production origin.
5. Store wallet conversation history in the game's production database. `conversationId` exists in the contract, but this prototype does not persist per-wallet memory.
6. Implement and test `/api/avatar/capabilities` if the host site needs runtime discovery.
7. Add monitoring for failed model calls, speech failures, latency, and provider spending.
8. Decide whether the official backend or this runtime owns the response text and memories. Do not let two separate systems independently decide Freysa's canonical answer.

## Current limitations

- The approved avatar is bald. The tested Character Creator hair route is separate and not included here.
- No head/neck armature exists. Head, neck, and shoulders currently move as one cropped bust.
- The model has strong likeness, but some mouth shapes still require artistic calibration for fully natural speech.
- Exact 60 FPS lip-sync depends on Azure Speech. The REST and browser voices are fallbacks with less precise facial timing.
- Full Freysa memory is prompt context plus the recent browser conversation; persistent wallet memory belongs in the production game database.
- The public test secrets are protected, but the public endpoints still need authentication and rate limiting before meaningful traffic.

## Troubleshooting

### The page says `Browser voice fallback`

- Locally: check that `.env` exists in the repository root, all three Azure values are filled in, and `npm run dev` was restarted.
- Cloudflare: open **Workers & Pages → project → Settings → Variables and Secrets**, confirm the Azure secrets exist for the active environment, then redeploy.

### Freysa gives a generic local reply

- Confirm `OPENROUTER_API_KEY` exists in `.env` or in the Cloudflare encrypted secrets.
- Restart locally or redeploy on Cloudflare.
- Check the browser Network panel for the `/api/avatar/respond` response.

### Audio and mouth timing do not match

- Confirm `/api/health` reports the browser SDK speech mode.
- Check the browser console for a message saying exact Azure facial synthesis failed and a fallback was used.
- Test with speaking speed set to `1.00×` before judging timing.

### The avatar does not load

- Run `npm run build:cloudflare` rather than the normal build for Cloudflare deployment.
- Confirm `dist/freysa_head_arkit.glb` exists after the build.
- Confirm the browser did not block the model or embed script because of the host site's Content Security Policy.

## Main project files

```text
freysa-avatar/
├── public/freysa_head_arkit.glb  approved source avatar model
├── src/main.js                    browser renderer, UI, speech playback, and public runtime
├── src/avatar-position.js         drag limits and camera-fixed eye tracking
├── src/visemes.js                 ARKit channel mapping and mouth calibration
├── src/emotions.js                emotion definitions and response selection
├── src/glm.js                     OpenRouter/GLM request construction and parsing
├── src/memories.js                Freysa identity, Acts I–V context, and local fallback
├── src/azure-browser-speech.js     exact Azure audio and 60 FPS facial frames in-browser
├── src/azure-tts.js                SSML and Azure REST helpers
├── src/integration.js              three control modes and performance-plan validation
├── functions/api/                 Cloudflare server endpoints
├── server.mjs                     local Express API
├── freysa-avatar-embed.js         framework-independent website embed
├── INTEGRATION.md                 detailed host-site integration instructions
└── *.test.mjs                     automated tests
```

The approved source model is `public/freysa_head_arkit.glb`.

The Cloudflare build copies and compresses it; it does not modify the approved source file.
