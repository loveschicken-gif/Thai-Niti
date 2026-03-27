"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/mvp/AppShell";
import ProgressBar from "@/components/mvp/ProgressBar";
import StatCard from "@/components/mvp/StatCard";
import { computeAccuracy, computeCurrentLevel, computeStreak } from "@/lib/game/mvp";
import { loadActiveRun, loadCompletions } from "@/lib/game/storage";
import type { CompletionSummary, LawId, RunSnapshot } from "@/lib/game/types";

type LawAvailability = {
  id: LawId;
  nameTh: string;
  nameEn: string;
  available: boolean;
  provisionCount: number;
};

export default function HomePage() {
  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [completions, setCompletions] = useState<CompletionSummary[]>([]);
  const [laws, setLaws] = useState<LawAvailability[]>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const active = loadActiveRun();
      setRun(active && !active.completed && !active.gameOver ? active : null);
      setCompletions(loadCompletions());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const loadLaws = async () => {
      try {
        const res = await fetch("/api/game/laws");
        const payload = (await res.json()) as { laws?: LawAvailability[] };
        if (res.ok && payload.laws) setLaws(payload.laws);
      } catch {
        setLaws([]);
      }
    };
    void loadLaws();
  }, []);

  const streak = computeStreak(completions);
  const accuracy = run ? computeAccuracy(run.correctCount, run.wrongCount) : 0;
  const level = computeCurrentLevel(run);
  const continueProgress = useMemo(() => {
    if (!run) return 0;
    return Math.round((run.completedCount / run.questions.length) * 100);
  }, [run]);

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-3xl border border-indigo-300/20 bg-gradient-to-b from-[#202983]/55 to-[#060a52]/85 p-6 shadow-[0_20px_60px_rgba(3,10,70,0.5)] sm:p-8">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-indigo-300/15 blur-3xl" />
        <div className="absolute -left-8 bottom-0 h-36 w-36 rounded-full bg-violet-300/10 blur-2xl" />
        <p className="relative text-xs font-bold uppercase tracking-[0.2em] text-indigo-200/90">ท่องกฎหมาย</p>
        <h1 className="relative mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">ฝึกจำกฎหมายด้วย Active Recall</h1>
        <p className="relative mt-3 max-w-2xl text-sm leading-7 text-slate-200">ฝึกบทบัญญัติกฎหมายไทยด้วยการทบทวนเชิงรุกอย่างต่อเนื่อง</p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <Link
            href="/study"
            className="rounded-full bg-indigo-300 px-6 py-3 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-[0_12px_28px_rgba(176,198,255,0.3)] transition hover:-translate-y-0.5 hover:bg-indigo-200"
          >
            เริ่มรอบฝึก
          </Link>
          <Link
            href={run ? "/gameplay" : "/study"}
            className="rounded-full border border-indigo-300/50 bg-indigo-300/10 px-6 py-3 text-sm font-bold uppercase tracking-wide text-indigo-100 transition hover:-translate-y-0.5 hover:bg-indigo-300/20"
          >
            ฝึกต่อ
          </Link>
          <Link
            href="/tracks"
            className="rounded-full border border-violet-300/50 bg-violet-300/10 px-6 py-3 text-sm font-bold uppercase tracking-wide text-violet-100 transition hover:-translate-y-0.5 hover:bg-violet-300/20"
          >
            ดูแผนที่แทร็ก
          </Link>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="สตรีค" value={`${streak} วัน`} icon="🔥" iconClassName="bg-amber-300/20 text-amber-100" />
        <StatCard label="ความแม่นยำ" value={`${accuracy}%`} icon="🎯" iconClassName="bg-violet-300/20 text-violet-100" />
        <StatCard label="เลเวล" value={`${level}`} icon="🏅" iconClassName="bg-indigo-300/20 text-indigo-100" />
      </section>

      <section className="glass-panel mt-4 rounded-2xl border border-indigo-300/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-100">ฝึกต่อ</h2>
          {run ? <span className="rounded-full bg-indigo-300/10 px-3 py-1 text-xs font-semibold text-indigo-100">{run.selectedLawName}</span> : null}
        </div>
        {run ? (
          <>
            <p className="mt-2 text-sm text-slate-300">
              เลเวล {run.level} · ชีวิต {run.lives} · ความคืบหน้า {run.completedCount}/{run.questions.length}
            </p>
            <div className="mt-3">
              <ProgressBar value={continueProgress} />
            </div>
            <Link
              href="/gameplay"
              className="mt-4 inline-flex rounded-full bg-indigo-300 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-[0_10px_22px_rgba(176,198,255,0.25)]"
            >
              ฝึกต่อ
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-300">ยังไม่มีรอบฝึกที่กำลังเล่น เริ่มรอบใหม่ได้ที่หน้าฝึกกฎหมาย</p>
            <Link href="/study" className="mt-4 inline-flex rounded-full border border-indigo-300/40 px-5 py-2.5 text-sm font-semibold text-indigo-100">
              ไปหน้าฝึกกฎหมาย
            </Link>
          </>
        )}
      </section>

      <section className="glass-panel mt-4 rounded-2xl border border-indigo-300/20 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">แทร็กกฎหมาย</h2>
          <Link href="/study" className="text-sm font-semibold text-indigo-200">
            ดูทั้งหมด
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(laws.length ? laws : []).slice(0, 4).map((law) => (
            <div key={law.id} className="rounded-xl border border-indigo-300/10 bg-[#0f176f]/55 p-3">
              <p className="text-sm font-semibold text-slate-100">{law.nameTh}</p>
              <p className="text-xs text-slate-400">{law.available ? `${law.provisionCount} มาตรา` : "กำลังเตรียมเนื้อหา"}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-violet-300/25 bg-gradient-to-r from-violet-900/30 to-indigo-900/20 p-5">
        <h2 className="text-lg font-semibold text-violet-100">โหมดวิจัย (เบต้า)</h2>
        <p className="mt-2 text-sm text-violet-100/90">ปลดล็อกเครื่องมือค้นคว้ากฎหมายเชิงลึกและฟีเจอร์เบต้า</p>
        <p className="mt-1 text-xs text-violet-200/80">ปลดล็อกที่เลเวล 50</p>
      </section>
    </AppShell>
  );
}
