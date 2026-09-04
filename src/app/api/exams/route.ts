import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { createExamSchema } from "@/lib/validation/examSchemas";

export async function GET() {
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const exams = await prisma.exam.findMany({
    where: { ownerId: session.userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });

  return NextResponse.json({ exams });
}

export async function POST(req: NextRequest) {
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createExamSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { title, passingPercentage, questions } = parsed.data;

  // Guard against duplicate question numbers even when creating inline,
  // same rule as the standalone answer-key endpoint.
  const questionNumbers = questions.map((q) => q.questionNumber);
  if (new Set(questionNumbers).size !== questionNumbers.length) {
    return NextResponse.json(
      { error: "Answer key has duplicate question numbers" },
      { status: 400 }
    );
  }

  // A Prisma transaction: either both the exam AND its questions get
  // created, or neither does. Without this, a crash between the two
  // writes could leave an exam with no answer key and no way to retry
  // cleanly.
  const exam = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const createdExam = await tx.exam.create({
      data: { title, passingPercentage, ownerId: session.userId },
    });

    if (questions.length > 0) {
      await tx.question.createMany({
        data: questions.map((q) => ({
          examId: createdExam.id,
          questionNumber: q.questionNumber,
          correctOption: q.correctOption,
          marks: q.marks,
        })),
      });
    }

    return createdExam;
  });

  return NextResponse.json({ exam }, { status: 201 });
}
