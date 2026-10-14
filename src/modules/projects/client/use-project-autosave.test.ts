import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ProjectSaveSnapshot, SavedProjectWorkspace, useProjectAutosave } from './use-project-autosave.ts';

const baseline: ProjectSaveSnapshot = {
  sourceType: 'PRODUCT_URL', sourceUrl: 'https://manufacturer.example/saved', rawInput: null,
  analysisData: null, generatedListing: null, seoData: null, readinessData: null,
};
const project: SavedProjectWorkspace = {
  ...baseline, id: '33333333-3333-4333-8333-333333333333', containerProjectId: '22222222-2222-4222-8222-222222222222',
  organizationId: '11111111-1111-4111-8111-111111111111', workspaceId: '44444444-4444-4444-8444-444444444444',
  name: 'Synthetic Product A', status: 'DRAFT', version: 7, updatedAt: '2026-01-01T00:00:00.000Z',
};

class TestProjectApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function createHarness(selectedProject = project) {
  const slots: Array<{ value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void }> = [];
  const effects: Array<() => void> = [];
  const timers = new Map<number, () => void>();
  const requests: Array<{ path: string; body: Record<string, unknown>; resolve: (result: unknown) => void; reject: (error: unknown) => void }> = [];
  let cursor = 0;
  let timerId = 0;
  const react = {
    useRef<T>(value: T) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: value } };
      return slots[index].value as { current: T };
    },
    useState<T>(value: T) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value };
      return [slots[index].value as T, (next: T | ((current: T) => T)) => {
        slots[index].value = typeof next === 'function' ? (next as (current: T) => T)(slots[index].value as T) : next;
      }];
    },
    useCallback: (callback: unknown) => callback,
    useEffect(effect: () => (() => void) | void, dependencies: readonly unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous?.dependencies?.length === dependencies.length && dependencies.every((value, position) => Object.is(value, previous.dependencies?.[position]))) return;
      effects.push(() => {
        previous?.cleanup?.();
        slots[index] = { dependencies, cleanup: effect() || undefined };
      });
    },
  };
  const exports: Record<string, unknown> = {};
  const source = readFileSync('src/modules/projects/client/use-project-autosave.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'react') return react;
      if (name === './project-api') return {
        ProjectApiError: TestProjectApiError,
        projectApiRequest(path: string, options: { body: Record<string, unknown> }) {
          return new Promise((resolve, reject) => { requests.push({ path, body: options.body, resolve, reject }); });
        },
      };
      throw new Error(`Unexpected local test import: ${name}`);
    },
    window: {
      setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id: number) { timers.delete(id); },
    },
  });
  const hook = exports.useProjectAutosave as typeof useProjectAutosave;
  return {
    requests,
    render(snapshot: ProjectSaveSnapshot, paused = false) {
      cursor = 0;
      const result = hook({ project: selectedProject, snapshot, enabled: true, paused });
      for (const effect of effects.splice(0)) effect();
      return result;
    },
    runTimers() {
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    },
    scheduledCallbacks() { return [...timers.values()]; },
    async settle(index: number, version: number) {
      requests[index].resolve({ product: { version, updatedAt: '2026-01-02T00:00:00.000Z' } });
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    },
    async reject(index: number, error: Error) {
      requests[index].reject(error);
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    },
  };
}

test('paused analysis prevents autosave of edited source and review snapshots', async () => {
  const harness = createHarness();
  harness.render(baseline);
  const saved = harness.render({ ...baseline, sourceUrl: 'https://manufacturer.example/replacement' }, true);
  harness.runTimers();
  assert.equal(await saved.saveNow(), null);
  assert.equal(harness.requests.length, 0);
});

test('pauseAndDrain waits for the in-flight save and prevents competing queued saves', async () => {
  const harness = createHarness();
  harness.render(baseline);
  const changed = { ...baseline, sourceUrl: 'https://manufacturer.example/changed' };
  let saved = harness.render(changed);
  const pendingSave = saved.saveNow();
  assert.equal(harness.requests.length, 1);
  saved = harness.render({ ...changed, rawInput: 'Queued input' });
  harness.runTimers();
  let drained = false;
  const drain = saved.pauseAndDrain().then((version) => { drained = true; return version; });
  await Promise.resolve();
  assert.equal(drained, false);
  await harness.settle(0, 8);
  assert.equal(await drain, 8);
  assert.equal(await pendingSave, 8);
  assert.equal(harness.requests.length, 1);
});

test('authoritative analysis adoption prevents an obsolete queued snapshot from overwriting success', async () => {
  const harness = createHarness();
  harness.render(baseline);
  const changed = { ...baseline, sourceUrl: 'https://manufacturer.example/replacement' };
  let saved = harness.render(changed);
  assert.equal(await saved.pauseAndDrain(), 7);
  const authoritative: ProjectSaveSnapshot = { ...changed, rawInput: 'Authoritatively analyzed input' };
  saved.adoptExternalSave(8, authoritative);
  saved.resume();
  saved = harness.render(authoritative);
  harness.runTimers();
  assert.equal(await saved.saveNow(), 8);
  assert.equal(harness.requests.length, 0);
});

test('failed analysis can resume autosave of the same pending replacement input', async () => {
  const harness = createHarness();
  harness.render(baseline);
  const changed = { ...baseline, sourceUrl: 'https://manufacturer.example/forbidden' };
  let saved = harness.render(changed);
  await saved.pauseAndDrain();
  saved.resume();
  saved = harness.render(changed);
  const pending = saved.saveNow();
  assert.equal(harness.requests[0].body.sourceUrl, changed.sourceUrl);
  assert.equal(harness.requests[0].body.version, 7);
  await harness.settle(0, 8);
  assert.equal(await pending, 8);
});

test('a pre-analysis timer cannot write an obsolete snapshot after authoritative analysis adoption', async () => {
  const harness = createHarness();
  harness.render(baseline);
  const changed = { ...baseline, sourceUrl: 'https://manufacturer.example/replacement' };
  const saved = harness.render(changed);
  const obsoleteCallback = harness.scheduledCallbacks()[0];
  assert.equal(typeof obsoleteCallback, 'function');
  await saved.pauseAndDrain();
  saved.adoptExternalSave(8, { ...changed, rawInput: 'Authoritatively saved analysis input' });
  saved.resume();
  // Exercise the interval before React can clean up the previous render's timer.
  obsoleteCallback();
  assert.equal(harness.requests.length, 0);
});

test('post-analysis autosave uses the authoritative response version on the same Product route', async () => {
  const harness = createHarness();
  let saved = harness.render(baseline);
  await saved.pauseAndDrain();
  saved.adoptExternalSave(11, baseline);
  saved.resume();
  saved = harness.render({ ...baseline, rawInput: 'Later merchant edit' });
  const pending = saved.saveNow();
  assert.equal(harness.requests[0].path, `/api/projects/${project.containerProjectId}/products/${project.id}/state`);
  assert.equal(harness.requests[0].body.workspaceId, project.workspaceId);
  assert.equal(harness.requests[0].body.version, 11);
  await harness.settle(0, 12);
  assert.equal(await pending, 12);
});

test('saveNow does not report a saved version while a different snapshot is still being written', async () => {
  const harness = createHarness();
  harness.render(baseline);
  const changed = { ...baseline, rawInput: 'In-flight merchant edit' };
  const inFlight = harness.render(changed).saveNow();
  const restored = harness.render(baseline);
  let completed = false;
  const saveRestored = restored.saveNow().then((version) => { completed = true; return version; });
  await Promise.resolve();
  assert.equal(completed, false);
  await harness.settle(0, 8);
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].body.version, 8);
  await harness.settle(1, 9);
  assert.equal(await saveRestored, 9);
  await inFlight;
});

test('a stale autosave stays conflicted and cannot send another write during analysis recovery', async () => {
  const harness = createHarness();
  harness.render(baseline);
  const changed = { ...baseline, rawInput: 'Source edit' };
  let saved = harness.render(changed);
  const pending = saved.saveNow();
  await harness.reject(0, new TestProjectApiError(409, 'Newer changes exist.'));
  assert.equal(await pending, null);
  saved = harness.render(changed);
  assert.equal(saved.status, 'conflict');
  assert.equal(await saved.saveNow(), null);
  assert.equal(harness.requests.length, 1);
});

test('Product B autosave never reuses Product A route or version', async () => {
  const productB = { ...project, id: '55555555-5555-4555-8555-555555555555', version: 19 };
  const first = createHarness(project);
  const second = createHarness(productB);
  first.render(baseline);
  second.render(baseline);
  const changed = { ...baseline, rawInput: 'Independent merchant edit' };
  const saveA = first.render(changed).saveNow();
  const saveB = second.render(changed).saveNow();
  assert.equal(first.requests[0].body.version, 7);
  assert.equal(second.requests[0].body.version, 19);
  assert.notEqual(first.requests[0].path, second.requests[0].path);
  await first.settle(0, 8);
  await second.settle(0, 20);
  assert.equal(await saveA, 8);
  assert.equal(await saveB, 20);
});
