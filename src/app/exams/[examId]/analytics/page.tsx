import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import AnalyticsClient from "./AnalyticsClient";

export default async function AnalyticsPage({
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

      <h1 className="mt-4 text-xl font-semibold text-ink">Class analytics</h1>

      <AnalyticsClient examId={exam.id} />
    </div>
  );
}
