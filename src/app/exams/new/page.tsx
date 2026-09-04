"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type QuestionRow = {
  questionNumber: string;
  correctOption: string;
  marks: string;
};

function emptyRow(nextNumber: number): QuestionRow {
  return { questionNumber: String(nextNumber), correctOption: "", marks: "" };
}

export default function NewExamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [passingPercentage, setPassingPercentage] = useState("40");
  const [rows, setRows] = useState<QuestionRow[]>([emptyRow(1)]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateRow(index: number, field: keyof QuestionRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    const nextNumber = rows.length + 1;
    setRows((prev) => [...prev, emptyRow(nextNumber)]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Only send rows the instructor actually filled in — an empty trailing
    // row from "Add question" shouldn't block submission.
    const filledRows = rows.filter(
      (r) => r.questionNumber.trim() || r.correctOption.trim() || r.marks.trim()
    );

    const questions = filledRows.map((r) => ({
      questionNumber: Number(r.questionNumber),
      correctOption: r.correctOption.trim(),
      marks: Number(r.marks),
    }));

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          passingPercentage: Number(passingPercentage),
          questions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const fieldErrors = data.details?.formErrors?.join(" ");
        setError(fieldErrors || data.error || "Something went wrong.");
        return;
      }

      router.push(`/exams/${data.exam.id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/exams" className="text-sm text-muted hover:text-ink">
        ← Back to exams
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-ink">Create an exam</h1>
      <p className="mt-1 text-sm text-muted">
        Set up the exam and its answer key. You can edit the answer key later
        from the exam page, before grading starts.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="block text-sm font-medium text-ink">
              Exam title
            </label>
            <input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Midterm Physics Quiz"
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="passing" className="block text-sm font-medium text-ink">
              Passing %
            </label>
            <input
              id="passing"
              type="number"
              min={0}
              max={100}
              required
              value={passingPercentage}
              onChange={(e) => setPassingPercentage(e.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">Answer key</h2>
            <button
              type="button"
              onClick={addRow}
              className="text-sm font-medium text-accent hover:underline"
            >
              + Add question
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-xs font-medium text-muted">
              <span>Question #</span>
              <span>Correct option</span>
              <span>Marks</span>
              <span></span>
            </div>

            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <input
                  type="number"
                  min={1}
                  value={row.questionNumber}
                  onChange={(e) => updateRow(index, "questionNumber", e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <select
                  value={row.correctOption}
                  onChange={(e) => updateRow(index, "correctOption", e.target.value)}
                  className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  <option value="">Select...</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={row.marks}
                  onChange={(e) => updateRow(index, "marks", e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  disabled={rows.length === 1}
                  className="rounded-md px-2 text-sm text-muted transition hover:text-danger disabled:opacity-30"
                  aria-label={`Remove question ${index + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
        >
          {isSubmitting ? "Creating..." : "Create exam"}
        </button>
      </form>
    </div>
  );
}
