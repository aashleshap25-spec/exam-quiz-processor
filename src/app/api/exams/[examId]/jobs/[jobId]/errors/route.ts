import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";

// Lets the instructor come back to an older upload job (not just the one
// they just submitted) and see exactly which rows were flagged and why.
// Capped at 200 rows per request — for the full picture on a huge job,
// the annotated CSV export (exam-wide) is the right tool.
export async function GET(
  req: NextRequest,
  { params }: { params: { examId: string; jobId: string } }
) {
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owned = await getOwnedExam(params.examId, session.userId);
  if (!owned) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const job = await prisma.submissionJob.findFirst({
    where: { id: params.jobId, examId: params.examId },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));

  const [rows, invalidCount, duplicateCount] = await Promise.all([
    prisma.submission.findMany({
      where: { jobId: job.id, validationStatus: { in: ["INVALID", "DUPLICATE"] } },
      orderBy: { createdAt: "asc" },
      take: limit,
    }),
    prisma.submission.count({ where: { jobId: job.id, validationStatus: "INVALID" } }),
    prisma.submission.count({ where: { jobId: job.id, validationStatus: "DUPLICATE" } }),
  ]);

  return NextResponse.json({
    total: invalidCount + duplicateCount,
    invalidCount,
    duplicateCount,
    rows: rows.map((r) => ({
      studentId: r.studentId,
      questionNumber: r.questionNumber === -1 ? null : r.questionNumber,
      selectedOption: r.selectedOption,
      status: r.validationStatus,
      reason: r.errorReason,
    })),
  });
}
