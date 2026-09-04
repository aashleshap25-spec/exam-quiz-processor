// Pure math functions for grading and class-level statistics. Kept free of
// Prisma/DB types so they're easy to unit test in isolation — the API route
// is responsible for wiring DB rows in and results back out.

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

// Percentile rank: the % of scores strictly below this student's score.
// (Standard "percentage of the class you outperformed" definition.)
export function percentileRank(score: number, allScores: number[]): number {
  if (allScores.length <= 1) return 100;
  const below = allScores.filter((s) => s < score).length;
  return (below / allScores.length) * 100;
}

export type GradableAnswer = {
  questionId: string;
  questionNumber: number;
  correctOption: string;
  marks: number;
  selectedOption: string | null; // null = unattempted
};

export type QuestionResultComputed = {
  questionId: string;
  selectedOption: string | null;
  isCorrect: boolean;
  isUnattempted: boolean;
};

export type StudentGradeResult = {
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  questionResults: QuestionResultComputed[];
};

// Grades a single student's answers against the answer key. This is the
// unit of work the concurrent worker pool fans out over.
export function gradeStudent(
  answers: GradableAnswer[],
  passingPercentage: number
): StudentGradeResult {
  let totalScore = 0;
  let maxScore = 0;
  const questionResults: QuestionResultComputed[] = [];

  for (const answer of answers) {
    maxScore += answer.marks;
    const isUnattempted = answer.selectedOption === null;
    const isCorrect =
      !isUnattempted &&
      answer.selectedOption?.toUpperCase() === answer.correctOption.toUpperCase();

    if (isCorrect) totalScore += answer.marks;

    questionResults.push({
      questionId: answer.questionId,
      selectedOption: answer.selectedOption,
      isCorrect,
      isUnattempted,
    });
  }

  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  return {
    totalScore,
    maxScore,
    percentage,
    passed: percentage >= passingPercentage,
    questionResults,
  };
}

export type QuestionStat = {
  questionNumber: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  totalAttempts: number;
  percentWrong: number; // difficulty index
};

export function computeQuestionStats(
  questionNumber: number,
  results: QuestionResultComputed[]
): QuestionStat {
  const correctCount = results.filter((r) => r.isCorrect).length;
  const unattemptedCount = results.filter((r) => r.isUnattempted).length;
  const incorrectCount = results.length - correctCount - unattemptedCount;
  const totalAttempts = results.length;
  const percentWrong = totalAttempts > 0 ? (incorrectCount / totalAttempts) * 100 : 0;

  return {
    questionNumber,
    correctCount,
    incorrectCount,
    unattemptedCount,
    totalAttempts,
    percentWrong,
  };
}

export type ClassAnalytics = {
  averageScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  standardDeviation: number;
  passCount: number;
  failCount: number;
};

export function computeClassAnalytics(
  scores: number[],
  passedFlags: boolean[]
): ClassAnalytics {
  return {
    averageScore: mean(scores),
    medianScore: median(scores),
    highestScore: scores.length ? Math.max(...scores) : 0,
    lowestScore: scores.length ? Math.min(...scores) : 0,
    standardDeviation: standardDeviation(scores),
    passCount: passedFlags.filter(Boolean).length,
    failCount: passedFlags.filter((p) => !p).length,
  };
}
