// Validates one row of a bulk submissions upload (CSV or JSON) against the
// exam's answer key. Designed so a single bad row can never throw — every
// row always produces a ValidatedSubmissionRow, just possibly with
// validationStatus INVALID and a human-readable reason attached.

// Format decision (documented in README): we accept "one row per student
// answer" (student_id, student_name, question_number, selected_option),
// matching the sample submissions.csv. The alternative — one row per
// student with all answers as columns — would require a dynamic column
// schema per exam (columns depend on question count), which is harder to
// validate generically and doesn't fit a single reusable Zod shape.

const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/;
const VALID_OPTION_PATTERN = /^[A-Da-d]$/;

export type ValidationStatus = "VALID" | "INVALID" | "DUPLICATE";

export type RawSubmissionRow = {
  studentId: string;
  studentName: string;
  questionNumber: string; // raw, pre-parse — may be garbage
  selectedOption: string; // raw — may be blank (unattempted)
};

export type ValidatedSubmissionRow = {
  rowNumber: number; // 1-based, for user-facing error reports
  studentId: string;
  studentName: string | null;
  questionNumber: number | null;
  selectedOption: string | null; // normalized to uppercase, or null if blank
  validationStatus: ValidationStatus;
  errorReason: string | null;
};

export function normalizeRawRow(
  record: Record<string, string>,
  rowNumber: number
): RawSubmissionRow {
  // Accepts either snake_case (CSV headers) or camelCase (JSON) keys so both
  // upload formats can share this normalizer.
  const get = (snake: string, camel: string) =>
    record[snake] ?? record[camel] ?? "";

  return {
    studentId: (get("student_id", "studentId") ?? "").toString().trim(),
    studentName: (get("student_name", "studentName") ?? "").toString().trim(),
    questionNumber: (get("question_number", "questionNumber") ?? "")
      .toString()
      .trim(),
    selectedOption: (get("selected_option", "selectedOption") ?? "")
      .toString()
      .trim(),
  };
}

export function validateSubmissionRows(
  rawRows: { record: Record<string, string>; rowNumber: number }[],
  answerKeyQuestionNumbers: Set<number>
): ValidatedSubmissionRow[] {
  const seenKeys = new Set<string>();
  const validated: ValidatedSubmissionRow[] = [];

  for (const { record, rowNumber } of rawRows) {
    const raw = normalizeRawRow(record, rowNumber);
    const errors: string[] = [];

    // --- required fields ---
    if (!raw.studentId) errors.push("Missing student_id");
    if (!raw.studentName) errors.push("Missing student_name");
    if (!raw.questionNumber) errors.push("Missing question_number");

    // --- student_id format ---
    if (raw.studentId && !STUDENT_ID_PATTERN.test(raw.studentId)) {
      errors.push(
        `student_id "${raw.studentId}" doesn't match the expected format (alphanumeric, dashes/underscores allowed)`
      );
    }

    // --- question_number: must parse and exist in the answer key ---
    let parsedQuestionNumber: number | null = null;
    if (raw.questionNumber) {
      const n = Number(raw.questionNumber);
      if (!Number.isInteger(n) || n <= 0) {
        errors.push(`question_number "${raw.questionNumber}" is not a valid positive integer`);
      } else if (!answerKeyQuestionNumbers.has(n)) {
        errors.push(`question_number ${n} does not exist in this exam's answer key`);
      } else {
        parsedQuestionNumber = n;
      }
    }

    // --- selected_option: blank (unattempted) or a single valid option ---
    let normalizedOption: string | null = null;
    if (raw.selectedOption === "") {
      normalizedOption = null; // unattempted — allowed
    } else if (VALID_OPTION_PATTERN.test(raw.selectedOption)) {
      normalizedOption = raw.selectedOption.toUpperCase();
    } else {
      errors.push(
        `selected_option "${raw.selectedOption}" is not a valid option (expected A/B/C/D or blank)`
      );
    }

    if (errors.length > 0) {
      validated.push({
        rowNumber,
        studentId: raw.studentId,
        studentName: raw.studentName || null,
        questionNumber: parsedQuestionNumber,
        selectedOption: normalizedOption,
        validationStatus: "INVALID",
        errorReason: errors.join("; "),
      });
      continue;
    }

    // --- duplicate check: same student answering the same question twice ---
    const dupKey = `${raw.studentId.toLowerCase()}::${parsedQuestionNumber}`;
    if (seenKeys.has(dupKey)) {
      validated.push({
        rowNumber,
        studentId: raw.studentId,
        studentName: raw.studentName || null,
        questionNumber: parsedQuestionNumber,
        selectedOption: normalizedOption,
        validationStatus: "DUPLICATE",
        errorReason: `Duplicate answer for student ${raw.studentId}, question ${parsedQuestionNumber} (first occurrence kept)`,
      });
      continue;
    }
    seenKeys.add(dupKey);

    validated.push({
      rowNumber,
      studentId: raw.studentId,
      studentName: raw.studentName || null,
      questionNumber: parsedQuestionNumber,
      selectedOption: normalizedOption,
      validationStatus: "VALID",
      errorReason: null,
    });
  }

  return validated;
}
