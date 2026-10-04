export function jsonlLines(rows) {
  if (!Array.isArray(rows)) throw new TypeError("JSONL rows must be an array");
  return `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
}

export function parseJsonlLines(text) {
  const rows = [];
  for (const [index, raw] of String(text ?? "").split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`JSONL line ${index + 1} is invalid: ${error.message}`);
    }
  }
  return rows;
}
