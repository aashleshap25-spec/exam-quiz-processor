// Centralized so the API route, the UI, and the README all agree on the
// same numbers.
export const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_SUBMISSION_ROWS = 20000; // per upload
export const GRADING_CONCURRENCY = 20; // workers in the grading pool
