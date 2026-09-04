import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import LogoutButton from "./LogoutButton";

type ExamWithQuestionCount = {
  id: string;
  title: string;
  passingPercentage: number;
  createdAt: Date;
  _count: { questions: number };
};

export default async function ExamsPage() {
  const session = getSessionPayload();
  if (!session) redirect("/login");

  const exams = await prisma.exam.findMany({
    where: { ownerId: session.userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Your exams</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/exams/new"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent/90"
          >
            New exam
          </Link>
          <LogoutButton />
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">
            You haven&apos;t created any exams yet.
          </p>
          <Link
            href="/exams/new"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Create your first exam
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-md border border-border">
          {exams.map((exam: ExamWithQuestionCount) => (
            <li key={exam.id}>
              <Link
                href={`/exams/${exam.id}`}
                className="flex items-center justify-between px-4 py-3 transition hover:bg-black/5"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{exam.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {exam._count.questions} question
                    {exam._count.questions === 1 ? "" : "s"}, pass mark{" "}
                    {exam.passingPercentage}%
                  </p>
                </div>
                <span className="text-xs text-muted">
                  {new Date(exam.createdAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
