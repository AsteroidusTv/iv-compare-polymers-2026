/** Explicit row objects only; protects spreadsheet consumers from formula strings. */
export function rowsCsv(rows: Record<string, unknown>[]) {
  const columns = [...new Set(rows.flatMap(row=>Object.keys(row)))];
  const cell = (value: unknown) => {
    let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    if(typeof value === "string" && /^\s*[=+@-]/.test(value)) text = `'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  };
  return [columns,...rows.map(row=>columns.map(key=>row[key]))].map(row=>row.map(cell).join(",")).join("\r\n");
}
