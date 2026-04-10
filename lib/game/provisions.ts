import { GAME_LAWS, missingWordsForLevel, selectLawProvisions } from "@/lib/game/laws";
import { buildCloze, buildClozeWithFallback, extractDisplayText, shuffle } from "@/lib/game/text";
import type { ClozeQuestion, LawId, ProvisionRecord, TrackAvailabilityStatus } from "@/lib/game/types";

export type LawAvailability = {
  id: LawId;
  nameTh: string;
  nameEn: string;
  available: boolean;
  provisionCount: number;
  status: TrackAvailabilityStatus;
  statusLabel: string;
  statusMessage: string;
  ctaLabel: string;
  canStart: boolean;
};

let provisionsCache: ProvisionRecord[] | null = null;

export async function loadProvisions(): Promise<ProvisionRecord[]> {
  if (provisionsCache) return provisionsCache;
  const res = await fetch("/data/thai_niti_deduped.json");
  if (!res.ok) throw new Error(`ไม่สามารถโหลดข้อมูลบทบัญญัติได้ (${res.status})`);
  const parsed = (await res.json()) as Array<Record<string, unknown>>;
  provisionsCache = parsed.map((row, idx) => ({
    id: `${row.law_title || "unknown"}-${row.section || "na"}-${idx}`,
    law_title: String(row.law_title || ""),
    section: String(row.section || ""),
    context_text: String(row.context_text || ""),
    split: String(row.split || ""),
  }));
  return provisionsCache;
}

function statusFromProvisionCount(count: number): TrackAvailabilityStatus {
  if (count <= 0) return "coming_soon";
  if (count <= 24) return "starter_pack";
  if (count <= 99) return "early_access";
  return "full";
}

function statusMeta(status: TrackAvailabilityStatus) {
  if (status === "coming_soon") {
    return {
      statusLabel: "เร็ว ๆ นี้",
      statusMessage: "แทร็กนี้ตั้งค่าไว้แล้วและกำลังเติมบทบัญญัติ",
      ctaLabel: "ขอแทร็กนี้",
      canStart: false,
    };
  }
  if (status === "starter_pack") {
    return {
      statusLabel: "แพ็กเริ่มต้น",
      statusMessage: "เริ่มฝึกบทบัญญัติแกนหลักระหว่างรอเนื้อหาฉบับเต็ม",
      ctaLabel: "เริ่มแพ็กเริ่มต้น",
      canStart: true,
    };
  }
  if (status === "early_access") {
    return {
      statusLabel: "เข้าถึงก่อน",
      statusMessage: "กำลังเพิ่มความครอบคลุม เริ่มฝึกจากบทบัญญัติที่มีได้เลย",
      ctaLabel: "เริ่มฝึก",
      canStart: true,
    };
  }
  return {
    statusLabel: "พร้อมเต็มแทร็ก",
    statusMessage: "มีความครอบคลุมครบสำหรับฝึกแบบเต็มรอบ",
    ctaLabel: "เข้าแทร็ก",
    canStart: true,
  };
}

export async function computeLawAvailabilities(): Promise<LawAvailability[]> {
  const records = await loadProvisions();
  return GAME_LAWS.map((law) => {
    const count = selectLawProvisions(records, law.id).length;
    const status = statusFromProvisionCount(count);
    const meta = statusMeta(status);
    return {
      id: law.id,
      nameTh: law.nameTh,
      nameEn: law.nameEn,
      available: status === "full",
      provisionCount: count,
      status,
      statusLabel: meta.statusLabel,
      statusMessage: meta.statusMessage,
      ctaLabel: meta.ctaLabel,
      canStart: meta.canStart,
    };
  });
}

type BuildSummary = {
  totalAttempts: number;
  skippedProvisions: number;
  tierSuccess: Record<string, number>;
  failureSamples: Array<{
    provisionId: string;
    section: string;
    targetBlanks: number;
    reason: string;
  }>;
};

function buildRunQuestions(selected: ProvisionRecord[], lawId: LawId): { questions: ClozeQuestion[]; summary: BuildSummary } {
  const picked = shuffle(selected);
  const questions: ClozeQuestion[] = [];
  const summary: BuildSummary = {
    totalAttempts: 0,
    skippedProvisions: 0,
    tierSuccess: {},
    failureSamples: [],
  };
  const usedProvisionIds = new Set<string>();
  const maxAttempts = Math.min(5000, Math.max(400, picked.length * 3));

  for (let i = 0; i < maxAttempts && questions.length < 100; i += 1) {
    const provision = picked[i % picked.length];
    if (usedProvisionIds.has(provision.id)) continue;

    summary.totalAttempts += 1;
    const questionIndex = questions.length;
    const level = Math.floor(questionIndex / 10) + 1;
    const questionInLevel = (questionIndex % 10) + 1;
    const missing = missingWordsForLevel(level);
    const baseText = extractDisplayText(provision.context_text);
    const cloze = buildClozeWithFallback(baseText, missing);
    if (!cloze) {
      summary.skippedProvisions += 1;
      if (summary.failureSamples.length < 25) {
        summary.failureSamples.push({
          provisionId: provision.id,
          section: provision.section,
          targetBlanks: missing,
          reason: "all_fallback_tiers_failed",
        });
      }
      continue;
    }
    if (cloze.blanks.length < missing) {
      summary.skippedProvisions += 1;
      if (summary.failureSamples.length < 25) {
        summary.failureSamples.push({
          provisionId: provision.id,
          section: provision.section,
          targetBlanks: missing,
          reason: "fallback_returned_insufficient_blanks",
        });
      }
      continue;
    }

    usedProvisionIds.add(provision.id);
    summary.tierSuccess[cloze.tier] = (summary.tierSuccess[cloze.tier] || 0) + 1;
    questions.push({
      id: `${provision.id}-q${questionIndex + 1}`,
      lawId,
      lawTitle: provision.law_title,
      section: provision.section,
      originalText: baseText,
      promptText: cloze.promptText,
      blanks: cloze.blanks,
      level,
      questionInLevel,
      isBonus: false,
    });
  }
  return { questions, summary };
}

function buildBonusFromQuestions(questions: ClozeQuestion[]): ClozeQuestion | null {
  const source = questions.find((q) => q.blanks.length >= 1);
  if (!source) return null;
  const easier = buildCloze(source.originalText, Math.min(2, source.blanks.length));
  if (!easier) return null;
  return {
    ...source,
    id: `${source.id}-bonus`,
    promptText: easier.promptText,
    blanks: easier.blanks,
    isBonus: true,
  };
}

export type StartRunResult =
  | { ok: true; questions: ClozeQuestion[]; bonus: ClozeQuestion | null }
  | { ok: false; error: string; errorCode?: string };

const MAX_SEARCH_RESULTS = 50;
const MAX_QUERY_LENGTH = 200;

export type ProvisionSearchResult = {
  section: string;
  lawTitle: string;
  text: string;
};

export async function searchProvisions(query: string, lawId?: LawId): Promise<ProvisionSearchResult[]> {
  const records = await loadProvisions();
  const pool = lawId ? selectLawProvisions(records, lawId) : records;
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  const terms = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return [];
  const matched = pool.filter((r) => {
    const haystack = `${r.law_title} ${r.section} ${r.context_text}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  return matched.slice(0, MAX_SEARCH_RESULTS).map((r) => ({
    section: r.section,
    lawTitle: r.law_title,
    text: extractDisplayText(r.context_text),
  }));
}

export async function startRun(lawId: LawId): Promise<StartRunResult> {
  const records = await loadProvisions();
  const selected = selectLawProvisions(records, lawId);
  if (selected.length < 100) {
    return {
      ok: false,
      error: "จำนวนบทบัญญัติของกฎหมายนี้ในชุดข้อมูลปัจจุบันยังไม่เพียงพอ",
      errorCode: "insufficient_provisions",
    };
  }

  const { questions, summary } = buildRunQuestions(selected, lawId);
  if (questions.length < 100) {
    console.warn("[provisions] cloze generation incomplete", {
      lawId,
      generated: questions.length,
      required: 100,
      totalAttempts: summary.totalAttempts,
      skippedProvisions: summary.skippedProvisions,
      tierSuccess: summary.tierSuccess,
    });
    return {
      ok: false,
      error:
        questions.length > 0
          ? `สร้างการ์ดได้ ${questions.length}/100 ภายใต้เงื่อนไขคุณภาพปัจจุบัน กรุณาลองเริ่มรอบฝึกใหม่อีกครั้ง`
          : "ไม่สามารถสร้างคำถามแบบ cloze ที่มีคุณภาพเพียงพอได้หลังจากลองสำรองหลายรอบ",
      errorCode: "question_generation_failed",
    };
  }

  const bonus = buildBonusFromQuestions(questions);
  return { ok: true, questions, bonus };
}
