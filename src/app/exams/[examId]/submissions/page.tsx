import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionPayload } from "@/lib/session";
import { getOwnedExam } from "@/lib/examAccess";
import { prisma } from "@/lib/prisma";
import SubmissionsClient from "./SubmissionsClient";

export default async function SubmissionsPage({
  params,
}: {
  params: { examId: string };
}) {
  const session = getSessionPayload();
  if (!session) redirect("/login");

  const exam = await getOwnedExam(params.examId, session.userId);
  if (!exam) notFound();

  const questionCount = await prisma.question.count({ where: { examId: exam.id } });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href={`/exams/${exam.id}`} className="text-sm text-muted hover:text-ink">
        ← Back to {exam.title}
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-ink">Upload submissions</h1>
      <p className="mt-1 text-sm text-muted">
        Upload a CSV or JSON file of student answers, then trigger grading.
      </p>

      {questionCount === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
          This exam has no answer key yet.{" "}
          <Link href={`/exams/${exam.id}`} className="text-accent hover:underline">
            Add one first
          </Link>
          .
        </div>
      ) : (
        <SubmissionsClient examId={exam.id} />
      )}
    </div>
  );
}
