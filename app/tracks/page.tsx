"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/mvp/AppShell";
import { loadCompletions } from "@/lib/game/storage";
import type { CompletionSummary, LawId, TrackAvailabilityStatus } from "@/lib/game/types";

type LawAvailability = {
  id: LawId;
  nameTh: string;
  available: boolean;
  provisionCount: number;
  status: TrackAvailabilityStatus;
  canStart: boolean;
};

const TRACK_ORDER: LawId[] = ["ccc", "pc", "cpc", "crpc", "evidence", "revenue", "bankruptcy", "juvenile", "ip", "land", "labor", "consumer"];

function badgeLabel(status: "full" | "early_access" | "starter_pack" | "coming_soon" | "locked") {
  if (status === "full") return "พร้อมเต็ม";
  if (status === "early_access") return "Early Access";
  if (status === "starter_pack") return "Starter Pack";
  if (status === "locked") return "ล็อก";
  return "เร็ว ๆ นี้";
}

export default function TracksPage() {
  const [laws, setLaws] = useState<LawAvailability[]>([]);
  const [completions] = useState<CompletionSummary[]>(() => (typeof window === "undefined" ? [] : loadCompletions()));

  useEffect(() => {
    const loadLaws = async () => {
      try {
        const { computeLawAvailabilities } = await import("@/lib/game/provisions");
        const availabilities = await computeLawAvailabilities();
        setLaws(availabilities);
      } catch {
        setLaws([]);
      }
    };
    void loadLaws();
  }, []);

  const completionStats = useMemo(() => {
    const stats = new Map<LawId, { attempted: number; correct: number; total: number }>();
    for (const c of completions) {
      const row = stats.get(c.lawId) ?? { attempted: 0, correct: 0, total: 0 };
      row.attempted += c.correctCount + c.wrongCount;
      row.correct += c.correctCount;
      row.total += c.totalQuestions;
      stats.set(c.lawId, row);
    }
    return stats;
  }, [completions]);

  const orderedLaws = useMemo(() => {
    const map = new Map(laws.map((law) => [law.id, law]));
    return TRACK_ORDER.map((id) => map.get(id)).filter((law): law is LawAvailability => Boolean(law));
  }, [laws]);

  return (
    <AppShell>
      <section className="glass-panel rounded-3xl border border-indigo-300/20 p-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">แผนที่ความก้าวหน้าแทร็ก</h1>
        <p className="mt-2 text-sm text-slate-300">ดูสถานะปลดล็อกและจุดตรวจทุกแทร็กแบบเส้นทางการเรียน</p>
      </section>

      <section className="mt-4 space-y-4">
        {orderedLaws.map((law, idx) => {
          const prev = orderedLaws[idx - 1];
          const prevStats = prev ? completionStats.get(prev.id) : undefined;
          const prevMastery = prevStats && prevStats.attempted > 0 ? Math.round((prevStats.correct / prevStats.attempted) * 100) : 0;
          const locked = idx > 0 && prev && prevMastery < 40;
          const status = locked ? "locked" : law.status;
          const stats = completionStats.get(law.id);
          const mastery = stats && stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0;
          const attempted = stats?.attempted ?? 0;
          const milestones = Array.from({ length: Math.max(1, Math.ceil(Math.max(law.provisionCount, 1) / 25)) }, (_, i) => i + 1);
          const reachedMilestones = Math.floor(attempted / 25);

          return (
            <article key={law.id} className="glass-panel rounded-2xl border border-indigo-300/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold text-slate-100">{law.nameTh}</p>
                <span className="rounded-full bg-indigo-300/15 px-2.5 py-1 text-xs font-semibold text-indigo-100">{badgeLabel(status)}</span>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">Mastery {mastery}%</span>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">ข้อฝึกแล้ว {attempted}</span>
              </div>
              <p className="mt-2 text-xs text-slate-300">มาตราพร้อมฝึก {law.provisionCount} · ปลดล็อกถัดไปเมื่อแทร็กก่อนหน้ามี Mastery อย่างน้อย 40%</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {milestones.map((milestone) => {
                  const reached = milestone <= reachedMilestones;
                  return (
                    <span key={`${law.id}-${milestone}`} className={`rounded-full px-2.5 py-1 text-xs ${reached ? "bg-emerald-300/20 text-emerald-100" : "bg-slate-800 text-slate-300"}`}>
                      จุด {milestone}
                    </span>
                  );
                })}
              </div>
              <div className="mt-3">
                <Link
                  href={locked ? "/progress" : "/study"}
                  className="inline-flex rounded-full border border-indigo-300/40 bg-indigo-300/10 px-4 py-2 text-xs font-semibold text-indigo-100"
                >
                  {locked ? "ไปเพิ่ม Mastery แทร็กก่อนหน้า" : "ไปหน้าฝึกแทร็กนี้"}
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
