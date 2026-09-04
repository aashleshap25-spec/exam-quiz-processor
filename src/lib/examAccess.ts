import { prisma } from "@/lib/prisma";

// Returns the exam only if it belongs to the given user, otherwise null.
// Using this everywhere prevents the classic bug of "any logged-in user
// can view/edit any exam by guessing its id."
export async function getOwnedExam(examId: string, userId: string) {
  return prisma.exam.findFirst({
    where: { id: examId, ownerId: userId },
  });
}
