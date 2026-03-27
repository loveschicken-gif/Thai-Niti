"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/mvp/AppShell";
import TrackCard from "@/components/mvp/TrackCard";
import { GAME_LAWS, getLawById } from "@/lib/game/laws";
import { lawMastery } from "@/lib/game/mvp";
import { loadCompletions, saveActiveRun } from "@/lib/game/storage";
import type { CompletionSummary, LawId, RunSnapshot, TrackAvailabilityStatus } from "@/lib/game/types";

type LawAvailability = {
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

const TRACK_REQUEST_FORM_URL = "https://forms.gle/9mL8TpV3wfLhzUmE9";

export default function StudyPage() {
  const router = useRouter();
  const [laws, setLaws] = useState<LawAvailability[]>([]);
  const [completions, setCompletions] = useState<CompletionSummary[]>([]);
  const [loadingLaw, setLoadingLaw] = useState<LawId | null>(null);
  const [error, setError] = useState("");
  const [requestModalLaw, setRequestModalLaw] = useState<string | null>(null);

  useEffect(() => {
    setCompletions(loadCompletions());
  }, []);

  useEffect(() => {
    const loadLaws = async () => {
      try {
        const { computeLawAvailabilities } = await import("@/lib/game/provisions");
        const availabilities = await computeLawAvailabilities();
        setLaws(availabilities);
      } catch (err) {
        setError(err instanceof Error ? err.message : "ไม่สามารถโหลดแทร็กได้");
      }
    };
    void loadLaws();
  }, []);

  const byLaw = useMemo(() => {
    return laws.reduce<Partial<Record<LawId, LawAvailability>>>((acc, law) => {
      acc[law.id] = law;
      return acc;
    }, {});
  }, [laws]);

  const startRun = async (lawId: LawId) => {
    setLoadingLaw(lawId);
    setError("");
    try {
      const { startRun: clientStartRun } = await import("@/lib/game/provisions");
      const result = await clientStartRun(lawId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      const law = getLawById(lawId);
      const nextRun: RunSnapshot = {
        selectedLawId: lawId,
        selectedLawName: law?.nameTh || lawId,
        questions: result.questions,
        bonusQuestion: result.bonus ?? undefined,
        bonusUsed: false,
        currentIndex: 0,
        level: 1,
        questionInLevel: 1,
        lives: 2,
        bonusPending: false,
        gameOver: false,
        completed: false,
        completedCount: 0,
        correctCount: 0,
        wrongCount: 0,
        missed: [],
        correct: [],
        startedAt: new Date().toISOString(),
      };
      saveActiveRun(nextRun);
      router.push("/gameplay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถเริ่มรอบฝึกได้");
    } finally {
      setLoadingLaw(null);
    }
  };

  const requestTrack = (lawName: string) => {
    setRequestModalLaw(lawName);
  };

  const openRequestForm = () => {
    if (typeof window !== "undefined") {
      window.open(TRACK_REQUEST_FORM_URL, "_blank", "noopener,noreferrer");
    }
    setError(requestModalLaw ? `กำลังเตรียม "${requestModalLaw}" กรุณาส่งคำขอผ่านฟอร์ม` : "");
    setRequestModalLaw(null);
  };

  return (
    <AppShell>
      <section className="glass-panel rounded-3xl border border-indigo-300/20 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">แทร็กกฎหมาย</h1>
          <Link href="/tracks" className="rounded-full border border-indigo-300/40 bg-indigo-300/10 px-4 py-2 text-xs font-semibold text-indigo-100">
            ดูแผนที่ความก้าวหน้า
          </Link>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          เลือกกรอบกฎหมายที่ต้องการฝึก ระบบ Active Recall ของเราจะเน้นบทบัญญัติสำคัญเพื่อช่วยให้จำได้แม่นขึ้นและสม่ำเสมอขึ้น
        </p>
        {error ? <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-950/20 p-3 text-sm text-rose-100">{error}</p> : null}
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        {GAME_LAWS.map((law) => {
          const availability = byLaw[law.id];
          const mastery = lawMastery(completions, law.id);
          const cardMetaByLaw: Record<LawId, { icon: string; accent: "indigo" | "amber" | "violet"; category: string }> = {
            ccc: { icon: "⚖", accent: "indigo", category: "กฎหมายเอกชน" },
            cpc: { icon: "🏛", accent: "violet", category: "วิธีพิจารณา" },
            pc: { icon: "🔨", accent: "amber", category: "กฎหมายมหาชน" },
            crpc: { icon: "🧭", accent: "violet", category: "วิธีพิจารณา" },
            evidence: { icon: "📚", accent: "violet", category: "ข้ามประมวล" },
            revenue: { icon: "💼", accent: "amber", category: "ภาษีอากร" },
            bankruptcy: { icon: "📉", accent: "amber", category: "พาณิชย์" },
            juvenile: { icon: "🛡", accent: "indigo", category: "เยาวชนและครอบครัว" },
            ip: { icon: "💡", accent: "indigo", category: "ทรัพย์สินทางปัญญา" },
            land: { icon: "🌏", accent: "indigo", category: "ที่ดิน" },
            labor: { icon: "👥", accent: "amber", category: "แรงงาน" },
            consumer: { icon: "🛒", accent: "violet", category: "คุ้มครองผู้บริโภค" },
          };
          const cardMeta = cardMetaByLaw[law.id];
          return (
            <TrackCard
              key={law.id}
              title={law.nameTh}
              subtitle={law.nameTh}
              description="ฝึกบทบัญญัติสำคัญด้วยโจทย์ Active Recall ที่ค่อย ๆ เพิ่มระดับ"
              levelLabel={`เลเวล ${Math.max(1, Math.ceil(mastery / 10))}`}
              categoryLabel={cardMeta.category}
              icon={cardMeta.icon}
              accent={cardMeta.accent}
              mastery={mastery}
              available={Boolean(availability?.available)}
              provisionCount={availability?.provisionCount ?? 0}
              loading={loadingLaw === law.id}
              status={availability?.status ?? "coming_soon"}
              statusLabel={availability?.statusLabel ?? "เร็ว ๆ นี้"}
              statusMessage={availability?.statusMessage ?? "แทร็กนี้ตั้งค่าไว้แล้วและกำลังเติมบทบัญญัติ"}
              ctaLabel={availability?.ctaLabel ?? "ขอแทร็กนี้"}
              canStart={availability?.canStart ?? false}
              onEnter={() => {
                if (availability?.canStart) {
                  void startRun(law.id);
                  return;
                }
                requestTrack(law.nameTh);
              }}
              onRequestTrack={() => requestTrack(law.nameTh)}
            />
          );
        })}
      </section>
      {requestModalLaw ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-indigo-300/25 p-5 shadow-[0_20px_60px_rgba(5,10,55,0.45)]">
            <h3 className="text-lg font-bold text-white">ขอเพิ่มหัวข้อนี้</h3>
            <p className="mt-2 text-sm text-slate-200">
              {`"${requestModalLaw}" กำลังอยู่ระหว่างเตรียมเนื้อหา ไปที่ฟอร์มเพื่อขอหัวข้อนี้หรือหัวข้ออื่นเพิ่มเติมได้`}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={openRequestForm}
                className="rounded-full bg-indigo-300 px-4 py-2 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-[0_10px_22px_rgba(176,198,255,0.25)]"
              >
                ไปหน้าฟอร์มคำขอ
              </button>
              <button
                onClick={() => setRequestModalLaw(null)}
                className="rounded-full border border-indigo-300/40 px-4 py-2 text-sm font-semibold text-indigo-100"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
