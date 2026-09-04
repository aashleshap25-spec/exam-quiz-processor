import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";

// Polled by the UI while grading runs to drive the progress bar (no
// WebSockets needed for this scale — see README for the tradeoff).
export async function GET(
  _req: NextRequest,
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
    include: {
      _count: {
        select: {
          submissions: true,
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const [validCount, invalidCount, duplicateCount] = await Promise.all([
    prisma.submission.count({ where: { jobId: job.id, validationStatus: "VALID" } }),
    prisma.submission.count({ where: { jobId: job.id, validationStatus: "INVALID" } }),
    prisma.submission.count({ where: { jobId: job.id, validationStatus: "DUPLICATE" } }),
  ]);

  return NextResponse.json({
    job,
    validation: { valid: validCount, invalid: invalidCount, duplicate: duplicateCount },
  });
}
