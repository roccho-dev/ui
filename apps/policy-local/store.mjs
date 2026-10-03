import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const etagFor = body => `"sha256-${createHash('sha256').update(body).digest('hex')}"`;
const stale = () => Object.assign(new Error('stale ETag'), { code: 'STALE_ETAG' });

// The queue serializes this server's writers. External file writers must be excluded operationally.
export const createFileStore = filePath => {
  let tail = Promise.resolve();

  const read = async () => {
    const body = await readFile(filePath);
    return { body, etag: etagFor(body) };
  };

  const replaceNow = async ({ expected, body, validate }) => {
    let current = await read();
    if (current.etag !== expected) throw stale();
    validate(current.body, body);
    const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
    let pending = true;
    try {
      await writeFile(temporary, body, { flag: 'wx' });
      current = await read();
      if (current.etag !== expected) throw stale();
      await rename(temporary, filePath);
      pending = false;
    } finally {
      if (pending) await unlink(temporary).catch(() => undefined);
    }
    return read();
  };

  return {
    read,
    replace: request => {
      const result = tail.then(() => replaceNow(request));
      tail = result.catch(() => undefined);
      return result;
    },
  };
};
