const THAI_WORD_RE = /[\u0E00-\u0E7Fa-zA-Z0-9]+/g;

const WORD_MIN = 3;
const WORD_MAX = 16;
const PHRASE_MIN = 6;
const PHRASE_MAX = 22;

const STOPWORDS = new Set([
  "และ",
  "หรือ",
  "ให้",
  "มี",
  "เป็น",
  "ได้",
  "ตาม",
  "ใน",
  "แห่ง",
  "ของ",
  "โดย",
  "จาก",
  "การ",
  "เพื่อ",
  "ว่า",
  "ซึ่ง",
  "เมื่อ",
  "ต้อง",
  "ห้าม",
  "มาตรา",
  "วรรค",
  "บัญญัติ",
  "พระราชบัญญัติ",
  "ประมวลกฎหมาย",
  "นี้",
  "นั้น",
  "ดังกล่าว",
  "อัน",
  "แก่",
  "กับ",
  "แต่",
  "ก็",
  "จึง",
  "อีก",
  "หนึ่ง",
  "ใด",
  "ผู้ใด",
]);

const CONNECTOR_BLACKLIST = new Set([
  "แต่กระนั้นก็ดี",
  "ก็ให้",
  "ท่านว่า",
  "และ",
  "หรือ",
  "ซึ่ง",
  "อัน",
  "เมื่อ",
  "ถ้า",
]);

const CONNECTOR_SUBSTRINGS = ["แต่กระนั้น", "ก็ให้", "ท่านว่า", "ตามบทบัญญัติมาตรา", "แห่งประมวลกฎหมายนี้"];

const LEGAL_CORE_TERMS = [
  "นิติบุคคล",
  "นิติกรรม",
  "นิติกรรมสัญญา",
  "สัญญา",
  "ค่าสินไหมทดแทน",
  "ละเมิด",
  "หนี้",
  "ชำระหนี้",
  "ผิดสัญญา",
  "เพิกถอน",
  "บอกเลิกสัญญา",
  "มรดก",
  "ผู้จัดการมรดก",
  "พินัยกรรม",
  "ทรัพย์สิน",
  "กรรมสิทธิ์",
  "ครอบครอง",
  "จดทะเบียน",
  "สมรส",
  "หย่า",
  "ผู้เยาว์",
  "คำฟ้อง",
  "คำให้การ",
  "พยานหลักฐาน",
  "คำพิพากษา",
  "บังคับคดี",
  "อายุความ",
  "เจ้าพนักงาน",
  "พนักงานอัยการ",
];

const LEGAL_PHRASE_DICTIONARY = [
  "ผู้จัดการมรดก",
  "ค่าสินไหมทดแทน",
  "เลิกสัญญา",
  "บอกเลิกสัญญา",
  "ผิดสัญญา",
  "ชำระหนี้",
  "คำพิพากษา",
  "คำฟ้อง",
  "คำให้การ",
  "พยานหลักฐาน",
  "อายุความ",
  "นิติบุคคล",
  "โดยสุจริต",
  "โดยทุจริต",
  "บังคับคดี",
  "จดทะเบียนสมรส",
  "จดทะเบียนหย่า",
  "ความรับผิด",
  "กรรมสิทธิ์",
  "การครอบครอง",
];

const LEGAL_VERB_HINTS = ["ฟ้อง", "ยื่น", "พิพากษา", "บังคับ", "จดทะเบียน", "เพิกถอน", "ชำระ", "โอน", "ครอบครอง"];
const LEGAL_SUFFIX_HINTS = ["สิทธิ", "หน้าที่", "ความผิด", "ความรับผิด", "ทดแทน", "นิติบุคคล", "พยาน", "สัญญา"];

type Candidate = {
  value: string;
  start: number;
  end: number;
  score: number;
  kind: "phrase" | "word";
};

type CandidatePolicy = {
  wordMin: number;
  wordMax: number;
  phraseMin: number;
  phraseMax: number;
  allowPhrase: boolean;
  dictionaryOnly: boolean;
};

export type ClozeTier = "strict" | "relaxed_bounds" | "relaxed_phrase" | "legal_heads_only";

export type ClozeBuildResult = {
  promptText: string;
  blanks: string[];
  tier: ClozeTier;
  diagnostics: Array<{
    tier: ClozeTier;
    requiredBlanks: number;
    candidateCount: number;
    selectedCount: number;
    reason: string;
  }>;
};

export function normalizeAnswerToken(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/[“”"'.(),:;!?[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

export function extractDisplayText(contextText: string): string {
  const text = (contextText || "").trim();
  const marker = text.match(/มาตรา\s*\d+\/?\d*/);
  if (!marker || marker.index === undefined) return text;
  return text.slice(marker.index).trim();
}

function collectCandidateWords(text: string): string[] {
  const matched = text.match(THAI_WORD_RE) ?? [];
  const deduped = new Set<string>();
  for (const rawWord of matched) {
    const word = rawWord.trim();
    if (!word) continue;
    if (word.length < 3) continue;
    if (STOPWORDS.has(word)) continue;
    if (/^\d+$/.test(word)) continue;
    deduped.add(word);
  }
  return [...deduped];
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFillerLike(token: string): boolean {
  const normalized = normalizeAnswerToken(token);
  if (!normalized) return true;
  if (CONNECTOR_BLACKLIST.has(normalized)) return true;
  if (STOPWORDS.has(normalized)) return true;
  return CONNECTOR_SUBSTRINGS.some((part) => normalized.includes(part));
}

function inWordLengthRange(token: string, policy: CandidatePolicy): boolean {
  return token.length >= policy.wordMin && token.length <= policy.wordMax;
}

function inPhraseLengthRange(token: string, policy: CandidatePolicy): boolean {
  return token.length >= policy.phraseMin && token.length <= policy.phraseMax;
}

function scoreToken(token: string, start: number, end: number, textLength: number): number {
  let score = 0;
  if (token.length >= 5) score += 1.5;
  if (token.length >= 8) score += 1;
  if (LEGAL_CORE_TERMS.some((term) => token.includes(term))) score += 7;
  if (LEGAL_VERB_HINTS.some((verb) => token.includes(verb))) score += 3;
  if (LEGAL_SUFFIX_HINTS.some((suffix) => token.includes(suffix))) score += 2;
  if (/^\d+$/.test(token)) score -= 100;
  if (STOPWORDS.has(token)) score -= 100;

  // Position-aware preference: mid-sentence terms usually read more naturally.
  const center = (start + end) / 2;
  const ratio = textLength > 0 ? center / textLength : 0.5;
  const centerDistance = Math.abs(ratio - 0.5);
  score += Math.max(0, 1.5 - centerDistance * 3);

  return score;
}

function pushCandidate(
  candidates: Candidate[],
  seen: Set<string>,
  value: string,
  start: number,
  end: number,
  kind: "phrase" | "word",
  textLength: number,
  policy: CandidatePolicy,
) {
  const normalized = normalizeAnswerToken(value);
  if (!normalized) return;
  const key = `${kind}:${normalized}:${start}:${end}`;
  if (seen.has(key)) return;
  if (isFillerLike(value)) return;
  if (kind === "word" && !inWordLengthRange(value, policy)) return;
  if (kind === "phrase" && !inPhraseLengthRange(value, policy)) return;

  const base = scoreToken(value, start, end, textLength);
  const score = kind === "phrase" ? base + 4 : base;
  candidates.push({ value, start, end, score, kind });
  seen.add(key);
}

function extractLegalHeadTermsFromSpan(
  raw: string,
  spanStart: number,
  candidates: Candidate[],
  seen: Set<string>,
  textLength: number,
  policy: CandidatePolicy,
) {
  // When tokenization yields an overly long Thai span, prefer compact legal heads.
  const sortedTerms = [...LEGAL_CORE_TERMS, ...LEGAL_PHRASE_DICTIONARY].sort((a, b) => b.length - a.length);
  for (const term of sortedTerms) {
    if (!term || term.length < WORD_MIN) continue;
    if (!raw.includes(term)) continue;
    let from = 0;
    while (from < raw.length) {
      const idx = raw.indexOf(term, from);
      if (idx < 0) break;
      const start = spanStart + idx;
      const end = start + term.length;
      const kind: "phrase" | "word" = term.length >= policy.phraseMin ? "phrase" : "word";
      pushCandidate(candidates, seen, term, start, end, kind, textLength, policy);
      from = idx + term.length;
    }
  }
}

function collectFromDictionary(
  text: string,
  dictionary: string[],
  kind: "phrase" | "word",
  candidates: Candidate[],
  seen: Set<string>,
  textLength: number,
  policy: CandidatePolicy,
) {
  for (const term of dictionary) {
    if (!term) continue;
    const re = new RegExp(escapeRegex(term), "g");
    for (const match of text.matchAll(re)) {
      const start = match.index ?? -1;
      if (start < 0) continue;
      pushCandidate(candidates, seen, term, start, start + term.length, kind, textLength, policy);
    }
  }
}

function collectCandidateUnits(text: string, missingCount: number, policy: CandidatePolicy): Candidate[] {
  const candidates: Candidate[] = [];
  const textLength = text.length;
  const seen = new Set<string>();

  const allowPhrase = policy.allowPhrase;

  // Always seed short legal heads first so we avoid clause-like blanks.
  collectFromDictionary(text, LEGAL_CORE_TERMS, "word", candidates, seen, textLength, policy);
  if (allowPhrase) {
    collectFromDictionary(text, LEGAL_PHRASE_DICTIONARY, "phrase", candidates, seen, textLength, policy);
  }

  if (policy.dictionaryOnly) {
    return candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  }

  for (const match of text.matchAll(THAI_WORD_RE)) {
    const raw = (match[0] || "").trim();
    const start = match.index ?? -1;
    if (!raw || start < 0) continue;
    const end = start + raw.length;
    if (/^\d+$/.test(raw)) continue;
    if (raw.length > policy.wordMax) {
      extractLegalHeadTermsFromSpan(raw, start, candidates, seen, textLength, policy);
      continue;
    }
    pushCandidate(candidates, seen, raw, start, end, "word", textLength, policy);
  }

  return candidates.sort((a, b) => b.score - a.score || a.start - b.start);
}

function overlaps(a: Candidate, b: Candidate): boolean {
  return a.start < b.end && b.start < a.end;
}

function chooseNonOverlapping(candidates: Candidate[], limit: number): Candidate[] {
  const chosen: Candidate[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (chosen.some((picked) => overlaps(picked, candidate))) continue;
    chosen.push(candidate);
  }
  return chosen;
}

function createPolicy(tier: ClozeTier, missingCount: number): CandidatePolicy {
  if (tier === "strict") {
    return {
      wordMin: WORD_MIN,
      wordMax: WORD_MAX,
      phraseMin: PHRASE_MIN,
      phraseMax: PHRASE_MAX,
      allowPhrase: missingCount >= 4,
      dictionaryOnly: false,
    };
  }
  if (tier === "relaxed_bounds") {
    return {
      wordMin: 2,
      wordMax: 18,
      phraseMin: 5,
      phraseMax: 24,
      allowPhrase: missingCount >= 4,
      dictionaryOnly: false,
    };
  }
  if (tier === "relaxed_phrase") {
    return {
      wordMin: 2,
      wordMax: 18,
      phraseMin: 5,
      phraseMax: 24,
      allowPhrase: missingCount >= 3,
      dictionaryOnly: false,
    };
  }
  return {
    wordMin: 2,
    wordMax: 18,
    phraseMin: 5,
    phraseMax: 24,
    allowPhrase: false,
    dictionaryOnly: true,
  };
}

export function buildClozeWithFallback(text: string, missingCount: number): ClozeBuildResult | null {
  const limit = Math.max(1, missingCount);
  const tiers: ClozeTier[] = ["strict", "relaxed_bounds", "relaxed_phrase", "legal_heads_only"];
  const diagnostics: ClozeBuildResult["diagnostics"] = [];

  for (const tier of tiers) {
    const policy = createPolicy(tier, limit);
    const scored = collectCandidateUnits(text, limit, policy);
    const chosen = chooseNonOverlapping(scored, limit);
    const selectedCount = chosen.length;
    const reason = selectedCount >= limit ? "ok" : "insufficient_safe_candidates";
    diagnostics.push({
      tier,
      requiredBlanks: limit,
      candidateCount: scored.length,
      selectedCount,
      reason,
    });
    if (selectedCount < limit) continue;

    // Replace from right to left to preserve index stability.
    const byPosition = [...chosen].sort((a, b) => b.start - a.start);
    let prompt = text;
    const labels = [...chosen].sort((a, b) => a.start - b.start);

    byPosition.forEach((candidate) => {
      const label = labels.findIndex((x) => x.start === candidate.start && x.end === candidate.end) + 1;
      prompt = `${prompt.slice(0, candidate.start)}____(${label})____${prompt.slice(candidate.end)}`;
    });

    return { promptText: prompt, blanks: labels.map((c) => c.value), tier, diagnostics };
  }

  const fallback = collectCandidateWords(text)
    .filter((word) => !isFillerLike(word))
    .filter((word) => inWordLengthRange(word, createPolicy("relaxed_bounds", limit)))
    .filter((word) => LEGAL_CORE_TERMS.some((term) => word.includes(term) || term.includes(word)));
  diagnostics.push({
    tier: "legal_heads_only",
    requiredBlanks: limit,
    candidateCount: fallback.length,
    selectedCount: Math.min(limit, fallback.length),
    reason: fallback.length >= limit ? "fallback_legal_word_list" : "fallback_failed",
  });
  if (fallback.length >= limit) {
    const chosen = fallback.slice(0, limit);
    let prompt = text;
    chosen.forEach((word, idx) => {
      prompt = prompt.replace(new RegExp(escapeRegex(word)), `____(${idx + 1})____`);
    });
    return { promptText: prompt, blanks: chosen, tier: "legal_heads_only", diagnostics };
  }
  return null;
}

export function buildCloze(text: string, missingCount: number): { promptText: string; blanks: string[] } | null {
  const built = buildClozeWithFallback(text, missingCount);
  if (!built) return null;
  return { promptText: built.promptText, blanks: built.blanks };
}

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
