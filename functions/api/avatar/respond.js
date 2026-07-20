import { createPerformancePlan, INTEGRATION_MODES } from "../../../src/integration.js";
import { selectResponseEmotion } from "../../../src/emotions.js";
import { DEFAULT_GLM_MODEL, generateFreysaReply } from "../../../src/glm.js";

export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json();
    const plan = createPerformancePlan(payload);

    if (plan.mode !== INTEGRATION_MODES.FULL_FREYSA) {
      return json(plan);
    }

    if (!env.OPENROUTER_API_KEY) {
      return json({ error: "OpenRouter GLM-5.2 is not configured.", code: "MODEL_NOT_CONFIGURED" }, 503);
    }

    const text = await generateFreysaReply({
      apiKey: env.OPENROUTER_API_KEY,
      message: payload.message,
      history: payload.history
    });

    return json({
      ...plan,
      text,
      emotion: selectResponseEmotion(payload.message, text),
      model: DEFAULT_GLM_MODEL
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
      code: error?.code || "MODEL_REQUEST_FAILED"
    }, error?.code ? 400 : 502);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
