import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";

export async function GET(
  _req: NextRequest,
  { params }: { params: { examId: string; studentId: string } }
) {
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owned = await getOwnedExam(params.examId, session.userId);
  if (!owned) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const result = await prisma.studentResult.findUnique({
    where: { examId_studentId: { examId: params.examId, studentId: params.studentId } },
    include: {
      questionResults: {
        include: { question: true },
        orderBy: { question: { questionNumber: "asc" } },
      },
    },
  });

  if (!result) {
    return NextResponse.json({ error: "No result found for this student on this exam" }, { status: 404 });
  }

  const breakdown = result.questionResults.map((qr) => ({
    questionNumber: qr.question.questionNumber,
    correctOption: qr.question.correctOption,
    marks: qr.question.marks,
    selectedOption: qr.selectedOption,
    isCorrect: qr.isCorrect,
    isUnattempted: qr.isUnattempted,
  }));

  return NextResponse.json({ result, breakdown });
}
