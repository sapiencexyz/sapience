'use client';

type CsvParseResult = {
  headers: string[];
  rows: string[][];
  errors: string[];
};

// Minimal RFC-4180 aware CSV parser supporting:
// - Quoted fields
// - Escaped quotes ("")
// - Embedded commas and newlines inside quotes
// - CRLF and LF newlines
// - UTF-8 BOM
export function parseCsv(
  inputText: string,
  delimiter: string = ','
): CsvParseResult {
  const input = inputText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  const errors: string[] = [];

  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = '';
  };

  const pushRecord = () => {
    rows.push(record);
    record = [];
  };

  while (i < input.length) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        const next = input[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (c === delimiter) {
      pushField();
      i++;
      continue;
    }

    if (c === '\r' || c === '\n') {
      pushField();
      pushRecord();
      if (c === '\r' && input[i + 1] === '\n') i++;
      i++;
      continue;
    }

    field += c;
    i++;
  }

  // Flush last field/record
  pushField();
  if (record.length > 1 || (record.length === 1 && record[0] !== '')) {
    pushRecord();
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], errors: ['No data'] };
  }

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (row.length < headers.length) {
      dataRows[r] = [...row, ...Array(headers.length - row.length).fill('')];
    } else if (row.length > headers.length) {
      const merged = row.slice(headers.length - 1).join(delimiter);
      dataRows[r] = [...row.slice(0, headers.length - 1), merged];
      errors.push(`Row ${r + 2}: extra fields merged into last column`);
    }
  }

  return { headers, rows: dataRows, errors };
}

export function mapCsv(
  headers: string[],
  rows: string[][]
): Record<string, string>[] {
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });
}
