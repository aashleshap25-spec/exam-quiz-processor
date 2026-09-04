import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import type { Prisma } from "@prisma/client";

const SORTABLE_FIELDS = new Set(["studentId", "studentName", "totalScore", "percentage", "passed", "percentileRank"]);

export async function GET(
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

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || "";
  const sortParam = searchParams.get("sort") || "percentage";
  const sortField = SORTABLE_FIELDS.has(sortParam) ? sortParam : "percentage";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize")) || 50));

  const where: Prisma.StudentResultWhereInput = {
    examId: params.examId,
    ...(search
      ? {
          OR: [
            { studentId: { contains: search, mode: "insensitive" } },
            { studentName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [results, total] = await Promise.all([
    prisma.studentResult.findMany({
      where,
      orderBy: { [sortField]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.studentResult.count({ where }),
  ]);

  return NextResponse.json({ results, total, page, pageSize });
}
