const textBytes = text => new TextEncoder().encode(text);
const invalid = code => { throw new Error(code); };
const digest = async source => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', textBytes(source))),
  byte => byte.toString(16).padStart(2, '0')).join('');

// Pure read-model projection. No renderer, URL fetch, parser execution or edits.
export async function detailOf(envelope, selection) {
  const set = structuredClone(envelope), chosen = structuredClone(selection);
  if (!set || !chosen || !/^[a-f0-9]{64}$/.test(set.requestId)
      || chosen.requestId !== set.requestId || typeof chosen.id !== 'string') invalid('STALE_DETAIL');
  const rows = set.proposals;
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || !row.id)
      || new Set(rows.map(row => row.id)).size !== rows.length) invalid('INVALID_PROPOSAL_SET');
  const index = rows.findIndex(row => row.id === chosen.id);
  if (index < 0) invalid('UNKNOWN_PROPOSAL');
  const proposal = rows[index];
  const detail = proposal.detail ?? { format: 'text', source: proposal.representation };
  if (!detail || !['text', 'jsonl', 'mermaid', 'svg'].includes(detail.format)
      || typeof detail.source !== 'string' || textBytes(detail.source).length > 16384) invalid('INVALID_DETAIL');
  if (detail.format === 'jsonl') {
    for (const line of detail.source.split(/\r?\n/).filter(line => line.trim())) JSON.parse(line);
  }
  let preview = null;
  if (detail.preview != null) {
    const value = detail.preview;
    if (typeof value.png !== 'string' || value.png.length > 699052
        || value.sourceSha256 !== await digest(detail.source)) invalid('PREVIEW_SOURCE_MISMATCH');
    let raw;
    try { raw = atob(value.png); } catch { invalid('INVALID_PNG'); }
    if (btoa(raw) !== value.png || raw.length < 33 || raw.slice(0, 8) !== '\x89PNG\r\n\x1a\n'
        || raw.slice(12, 16) !== 'IHDR') invalid('INVALID_PNG');
    const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
    const header = new DataView(bytes.buffer);
    const width = header.getUint32(16), height = header.getUint32(20);
    if (!width || !height || width > 2048 || height > 2048 || width * height > 1048576) invalid('PNG_TOO_LARGE');
    // Full PNG decoding/CRC validation belongs to the existing image renderer.
    preview = { png: value.png, sourceSha256: value.sourceSha256 };
  }
  return { requestId: set.requestId, id: chosen.id, index, format: detail.format, source: detail.source, preview };
}
