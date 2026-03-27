import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { GAME_LAWS, selectLawProvisions } from "@/lib/game/laws";
import type { ProvisionRecord, TrackAvailabilityStatus } from "@/lib/game/types";

let cache: ProvisionRecord[] | null = null;

async function loadProvisions(): Promise<ProvisionRecord[]> {
  if (cache) return cache;
  const dataPath = path.join(process.cwd(), "data", "processed", "thai_niti_deduped.json");
  const raw = await readFile(dataPath, "utf-8");
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
  cache = parsed.map((row, idx) => ({
    id: `${row.law_title || "unknown"}-${row.section || "na"}-${idx}`,
    law_title: String(row.law_title || ""),
    section: String(row.section || ""),
    context_text: String(row.context_text || ""),
    split: String(row.split || ""),
  }));
  return cache;
}

function statusFromProvisionCount(count: number): TrackAvailabilityStatus {
  if (count <= 0) return "coming_soon";
  if (count <= 24) return "starter_pack";
  if (count <= 99) return "early_access";
  return "full";
}

function statusMeta(status: TrackAvailabilityStatus) {
  if (status === "coming_soon") {
    return {
      statusLabel: "เร็ว ๆ นี้",
      statusMessage: "แทร็กนี้ตั้งค่าไว้แล้วและกำลังเติมบทบัญญัติ",
      ctaLabel: "ขอแทร็กนี้",
      canStart: false,
    };
  }
  if (status === "starter_pack") {
    return {
      statusLabel: "แพ็กเริ่มต้น",
      statusMessage: "เริ่มฝึกบทบัญญัติแกนหลักระหว่างรอเนื้อหาฉบับเต็ม",
      ctaLabel: "เริ่มแพ็กเริ่มต้น",
      canStart: true,
    };
  }
  if (status === "early_access") {
    return {
      statusLabel: "เข้าถึงก่อน",
      statusMessage: "กำลังเพิ่มความครอบคลุม เริ่มฝึกจากบทบัญญัติที่มีได้เลย",
      ctaLabel: "เริ่มฝึก",
      canStart: true,
    };
  }
  return {
    statusLabel: "พร้อมเต็มแทร็ก",
    statusMessage: "มีความครอบคลุมครบสำหรับฝึกแบบเต็มรอบ",
    ctaLabel: "เข้าแทร็ก",
    canStart: true,
  };
}

export async function GET() {
  try {
    const records = await loadProvisions();
    const laws = GAME_LAWS.map((law) => {
      const count = selectLawProvisions(records, law.id).length;
      const status = statusFromProvisionCount(count);
      const meta = statusMeta(status);
      return {
        id: law.id,
        nameTh: law.nameTh,
        nameEn: law.nameEn,
        available: status === "full",
        provisionCount: count,
        status,
        statusLabel: meta.statusLabel,
        statusMessage: meta.statusMessage,
        ctaLabel: meta.ctaLabel,
        canStart: meta.canStart,
      };
    });
    return NextResponse.json({ laws });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
