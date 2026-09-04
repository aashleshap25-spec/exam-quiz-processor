"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  totalRows: number;
  processedRows: number;
  studentsTotal: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  _count?: { submissions: number };
};

type ValidationSummary = { valid: number; invalid: number; duplicate: number };
type SampleError = { rowNumber: number; studentId: string; status: string; reason: string | null };
type JobErrorRow = { studentId: string; questionNumber: number | null; selectedOption: string | null; status: string; reason: string | null };

const STATUS_STYLES: Record<Job["status"], string> = {
  PENDING: "bg-muted/20 text-muted",
  PROCESSING: "bg-accent/10 text-accent",
  COMPLETED: "bg-accent/15 text-accent",
  FAILED: "bg-danger/10 text-danger",
};

export default function SubmissionsClient({ examId }: { examId: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadSummary, setLastUploadSummary] = useState<ValidationSummary | null>(null);
  const [lastSampleErrors, setLastSampleErrors] = useState<SampleError[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [gradingJobId, setGradingJobId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobErrors, setJobErrors] = useState<Record<string, { total: number; rows: JobErrorRow[] } | undefined>>({});
  const [loadingJobErrors, setLoadingJobErrors] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchJobs = useCallback(async () => {
    const res = await fetch(`/api/exams/${examId}/submissions`);
    if (res.ok) {
      const data = await res.json();
      setJobs(data.jobs);
    }
    setLoadingJobs(false);
  }, [examId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Poll while any job is still pending/processing — this is what drives
  // the live progress bar.
  useEffect(() => {
    const hasActiveJob = jobs.some((j) => j.status === "PENDING" || j.status === "PROCESSING");
    if (!hasActiveJob) return;
    const interval = setInterval(fetchJobs, 1200);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setLastUploadSummary(null);
    setLastSampleErrors([]);
    setShowErrors(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/exams/${examId}/submissions`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Upload failed");
        return;
      }
      setLastUploadSummary(data.validation);
      setLastSampleErrors(data.sampleErrors ?? []);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchJobs();
    } catch {
      setUploadError("Network error while uploading");
    } finally {
      setUploading(false);
    }
  }

  async function handleGrade(jobId: string) {
    setGradingJobId(jobId);
    try {
      const res = await fetch(`/api/exams/${examId}/jobs/${jobId}/grade`, { method: "POST" });
      if (res.ok) {
        await fetchJobs();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not start grading");
      }
    } finally {
      setGradingJobId(null);
    }
  }

  async function toggleJobErrors(jobId: string) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    if (!jobErrors[jobId]) {
      setLoadingJobErrors(jobId);
      try {
        const res = await fetch(`/api/exams/${examId}/jobs/${jobId}/errors`);
        if (res.ok) {
          const data = await res.json();
          setJobErrors((prev) => ({ ...prev, [jobId]: { total: data.total, rows: data.rows } }));
        }
      } finally {
        setLoadingJobErrors(null);
      }
    }
  }

  return (
    <div>
      <form onSubmit={handleUpload} className="mt-8 rounded-md border border-border p-6">
        <label className="text-sm font-medium text-ink">Submissions file (.csv or .json)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-2 block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-accent/90"
        />
        <p className="mt-2 text-xs text-muted">
          Expected columns: student_id, student_name, question_number, selected_option. Max 5 MB / 20,000 rows.
        </p>

        {uploadError && (
          <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{uploadError}</p>
        )}

        {lastUploadSummary && (
          <div className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            <div className="flex items-center justify-between gap-3">
              <span>
                Uploaded: {lastUploadSummary.valid} valid, {lastUploadSummary.invalid} invalid,{" "}
                {lastUploadSummary.duplicate} duplicate rows.
              </span>
              {lastSampleErrors.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowErrors((v) => !v)}
                  className="shrink-0 text-xs font-medium underline"
                >
                  {showErrors ? "Hide" : "Show"} row errors ({lastSampleErrors.length})
                </button>
              )}
            </div>

            {showErrors && lastSampleErrors.length > 0 && (
              <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-accent/20 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-black/[0.03] text-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Row</th>
                      <th className="px-2 py-1.5 font-medium">Student ID</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastSampleErrors.map((e, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5 text-ink">{e.rowNumber}</td>
                        <td className="px-2 py-1.5 text-ink">{e.studentId || "—"}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              e.status === "INVALID" ? "bg-danger/10 text-danger" : "bg-muted/20 text-muted"
                            }`}
                          >
                            {e.status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-ink">{e.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lastUploadSummary.invalid + lastUploadSummary.duplicate > lastSampleErrors.length && (
                  <p className="px-2 py-1.5 text-[11px] text-muted">
                    Showing the first {lastSampleErrors.length} flagged rows. Download the annotated CSV
                    from the results page for the full list.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || uploading}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      <div className="mt-10">
        <h2 className="text-sm font-medium text-ink">Upload jobs</h2>

        {loadingJobs ? (
          <p className="mt-4 text-sm text-muted">Loading...</p>
        ) : jobs.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No uploads yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {jobs.map((job) => {
              const denominator = job.studentsTotal ?? 0;
              const pct = denominator > 0 ? Math.round((job.processedRows / denominator) * 100) : 0;
              return (
                <li key={job.id} className="rounded-md border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status]}`}>
                        {job.status}
                      </span>
                      <span className="text-xs text-muted">
                        {job._count?.submissions ?? job.totalRows} rows · {new Date(job.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleJobErrors(job.id)}
                        className="text-xs font-medium text-muted underline hover:text-ink"
                      >
                        {expandedJobId === job.id ? "Hide row errors" : "View row errors"}
                      </button>
                      {(job.status === "PENDING" || job.status === "FAILED") && (
                        <button
                          onClick={() => handleGrade(job.id)}
                          disabled={gradingJobId === job.id}
                          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-ink transition hover:bg-black/5 disabled:opacity-50"
                        >
                          {job.status === "FAILED" ? "Retry grading" : "Grade"}
                        </button>
                      )}
                      {job.status === "COMPLETED" && (
                        <>
                          <Link href={`/exams/${examId}/results`} className="text-xs font-medium text-accent hover:underline">
                            View results
                          </Link>
                          <Link href={`/exams/${examId}/analytics`} className="text-xs font-medium text-accent hover:underline">
                            View analytics
                          </Link>
                        </>
                      )}
                    </div>
                  </div>

                  {job.status === "FAILED" && job.errorMessage && (
                    <p className="mt-2 text-xs text-danger">{job.errorMessage}</p>
                  )}

                  {(job.status === "PROCESSING" || job.status === "COMPLETED") && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${job.status === "COMPLETED" ? 100 : pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {job.status === "COMPLETED"
                          ? "Done"
                          : `Grading… ${job.processedRows} of ${job.studentsTotal ?? "?"} students`}
                      </p>
                    </div>
                  )}

                  {expandedJobId === job.id && (
                    <div className="mt-3 rounded-md border border-border bg-black/[0.02] p-3">
                      {loadingJobErrors === job.id ? (
                        <p className="text-xs text-muted">Loading row errors...</p>
                      ) : !jobErrors[job.id] || jobErrors[job.id]!.total === 0 ? (
                        <p className="text-xs text-muted">No invalid or duplicate rows in this upload.</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted">
                            {jobErrors[job.id]!.total} flagged row{jobErrors[job.id]!.total === 1 ? "" : "s"}
                            {jobErrors[job.id]!.total > jobErrors[job.id]!.rows.length
                              ? ` (showing first ${jobErrors[job.id]!.rows.length})`
                              : ""}
                          </p>
                          <div className="mt-2 max-h-56 overflow-y-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="text-muted">
                                <tr>
                                  <th className="px-2 py-1 font-medium">Student ID</th>
                                  <th className="px-2 py-1 font-medium">Q#</th>
                                  <th className="px-2 py-1 font-medium">Status</th>
                                  <th className="px-2 py-1 font-medium">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {jobErrors[job.id]!.rows.map((r, i) => (
                                  <tr key={i} className="border-t border-border">
                                    <td className="px-2 py-1 text-ink">{r.studentId || "—"}</td>
                                    <td className="px-2 py-1 text-ink">{r.questionNumber ?? "—"}</td>
                                    <td className="px-2 py-1">
                                      <span
                                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                          r.status === "INVALID" ? "bg-danger/10 text-danger" : "bg-muted/20 text-muted"
                                        }`}
                                      >
                                        {r.status}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 text-ink">{r.reason || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
