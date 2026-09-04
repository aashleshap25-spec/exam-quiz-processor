import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";

function csvEscape(value: string | number | boolean | null): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvLine(fields: (string | number | boolean | null)[]): string {
  return fields.map(csvEscape).join(",");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { examId: string } }
) {
  const session = getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const exam = await getOwnedExam(params.examId, session.userId);
  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const [results, flaggedRows] = await Promise.all([
    prisma.studentResult.findMany({
      where: { examId: params.examId },
      orderBy: { percentage: "desc" },
    }),
    prisma.submission.findMany({
      where: { examId: params.examId, validationStatus: { in: ["INVALID", "DUPLICATE"] } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const lines: string[] = [];

  lines.push("# Student Results");
  lines.push(
    toCsvLine([
      "student_id",
      "student_name",
      "total_score",
      "max_score",
      "percentage",
      "percentile_rank",
      "passed",
    ])
  );
  for (const r of results) {
    lines.push(
      toCsvLine([
        r.studentId,
        r.studentName,
        r.totalScore,
        r.maxScore,
        Number(r.percentage.toFixed(2)),
        r.percentileRank !== null ? Number(r.percentileRank.toFixed(2)) : "",
        r.passed ? "PASS" : "FAIL",
      ])
    );
  }

  lines.push("");
  lines.push("# Flagged / Invalid Rows (excluded from grading)");
  lines.push(
    toCsvLine(["job_id", "student_id", "student_name", "question_number", "selected_option", "validation_status", "error_reason"])
  );
  for (const row of flaggedRows) {
    lines.push(
      toCsvLine([
        row.jobId,
        row.studentId,
        row.studentName,
        row.questionNumber === -1 ? "" : row.questionNumber,
        row.selectedOption,
        row.validationStatus,
        row.errorReason,
      ])
    );
  }

  const csv = lines.join("\n");
  const filename = `${exam.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_results.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
