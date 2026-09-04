import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import ResultsClient from "./ResultsClient";

export default async function ResultsPage({
  params,
}: {
  params: { examId: string };
}) {
  const session = getSessionPayload();
  if (!session) redirect("/login");

  const exam = await getOwnedExam(params.examId, session.userId);
  if (!exam) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link href={`/exams/${exam.id}`} className="text-sm text-muted hover:text-ink">
        ← Back to {exam.title}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Results</h1>
        <a
          href={`/api/exams/${exam.id}/export`}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-black/5"
        >
          Download CSV
        </a>
      </div>

      <ResultsClient examId={exam.id} />
    </div>
  );
}
