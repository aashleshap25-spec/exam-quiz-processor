import { prisma } from "@/lib/prisma";
import { computeClassAnalytics } from "@/lib/grading";

// Recomputes exam-wide analytics (average/median/high/low/stddev/pass-fail)
// from whatever StudentResults currently exist for the exam. Cheap enough
// to call standalone (no re-grading) whenever a user just wants fresh
// stats, and it's reused right after grading completes.
export async function recomputeExamAnalytics(examId: string) {
  const results = await prisma.studentResult.findMany({ where: { examId } });
  const scores = results.map((r) => r.percentage);
  const passedFlags = results.map((r) => r.passed);
  const stats = computeClassAnalytics(scores, passedFlags);

  await prisma.examAnalytics.upsert({
    where: { examId },
    create: { examId, ...stats },
    update: { ...stats },
  });

  return stats;
}
