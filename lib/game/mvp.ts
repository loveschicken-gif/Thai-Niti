import type { CompletionSummary, LawId, MistakeHistoryItem, RunSnapshot } from "@/lib/game/types";

export function computeAccuracy(correct: number, wrong: number): number {
  const total = correct + wrong;
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

export function computeCurrentLevel(run: RunSnapshot | null): number {
  if (!run) return 1;
  return run.level;
}

export function computeStreak(completions: CompletionSummary[]): number {
  if (completions.length === 0) return 0;
  const sorted = [...completions].sort((a, b) => +new Date(b.completedAt) - +new Date(a.completedAt));
  let streak = 0;
  let cursor = startOfDay(new Date());
  for (const item of sorted) {
    const day = startOfDay(new Date(item.completedAt));
    const delta = Math.floor((cursor.getTime() - day.getTime()) / 86400000);
    if (delta === 0 || (streak > 0 && delta === 1)) {
      streak += 1;
      cursor = day;
      continue;
    }
    if (delta > 1) break;
  }
  return streak;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function lawMastery(completions: CompletionSummary[], lawId: LawId): number {
  const byLaw = completions.filter((item) => item.lawId === lawId);
  if (byLaw.length === 0) return 0;
  const totalCorrect = byLaw.reduce((sum, item) => sum + item.correctCount, 0);
  const totalAttempts = byLaw.reduce((sum, item) => sum + item.correctCount + item.wrongCount, 0);
  if (totalAttempts === 0) return 0;
  return Math.round((totalCorrect / totalAttempts) * 100);
}

export function formatStudyTime(startedAt?: string, endedAt?: string): string {
  if (!startedAt || !endedAt) return "0m";
  const ms = Math.max(0, +new Date(endedAt) - +new Date(startedAt));
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `${minutes}m`;
}

export function calcXp(summary: CompletionSummary): number {
  const accuracy = computeAccuracy(summary.correctCount, summary.wrongCount);
  const base = summary.correctCount * 5;
  const bonus = Math.round(accuracy * 1.5);
  return base + bonus;
}

export function nextMilestoneProgress(level: number, goal: number): { current: number; goal: number; pct: number } {
  const current = Math.max(0, level);
  const pct = Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
  return { current, goal, pct };
}

export function formatMistakeDateTime(input: string): { day: string; time: string } {
  const date = new Date(input);
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const dayDelta = Math.floor((today.getTime() - target.getTime()) / 86400000);
  let day = target.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (dayDelta === 0) day = "วันนี้";
  if (dayDelta === 1) day = "เมื่อวาน";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { day, time };
}

export type MistakeTableRow = {
  section: string;
  lawName: string;
  lawId: LawId;
  mistakeCount: number;
  lastSeenAt: string;
  reviewPriority: "High" | "Medium" | "Low";
};

export type MistakeAnalyticsRow = MistakeTableRow & {
  mistakes24h: number;
  mistakes7d: number;
  mistakes30d: number;
  lastWrongAt: string;
  masteryScore: number;
  reviewScore: number;
};

export function buildMistakeTable(history: MistakeHistoryItem[]): MistakeTableRow[] {
  const grouped = new Map<string, MistakeTableRow>();
  for (const item of history) {
    const key = `${item.lawId}:${item.section}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        section: item.section,
        lawName: item.lawName,
        lawId: item.lawId,
        mistakeCount: 1,
        lastSeenAt: item.mistakeAt,
        reviewPriority: "Low",
      });
      continue;
    }
    current.mistakeCount += 1;
    if (+new Date(item.mistakeAt) > +new Date(current.lastSeenAt)) {
      current.lastSeenAt = item.mistakeAt;
    }
    current.reviewPriority = current.mistakeCount >= 5 ? "High" : current.mistakeCount >= 3 ? "Medium" : "Low";
  }
  return [...grouped.values()].sort((a, b) => {
    if (b.mistakeCount !== a.mistakeCount) return b.mistakeCount - a.mistakeCount;
    return +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt);
  });
}

export function buildMistakeAnalyticsTable(history: MistakeHistoryItem[], now = Date.now()): MistakeAnalyticsRow[] {
  const grouped = new Map<string, MistakeHistoryItem[]>();
  for (const item of history) {
    const key = `${item.lawId}:${item.section}`;
    const arr = grouped.get(key) ?? [];
    arr.push(item);
    grouped.set(key, arr);
  }

  const oneDay = 24 * 60 * 60 * 1000;
  const sevenDays = 7 * oneDay;
  const thirtyDays = 30 * oneDay;

  const rows: MistakeAnalyticsRow[] = [];

  for (const [key, items] of grouped) {
    const [lawId, section] = key.split(":");
    const sorted = [...items].sort((a, b) => +new Date(b.mistakeAt) - +new Date(a.mistakeAt));
    const lastWrongAt = sorted[0]?.mistakeAt ?? new Date(now).toISOString();
    const lawName = sorted[0]?.lawName ?? "";
    const mistakeCount = sorted.length;

    const mistakes24h = sorted.filter((x) => now - +new Date(x.mistakeAt) <= oneDay).length;
    const mistakes7d = sorted.filter((x) => now - +new Date(x.mistakeAt) <= sevenDays).length;
    const mistakes30d = sorted.filter((x) => now - +new Date(x.mistakeAt) <= thirtyDays).length;

    const daysSinceLastWrong = Math.max(0, (now - +new Date(lastWrongAt)) / oneDay);
    const repetitionPenalty = Math.min(45, mistakes7d * 8 + mistakes24h * 6);
    const recencyPenalty = Math.max(0, 25 - daysSinceLastWrong * 2.5);
    const masteryScore = Math.max(0, Math.min(100, Math.round(100 - repetitionPenalty - recencyPenalty)));
    const reviewScore = mistakes7d * 5 + mistakes24h * 7 + Math.max(0, 20 - daysSinceLastWrong);
    const reviewPriority: MistakeTableRow["reviewPriority"] =
      reviewScore >= 30 ? "High" : reviewScore >= 16 ? "Medium" : "Low";

    rows.push({
      section,
      lawId: lawId as LawId,
      lawName,
      mistakeCount,
      lastSeenAt: lastWrongAt,
      lastWrongAt,
      reviewPriority,
      mistakes24h,
      mistakes7d,
      mistakes30d,
      masteryScore,
      reviewScore,
    });
  }

  return rows.sort((a, b) => {
    if (b.reviewScore !== a.reviewScore) return b.reviewScore - a.reviewScore;
    return +new Date(b.lastWrongAt) - +new Date(a.lastWrongAt);
  });
}
