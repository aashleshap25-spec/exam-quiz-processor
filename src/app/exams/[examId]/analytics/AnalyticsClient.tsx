"use client";

import { useCallback, useEffect, useState } from "react";

const ACCENT = "#2F6F4E";
const DANGER = "#B3261E";
const BORDER = "#E2E1DD";
const MUTED = "#6B7280";

type Analytics = {
  averageScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  standardDeviation: number;
  passCount: number;
  failCount: number;
} | null;

type QuestionStat = {
  questionNumber: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  totalAttempts: number;
  percentWrong: number;
};

type Bucket = { rangeLabel: string; count: number };

export default function AnalyticsClient({ examId }: { examId: string }) {
  const [analytics, setAnalytics] = useState<Analytics>(null);
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState<Bucket[]>([]);
  const [studentsGraded, setStudentsGraded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/exams/${examId}/analytics`);
    if (res.ok) {
      const data = await res.json();
      setAnalytics(data.analytics);
      setQuestionStats(data.questionStats);
      setScoreDistribution(data.scoreDistribution);
      setStudentsGraded(data.studentsGraded);
    }
    setLoading(false);
  }, [examId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRecompute() {
    setRecomputing(true);
    await fetch(`/api/exams/${examId}/analytics`, { method: "POST" });
    await load();
    setRecomputing(false);
  }

  if (loading) return <p className="mt-8 text-sm text-muted">Loading...</p>;

  if (studentsGraded === 0) {
    return (
      <p className="mt-8 text-sm text-muted">
        No graded results yet. Upload submissions and trigger grading first.
      </p>
    );
  }

  const maxBucket = Math.max(1, ...scoreDistribution.map((b) => b.count));
  const passCount = analytics?.passCount ?? 0;
  const failCount = analytics?.failCount ?? 0;
  const passFailTotal = Math.max(1, passCount + failCount);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{studentsGraded} students graded</p>
        <button
          onClick={handleRecompute}
          disabled={recomputing}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-black/5 disabled:opacity-50"
        >
          {recomputing ? "Recomputing..." : "Re-run aggregation"}
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          ["Average", analytics?.averageScore.toFixed(1) + "%"],
          ["Median", analytics?.medianScore.toFixed(1) + "%"],
          ["Highest", analytics?.highestScore.toFixed(1) + "%"],
          ["Lowest", analytics?.lowestScore.toFixed(1) + "%"],
          ["Std dev", analytics?.standardDeviation.toFixed(1)],
          ["Pass rate", `${Math.round((passCount / passFailTotal) * 100)}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border p-3 text-center">
            <p className="text-sm font-semibold text-ink">{value}</p>
            <p className="mt-0.5 text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Score distribution histogram */}
      <div className="mt-8 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium text-ink">Score distribution</h2>
        <svg viewBox="0 0 400 160" className="mt-3 w-full">
          {scoreDistribution.map((b, i) => {
            const barWidth = 34;
            const gap = 6;
            const x = i * (barWidth + gap) + 8;
            const height = (b.count / maxBucket) * 110;
            return (
              <g key={b.rangeLabel}>
                <rect x={x} y={130 - height} width={barWidth} height={height} fill={ACCENT} rx={2} />
                <text x={x + barWidth / 2} y={128 - height - 4} textAnchor="middle" fontSize="9" fill={MUTED}>
                  {b.count > 0 ? b.count : ""}
                </text>
                <text x={x + barWidth / 2} y={145} textAnchor="middle" fontSize="8" fill={MUTED}>
                  {b.rangeLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Question difficulty */}
      <div className="mt-6 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium text-ink">Question difficulty (% wrong)</h2>
        <svg viewBox={`0 0 400 ${questionStats.length * 26 + 10}`} className="mt-3 w-full">
          {questionStats.map((q, i) => {
            const y = i * 26 + 6;
            const barWidth = (q.percentWrong / 100) * 300;
            return (
              <g key={q.questionNumber}>
                <text x={0} y={y + 13} fontSize="10" fill={MUTED}>
                  Q{q.questionNumber}
                </text>
                <rect x={35} y={y} width={300} height={16} fill={BORDER} rx={2} />
                <rect x={35} y={y} width={Math.max(2, barWidth)} height={16} fill={DANGER} rx={2} />
                <text x={340} y={y + 13} fontSize="10" fill={MUTED}>
                  {q.percentWrong.toFixed(0)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Pass/fail donut */}
      <div className="mt-6 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium text-ink">Pass / fail split</h2>
        <div className="mt-3 flex items-center gap-6">
          <PassFailDonut passCount={passCount} failCount={failCount} />
          <div className="text-sm">
            <p className="flex items-center gap-2 text-ink">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT }} />
              Pass — {passCount}
            </p>
            <p className="mt-1 flex items-center gap-2 text-ink">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DANGER }} />
              Fail — {failCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PassFailDonut({ passCount, failCount }: { passCount: number; failCount: number }) {
  const total = Math.max(1, passCount + failCount);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const passFraction = passCount / total;
  const passLength = circumference * passFraction;

  return (
    <svg viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r={radius} fill="none" stroke={DANGER} strokeWidth="14" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={ACCENT}
        strokeWidth="14"
        strokeDasharray={`${passLength} ${circumference - passLength}`}
        strokeDashoffset={circumference * 0.25}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="54" textAnchor="middle" fontSize="14" fill="#1C2321" fontWeight="600">
        {Math.round(passFraction * 100)}%
      </text>
    </svg>
  );
}
