"use client";

import { FormEvent, useState } from "react";

type SearchBoxProps = {
  onSearch: (query: string) => Promise<void> | void;
  loading: boolean;
};

export default function SearchBox({ onSearch, loading }: SearchBoxProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    await onSearch(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="พิมพ์คำถามกฎหมายไทย เช่น บริษัทจำกัดสามารถทำธุรกิจธนาคารพาณิชย์ได้หรือไม่"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-blue-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "กำลังค้นหา..." : "ค้นหาคำตอบ"}
        </button>
      </div>
    </form>
  );
}
