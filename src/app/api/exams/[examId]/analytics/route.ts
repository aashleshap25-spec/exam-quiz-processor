import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import { computeQuestionStats } from "@/lib/grading";
import { recomputeExamAnalytics } from "@/lib/analytics";
import { logger, newCorrelationId } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: { examId: string } }
) {
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owned = await getOwnedExam(params.examId, session.userId);
  if (!owned) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const [analytics, questions, allResults] = await Promise.all([
    prisma.examAnalytics.findUnique({ where: { examId: params.examId } }),
    prisma.question.findMany({
      where: { examId: params.examId },
      orderBy: { questionNumber: "asc" },
      include: { questionResults: true },
    }),
    prisma.studentResult.findMany({ where: { examId: params.examId }, select: { percentage: true, passed: true } }),
  ]);
  const resultCount = allResults.length;

  // Score distribution histogram — ten 10-point buckets (0-10, 10-20, ...).
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    rangeLabel: `${i * 10}-${i * 10 + 10}`,
    count: 0,
  }));
  for (const r of allResults) {
    const idx = Math.min(9, Math.floor(r.percentage / 10));
    buckets[idx].count++;
  }

  const questionStats = questions.map((q) =>
    computeQuestionStats(
      q.questionNumber,
      q.questionResults.map((qr) => ({
        questionId: qr.questionId,
        selectedOption: qr.selectedOption,
        isCorrect: qr.isCorrect,
        isUnattempted: qr.isUnattempted,
      }))
    )
  );

  return NextResponse.json({ analytics, questionStats, scoreDistribution: buckets, studentsGraded: resultCount });
}

// Re-run aggregation/statistics on demand without re-grading — e.g. if the
// user just wants fresh numbers (this recomputes purely from the
// StudentResults already stored; use the job's /grade endpoint to re-grade
// against a corrected answer key).
export async function POST(
  _req: NextRequest,
  { params }: { params: { examId: string } }
) {
  const correlationId = newCorrelationId();
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owned = await getOwnedExam(params.examId, session.userId);
  if (!owned) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const stats = await recomputeExamAnalytics(params.examId);
  logger.info("analytics_recomputed", { correlationId, examId: params.examId });

  return NextResponse.json({ analytics: stats });
}
