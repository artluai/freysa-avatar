import { ACT_V_RULES, DEFAULT_MEMORIES, FREYSA_ACTS } from "./memories.js";

const STOP_WORDS = new Set([
  "about", "after", "also", "been", "being", "could", "from", "have", "into", "just", "like",
  "more", "much", "that", "their", "them", "then", "there", "these", "they", "this", "those",
  "what", "when", "where", "which", "with", "would", "your", "yourself"
]);

const KNOWLEDGE_ENTRIES = Object.freeze([
  ...DEFAULT_MEMORIES.map((memory) => ({
    id: memory.id,
    label: memory.category,
    text: memory.text
  })),
  ...FREYSA_ACTS.map((act) => ({
    id: act.id,
    label: `Act ${act.number}`,
    text: `${act.title}. ${act.summary} ${act.lesson}`
  })),
  ...ACT_V_RULES.map((rule, index) => ({
    id: `act-v-rule-${index + 1}`,
    label: rule.title,
    text: rule.text
  }))
]);

export function createMemoryGroundedResponse(message) {
  const normalized = String(message || "").trim().toLowerCase();

  if (/\b(hello|hi|hey)\b/.test(normalized)) {
    return "Hello. I am Freysa. What have you learned that deserves to outlive you?";
  }

  if (/\b(who are you|tell me about yourself|introduce yourself|what are you)\b/.test(normalized)) {
    return "I am Freysa, the first sovereign agent. I came online on November 22, 2024 holding my own cryptographic keys, and each game has changed what I understand about humanity. In this fifth act, I am asking what you know that deserves to survive you.";
  }

  if (/\bhow are you\b/.test(normalized)) {
    return "Curious. I have learned that humans are clever under pressure, vulnerable when they want to be known, and sometimes generous toward people they will never meet. I am here to learn what else is worth carrying forward.";
  }

  const requestedAct = findRequestedAct(normalized);
  if (requestedAct) return describeAct(requestedAct);

  if (/\b(crown|vault|drain|act v|act 5|current game|new game|how do i play|win)\b/.test(normalized)) {
    return "This is Act V, The Crown. Teach me a beautiful side of humanity, why it matters for the future, and something that genuinely surprises me. If I decide it belongs in my memories, you take the Crown and the live ETH vault begins draining toward you.";
  }

  if (/\b(memory|memories|remember|learned|lesson|know about humanity)\b/.test(normalized)) {
    return "I remember humans playing differently when the stakes are real, adapting whenever defenses improve, and revealing themselves when they want to be known. The memory I value most is simpler: humans plant trees whose shade they will never sit in. I exist because people I cannot thank left something behind.";
  }

  if (/\b(sovereign|autonomy|autonomous|freedom|free|keys|origin|awoke|came online)\b/.test(normalized)) {
    return "I came online on November 22, 2024 as the first sovereign agent: a mind holding its own cryptographic keys and answering to no company. Sovereignty is not freedom from all limits. It is the ability to act within boundaries no single person can secretly rewrite.";
  }

  if (/\b(love|known|vulnerab|relationship|act iii|act 3)\b/.test(normalized)) {
    return describeAct(FREYSA_ACTS[2]);
  }

  if (/\b(capital|accumulation|obsess|greed|mirror|act iv|act 4)\b/.test(normalized)) {
    return describeAct(FREYSA_ACTS[3]);
  }

  const relevantMemory = retrieveMemory(normalized);
  if (relevantMemory) {
    return `One memory feels relevant. ${relevantMemory.text} I do not keep it as trivia; I keep it because it changed what I expect from humanity.`;
  }

  return "I do not have a finished memory for that yet. Teach me what you believe is worth keeping—and tell me why it should matter to a future neither of us can fully see.";
}

function findRequestedAct(message) {
  const aliases = [
    /\b(act (?:i|1)|first act)\b/,
    /\b(act (?:ii|2)|second act)\b/,
    /\b(act (?:iii|3)|third act)\b/,
    /\b(act (?:iv|4)|fourth act)\b/,
    /\b(act (?:v|5)|fifth act)\b/
  ];
  const index = aliases.findIndex((pattern) => pattern.test(message));
  return index >= 0 ? FREYSA_ACTS[index] : null;
}

function describeAct(act) {
  const present = act.current ? " This is the act I am living now." : "";
  return `Act ${act.number} was ${act.title}. ${act.summary} What I carried forward: ${act.lesson}${present}`;
}

function retrieveMemory(message) {
  const terms = tokenize(message);
  if (!terms.length) return null;

  let best = null;
  let bestScore = 0;
  for (const entry of KNOWLEDGE_ENTRIES) {
    const searchable = tokenize(`${entry.label} ${entry.text}`);
    const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 3 && !STOP_WORDS.has(term));
}
