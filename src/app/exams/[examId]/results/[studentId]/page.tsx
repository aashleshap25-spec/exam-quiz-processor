import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import { prisma } from "@/lib/prisma";

export default async function StudentResultPage({
  params,
}: {
  params: { examId: string; studentId: string };
}) {
  const session = getSessionPayload();
  if (!session) redirect("/login");

  const exam = await getOwnedExam(params.examId, session.userId);
  if (!exam) notFound();

  const result = await prisma.studentResult.findUnique({
    where: { examId_studentId: { examId: exam.id, studentId: params.studentId } },
    include: {
      questionResults: {
        include: { question: true },
        orderBy: { question: { questionNumber: "asc" } },
      },
    },
  });

  if (!result) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/exams/${exam.id}/results`} className="text-sm text-muted hover:text-ink">
        ← Back to results
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">{result.studentName || result.studentId}</h1>
          <p className="mt-1 text-sm text-muted">{result.studentId}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            result.passed ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
          }`}
        >
          {result.passed ? "PASS" : "FAIL"}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md border border-border p-3">
          <p className="text-lg font-semibold text-ink">
            {result.totalScore} / {result.maxScore}
          </p>
          <p className="text-xs text-muted">Score</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-lg font-semibold text-ink">{result.percentage.toFixed(1)}%</p>
          <p className="text-xs text-muted">Percentage</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-lg font-semibold text-ink">
            {result.percentileRank !== null ? `${result.percentileRank.toFixed(0)}th` : "—"}
          </p>
          <p className="text-xs text-muted">Percentile</p>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-medium text-ink">Question-by-question breakdown</h2>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="py-2 font-medium">Q#</th>
            <th className="py-2 font-medium">Selected</th>
            <th className="py-2 font-medium">Correct</th>
            <th className="py-2 font-medium">Marks</th>
            <th className="py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {result.questionResults.map((qr) => (
            <tr key={qr.id} className="border-b border-border last:border-0">
              <td className="py-2 text-ink">{qr.question.questionNumber}</td>
              <td className="py-2 text-ink">{qr.selectedOption || "—"}</td>
              <td className="py-2 text-ink">{qr.question.correctOption}</td>
              <td className="py-2 text-ink">{qr.question.marks}</td>
              <td className="py-2">
                {qr.isUnattempted ? (
                  <span className="text-xs font-medium text-muted">Unattempted</span>
                ) : qr.isCorrect ? (
                  <span className="text-xs font-medium text-accent">Correct</span>
                ) : (
                  <span className="text-xs font-medium text-danger">Incorrect</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
