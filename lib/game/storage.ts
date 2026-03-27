"use client";

import type { CompletionSummary, MistakeHistoryItem, RunSnapshot } from "@/lib/game/types";

const RUN_KEY = "thai-niti-game:active-run";
const COMPLETIONS_KEY = "thai-niti-game:completions";
const MISTAKES_KEY = "thai-niti-game:mistakes";

export function loadActiveRun(): RunSnapshot | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RunSnapshot;
  } catch {
    return null;
  }
}

export function saveActiveRun(run: RunSnapshot): void {
  localStorage.setItem(RUN_KEY, JSON.stringify(run));
}

export function clearActiveRun(): void {
  localStorage.removeItem(RUN_KEY);
}

export function loadCompletions(): CompletionSummary[] {
  try {
    const raw = localStorage.getItem(COMPLETIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CompletionSummary[];
  } catch {
    return [];
  }
}

export function appendCompletion(summary: CompletionSummary): void {
  const items = loadCompletions();
  localStorage.setItem(COMPLETIONS_KEY, JSON.stringify([summary, ...items].slice(0, 20)));
}

export function loadLatestCompletion(): CompletionSummary | null {
  const items = loadCompletions();
  return items[0] ?? null;
}

export function loadMistakeHistory(): MistakeHistoryItem[] {
  try {
    const raw = localStorage.getItem(MISTAKES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MistakeHistoryItem[];
  } catch {
    return [];
  }
}

export function appendMistakeHistory(items: MistakeHistoryItem[]): void {
  if (items.length === 0) return;
  const current = loadMistakeHistory();
  const merged = [...items, ...current].slice(0, 500);
  localStorage.setItem(MISTAKES_KEY, JSON.stringify(merged));
}
