import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const generationTraceDirectory = path.join(process.cwd(), '.local-diagnostics', 'generation-traces');
const MAX_TRACES = 75;
const MAX_TEXT = 500;

export type ListingGenerationStage = 'authorization' | 'project_load' | 'merchant_profile' | 'generation_eligibility' | 'generation_plan' | 'generation_instructions' | 'provider_request' | 'provider_response' | 'response_parsing' | 'factual_validation' | 'craft_validation' | 'persistence' | 'response';
type StageStatus = 'STARTED' | 'PASSED' | 'FAILED' | 'SKIPPED';
type SafeRecord = Record<string, unknown>;

export interface GenerationTraceDocument {
  correlationRequestId: string;
  timestamp: string;
  projectId: string;
  workspaceId: string | null;
  projectVersion: number | null;
  product: { brand: string | null; model: string | null; type: string | null };
  instructionFingerprint: string | null;
  stages: Partial<Record<ListingGenerationStage, { startedAt: string | null; completedAt: string | null; durationMs: number | null; status: StageStatus; details?: SafeRecord }>>;
  failure: SafeRecord | null;
}

export interface ListingGenerationTrace {
  readonly requestId: string;
  context(details: SafeRecord): void;
  start(stage: ListingGenerationStage): void;
  complete(stage: ListingGenerationStage, details?: SafeRecord): void;
  fail(error: unknown): void;
  flush(): Promise<void>;
}

const truncate = (value: string | null | undefined) => value ? value.slice(0, MAX_TEXT) : null;
function safeValue(value: unknown): unknown {
  if (typeof value === 'string') return truncate(value);
  if (Array.isArray(value)) return value.slice(0, 20).map(safeValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as SafeRecord).slice(0, 30).map(([key, item]) => [key, safeValue(item)]));
  return value;
}
function detailsFor(error: unknown): SafeRecord {
  if (!error || typeof error !== 'object') return { errorClass: 'UnknownError' };
  const item = error as { name?: unknown; code?: unknown; statusCode?: unknown; message?: unknown; metadata?: unknown };
  return {
    errorClass: typeof item.name === 'string' ? item.name : 'UnknownError',
    ...(typeof item.code === 'string' ? { errorCode: item.code } : {}),
    ...(typeof item.statusCode === 'number' ? { errorStatus: item.statusCode } : {}),
    ...(typeof item.message === 'string' ? { reason: truncate(item.message) } : {}),
    ...(item.metadata && typeof item.metadata === 'object' ? { validation: safeValue(item.metadata) } : {}),
  };
}
async function persist(document: GenerationTraceDocument): Promise<void> {
  await mkdir(generationTraceDirectory, { recursive: true });
  const filename = path.join(generationTraceDirectory, `${document.correlationRequestId}.json`);
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, JSON.stringify(document, null, 2), 'utf8');
  await rename(temporary, filename);
  const entries = await readdir(generationTraceDirectory, { withFileTypes: true });
  const traces = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map(async (entry) => ({ entry, timestamp: (await readFile(path.join(generationTraceDirectory, entry.name), 'utf8')).match(/"timestamp":\s*"([^"]+)/u)?.[1] ?? '' })));
  for (const old of traces.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(MAX_TRACES)) await unlink(path.join(generationTraceDirectory, old.entry.name));
}

export async function readGenerationTrace(requestId: string): Promise<GenerationTraceDocument | null> {
  if (process.env.NODE_ENV === 'production' || !/^[0-9a-f-]{36}$/iu.test(requestId)) return null;
  try { return JSON.parse(await readFile(path.join(generationTraceDirectory, `${requestId}.json`), 'utf8')) as GenerationTraceDocument; } catch { return null; }
}

export function createListingGenerationTrace(input: { readonly requestId: string; readonly projectId: string }): ListingGenerationTrace {
  const enabled = process.env.NODE_ENV !== 'production';
  const document: GenerationTraceDocument = { correlationRequestId: input.requestId, timestamp: new Date().toISOString(), projectId: input.projectId, workspaceId: null, projectVersion: null, product: { brand: null, model: null, type: null }, instructionFingerprint: null, stages: {}, failure: null };
  let current: ListingGenerationStage | null = null;
  let pending = Promise.resolve();
  const save = () => { if (enabled) pending = pending.then(() => persist(document)).catch(() => undefined); };
  const now = () => new Date().toISOString();
  return {
    requestId: input.requestId,
    context(details) { Object.assign(document, safeValue(details)); save(); },
    start(stage) { current = stage; document.stages[stage] = { startedAt: now(), completedAt: null, durationMs: null, status: 'STARTED' }; save(); },
    complete(stage, details = {}) { const prior = document.stages[stage]; const completedAt = now(); document.stages[stage] = { startedAt: prior?.startedAt ?? completedAt, completedAt, durationMs: prior?.startedAt ? Date.parse(completedAt) - Date.parse(prior.startedAt) : 0, status: 'PASSED', ...(Object.keys(details).length ? { details: safeValue(details) as SafeRecord } : {}) }; save(); },
    fail(error) { const failure = detailsFor(error); document.failure = failure; if (current) { const prior = document.stages[current]; const completedAt = now(); document.stages[current] = { startedAt: prior?.startedAt ?? completedAt, completedAt, durationMs: prior?.startedAt ? Date.parse(completedAt) - Date.parse(prior.startedAt) : 0, status: 'FAILED', details: failure }; } save(); },
    async flush() { await pending; },
  };
}
