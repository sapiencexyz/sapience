import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import { createLogger } from '../core/logger';
import { hasValidInternalToken } from '../runtime/internalAuth';

const log = createLogger('internal');
const router = Router();

const HEAP_SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastHeapSnapshotAt = 0;

router.post('/heap-snapshot', (req: Request, res: Response) => {
  if (!hasValidInternalToken(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const now = Date.now();
  const elapsed = now - lastHeapSnapshotAt;
  if (lastHeapSnapshotAt > 0 && elapsed < HEAP_SNAPSHOT_MIN_INTERVAL_MS) {
    res.status(429).json({
      error: 'Heap snapshot rate limited',
      retryAfterMs: HEAP_SNAPSHOT_MIN_INTERVAL_MS - elapsed,
    });
    return;
  }
  lastHeapSnapshotAt = now;

  const filename = path.join(os.tmpdir(), `heap-${now}.heapsnapshot`);
  try {
    v8.writeHeapSnapshot(filename);
    const memory = process.memoryUsage();
    log.info(
      {
        event: 'heap_snapshot',
        filename,
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        rssMb: Math.round(memory.rss / 1024 / 1024),
      },
      'heap_snapshot written'
    );

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="heap-${now}.heapsnapshot"`
    );

    const stream = fs.createReadStream(filename);
    stream.on('error', (err) => {
      log.error({ err }, 'heap snapshot stream failed');
      fs.unlink(filename, () => {});
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream snapshot' });
      }
    });
    stream.on('end', () => {
      fs.unlink(filename, () => {});
    });
    stream.pipe(res);
  } catch (err) {
    log.error({ err }, 'heap snapshot failed');
    res.status(500).json({ error: 'Failed to write snapshot' });
  }
});

export { router as internalRoutes };
