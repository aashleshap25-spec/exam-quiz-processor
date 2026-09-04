import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import { parseCSV } from "@/lib/csv";
import { validateSubmissionRows } from "@/lib/submissionValidation";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_SUBMISSION_ROWS } from "@/lib/uploadLimits";
import { logger, newCorrelationId } from "@/lib/logger";

// GET: list submission jobs for this exam (used by the upload/progress UI).
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

  const jobs = await prisma.submissionJob.findMany({
    where: { examId: params.examId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });

  return NextResponse.json({ jobs });
}

// POST: upload a bulk submissions file (CSV or JSON) or an inline JSON body.
// Accepted shapes:
//   - multipart/form-data with a `file` field (.csv or .json)
//   - application/json body: { "submissions": [ {student_id, student_name,
//     question_number, selected_option}, ... ] }
export async function POST(
  req: NextRequest,
  { params }: { params: { examId: string } }
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

  const questions = await prisma.question.findMany({ where: { examId: exam.id } });
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "This exam has no answer key yet. Define the answer key before uploading submissions." },
      { status: 400 }
    );
  }
  const answerKeyQuestionNumbers = new Set(questions.map((q) => q.questionNumber));

  const contentType = req.headers.get("content-type") || "";
  let rawText = "";
  let sourceFormat: "csv" | "json" = "csv";
  let sourceName = "inline";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided (expected a 'file' field)" }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `File too large. Max size is ${MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024)} MB.` },
          { status: 413 }
        );
      }
      sourceName = file.name;
      sourceFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
      rawText = await file.text();
    } else if (contentType.includes("application/json")) {
      // Guard body size before parsing — a malicious/huge JSON body
      // shouldn't get to JSON.parse.
      const contentLength = Number(req.headers.get("content-length") || "0");
      if (contentLength > MAX_UPLOAD_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Request body too large. Max size is ${MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024)} MB.` },
          { status: 413 }
        );
      }
      sourceFormat = "json";
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.submissions)) {
        return NextResponse.json(
          { error: "Expected JSON body: { \"submissions\": [ { student_id, student_name, question_number, selected_option }, ... ] }" },
          { status: 400 }
        );
      }
      rawText = JSON.stringify(body.submissions);
    } else {
      return NextResponse.json(
        { error: "Unsupported content type. Send multipart/form-data with a file, or application/json." },
        { status: 415 }
      );
    }
  } catch (err) {
    logger.error("submission_upload_read_failed", { correlationId, examId: exam.id, error: String(err) });
    return NextResponse.json({ error: "Could not read the uploaded file/body" }, { status: 400 });
  }

  // --- turn rawText into a uniform list of { record, rowNumber } ---
  let records: { record: Record<string, string>; rowNumber: number }[] = [];

  if (sourceFormat === "csv") {
    const { rows, skippedLines } = parseCSV(rawText);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No data rows found in the uploaded CSV" }, { status: 400 });
    }
    records = rows.map((record, idx) => ({ record, rowNumber: idx + 1 }));
    if (skippedLines > 0) {
      logger.warn("submission_upload_blank_lines_skipped", { correlationId, examId: exam.id, skippedLines });
    }
  } else {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Malformed JSON — could not parse the submissions file" }, { status: 400 });
    }
    if (!Array.isArray(parsedJson)) {
      return NextResponse.json({ error: "Expected the JSON submissions to be an array of rows" }, { status: 400 });
    }
    records = parsedJson.map((item, idx) => {
      // Malformed entries (not an object) never crash the pipeline — they
      // just become an all-blank record, which validation will flag.
      const record =
        item && typeof item === "object"
          ? Object.fromEntries(
              Object.entries(item as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)])
            )
          : {};
      return { record, rowNumber: idx + 1 };
    });
  }

  if (records.length === 0) {
    return NextResponse.json({ error: "No submission rows found" }, { status: 400 });
  }
  if (records.length > MAX_SUBMISSION_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${records.length}). Max allowed per upload is ${MAX_SUBMISSION_ROWS}.` },
      { status: 413 }
    );
  }

  // --- validate every row; never throws, always produces a status ---
  const validatedRows = validateSubmissionRows(records, answerKeyQuestionNumbers);

  const summary = {
    total: validatedRows.length,
    valid: validatedRows.filter((r) => r.validationStatus === "VALID").length,
    invalid: validatedRows.filter((r) => r.validationStatus === "INVALID").length,
    duplicate: validatedRows.filter((r) => r.validationStatus === "DUPLICATE").length,
  };

  // --- persist: one SubmissionJob + all raw Submission rows ---
  const job = await prisma.$transaction(async (tx) => {
    const createdJob = await tx.submissionJob.create({
      data: {
        examId: exam.id,
        status: "PENDING",
        totalRows: validatedRows.length,
        processedRows: 0,
      },
    });

    await tx.submission.createMany({
      data: validatedRows.map((row) => ({
        examId: exam.id,
        jobId: createdJob.id,
        studentId: row.studentId || "(missing)",
        studentName: row.studentName,
        questionNumber: row.questionNumber ?? -1,
        selectedOption: row.selectedOption,
        validationStatus: row.validationStatus,
        errorReason: row.errorReason,
      })),
    });

    return createdJob;
  });

  logger.info("submission_upload_completed", {
    correlationId,
    examId: exam.id,
    jobId: job.id,
    sourceName,
    sourceFormat,
    ...summary,
  });

  return NextResponse.json(
    {
      job,
      validation: summary,
      // A capped sample of row-level errors so the UI can show something
      // useful without shipping every error for a 20k-row file.
      sampleErrors: validatedRows
        .filter((r) => r.validationStatus !== "VALID")
        .slice(0, 50)
        .map((r) => ({ rowNumber: r.rowNumber, studentId: r.studentId, status: r.validationStatus, reason: r.errorReason })),
      correlationId,
    },
    { status: 201 }
  );
}
