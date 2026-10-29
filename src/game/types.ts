export type MediaType = 'image' | 'video';

export interface Media {
  type: MediaType;
  dataUrl: string;
}

export interface Answer {
  id: string;
  text: string;
  media: Media | null;
}

export type QuestionType = 'quiz' | 'truefalse' | 'type';

/** 1 = standard, 2 = double points, 0 = no points. */
export type PointsMultiplier = 0 | 1 | 2;

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  seconds: number;
  media: Media | null;
  answers: Answer[];
  correctIndex: number;
  /** Accepted typed answers, separated by `|`. */
  typeAnswer: string;
  pointsMultiplier?: PointsMultiplier;
}

export interface Quiz {
  id: string;
  title: string;
  folderId: string;
  cover: string | null;
  shuffleAnswers: boolean;
  updatedAt: number;
  questions: Question[];
  sharedOriginalId?: string;
}

export interface Folder {
  id: string;
  name: string;
  updatedAt: number;
}

export type RoomPhase =
  | 'lobby'
  | 'countdown'
  | 'question_media'
  | 'question_answers'
  | 'paused'
  | 'locked'
  | 'answer_results'
  | 'leaderboard'
  | 'final'
  | 'ended';

export interface PauseWindow {
  from: number;
  to?: number;
}

export interface Player {
  name: string;
  joinedAt: number;
  lastSeenAt?: number;
  avatarEmoji?: string;
  avatarColor?: string;
  score: number;
  streak: number;
  streakMsg?: string;
  currentAnswerIndex?: number | null;
  currentTypedAnswer?: string | null;
  /** Server timestamp of the answer. */
  answerAt?: number;
  /** Question index the current answer belongs to (-1 = none). */
  answerQ?: number;
  lastAnswered?: boolean;
  lastCorrect?: boolean;
  lastDelta?: number;
  lastBonus?: number;
  lastAnswerMs?: number;
  rank?: number;
  prevRank?: number | null;
  behindName?: string;
  behindBy?: number;
}

export interface Room {
  code: string;
  hostUid: string;
  hostName: string;
  quiz: Quiz;
  currentQ: number;
  phase: RoomPhase;
  countdownEndsAt?: number;
  currentQuestionStartedAt?: number;
  currentQuestionDurationMs?: number;
  currentQuestionEndsAt?: number;
  currentRemainingMs?: number;
  paused?: boolean;
  pauseWindows?: Record<string, PauseWindow> | null;
  activePauseId?: string | null;
  scoredQ?: number;
  endedEarly?: boolean;
  players?: Record<string, Player>;
  updatedAt: number;
}

export type PlayerWithId = Player & { id: string };

/** Fields written onto each player when a question's results are revealed. */
export type PlayerResult = Required<
  Pick<
    Player,
    | 'lastAnswered'
    | 'lastCorrect'
    | 'lastDelta'
    | 'lastBonus'
    | 'lastAnswerMs'
    | 'score'
    | 'streak'
    | 'streakMsg'
    | 'rank'
    | 'behindName'
    | 'behindBy'
  >
> & { prevRank: number | null };

export interface AppSettings {
  defaultSeconds: number;
  defaultQuestionType: QuestionType;
}
