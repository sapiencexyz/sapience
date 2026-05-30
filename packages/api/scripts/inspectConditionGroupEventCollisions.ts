/**
 * Inspect (source, externalEventId) collisions surfaced by
 * backfillConditionGroupEvent.ts. Reads the collision section from a
 * backfill log, then for each losing group prints a side-by-side dump of
 * the winning group (the row already pointing at that event) and the
 * losing group, so the operator can decide merge vs leave-NULL per group.
 *
 * Defaults to the most-recent `backfill-events-{apply,dryrun}-*.log` in
 * scripts/logs. Pass a path explicitly to inspect an older run.
 *
 * Works with both apply and dry-run logs:
 *   - In apply logs the winner is the group whose UPDATE landed first; we
 *     find it via findFirst({source, externalEventId}) in the DB.
 *   - In dry-run logs no group has externalEventId set yet, so the DB
 *     lookup returns null. The per-group `⊘ COLLISION → ... already
 *     owned by group <id>` lines (emitted by the pre-flight) carry the
 *     would-be winner's id; we parse those into a fallback lookup map.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/inspectConditionGroupEventCollisions.ts
 *   pnpm --filter @sapience/api exec tsx scripts/inspectConditionGroupEventCollisions.ts scripts/logs/backfill-events-dryrun-2026-05-30T00-44-49-596.log
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import prisma from '../src/core/db';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = resolve(__dirname, 'logs');

function findLatestBackfillLog(): string {
  const files = readdirSync(LOGS_DIR)
    .filter(
      (f) =>
        (f.startsWith('backfill-events-apply-') ||
          f.startsWith('backfill-events-dryrun-')) &&
        f.endsWith('.log')
    )
    .sort();
  if (files.length === 0) {
    throw new Error(
      `no backfill-events-{apply,dryrun}-*.log files in ${LOGS_DIR}`
    );
  }
  return join(LOGS_DIR, files[files.length - 1]);
}

interface Collision {
  eventId: string;
  eventTitle: string;
  loserGroupId: number;
  loserGroupName: string;
}

interface ParsedLog {
  collisions: Collision[];
  /**
   * Map of eventId → winner group id, sourced from the dry-run
   * pre-flight's per-group `⊘ COLLISION → ... already owned by group <id>`
   * lines. Empty for apply-mode logs (those lines don't appear there) —
   * in which case the inspect script falls back to a DB lookup via
   * findFirst({source, externalEventId}).
   */
  winnerByEvent: Map<string, number>;
}

function parseLog(path: string): ParsedLog {
  const txt = readFileSync(path, 'utf8');
  const collisions: Collision[] = [];
  const winnerByEvent = new Map<string, number>();
  // The file logger prepends "[iso-ts] LEVEL " to each line; strip it so
  // the same regex works for both file and raw console output.
  const stripPrefix = /^\[[^\]]+\]\s+\S+\s+/;
  const eventRe = /^\s*event\s+(\S+?)(?:\s+\((.*?)\))?\s+—/;
  // Optional `[conflict-resolved]` suffix: the backfill emits it after
  // the closing quote for losers whose chosen event came from
  // --resolve-conflicts. Without this trailing-suffix slot, the `$`
  // anchor rejects those lines and the corresponding collisions silently
  // drop out of the inspect input.
  const groupRe =
    /^\s*·\s+group\s+(\d+)\s+"(.*)"(?:\s+\[conflict-resolved\])?\s*$/;
  // Dry-run pre-flight emits, per losing group:
  //   ⊘ group <loser> "<name>" COLLISION → event <eid> ... already owned by group <winner> "<name>"
  // We extract eid + winner id so the inspect can show the winner even
  // before --apply has populated externalEventId in the DB.
  // Loser group name is matched with `.+?` (non-greedy any-char) rather
  // than `"[^"]*"` because Polymarket prop titles can contain literal
  // double quotes inside the name (e.g.
  //   "Trump say "Ballroom" or "250" during the Detroit speech")
  // — the earlier quote-anchored pattern bailed out at the first inner
  // quote and dropped winner ids for ~21 collisions on prod.
  //
  // Event title parens use `.*?` (non-greedy) so titles that themselves
  // contain `)` (e.g. "Super Bowl LX (Las Vegas)") still match.
  const collisionRe =
    /⊘\s+group\s+\d+\s+.+?\s+COLLISION\s+→\s+event\s+(\S+?)(?:\s+\(.*?\))?\s+already owned by group\s+(\d+)\b/;
  let currentEventId: string | null = null;
  let currentEventTitle = '';
  for (const raw of txt.split('\n')) {
    const line = raw.replace(stripPrefix, '');
    const cm = collisionRe.exec(line);
    if (cm) {
      const eid = cm[1];
      const winnerId = Number(cm[2]);
      if (!winnerByEvent.has(eid)) winnerByEvent.set(eid, winnerId);
      continue;
    }
    const em = eventRe.exec(line);
    if (em) {
      currentEventId = em[1];
      currentEventTitle = em[2] ?? '';
      continue;
    }
    const gm = groupRe.exec(line);
    if (gm && currentEventId) {
      collisions.push({
        eventId: currentEventId,
        eventTitle: currentEventTitle,
        loserGroupId: Number(gm[1]),
        loserGroupName: gm[2],
      });
    }
  }
  return { collisions, winnerByEvent };
}

async function main(): Promise<void> {
  const logPath = process.argv[2] ?? findLatestBackfillLog();
  console.log(`[inspect] reading ${logPath}`);
  const { collisions, winnerByEvent } = parseLog(logPath);
  if (collisions.length === 0) {
    console.log('[inspect] no collisions found in log');
    return;
  }
  console.log(
    `[inspect] ${collisions.length} collision(s) to inspect` +
      (winnerByEvent.size > 0
        ? ` (parsed ${winnerByEvent.size} winner ids from dry-run pre-flight lines)`
        : '') +
      '\n'
  );

  let mergeableCount = 0;
  let suspiciousCount = 0;
  let privatedWinners = 0;
  let privatedLosers = 0;
  let bothPrivated = 0;
  // Settlement breakdown across all rows we inspect, summed across
  // winner+loser per collision. "Live" = public AND !settled — those are
  // the conditions a merge actually exposes to user-visible risk. Settled
  // and privated-unsettled conditions are operationally safe to move.
  let totalSettled = 0;
  let totalLive = 0;
  let pairsNoLive = 0;
  let pairsAllLive = 0;
  let pairsMixed = 0;
  for (const c of collisions) {
    const select = {
      id: true,
      name: true,
      negRiskMarketId: true,
      externalEventId: true,
      createdAt: true,
      publicConditionCount: true,
      totalOpenInterest: true,
      maxEndTime: true,
      condition: {
        select: { settled: true, resolvedToYes: true, public: true },
      },
    } as const;
    const parsedWinnerId = winnerByEvent.get(c.eventId);
    const [winnerByDb, loser] = await Promise.all([
      prisma.conditionGroup.findFirst({
        where: { source: 'polymarket', externalEventId: c.eventId },
        select,
      }),
      prisma.conditionGroup.findUnique({
        where: { id: c.loserGroupId },
        select,
      }),
    ]);
    // Apply-mode logs: winner lives in DB under (source, externalEventId).
    // Dry-run logs: DB has no winner yet, fall back to the id parsed from
    // the per-group `⊘ COLLISION` line in the pre-flight output.
    const winner =
      winnerByDb ??
      (parsedWinnerId !== undefined
        ? await prisma.conditionGroup.findUnique({
            where: { id: parsedWinnerId },
            select,
          })
        : null);

    type GroupRow = NonNullable<typeof winner>;
    interface Stats {
      total: number;
      settled: number;
      // "live" = public && !settled — i.e. visible to users AND still open.
      // A private unsettled condition is operationally dead (hidden) so it
      // doesn't contribute to merge risk.
      live: number;
      resolvedYes: number;
      resolvedNo: number;
    }
    const computeStats = (g: GroupRow): Stats => {
      let settled = 0;
      let live = 0;
      let resolvedYes = 0;
      let resolvedNo = 0;
      for (const cond of g.condition) {
        if (cond.settled) {
          settled++;
          if (cond.resolvedToYes) resolvedYes++;
          else resolvedNo++;
        } else if (cond.public) {
          live++;
        }
      }
      return {
        total: g.condition.length,
        settled,
        live,
        resolvedYes,
        resolvedNo,
      };
    };
    const fmt = (g: GroupRow, s: Stats): string => {
      const privated = g.publicConditionCount === 0;
      const endTime =
        g.maxEndTime > 0
          ? new Date(g.maxEndTime * 1000).toISOString().slice(0, 10)
          : '—';
      const settledFrac =
        s.total > 0
          ? `${s.settled}/${s.total} settled (${s.resolvedYes} YES, ${s.resolvedNo} NO), ${s.live} live`
          : '0/0 settled, 0 live';
      return (
        ` — ${s.total} cond (${g.publicConditionCount} public${privated ? ', PRIVATED' : ''}),` +
        ` ${settledFrac},` +
        ` OI=${g.totalOpenInterest.toString()}, maxEnd=${endTime},` +
        ` basket=${g.negRiskMarketId ?? 'null'},` +
        ` created ${g.createdAt.toISOString()}`
      );
    };

    console.log(
      `event ${c.eventId}${c.eventTitle ? ` — ${c.eventTitle}` : ''}`
    );
    let pairSettled = 0;
    let pairLive = 0;
    if (winner) {
      const s = computeStats(winner);
      console.log(`  WINNER group ${winner.id} "${winner.name}"` + fmt(winner, s));
      if (winner.publicConditionCount === 0) privatedWinners++;
      pairSettled += s.settled;
      pairLive += s.live;
      totalSettled += s.settled;
      totalLive += s.live;
    } else {
      console.log(
        `  WINNER not found — was the event reclaimed or the group deleted?`
      );
    }
    if (loser) {
      const s = computeStats(loser);
      console.log(
        `  LOSER  group ${loser.id} "${loser.name}"` +
          fmt(loser, s) +
          ` (externalEventId=${loser.externalEventId ?? 'null'})`
      );
      if (loser.publicConditionCount === 0) privatedLosers++;
      if (
        winner &&
        winner.publicConditionCount === 0 &&
        loser.publicConditionCount === 0
      )
        bothPrivated++;
      pairSettled += s.settled;
      pairLive += s.live;
      totalSettled += s.settled;
      totalLive += s.live;
      // Heuristic: a loser with very few conditions is almost certainly
      // a stale duplicate worth merging. A loser comparable in size to
      // the winner is suspicious — manually triage before merging.
      if (winner) {
        if (loser.condition.length <= Math.max(2, winner.condition.length / 4)) {
          mergeableCount++;
          console.log(`  → looks mergeable (loser is small vs winner)`);
        } else {
          suspiciousCount++;
          console.log(
            `  → SUSPICIOUS — loser size comparable to winner; inspect members before merging`
          );
        }
      }
    } else {
      console.log(`  LOSER  group ${c.loserGroupId} not found`);
    }
    if (pairLive === 0) pairsNoLive++;
    else if (pairSettled === 0) pairsAllLive++;
    else pairsMixed++;
    console.log('');
  }

  console.log(`[inspect] summary: ${collisions.length} collision(s)`);
  console.log(`  mergeable (small loser)  : ${mergeableCount}`);
  console.log(`  suspicious (similar size): ${suspiciousCount}`);
  console.log(`  privated winners         : ${privatedWinners}`);
  console.log(`  privated losers          : ${privatedLosers}`);
  console.log(`  both sides privated      : ${bothPrivated}`);
  console.log(
    `  pairs with no live cond  : ${pairsNoLive}  (safe — historical or privated only)`
  );
  console.log(
    `  pairs all live           : ${pairsAllLive}  (active markets — careful)`
  );
  console.log(
    `  pairs mixed              : ${pairsMixed}  (some settled + some live)`
  );
  console.log(
    `  conditions settled/live  : ${totalSettled} settled, ${totalLive} live across both sides`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
