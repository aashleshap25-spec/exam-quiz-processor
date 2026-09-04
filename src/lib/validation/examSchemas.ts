import { z } from "zod";

// The assignment's submission format (and sample data) restricts answers to
// a single-letter MCQ option, A-D. Locking the answer key down to the same
// set at creation time keeps grading unambiguous: a key value the
// submission validator could never match (e.g. "True") would silently
// make every student wrong on that question instead of surfacing an error
// up front.
const VALID_CORRECT_OPTION_PATTERN = /^[A-Da-d]$/;

export const questionSchema = z.object({
  questionNumber: z.number().int().positive("Question number must be a positive integer"),
  correctOption: z
    .string()
    .trim()
    .min(1, "Correct option is required")
    .regex(VALID_CORRECT_OPTION_PATTERN, "Correct option must be a single letter A, B, C, or D")
    .transform((v) => v.toUpperCase()),
  marks: z.number().positive("Marks must be greater than 0"),
});

export const createExamSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters"),
  passingPercentage: z
    .number()
    .min(0, "Passing percentage can't be negative")
    .max(100, "Passing percentage can't exceed 100"),
  // Answer key is optional at creation time — an instructor might create the
  // exam first and add questions afterward from the exam page.
  questions: z.array(questionSchema).optional().default([]),
});

export const answerKeySchema = z
  .array(questionSchema)
  .min(1, "Add at least one question")
  .superRefine((questions, ctx) => {
    const seen = new Set<number>();
    for (const q of questions) {
      if (seen.has(q.questionNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Question number ${q.questionNumber} is duplicated in the answer key`,
        });
      }
      seen.add(q.questionNumber);
    }
  });

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type AnswerKeyInput = z.infer<typeof answerKeySchema>;
