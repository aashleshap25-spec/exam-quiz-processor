// A small, dependency-free CSV parser. We deliberately don't pull in a
// library for this: the input format is simple (flat rows, optionally
// quoted fields) and writing it ourselves means zero new dependencies
// and full control over "never throw on malformed input."

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  // Rows that couldn't be mapped to the header at all (e.g. completely
  // empty after trimming) are skipped and counted here rather than
  // crashing the whole parse.
  skippedLines: number;
};

// Splits a single CSV line into fields, respecting double-quoted fields
// that may contain commas or escaped quotes ("").
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

export function parseCSV(text: string): CsvParseResult {
  // Normalize line endings, then drop a trailing BOM if present.
  const normalized = text.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const lines = normalized.split("\n");

  let skippedLines = 0;
  let headers: string[] = [];
  const rows: Record<string, string>[] = [];

  let headerFound = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      // Blank lines are common (trailing newline, spacing) — skip quietly,
      // don't count as a data error.
      continue;
    }

    if (!headerFound) {
      headers = splitCsvLine(line).map((h) => h.trim().toLowerCase());
      headerFound = true;
      continue;
    }

    const values = splitCsvLine(line);
    if (values.every((v) => v === "")) {
      skippedLines++;
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      // Ragged rows (fewer columns than the header, e.g. a trailing blank
      // option) are tolerated — missing fields just become "".
      row[header] = values[idx] !== undefined ? values[idx] : "";
    });
    rows.push(row);
  }

  return { headers, rows, skippedLines };
}
