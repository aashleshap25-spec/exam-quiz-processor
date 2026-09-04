import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import { z } from "zod";

export async function GET(
  _req: NextRequest,
  { params }: { params: { examId: string } }
) {
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, ownerId: session.userId },
    include: { questions: { orderBy: { questionNumber: "asc" } } },
  });

  // 404, not 403 — we don't want to confirm to a user that an exam ID
  // exists at all if it isn't theirs.
  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  return NextResponse.json({ exam });
}

const updateExamSchema = z.object({
  title: z.string().trim().min(3).optional(),
  passingPercentage: z.number().min(0).max(100).optional(),
});

export async function PATCH(
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
  const parsed = updateExamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const exam = await prisma.exam.update({
    where: { id: params.examId },
    data: parsed.data,
  });

  return NextResponse.json({ exam });
}
