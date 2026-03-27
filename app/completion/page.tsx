"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import AppShell from "@/components/mvp/AppShell";
import CompletionStats from "@/components/mvp/CompletionStats";
import ProgressBar from "@/components/mvp/ProgressBar";
import { calcXp, computeAccuracy, nextMilestoneProgress } from "@/lib/game/mvp";
import { loadCompletions } from "@/lib/game/storage";
import type { CompletionSummary } from "@/lib/game/types";

export default function CompletionPage() {
  const [summary] = useState<CompletionSummary | null>(() => {
    if (typeof window === "undefined") return null;
    return loadCompletions()[0] ?? null;
  });
  const [copied, setCopied] = useState("");

  const accuracy = summary ? computeAccuracy(summary.correctCount, summary.wrongCount) : 0;
  const milestone = useMemo(() => nextMilestoneProgress(Math.max(1, Math.floor(accuracy / 2)), 50), [accuracy]);

  const shareResult = async () => {
    if (!summary) return;
    const text = `จบรอบฝึกแล้ว! ${summary.lawName} ความแม่นยำ ${accuracy}% (${summary.correctCount}/${summary.totalQuestions})`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "ท่องกฎหมาย", text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied("คัดลอกผลลัพธ์ไปยังคลิปบอร์ดแล้ว");
      }
    } catch {
      setCopied("ยกเลิกการแชร์");
    }
  };

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-3xl border border-indigo-300/20 bg-gradient-to-b from-[#212b88]/55 to-[#070b56]/80 p-6">
        <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-indigo-300/20 blur-2xl" />
        <h1 className="relative text-3xl font-extrabold tracking-tight text-white">จบรอบฝึกแล้ว!</h1>
        <p className="relative mt-2 text-sm text-slate-200">วันนี้ทำได้ดีมาก ดูความคืบหน้าแล้วฝึกต่ออย่างสม่ำเสมอ</p>
      </section>

      <section className="mt-4">
        <CompletionStats
          accuracy={`${accuracy}%`}
          studyTime="10m"
          provisionsMastered={`${summary?.correctCount ?? 0}`}
          xpGained={`${summary ? calcXp(summary) : 0}`}
        />
      </section>

      <section className="glass-panel mt-4 rounded-2xl border border-indigo-300/20 p-5">
        <h2 className="text-lg font-semibold text-slate-100">เป้าหมายถัดไป</h2>
        <p className="mt-1 text-sm text-slate-300">
          เลเวล {milestone.current} / {milestone.goal}
        </p>
        {summary ? (
          <p className="mt-1 text-xs text-slate-400">
            เวลาเฉลี่ยต่อข้อ {Math.round((summary.avgQuestionTimeLimitMs ?? 60000) / 1000)} วินาที · ความเร็วเฉลี่ย
            {` ${summary.avgSpeedMultiplier ?? 1}x`}
          </p>
        ) : null}
        <div className="mt-3">
          <ProgressBar value={milestone.pct} />
        </div>
      </section>

      <section className="mt-4 grid gap-2 sm:grid-cols-3">
        <Link
          href="/research-beta"
          className="rounded-full bg-indigo-300 px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-slate-950 shadow-[0_10px_24px_rgba(176,198,255,0.25)]"
        >
          ปลดล็อกโหมดวิจัยเบต้า
        </Link>
        <Link href="/progress" className="rounded-full border border-indigo-300/40 bg-indigo-300/10 px-4 py-3 text-center text-sm font-semibold text-indigo-100">
          ทบทวนข้อที่ผิด
        </Link>
        <button
          onClick={() => void shareResult()}
          className="rounded-full border border-indigo-300/40 bg-indigo-300/10 px-4 py-3 text-sm font-semibold text-indigo-100"
        >
          แชร์ผลลัพธ์
        </button>
      </section>

      {copied ? <p className="mt-3 text-xs text-slate-400">{copied}</p> : null}
    </AppShell>
  );
}
