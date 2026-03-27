"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import AppShell from "@/components/mvp/AppShell";
import ProvisionCard from "@/components/mvp/ProvisionCard";
import RunHud from "@/components/mvp/RunHud";
import RunnerLane from "@/components/mvp/RunnerLane";
import { appendCompletion, appendMistakeHistory, clearActiveRun, loadActiveRun, saveActiveRun } from "@/lib/game/storage";
import { normalizeAnswerToken } from "@/lib/game/text";
import type { CompletionSummary, MistakeHistoryItem, RunSnapshot } from "@/lib/game/types";

const BASE_QUESTION_TIME_LIMIT_MS = 60_000;

function finalizeRun(state: RunSnapshot) {
  const avgResponseMs =
    state.responseTimesMs && state.responseTimesMs.length
      ? Math.round(state.responseTimesMs.reduce((sum, ms) => sum + ms, 0) / state.responseTimesMs.length)
      : 0;
  const avgQuestionTimeLimitMs =
    state.questionTimeLimitsMs && state.questionTimeLimitsMs.length
      ? Math.round(state.questionTimeLimitsMs.reduce((sum, ms) => sum + ms, 0) / state.questionTimeLimitsMs.length)
      : BASE_QUESTION_TIME_LIMIT_MS;
  const summary: CompletionSummary = {
    id: `${state.selectedLawId}-${Date.now()}`,
    lawId: state.selectedLawId,
    lawName: state.selectedLawName,
    completedAt: state.endedAt || new Date().toISOString(),
    correctCount: state.correctCount,
    wrongCount: state.wrongCount,
    totalQuestions: state.questions.length,
    score: state.score ?? 0,
    bestStreak: state.bestStreak ?? 0,
    avgResponseMs,
    avgQuestionTimeLimitMs,
    avgSpeedMultiplier: Number((BASE_QUESTION_TIME_LIMIT_MS / Math.max(1, avgQuestionTimeLimitMs)).toFixed(2)),
    bonusUsed: state.bonusUsed,
    missedSections: state.missed.map((m) => m.section),
  };
  appendCompletion(summary);
  const mistakes: MistakeHistoryItem[] = state.missed.map((m, idx) => ({
    id: `${state.selectedLawId}-${m.questionId}-${idx}-${m.mistakeAt || state.endedAt || Date.now()}`,
    lawId: state.selectedLawId,
    lawName: state.selectedLawName,
    section: m.section,
    questionId: m.questionId,
    expected: m.expected,
    userAnswer: m.userAnswer,
    mistakeAt: m.mistakeAt || state.endedAt || new Date().toISOString(),
  }));
  appendMistakeHistory(mistakes);
}

export default function GameplayPage() {
  const router = useRouter();
  const [run, setRun] = useState<RunSnapshot | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = loadActiveRun();
    return stored && !stored.completed && !stored.gameOver ? stored : null;
  });
  const [inputs, setInputs] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [hintText, setHintText] = useState("");
  const [questionProgress, setQuestionProgress] = useState(0);
  const [characterAction, setCharacterAction] = useState<"idle" | "jump" | "hit">("idle");
  const [timeLimitMs, setTimeLimitMs] = useState(BASE_QUESTION_TIME_LIMIT_MS);
  const [comboCount, setComboCount] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [revivePrompt, setRevivePrompt] = useState(false);
  const [usedHintForCurrent, setUsedHintForCurrent] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const questionStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const progressRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const MAX_LIVES = 3;
  const BASE_SCORE = 100;

  useEffect(() => {
    if (!run) router.replace("/study");
  }, [router, run]);

  const currentQuestion = useMemo(() => {
    if (!run) return null;
    if (run.bonusPending && run.bonusQuestion) return run.bonusQuestion;
    return run.questions[run.currentIndex] ?? null;
  }, [run]);

  useEffect(() => {
    if (!currentQuestion) return;
    const timer = window.setTimeout(() => {
      setInputs(new Array(currentQuestion.blanks.length).fill(""));
      setFeedback("");
      setHintText("");
      setQuestionProgress(0);
      progressRef.current = 0;
      resolvedRef.current = false;
      setUsedHintForCurrent(false);
      questionStartRef.current = performance.now();
      setTimeLimitMs(BASE_QUESTION_TIME_LIMIT_MS);
      setCharacterAction("idle");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentQuestion?.id, run?.completedCount, run?.level]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRun = (next: RunSnapshot) => {
    setRun(next);
    if (next.gameOver || next.completed) {
      clearActiveRun();
      return;
    }
    saveActiveRun(next);
  };

  const ensureAudioContext = () => {
    if (audioCtxRef.current) return audioCtxRef.current;
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtxRef.current = new Ctx();
    return audioCtxRef.current;
  };

  const playSfx = (kind: "ok" | "perfect" | "hit" | "revive") => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (kind === "ok") {
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.linearRampToValueAtTime(760, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      return;
    }
    if (kind === "perfect") {
      osc.frequency.setValueAtTime(720, now);
      osc.frequency.linearRampToValueAtTime(980, now + 0.11);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
      return;
    }
    if (kind === "revive") {
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.linearRampToValueAtTime(640, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
      return;
    }
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
    osc.start(now);
    osc.stop(now + 0.19);
  };

  const animateCharacter = (action: "jump" | "hit") => {
    setCharacterAction(action);
    window.setTimeout(() => {
      setCharacterAction("idle");
    }, 380);
  };

  const resolveAnswer = (isCorrect: boolean, userInputs: string[]) => {
    if (!run || !currentQuestion || resolvedRef.current) return;
    resolvedRef.current = true;

    if (isCorrect) {
      animateCharacter("jump");
      const inPerfectWindow = questionProgress >= 0.72 && questionProgress <= 0.92;
      const nextLives = inPerfectWindow ? Math.min(MAX_LIVES, run.lives + 1) : run.lives;
      const responseMs = Math.max(0, Math.round(performance.now() - questionStartRef.current));
      const difficulty = Math.max(1, Math.min(10, currentQuestion.level));
      const responseRatio = Math.max(0, Math.min(1, responseMs / Math.max(1, timeLimitMs)));
      const speedBonus = Math.max(0, Math.round((1 - responseRatio) * 40));
      const streakBase = (run.streak ?? comboCount) + 1;
      const streakBonus = Math.min(streakBase * 5, 40);
      const difficultyBonus = difficulty * 15;
      const hintPenalty = usedHintForCurrent ? 35 : 0;
      const gainedScore = Math.max(20, BASE_SCORE + difficultyBonus + streakBonus + speedBonus - hintPenalty);
      const completedCount = run.completedCount + 1;
      const nextIndex = run.currentIndex + (run.bonusPending ? 0 : 1);
      const isFinished = !run.bonusPending && completedCount >= run.questions.length;
      const next: RunSnapshot = {
        ...run,
        bonusPending: false,
        completedCount,
        currentIndex: nextIndex,
        level: Math.min(10, Math.floor(nextIndex / 10) + 1),
        questionInLevel: (nextIndex % 10) + 1,
        lives: nextLives,
        score: (run.score ?? 0) + gainedScore,
        streak: streakBase,
        bestStreak: Math.max(run.bestStreak ?? 0, streakBase),
        responseTimesMs: [...(run.responseTimesMs ?? []), responseMs].slice(-200),
        questionTimeLimitsMs: [...(run.questionTimeLimitsMs ?? []), timeLimitMs].slice(-200),
        hintsUsed: (run.hintsUsed ?? 0) + (usedHintForCurrent ? 1 : 0),
        correctCount: run.correctCount + 1,
        correct: [
          ...run.correct,
          {
            questionId: currentQuestion.id,
            section: currentQuestion.section,
            promptText: currentQuestion.promptText,
            expected: currentQuestion.blanks,
          },
        ],
      };
      if (isFinished) {
        playSfx(inPerfectWindow ? "perfect" : "ok");
        next.completed = true;
        next.endedAt = new Date().toISOString();
        window.setTimeout(() => {
          updateRun(next);
          finalizeRun(next);
          router.push("/completion");
        }, 240);
        return;
      }
      const nextCombo = comboCount + 1;
      setComboCount(nextCombo);
      setBestCombo((prev) => Math.max(prev, nextCombo));
      if (inPerfectWindow) {
        playSfx("perfect");
        setFeedback("เพอร์เฟกต์! จังหวะดีมาก +1 ชีวิต");
      } else {
        playSfx("ok");
        setFeedback("ถูกต้อง ตัวละครข้ามสิ่งกีดขวางได้");
      }
      window.setTimeout(() => {
        updateRun(next);
      }, 260);
      return;
    }

    animateCharacter("hit");
    playSfx("hit");
    setComboCount(0);
    const livesLeft = run.lives - 1;
    const nextMissed = [
      ...run.missed,
      {
        questionId: currentQuestion.id,
        lawId: run.selectedLawId,
        lawName: run.selectedLawName,
        section: currentQuestion.section,
        promptText: currentQuestion.promptText,
        expected: currentQuestion.blanks,
        userAnswer: userInputs,
        mistakeAt: new Date().toISOString(),
      },
    ];

    if (livesLeft >= 1) {
      const next = {
        ...run,
        lives: livesLeft,
        streak: 0,
        wrongCount: run.wrongCount + 1,
        questionTimeLimitsMs: [...(run.questionTimeLimitsMs ?? []), timeLimitMs].slice(-200),
        missed: nextMissed,
      };
      setFeedback("ชนสิ่งกีดขวาง! เสียชีวิต 1");
      window.setTimeout(() => {
        updateRun(next);
      }, 260);
      return;
    }

    if (!run.bonusUsed && run.bonusQuestion) {
      const next = {
        ...run,
        lives: 0,
        streak: 0,
        wrongCount: run.wrongCount + 1,
        questionTimeLimitsMs: [...(run.questionTimeLimitsMs ?? []), timeLimitMs].slice(-200),
        missed: nextMissed,
      };
      setFeedback("ชีวิตหมด! กดปุ่มต่อชีวิตเพื่อใช้คำถามโบนัส");
      setRevivePrompt(true);
      updateRun(next);
      return;
    }

    const gameOverRun: RunSnapshot = {
      ...run,
      lives: 0,
      bonusPending: false,
      gameOver: true,
      wrongCount: run.wrongCount + 1,
      streak: 0,
      questionTimeLimitsMs: [...(run.questionTimeLimitsMs ?? []), timeLimitMs].slice(-200),
      missed: nextMissed,
      endedAt: new Date().toISOString(),
    };
    updateRun(gameOverRun);
    finalizeRun(gameOverRun);
    router.push("/completion");
  };

  const handleRevive = () => {
    if (!run || !run.bonusQuestion) return;
    const next = {
      ...run,
      lives: 1,
      bonusPending: true,
      bonusUsed: true,
    };
    playSfx("revive");
    setFeedback("ต่อชีวิตสำเร็จ! เข้าสู่คำถามโบนัส");
    setRevivePrompt(false);
    resolvedRef.current = false;
    progressRef.current = 0;
    setQuestionProgress(0);
    questionStartRef.current = performance.now();
    updateRun(next);
  };

  const handleEndRunNow = () => {
    if (!run) return;
    const gameOverRun: RunSnapshot = {
      ...run,
      lives: 0,
      bonusPending: false,
      gameOver: true,
      endedAt: new Date().toISOString(),
    };
    setRevivePrompt(false);
    updateRun(gameOverRun);
    finalizeRun(gameOverRun);
    router.push("/completion");
  };

  const handleRestartRun = async () => {
    if (!run || restarting) return;
    setRestarting(true);
    setFeedback("");
    setHintText("");
    setRevivePrompt(false);
    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lawId: run.selectedLawId }),
      });
      const payload = (await res.json()) as { questions?: RunSnapshot["questions"]; bonus?: RunSnapshot["bonusQuestion"]; message?: string; error?: string };
      if (!res.ok || !payload.questions || payload.questions.length < 100) {
        throw new Error(payload.message || payload.error || "ไม่สามารถเริ่มรอบใหม่ได้");
      }
      const nextRun: RunSnapshot = {
        selectedLawId: run.selectedLawId,
        selectedLawName: run.selectedLawName,
        questions: payload.questions,
        bonusQuestion: payload.bonus,
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
        score: 0,
        streak: 0,
        bestStreak: 0,
        hintsUsed: 0,
        responseTimesMs: [],
        questionTimeLimitsMs: [],
        missed: [],
        correct: [],
        startedAt: new Date().toISOString(),
      };
      updateRun(nextRun);
      resolvedRef.current = false;
      progressRef.current = 0;
      setQuestionProgress(0);
      questionStartRef.current = performance.now();
      setCharacterAction("idle");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "ไม่สามารถเริ่มรอบใหม่ได้");
    } finally {
      setRestarting(false);
    }
  };

  const handleSubmitAnswer = () => {
    if (!currentQuestion || resolvedRef.current) return;
    const expected = currentQuestion.blanks.map(normalizeAnswerToken);
    const received = inputs.map(normalizeAnswerToken);
    const isCorrect = expected.length === received.length && expected.every((word, idx) => word === received[idx]);
    resolveAnswer(isCorrect, inputs);
  };

  const showHint = () => {
    if (!currentQuestion || revivePrompt) return;
    if (!usedHintForCurrent) setUsedHintForCurrent(true);
    const hint = currentQuestion.blanks.map((word, idx) => `${idx + 1}) ${word.slice(0, 1)}...`).join("  ");
    setHintText(hint);
  };

  useEffect(() => {
    if (!currentQuestion) return;
    const tick = (now: number) => {
      if (resolvedRef.current) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - questionStartRef.current;
      const nextProgress = Math.min(1, elapsed / Math.max(1, timeLimitMs));
      if (Math.abs(nextProgress - progressRef.current) > 0.008) {
        progressRef.current = nextProgress;
        setQuestionProgress(nextProgress);
      }
      if (nextProgress >= 1 && !resolvedRef.current) {
        resolveAnswer(false, inputs);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [currentQuestion?.id, inputs, timeLimitMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const obstacleX = useMemo(() => {
    // Obstacle starts ahead and moves toward the character lane with easing.
    const p = questionProgress;
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    return 84 - eased * 66;
  }, [questionProgress]);

  const speedLabel = useMemo(() => {
    if (timeLimitMs < BASE_QUESTION_TIME_LIMIT_MS) return "เร็วขึ้น";
    if (timeLimitMs > BASE_QUESTION_TIME_LIMIT_MS) return "ช้าลง";
    return "ช้า (อ่านข้อความยาว)";
  }, [timeLimitMs]);

  const quickOptions = useMemo(() => {
    if (!currentQuestion) return [];
    const legalWords = Array.from(
      new Set(
        currentQuestion.originalText
          .split(/[\s,.;:()\-–—"“”'‘’]/)
          .map((word) => word.trim())
          .filter((word) => word.length >= 3),
      ),
    );

    return currentQuestion.blanks.map((blank) => {
      const pool = [blank, ...legalWords.filter((w) => normalizeAnswerToken(w) !== normalizeAnswerToken(blank)).slice(0, 3)];
      const shuffled = [...new Set(pool)].sort((a, b) => {
        const seed = `${currentQuestion.id}-${blank}-${a}-${b}`;
        return seed.charCodeAt(0) % 2 === 0 ? 1 : -1;
      });
      return shuffled.slice(0, 4);
    });
  }, [currentQuestion]);

  if (!run || !currentQuestion) {
    return (
      <AppShell>
        <section className="rounded-2xl border border-indigo-400/20 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-300">กำลังโหลดรอบฝึก...</p>
        </section>
      </AppShell>
    );
  }

  const progressValue = run.currentIndex + 1;
  const total = run.questions.length;

  return (
    <AppShell>
      <section className="space-y-4">
        <RunHud
          trackName={run.selectedLawName}
          level={run.level}
          questionInLevel={run.questionInLevel}
          progressValue={progressValue}
          total={total}
          lives={run.lives}
          combo={comboCount}
          bestCombo={bestCombo}
          score={run.score ?? 0}
        />

        <RunnerLane
          obstacleX={obstacleX}
          characterAction={characterAction}
          speedLabel={speedLabel}
          timeLeftSec={((1 - questionProgress) * timeLimitMs) / 1000}
        />

        <div className="mx-auto w-full max-w-3xl">
          <ProvisionCard lawTitle={currentQuestion.lawTitle} section={currentQuestion.section} promptText={currentQuestion.promptText} />
        </div>

        <section className="glass-panel mx-auto w-full max-w-2xl rounded-2xl border border-indigo-300/20 p-5">
          <label className="mb-2 block text-sm font-semibold text-slate-200">เติมคำที่หายไป</label>
          <div className="grid gap-2">
            {currentQuestion.blanks.map((_, idx) => {
              const options = quickOptions[idx] || [];
              return (
                <div key={`${currentQuestion.id}-${idx}`} className="space-y-2">
                  <input
                    value={inputs[idx] || ""}
                    onChange={(e) => {
                      const next = [...inputs];
                      next[idx] = e.target.value;
                      setInputs(next);
                    }}
                    placeholder="พิมพ์คำตอบของคุณ"
                    className="rounded-xl border border-indigo-300/10 bg-[#080d5a]/70 px-4 py-3 text-sm font-medium text-slate-100 outline-none ring-indigo-300/40 placeholder:text-slate-400 focus:ring"
                  />
                  <div className="flex flex-wrap gap-2">
                    {options.map((option) => (
                      <button
                        key={`${idx}-${option}`}
                        onClick={() => {
                          const next = [...inputs];
                          next[idx] = option;
                          setInputs(next);
                        }}
                        className="rounded-full border border-indigo-300/35 bg-indigo-300/10 px-3 py-1.5 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-300/20"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleSubmitAnswer}
              disabled={revivePrompt}
              className="rounded-full bg-indigo-300 px-5 py-3 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-[0_10px_20px_rgba(176,198,255,0.25)] transition hover:-translate-y-0.5"
            >
              ส่งคำตอบ
            </button>
            <button
              onClick={showHint}
              disabled={revivePrompt}
              className="rounded-full border border-indigo-300/40 bg-indigo-300/10 px-5 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-300/20"
            >
              คำใบ้
            </button>
          </div>
          {revivePrompt ? (
            <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3">
              <p className="text-sm font-semibold text-amber-100">ชีวิตหมดแล้ว ต้องการต่อชีวิตหรือไม่?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleRevive}
                  className="rounded-full bg-amber-300 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-950"
                >
                  ต่อชีวิต (ใช้โบนัส)
                </button>
                <button
                  onClick={handleEndRunNow}
                  className="rounded-full border border-amber-300/40 px-4 py-2 text-xs font-semibold text-amber-100"
                >
                  จบรอบเลย
                </button>
              </div>
            </div>
          ) : null}
          {hintText ? <p className="mt-3 text-xs text-indigo-200">{hintText}</p> : null}
          {feedback ? <p className="mt-2 text-sm text-amber-300">{feedback}</p> : null}
          {feedback === "ชนสิ่งกีดขวาง! เสียชีวิต 1" ? (
            <button
              onClick={() => void handleRestartRun()}
              disabled={restarting}
              className="mt-3 rounded-full border border-rose-300/50 bg-rose-400/15 px-4 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-400/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {restarting ? "กำลังเริ่มรอบใหม่..." : "เริ่มใหม่"}
            </button>
          ) : null}
        </section>
      </section>
    </AppShell>
  );
}
