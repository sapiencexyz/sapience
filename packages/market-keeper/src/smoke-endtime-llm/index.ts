/**
 * Smoke test for the LLM endTime path.
 *
 * Fires one Perplexity Sonar call against a synthetic Polymarket market,
 * runs the result through `decideEndTime`, and asserts the combiner picked
 * the LLM branch. Exit 0 means the LLM wiring (auth, model id, prompt,
 * citations parse, combiner) is alive end-to-end; exit 1 means something
 * regressed.
 *
 * Where this runs: two Railway services, both invoking this same script.
 *   - Daily heartbeat: catches external regressions between deploys
 *     (OpenRouter API shape change, model deprecation, auth rotation).
 *   - Per-deploy gate: runs after a keeper deploy completes; failing
 *     deploy is marked unhealthy before traffic is taken.
 * Keeping OPENROUTER_API_KEY in Railway (not GitHub Actions) blocks the
 * credit-drain vector of PR-spam abuse via CI workflows.
 *
 * Why a synthetic market: the smoke is testing the call path, not endTime
 * quality. A fixed input keeps the assertion deterministic across runs.
 * The GraphQL fetch path is exercised by every cron tick — no need to
 * double-test it here. No DB writes either; smoke is fully read-only.
 *
 * Model default is `perplexity/sonar` (cheap) rather than inheriting the
 * keeper's `perplexity/sonar-pro` default. The smoke proves the *call
 * path*, not the prod model's hallucination profile — prod model quality
 * is verified by daily generate output, not by a fixed synthetic market.
 * Override via LLM_ENDTIME_MODEL=perplexity/sonar-pro if you want to
 * smoke the prod model explicitly.
 *
 * Cost: ~$0.005 per invocation at sonar pricing (dominated by the $5/1000
 * web-search charge, not tokens). Daily + per-deploy = rounding error.
 */

import { enrichEndTimesWithLLM } from '../llm';
import { decideEndTime } from '../generate/api';
import type { PolymarketMarket, SapienceCondition } from '../types';
import { log, logError } from '../utils';

const SMOKE_MARKET: PolymarketMarket = {
  id: 'smoke',
  conditionId: '0xsmoke',
  question:
    'Will the men’s singles final of the 2027 Australian Open be played on or before January 31, 2027?',
  description:
    'Resolves YES if the men’s singles final of the 2027 Australian Open is played at any point on or before 11:59 PM AET on January 31, 2027.',
  events: [{ title: '2027 Australian Open' }],
  outcomes: ['Yes', 'No'],
  outcomePrices: [0.5, 0.5],
  endDate: '2027-01-31T12:59:00Z',
  volume: '0',
  liquidity: '0',
  slug: 'smoke-ao-2027',
  active: true,
  closed: false,
};

// Cheap by default — see file header rationale.
const SMOKE_DEFAULT_MODEL = 'perplexity/sonar';

export async function runSmoke(): Promise<number> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.LLM_ENDTIME_MODEL || SMOKE_DEFAULT_MODEL;

  if (!apiKey) {
    logError(
      '[smoke-endtime-llm] FAIL: OPENROUTER_API_KEY not set. The smoke must be invoked with the key wired in from Railway env, never from CI secrets.'
    );
    return 1;
  }

  log(`[smoke-endtime-llm] Calling Sonar with model=${model} ...`);

  let llmMap;
  try {
    // Force enabled:true — staging keeper runs with LLM_ENABLED=false at
    // runtime, and we explicitly want to bypass that gate here.
    llmMap = await enrichEndTimesWithLLM([SMOKE_MARKET], {
      enabled: true,
      apiKey,
      model,
    });
  } catch (err) {
    logError(
      `[smoke-endtime-llm] FAIL: Sonar call threw — ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }

  const llmResult = llmMap.get(SMOKE_MARKET.conditionId);
  if (!llmResult) {
    logError(
      '[smoke-endtime-llm] FAIL: Sonar returned no entry for the smoke market — see [LLM:endTime] error logs above.'
    );
    return 1;
  }

  log(
    `[smoke-endtime-llm] Sonar result: ts=${llmResult.ts}, confidence=${llmResult.confidence}`
  );

  if (llmResult.ts === null) {
    logError(
      `[smoke-endtime-llm] FAIL: Sonar returned a null timestamp (confidence=${llmResult.confidence}). The prompt parses but Sonar refused to commit — investigate the prompt or model.`
    );
    return 1;
  }

  // Run the combiner. With a non-null LLM ts, decideEndTime MUST pick the
  // LLM branch — anything else is a regression in decideEndTime itself.
  const condition: SapienceCondition = {
    conditionHash: SMOKE_MARKET.conditionId,
    question: SMOKE_MARKET.question,
    shortName: 'AO 2027 final?',
    categorySlug: 'sports',
    endDate: SMOKE_MARKET.endDate,
    description: SMOKE_MARKET.description,
    similarMarkets: [],
    tags: [],
    chainId: 5064014,
    llmEndTime: llmResult,
  };

  const decision = decideEndTime(condition);
  log(
    `[smoke-endtime-llm] decideEndTime: source=${decision.source}, ts=${decision.ts}`
  );

  if (!decision.source.startsWith('llm-')) {
    logError(
      `[smoke-endtime-llm] FAIL: combiner picked source=${decision.source} despite a non-null Sonar ts. decideEndTime priority is broken.`
    );
    return 1;
  }

  log('[smoke-endtime-llm] OK: LLM endTime path alive end-to-end.');
  return 0;
}

export async function main(): Promise<void> {
  const code = await runSmoke();
  process.exit(code);
}
