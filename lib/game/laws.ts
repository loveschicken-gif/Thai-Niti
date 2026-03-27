import type { GameLaw, LawId, ProvisionRecord } from "@/lib/game/types";

export const GAME_LAWS: GameLaw[] = [
  {
    id: "ccc",
    nameTh: "ประมวลกฎหมายแพ่งและพาณิชย์",
    nameEn: "Civil and Commercial Code",
    titlePatterns: ["ประมวลกฎหมายแพ่งและพาณิชย์"],
  },
  {
    id: "cpc",
    nameTh: "ประมวลกฎหมายวิธีพิจารณาความแพ่ง",
    nameEn: "Civil Procedure Code",
    titlePatterns: ["ประมวลกฎหมายวิธีพิจารณาความแพ่ง"],
  },
  {
    id: "pc",
    nameTh: "ประมวลกฎหมายอาญา",
    nameEn: "Penal Code",
    titlePatterns: ["ประมวลกฎหมายอาญา"],
  },
  {
    id: "crpc",
    nameTh: "ประมวลกฎหมายวิธีพิจารณาความอาญา",
    nameEn: "Criminal Procedure Code",
    titlePatterns: ["ประมวลกฎหมายวิธีพิจารณาความอาญา"],
  },
  {
    id: "evidence",
    nameTh: "กฎหมายลักษณะพยาน",
    nameEn: "Law of Evidence",
    titlePatterns: [],
  },
  {
    id: "revenue",
    nameTh: "ประมวลรัษฎากร",
    nameEn: "Revenue Code",
    titlePatterns: ["ประมวลรัษฎากร"],
  },
  {
    id: "bankruptcy",
    nameTh: "พระราชบัญญัติล้มละลาย",
    nameEn: "Bankruptcy Act",
    titlePatterns: ["พระราชบัญญัติล้มละลาย"],
  },
  {
    id: "juvenile",
    nameTh: "พระราชบัญญัติศาลเยาวชนและครอบครัว",
    nameEn: "Juvenile and Family Court Act",
    titlePatterns: ["พระราชบัญญัติศาลเยาวชนและครอบครัว"],
  },
  {
    id: "ip",
    nameTh: "กฎหมายทรัพย์สินทางปัญญา",
    nameEn: "Intellectual Property Laws",
    titlePatterns: [
      "พระราชบัญญัติลิขสิทธิ์",
      "พระราชบัญญัติสิทธิบัตร",
      "พระราชบัญญัติเครื่องหมายการค้า",
      "พระราชบัญญัติความลับทางการค้า",
    ],
  },
  {
    id: "land",
    nameTh: "ประมวลกฎหมายที่ดิน",
    nameEn: "Land Code",
    titlePatterns: ["ประมวลกฎหมายที่ดิน"],
  },
  {
    id: "labor",
    nameTh: "พระราชบัญญัติคุ้มครองแรงงาน",
    nameEn: "Labor Protection Act",
    titlePatterns: ["พระราชบัญญัติคุ้มครองแรงงาน"],
  },
  {
    id: "consumer",
    nameTh: "พระราชบัญญัติคุ้มครองผู้บริโภค",
    nameEn: "Consumer Protection Act",
    titlePatterns: ["พระราชบัญญัติคุ้มครองผู้บริโภค"],
  },
];

export function getLawById(id: LawId): GameLaw | undefined {
  return GAME_LAWS.find((law) => law.id === id);
}

const NON_STATUTORY_TITLE_MARKERS = [
  "ราชกิจจานุเบกษา",
  "ประกาศ",
  "กฎกระทรวง",
  "ระเบียบ",
  "คำสั่ง",
  "คำพิพากษา",
  "ฎีกา",
  "judgment",
  "gazette",
  "regulation",
  "announcement",
];

export function isStatuteTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return false;
  const belongsToAllowedStatute = GAME_LAWS.some((law) => law.titlePatterns.some((pattern) => normalized.includes(pattern.toLowerCase())));
  if (!belongsToAllowedStatute) return false;
  return !NON_STATUTORY_TITLE_MARKERS.some((marker) => normalized.includes(marker));
}

export function isAllowedGameProvisionTitle(title: string, lawId: LawId): boolean {
  if (lawId === "evidence") return false;
  const law = getLawById(lawId);
  if (!law) return false;
  const normalized = title.trim().toLowerCase();
  const inSelectedStatute = law.titlePatterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
  if (!inSelectedStatute) return false;
  return isStatuteTitle(title);
}

type SectionRange = {
  from: number;
  to: number;
};

const EVIDENCE_SECTION_RANGES: Record<"cpc" | "crpc", SectionRange[]> = {
  cpc: [
    { from: 84, to: 130 },
  ],
  crpc: [
    { from: 226, to: 244 },
  ],
};

function parseSectionNumber(section: string): number | null {
  const match = section.match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function inRanges(value: number, ranges: SectionRange[]): boolean {
  return ranges.some((range) => value >= range.from && value <= range.to);
}

function isEvidenceProvision(record: ProvisionRecord): boolean {
  const sectionNumber = parseSectionNumber(record.section);
  if (sectionNumber === null) return false;
  const inCpc = isAllowedGameProvisionTitle(record.law_title, "cpc") && inRanges(sectionNumber, EVIDENCE_SECTION_RANGES.cpc);
  if (inCpc) return true;
  return isAllowedGameProvisionTitle(record.law_title, "crpc") && inRanges(sectionNumber, EVIDENCE_SECTION_RANGES.crpc);
}

export function selectLawProvisions(records: ProvisionRecord[], lawId: LawId): ProvisionRecord[] {
  if (lawId === "evidence") {
    return records.filter(isEvidenceProvision);
  }
  return records.filter((record) => isAllowedGameProvisionTitle(record.law_title, lawId));
}

export function missingWordsForLevel(level: number): number {
  if (level <= 3) return 1;
  if (level <= 6) return 2;
  if (level <= 8) return 3;
  return 4;
}
