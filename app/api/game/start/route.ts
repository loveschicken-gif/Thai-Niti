import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { missingWordsForLevel, selectLawProvisions } from "@/lib/game/laws";
import { buildCloze, buildClozeWithFallback, extractDisplayText, shuffle } from "@/lib/game/text";
import type { ClozeQuestion, LawId, ProvisionRecord } from "@/lib/game/types";

type StartBody = { lawId?: LawId };

let cache: ProvisionRecord[] | null = null;

async function loadProvisions(): Promise<ProvisionRecord[]> {
  if (cache) return cache;
  const dataPath = path.join(process.cwd(), "data", "processed", "thai_niti_deduped.json");
  const raw = await readFile(dataPath, "utf-8");
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
  cache = parsed.map((row, idx) => ({
    id: `${row.law_title || "unknown"}-${row.section || "na"}-${idx}`,
    law_title: String(row.law_title || ""),
    section: String(row.section || ""),
    context_text: String(row.context_text || ""),
    split: String(row.split || ""),
  }));
  return cache;
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StartBody;
    const lawId = body.lawId;
    if (!lawId) {
      return NextResponse.json({ error: "จำเป็นต้องระบุ lawId" }, { status: 400 });
    }

    const records = await loadProvisions();
    const selected = selectLawProvisions(records, lawId);
    if (selected.length < 100) {
      return NextResponse.json(
        {
          error: "insufficient_provisions",
          message: "จำนวนบทบัญญัติของกฎหมายนี้ในชุดข้อมูลปัจจุบันยังไม่เพียงพอ",
          available: selected.length,
        },
        { status: 400 },
      );
    }

    const { questions, summary } = buildRunQuestions(selected, lawId);
    if (questions.length < 100) {
      console.warn("[game/start] cloze generation incomplete", {
        lawId,
        generated: questions.length,
        required: 100,
        totalAttempts: summary.totalAttempts,
        skippedProvisions: summary.skippedProvisions,
        tierSuccess: summary.tierSuccess,
        failures: summary.failureSamples,
      });
      return NextResponse.json(
        {
          error: "question_generation_failed",
          message:
            questions.length > 0
              ? `สร้างการ์ดได้ ${questions.length}/100 ภายใต้เงื่อนไขคุณภาพปัจจุบัน กรุณาลองเริ่มรอบฝึกใหม่อีกครั้ง`
              : "ไม่สามารถสร้างคำถามแบบ cloze ที่มีคุณภาพเพียงพอได้หลังจากลองสำรองหลายรอบ",
          generated: questions.length,
          required: 100,
          debug: {
            totalAttempts: summary.totalAttempts,
            skippedProvisions: summary.skippedProvisions,
            tierSuccess: summary.tierSuccess,
            failures: summary.failureSamples,
          },
        },
        { status: 500 },
      );
    }

    const bonus = buildBonusFromQuestions(questions);
    console.info("[game/start] cloze generation summary", {
      lawId,
      generated: questions.length,
      totalAttempts: summary.totalAttempts,
      skippedProvisions: summary.skippedProvisions,
      tierSuccess: summary.tierSuccess,
    });
    return NextResponse.json({ questions, bonus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์ที่ไม่ทราบสาเหตุ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
