export type LawId =
  | "ccc"
  | "cpc"
  | "pc"
  | "crpc"
  | "evidence"
  | "revenue"
  | "bankruptcy"
  | "juvenile"
  | "ip"
  | "land"
  | "labor"
  | "consumer";

export type ProvisionRecord = {
  id: string;
  law_title: string;
  section: string;
  context_text: string;
  split?: string;
};

export type GameLaw = {
  id: LawId;
  nameTh: string;
  nameEn: string;
  titlePatterns: string[];
};

export type TrackAvailabilityStatus = "coming_soon" | "starter_pack" | "early_access" | "full";

export type ClozeQuestion = {
  id: string;
  lawId: LawId;
  lawTitle: string;
  section: string;
  originalText: string;
  promptText: string;
  blanks: string[];
  level: number;
  questionInLevel: number;
  isBonus: boolean;
};

export type RunProvision = ProvisionRecord & {
  lawId: LawId;
};

export type RunSnapshot = {
  selectedLawId: LawId;
  selectedLawName: string;
  questions: ClozeQuestion[];
  currentIndex: number;
  level: number;
  questionInLevel: number;
  lives: number;
  bonusPending: boolean;
  gameOver: boolean;
  completed: boolean;
  completedCount: number;
  correctCount: number;
  wrongCount: number;
  score?: number;
  streak?: number;
  bestStreak?: number;
  hintsUsed?: number;
  responseTimesMs?: number[];
  questionTimeLimitsMs?: number[];
  bonusUsed: boolean;
  bonusQuestion?: ClozeQuestion;
  missed: Array<{
    questionId: string;
    lawId?: LawId;
    lawName?: string;
    section: string;
    promptText: string;
    expected: string[];
    userAnswer: string[];
    mistakeAt?: string;
  }>;
  correct: Array<{
    questionId: string;
    section: string;
    promptText: string;
    expected: string[];
  }>;
  startedAt: string;
  endedAt?: string;
};

export type MistakeHistoryItem = {
  id: string;
  lawId: LawId;
  lawName: string;
  section: string;
  questionId: string;
  expected: string[];
  userAnswer: string[];
  mistakeAt: string;
};

export type CompletionSummary = {
  id: string;
  lawId: LawId;
  lawName: string;
  completedAt: string;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  score?: number;
  bestStreak?: number;
  avgResponseMs?: number;
  avgQuestionTimeLimitMs?: number;
  avgSpeedMultiplier?: number;
  bonusUsed: boolean;
  missedSections: string[];
};
