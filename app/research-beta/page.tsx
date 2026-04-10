"use client";

import { useEffect, useRef, useState } from "react";

import AppShell from "@/components/mvp/AppShell";
import { GAME_LAWS } from "@/lib/game/laws";
import type { LawId } from "@/lib/game/types";

const RESEARCH_ACCESS_KEY = "thai-niti:research-access";
const CORRECT_PASSCODE = "ThaiNitiinthefuture";

const LAW_OPTIONS: { id: LawId; label: string }[] = GAME_LAWS.map((l) => ({ id: l.id, label: l.nameTh }));

type SearchResult = {
  section: string;
  lawTitle: string;
  text: string;
};

function PasscodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === CORRECT_PASSCODE) {
      localStorage.setItem(RESEARCH_ACCESS_KEY, "true");
      onUnlock();
    } else {
      setError("รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
      setPasscode("");
      inputRef.current?.focus();
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#02054e] via-[#02054e] to-[#111560] text-slate-100">
      <div className="screen-aura" />
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="glass-panel w-full rounded-3xl border border-violet-300/25 bg-gradient-to-b from-violet-900/30 to-indigo-900/20 p-8 shadow-[0_20px_60px_rgba(5,10,55,0.45)]">
          <div className="mb-6 text-center">
            <span className="text-4xl">🔬</span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white">ห้องปฏิบัติการวิจัยกฎหมาย</h1>
            <p className="mt-2 text-sm text-violet-200/80">ศูนย์วิจัยกฎหมายขั้นสูง — ต้องใช้รหัสผ่านเพื่อเข้าถึง</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="passcode" className="mb-1.5 block text-sm font-semibold text-slate-200">
                รหัสผ่านการเข้าถึง
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  id="passcode"
                  type={showPasscode ? "text" : "password"}
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    setError("");
                  }}
                  placeholder="กรอกรหัสผ่าน…"
                  autoComplete="off"
                  className="w-full rounded-xl border border-violet-300/30 bg-slate-900/60 px-4 py-3 pr-12 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  aria-label={showPasscode ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPasscode ? "🙈" : "👁"}
                </button>
              </div>
              {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
            </div>

            <button
              type="submit"
              disabled={!passcode}
              className="w-full rounded-full bg-violet-500 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_10px_24px_rgba(139,92,246,0.35)] transition hover:-translate-y-0.5 hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              เข้าสู่ห้องวิจัย
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">รหัสผ่านมีให้แก่ผู้ที่ได้รับสิทธิ์เข้าถึงพิเศษเท่านั้น</p>
        </div>
      </div>
    </main>
  );
}

function ResearchInterface({ onLock }: { onLock: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedLaw, setSelectedLaw] = useState<LawId | "all">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setSearched(false);
    try {
      const { searchProvisions } = await import("@/lib/game/provisions");
      const rawResults = await searchProvisions(trimmed, selectedLaw === "all" ? undefined : selectedLaw);
      setResults(rawResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ค้นหาไม่สำเร็จ กรุณาลองใหม่");
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleLock = () => {
    localStorage.removeItem(RESEARCH_ACCESS_KEY);
    onLock();
  };

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-3xl border border-violet-300/25 bg-gradient-to-b from-violet-900/30 to-indigo-900/20 p-6 shadow-[0_20px_60px_rgba(5,10,55,0.45)] sm:p-8">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-violet-300/15 blur-3xl" />
        <div className="absolute -left-8 bottom-0 h-36 w-36 rounded-full bg-indigo-300/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200/90">ห้องปฏิบัติการวิจัยกฎหมาย</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">โหมดวิจัย</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-200">ค้นคว้าบทบัญญัติกฎหมายไทยเชิงลึก — ค้นหา วิเคราะห์ และอ้างอิงมาตราต่าง ๆ ได้โดยตรง</p>
          </div>
          <button
            onClick={handleLock}
            className="rounded-full border border-violet-300/30 bg-violet-900/40 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-800/60"
          >
            🔒 ออกจากโหมดวิจัย
          </button>
        </div>
      </section>

      <section className="glass-panel mt-4 rounded-2xl border border-violet-300/20 p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-100">ค้นหาบทบัญญัติ</h2>
        <form onSubmit={(e) => void handleSearch(e)} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์คำค้นหา เช่น สัญญา, ผิดนัด, ค่าเสียหาย…"
              className="flex-1 rounded-xl border border-violet-300/30 bg-slate-900/60 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20"
            />
            <select
              value={selectedLaw}
              onChange={(e) => setSelectedLaw(e.target.value as LawId | "all")}
              className="rounded-xl border border-violet-300/30 bg-slate-900/60 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20 sm:w-52"
            >
              <option value="all">ทุกกฎหมาย</option>
              {LAW_OPTIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="rounded-full bg-violet-500 px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-[0_10px_24px_rgba(139,92,246,0.3)] transition hover:-translate-y-0.5 hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "กำลังค้นหา…" : "ค้นหา"}
          </button>
        </form>
        {error ? <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-950/20 p-3 text-sm text-rose-100">{error}</p> : null}
      </section>

      {searched && !loading ? (
        <section className="mt-4">
          {results.length === 0 ? (
            <div className="glass-panel rounded-2xl border border-violet-300/20 p-5 text-center text-sm text-slate-400">ไม่พบผลการค้นหาสำหรับ &ldquo;{query}&rdquo;</div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">พบ {results.length} ผลลัพธ์</p>
              {results.map((r, i) => (
                <div key={i} className="glass-panel rounded-2xl border border-violet-300/15 bg-slate-900/50 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-violet-400/30 bg-violet-900/40 px-2.5 py-0.5 text-xs font-semibold text-violet-200">
                      {r.section}
                    </span>
                    <span className="text-xs text-slate-400">{r.lawTitle}</span>
                  </div>
                  <p className="text-sm leading-7 text-slate-200">{r.text}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="glass-panel rounded-2xl border border-violet-300/15 p-4">
          <p className="text-2xl">⚖️</p>
          <h3 className="mt-2 text-sm font-semibold text-slate-100">ค้นหาข้ามกฎหมาย</h3>
          <p className="mt-1 text-xs text-slate-400">ค้นหาบทบัญญัติในหลายประมวลกฎหมายพร้อมกัน</p>
        </div>
        <div className="glass-panel rounded-2xl border border-violet-300/15 p-4">
          <p className="text-2xl">📖</p>
          <h3 className="mt-2 text-sm font-semibold text-slate-100">อ่านตามบริบท</h3>
          <p className="mt-1 text-xs text-slate-400">ดูมาตราพร้อมมาตราข้างเคียงเพื่อเข้าใจบริบทกฎหมาย</p>
        </div>
        <div className="glass-panel rounded-2xl border border-violet-300/15 p-4">
          <p className="text-2xl">🔗</p>
          <h3 className="mt-2 text-sm font-semibold text-slate-100">เชื่อมโยงมาตรา</h3>
          <p className="mt-1 text-xs text-slate-400">ค้นหาความสัมพันธ์ระหว่างบทบัญญัติต่าง ๆ</p>
        </div>
      </section>
    </AppShell>
  );
}

export default function ResearchBetaPage() {
  const [accessGranted, setAccessGranted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = localStorage.getItem(RESEARCH_ACCESS_KEY);
      if (stored === "true") setAccessGranted(true);
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#02054e] via-[#02054e] to-[#111560] text-slate-100">
        <div className="screen-aura" />
      </main>
    );
  }

  if (!accessGranted) {
    return <PasscodeGate onUnlock={() => setAccessGranted(true)} />;
  }

  return <ResearchInterface onLock={() => setAccessGranted(false)} />;
}
