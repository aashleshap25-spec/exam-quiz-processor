"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Result = {
  studentId: string;
  studentName: string | null;
  totalScore: number;
  maxScore: number;
  percentage: number;
  percentileRank: number | null;
  passed: boolean;
};

type SortField = "studentId" | "studentName" | "totalScore" | "percentage" | "percentileRank";

const COLUMNS: { field: SortField; label: string }[] = [
  { field: "studentId", label: "Student ID" },
  { field: "studentName", label: "Name" },
  { field: "totalScore", label: "Score" },
  { field: "percentage", label: "Percentage" },
  { field: "percentileRank", label: "Percentile" },
];

export default function ResultsClient({ examId }: { examId: string }) {
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortField>("percentage");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ sort, order, search, pageSize: "200" });
    const res = await fetch(`/api/exams/${examId}/results?${qs.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setResults(data.results);
      setTotal(data.total);
    }
    setLoading(false);
  }, [examId, sort, order, search]);

  useEffect(() => {
    const timeout = setTimeout(load, 250); // debounce search typing
    return () => clearTimeout(timeout);
  }, [load]);

  function toggleSort(field: SortField) {
    if (sort === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(field);
      setOrder("desc");
    }
  }

  return (
    <div className="mt-6">
      <input
        type="text"
        placeholder="Search by student ID or name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-border px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {loading && results.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Loading...</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No results yet. Upload submissions and trigger grading first.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted">{total} student{total === 1 ? "" : "s"}</p>
          <div className="mt-2 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-black/[0.02] text-left text-xs text-muted">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.field}
                      onClick={() => toggleSort(col.field)}
                      className="cursor-pointer select-none py-2 px-3 font-medium hover:text-ink"
                    >
                      {col.label} {sort === col.field ? (order === "asc" ? "↑" : "↓") : ""}
                    </th>
                  ))}
                  <th className="py-2 px-3 font-medium">Pass/Fail</th>
                  <th className="py-2 px-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.studentId} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                    <td className="py-2 px-3 text-ink">{r.studentId}</td>
                    <td className="py-2 px-3 text-ink">{r.studentName || "—"}</td>
                    <td className="py-2 px-3 text-ink">
                      {r.totalScore} / {r.maxScore}
                    </td>
                    <td className="py-2 px-3 text-ink">{r.percentage.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-ink">
                      {r.percentileRank !== null ? `${r.percentileRank.toFixed(0)}th` : "—"}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.passed ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
                        }`}
                      >
                        {r.passed ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <Link
                        href={`/exams/${examId}/results/${encodeURIComponent(r.studentId)}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
