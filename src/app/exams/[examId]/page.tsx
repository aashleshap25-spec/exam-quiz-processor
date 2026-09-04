import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import { prisma } from "@/lib/prisma";

type QuestionRow = {
  id: string;
  questionNumber: number;
  correctOption: string;
  marks: number;
};

export default async function ExamDetailPage({
  params,
}: {
  params: { examId: string };
}) {
  const session = getSessionPayload();
  if (!session) redirect("/login");

  const exam = await getOwnedExam(params.examId, session.userId);
  if (!exam) notFound();

  const questions = await prisma.question.findMany({
    where: { examId: exam.id },
    orderBy: { questionNumber: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/exams" className="text-sm text-muted hover:text-ink">
        ← Back to exams
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">{exam.title}</h1>
          <p className="mt-1 text-sm text-muted">
            Passing percentage: {exam.passingPercentage}%
          </p>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Answer key</h2>
          <span className="text-xs text-muted">
            {questions.length} question{questions.length === 1 ? "" : "s"},{" "}
            {questions.reduce((sum: number, q: QuestionRow) => sum + q.marks, 0)} total marks
          </span>
        </div>

        {questions.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No answer key defined yet.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 font-medium">Question #</th>
                <th className="py-2 font-medium">Correct option</th>
                <th className="py-2 font-medium">Marks</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q: QuestionRow) => (
                <tr key={q.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-ink">{q.questionNumber}</td>
                  <td className="py-2 text-ink">{q.correctOption}</td>
                  <td className="py-2 text-ink">{q.marks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-10 grid grid-cols-3 gap-3">
        <Link
          href={`/exams/${exam.id}/submissions`}
          className="rounded-md border border-border p-4 text-center transition hover:bg-black/5"
        >
          <p className="text-sm font-medium text-ink">Submissions</p>
          <p className="mt-1 text-xs text-muted">Upload &amp; grade</p>
        </Link>
        <Link
          href={`/exams/${exam.id}/results`}
          className="rounded-md border border-border p-4 text-center transition hover:bg-black/5"
        >
          <p className="text-sm font-medium text-ink">Results</p>
          <p className="mt-1 text-xs text-muted">Per-student scores</p>
        </Link>
        <Link
          href={`/exams/${exam.id}/analytics`}
          className="rounded-md border border-border p-4 text-center transition hover:bg-black/5"
        >
          <p className="text-sm font-medium text-ink">Analytics</p>
          <p className="mt-1 text-xs text-muted">Class-level stats</p>
        </Link>
      </div>
    </div>
  );
}
