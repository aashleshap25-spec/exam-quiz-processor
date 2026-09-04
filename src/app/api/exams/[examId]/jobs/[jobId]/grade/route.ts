import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import { runWithConcurrency, simulateGradingDelay } from "@/lib/concurrency";
import { gradeStudent, percentileRank, GradableAnswer, StudentGradeResult } from "@/lib/grading";
import { GRADING_CONCURRENCY } from "@/lib/uploadLimits";
import { logger, newCorrelationId } from "@/lib/logger";
import { recomputeExamAnalytics } from "@/lib/analytics";

// POST: trigger (or re-trigger) grading for a submission job. Runs the
// worker pool in the background — the route responds as soon as the job
// is marked PROCESSING, and the client polls GET .../jobs/[jobId] for
// live progress. This assumes a long-lived Node server process (`next
// start`), not a short-lived serverless function — documented in the
// README as a deliberate scope tradeoff.
export async function POST(
  _req: NextRequest,
  { params }: { params: { examId: string; jobId: string } }
) {
  const correlationId = newCorrelationId();
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const exam = await getOwnedExam(params.examId, session.userId);
  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const job = await prisma.submissionJob.findFirst({
    where: { id: params.jobId, examId: exam.id },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status === "PROCESSING") {
    return NextResponse.json({ error: "This job is already grading" }, { status: 409 });
  }

  // Mark PROCESSING synchronously so a second click can't double-trigger
  // the same job before the background task has had a chance to update it.
  const startedJob = await prisma.submissionJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING", startedAt: new Date(), processedRows: 0 },
  });

  logger.info("grading_job_started", { correlationId, examId: exam.id, jobId: job.id });

  // Fire-and-forget: intentionally not awaited so the HTTP response
  // returns immediately.
  runGradingJob(exam.id, job.id, correlationId).catch((err) => {
    logger.error("grading_job_uncaught_error", { correlationId, examId: exam.id, jobId: job.id, error: String(err) });
  });

  return NextResponse.json({ job: startedJob }, { status: 202 });
}

async function runGradingJob(examId: string, jobId: string, correlationId: string) {
  try {
    const [questions, validSubmissions, exam] = await Promise.all([
      prisma.question.findMany({ where: { examId } }),
      prisma.submission.findMany({ where: { jobId, validationStatus: "VALID" } }),
      prisma.exam.findUnique({ where: { id: examId } }),
    ]);

    if (!exam) throw new Error("Exam no longer exists");
    if (questions.length === 0) throw new Error("Answer key is empty — nothing to grade against");

    // Group each student's valid answers by question number.
    const byStudent = new Map<string, { studentName: string | null; answers: Map<number, string | null> }>();
    for (const sub of validSubmissions) {
      if (!byStudent.has(sub.studentId)) {
        byStudent.set(sub.studentId, { studentName: sub.studentName, answers: new Map() });
      }
      byStudent.get(sub.studentId)!.answers.set(sub.questionNumber, sub.selectedOption);
    }

    const studentIds = Array.from(byStudent.keys());

    if (studentIds.length === 0) {
      await prisma.submissionJob.update({
        where: { id: jobId },
        data: { status: "COMPLETED", completedAt: new Date(), processedRows: 0, studentsTotal: 0 },
      });
      logger.warn("grading_job_no_valid_submissions", { correlationId, examId, jobId });
      return;
    }

    await prisma.submissionJob.update({
      where: { id: jobId },
      data: { studentsTotal: studentIds.length },
    });

    const graded: { studentId: string; studentName: string | null; result: StudentGradeResult }[] = [];

    await runWithConcurrency(
      studentIds,
      GRADING_CONCURRENCY,
      async (studentId) => {
        // Simulated per-submission grading cost — makes the worker pool's
        // concurrency actually matter at scale (see concurrency.ts).
        await simulateGradingDelay();

        const student = byStudent.get(studentId)!;
        const answers: GradableAnswer[] = questions.map((q) => ({
          questionId: q.id,
          questionNumber: q.questionNumber,
          correctOption: q.correctOption,
          marks: q.marks,
          selectedOption: student.answers.get(q.questionNumber) ?? null,
        }));

        const result = gradeStudent(answers, exam.passingPercentage);
        graded.push({ studentId, studentName: student.studentName, result });
        return result;
      },
      (completed, total) => {
        // Throttled progress writes — every 10 students or on completion —
        // so a large batch doesn't hammer the DB with per-item updates.
        if (completed % 10 === 0 || completed === total) {
          prisma.submissionJob
            .update({ where: { id: jobId }, data: { processedRows: completed } })
            .catch((err) => logger.warn("grading_progress_update_failed", { correlationId, jobId, error: String(err) }));
        }
      }
    );

    // Percentile rank needs the full class distribution, so it's computed
    // once all students in this job are graded.
    const allPercentages = graded.map((g) => g.result.percentage);

    // Persist each student's result + question breakdown concurrently
    // (bounded pool, same as the grading phase) rather than one-at-a-time —
    // at 10k+ students, a sequential await-per-student loop here would
    // dominate the job's wall-clock time even though the CPU-bound grading
    // itself was already parallelized. Each student's writes are isolated
    // in their own transaction, so concurrent execution is safe.
    const persistResults = await runWithConcurrency(
      graded,
      GRADING_CONCURRENCY,
      async (g) => {
        const percentile = percentileRank(g.result.percentage, allPercentages);

        await prisma.$transaction(async (tx) => {
          const studentResult = await tx.studentResult.upsert({
            where: { examId_studentId: { examId, studentId: g.studentId } },
            create: {
              examId,
              studentId: g.studentId,
              studentName: g.studentName,
              totalScore: g.result.totalScore,
              maxScore: g.result.maxScore,
              percentage: g.result.percentage,
              percentileRank: percentile,
              passed: g.result.passed,
            },
            update: {
              studentName: g.studentName,
              totalScore: g.result.totalScore,
              maxScore: g.result.maxScore,
              percentage: g.result.percentage,
              percentileRank: percentile,
              passed: g.result.passed,
            },
          });

          await tx.questionResult.deleteMany({ where: { studentResultId: studentResult.id } });
          await tx.questionResult.createMany({
            data: g.result.questionResults.map((qr) => ({
              studentResultId: studentResult.id,
              questionId: qr.questionId,
              selectedOption: qr.selectedOption,
              isCorrect: qr.isCorrect,
              isUnattempted: qr.isUnattempted,
            })),
          });
        });
      }
    );

    const persistFailures = persistResults.filter((r) => r.status === "rejected");
    if (persistFailures.length > 0) {
      // Don't crash the whole job over a handful of failed writes (e.g. a
      // transient DB hiccup on one student) — log which students were
      // affected so the instructor can re-run grading to pick them up.
      logger.warn("grading_persist_partial_failure", {
        correlationId,
        examId,
        jobId,
        failedCount: persistFailures.length,
        sampleStudentIds: persistFailures.slice(0, 10).map((r) => r.item.studentId),
      });
    }

    // Recompute exam-wide analytics from every currently-graded student
    // (not just this job's batch) — a later job may have added more
    // students to the same exam.
    await recomputeExamAnalytics(examId);

    await prisma.submissionJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", completedAt: new Date(), processedRows: studentIds.length },
    });

    logger.info("grading_job_completed", {
      correlationId,
      examId,
      jobId,
      studentsGraded: studentIds.length,
    });
  } catch (err) {
    logger.error("grading_job_failed", { correlationId, examId, jobId, error: String(err) });
    await prisma.submissionJob
      .update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date(), errorMessage: String(err).slice(0, 500) },
      })
      .catch(() => {});
  }
}
