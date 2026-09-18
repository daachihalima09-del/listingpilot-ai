import assert from 'node:assert/strict';
import test from 'node:test';
import { AiProtectionError } from './domain.ts';
import { DurableRateLimiter, type RateLimitRepository } from './service.ts';

class MemoryRateRepository implements RateLimitRepository {
  readonly events: Array<{ action: string; subjectHash: string; workspaceId: string | null; createdAt: Date }> = [];
  async consume(input: Parameters<RateLimitRepository['consume']>[0]) {
    const current = this.events.filter((event) => event.action === input.action && event.subjectHash === input.subjectHash && event.createdAt >= input.windowStartedAt);
    if (current.length >= input.maximum) return { allowed: false, retryAfterSeconds: 60 };
    this.events.push({ action: input.action, subjectHash: input.subjectHash, workspaceId: input.workspaceId, createdAt: input.now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

test('durable limiter throttles repeated attempts and permits requests after an injected window expires', async () => {
  let now = new Date('2026-08-29T12:00:00Z');
  const repository = new MemoryRateRepository();
  const limiter = new DurableRateLimiter(repository, () => now);
  const input = { action: 'SIGN_IN', subjectHash: 'a'.repeat(64), maximum: 2, windowSeconds: 60 };
  await limiter.enforce(input); await limiter.enforce(input);
  await assert.rejects(limiter.enforce(input), (error) => error instanceof AiProtectionError && error.code === 'REQUEST_RATE_LIMITED');
  now = new Date('2026-08-29T12:01:01Z');
  await limiter.enforce(input);
});

test('rate state is isolated by subject/workspace and successful legitimate requests are recorded', async () => {
  const repository = new MemoryRateRepository();
  const limiter = new DurableRateLimiter(repository);
  await limiter.enforce({ action: 'PRODUCT_ANALYSIS', subjectHash: 'a'.repeat(64), workspaceId: 'workspace-a', maximum: 1, windowSeconds: 60 });
  await limiter.enforce({ action: 'PRODUCT_ANALYSIS', subjectHash: 'b'.repeat(64), workspaceId: 'workspace-b', maximum: 1, windowSeconds: 60 });
  assert.equal(repository.events.length, 2);
});
