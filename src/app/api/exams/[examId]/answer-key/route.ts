import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import { answerKeySchema } from "@/lib/validation/examSchemas";

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

  const questions = await prisma.question.findMany({
    where: { examId: params.examId },
    orderBy: { questionNumber: "asc" },
  });

  return NextResponse.json({ questions });
}

// PUT (not PATCH) because this is a full replace: whatever list of
// questions is sent becomes the entire answer key. Simpler mental model
// than trying to diff individual question edits, and matches how the
// answer-key form works (edit the whole list, save the whole list).
export async function PUT(
  req: NextRequest,
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

  const body = await req.json().catch(() => null);
  const parsed = answerKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid answer key", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const questions = parsed.data;

  // Replacing an answer key mid-exam-lifecycle would silently break any
  // Submissions/StudentResults already graded against the old key. For
  // Phase 3 we only guard the simple case: block replacement once
  // grading has started. Re-grading after a key correction is handled
  // properly in a later phase.
  const existingResultsCount = await prisma.studentResult.count({
    where: { examId: params.examId },
  });
  if (existingResultsCount > 0) {
    return NextResponse.json(
      {
        error:
          "This exam already has graded results. Editing the answer key after grading isn't supported yet.",
      },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.question.deleteMany({ where: { examId: params.examId } }),
    prisma.question.createMany({
      data: questions.map((q) => ({
        examId: params.examId,
        questionNumber: q.questionNumber,
        correctOption: q.correctOption,
        marks: q.marks,
      })),
    }),
  ]);

  const updated = await prisma.question.findMany({
    where: { examId: params.examId },
    orderBy: { questionNumber: "asc" },
  });

  return NextResponse.json({ questions: updated });
}
