"use client";

import { useMemo, useState } from "react";

import AppShell from "@/components/mvp/AppShell";
import MistakeTable from "@/components/mvp/MistakeTable";
import { buildMistakeAnalyticsTable } from "@/lib/game/mvp";
import { loadMistakeHistory } from "@/lib/game/storage";
import type { MistakeHistoryItem } from "@/lib/game/types";

export default function ProgressPage() {
  const [history] = useState<MistakeHistoryItem[]>(() => (typeof window === "undefined" ? [] : loadMistakeHistory()));
  const [referenceNow] = useState<number>(() => Date.now());

  const rows = useMemo(() => buildMistakeAnalyticsTable(history, referenceNow), [history, referenceNow]);
  const totalMistakes = history.length;
  const mostRepeated = rows[0];
  const weekAgoMs = referenceNow - 7 * 24 * 60 * 60 * 1000;
  const mistakesThisWeek = history.filter((item) => +new Date(item.mistakeAt) >= weekAgoMs).length;

  return (
    <AppShell>
      <section className="glass-panel rounded-2xl border border-indigo-300/20 p-5">
        <h1 className="text-xl font-extrabold tracking-tight text-white">ความคืบหน้า</h1>
        <p className="mt-2 text-sm text-slate-300">ทบทวนข้อที่ผิดซ้ำตามความถี่และประวัติเวลา</p>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="glass-panel rounded-2xl border border-indigo-300/20 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-300">ผิดทั้งหมด</p>
          <p className="mt-2 text-2xl font-extrabold text-indigo-100">{totalMistakes}</p>
        </article>
        <article className="glass-panel rounded-2xl border border-indigo-300/20 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-300">มาตราที่ผิดซ้ำมากที่สุด</p>
          <p className="mt-2 text-lg font-extrabold text-indigo-100">{mostRepeated ? `มาตรา ${mostRepeated.section}` : "-"}</p>
        </article>
        <article className="glass-panel rounded-2xl border border-indigo-300/20 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-300">ข้อผิดพลาดสัปดาห์นี้</p>
          <p className="mt-2 text-2xl font-extrabold text-indigo-100">{mistakesThisWeek}</p>
        </article>
      </section>

      <section className="glass-panel mt-4 overflow-hidden rounded-2xl border border-indigo-300/20">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-100">ทบทวนข้อที่ผิด</h2>
        </div>
        <MistakeTable rows={rows} />
      </section>
    </AppShell>
  );
}
