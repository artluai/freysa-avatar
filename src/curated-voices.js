export const CURATED_ELEVENLABS_VOICES = Object.freeze([
  voice("matilda", "Matilda", ["knowledgeable", "professional", "alto"]),
  voice("sarah", "Sarah", ["mature", "reassuring", "confident"]),
  voice("bella", "Bella", ["professional", "bright", "warm"]),
  voice("hope", "Hope", ["professional", "clear", "natural"]),
  voice("juniper", "Juniper", ["grounded", "professional", "conversational"]),
  voice("jessica-anne-bogart", "Jessica Anne Bogart", ["confident", "conversational"]),
  voice("cassidy", "Cassidy", ["crisp", "podcaster", "contemporary"]),
  voice("lavenderlessons", "LavenderLessons", ["calm", "museum", "thoughtful"]),
  voice("brittney", "Brittney", ["relaxing", "calm", "meditative"]),
  voice("nayva", "Nayva", ["deep", "intense", "warm"]),
  voice("piper", "Piper", ["positive", "wise", "direct"]),
  voice("eva", "Eva - Futuristic Robot Helper", ["futuristic", "robot", "helper"])
]);

export function curateElevenLabsVoices(voices) {
  const available = Array.isArray(voices) ? voices : [];
  return CURATED_ELEVENLABS_VOICES.flatMap((definition) => {
    const match = bestVoiceMatch(available, definition);
    return match ? [{ ...match, curatedKey: definition.key }] : [];
  });
}

export function findMissingCuratedVoices(voices) {
  const availableKeys = new Set(curateElevenLabsVoices(voices).map((voice) => voice.curatedKey));
  return CURATED_ELEVENLABS_VOICES.filter((definition) => !availableKeys.has(definition.key));
}

export function selectSharedVoice(payload, definition) {
  const voices = Array.isArray(payload?.voices) ? payload.voices : [];
  const ranked = voices
    .map((candidate) => ({ candidate, score: voiceMatchScore(candidate, definition) }))
    .filter(({ score }) => score >= 55)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.candidate || null;
}

function bestVoiceMatch(voices, definition) {
  const ranked = voices
    .map((candidate) => ({ candidate, score: voiceMatchScore(candidate, definition) }))
    .filter(({ score }) => score >= 45)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.candidate || null;
}

function voiceMatchScore(candidate, definition) {
  const name = normalize(candidate?.name);
  const target = normalize(definition.search);
  if (!name || !target) return 0;

  let score = 0;
  if (name === target) score += 80;
  else if (name.startsWith(`${target} `)) score += 70;
  else if (name.includes(target)) score += 45;
  else return 0;

  const gender = normalize(candidate?.gender || candidate?.labels?.gender);
  const accent = normalize(candidate?.accent || candidate?.labels?.accent);
  const searchable = normalize([
    candidate?.name,
    candidate?.description,
    candidate?.descriptive,
    candidate?.use_case,
    candidate?.labels?.description
  ].filter(Boolean).join(" "));
  if (gender === "female") score += 12;
  if (accent === "american") score += 8;
  for (const keyword of definition.keywords) {
    if (searchable.includes(normalize(keyword))) score += 3;
  }
  return score;
}

function voice(key, search, keywords) {
  return Object.freeze({ key, search, keywords: Object.freeze(keywords) });
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
