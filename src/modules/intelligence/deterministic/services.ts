export interface IntelligenceClock {
  now(): string;
  nowMilliseconds(): number;
}

export interface IntelligenceIdGenerator {
  nextId(namespace: string): string;
}

export interface IntelligenceHasher {
  hash(value: unknown): string;
}

export interface IntelligenceRuntimeServices {
  readonly clock: IntelligenceClock;
  readonly ids: IntelligenceIdGenerator;
  readonly hasher: IntelligenceHasher;
}

function stableValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) throw new TypeError('Cannot hash a circular value.');
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => stableValue(item, seen));
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item, seen)]),
  );
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value, new WeakSet()));
}

export class DefaultIntelligenceClock implements IntelligenceClock {
  now(): string {
    return new Date().toISOString();
  }

  nowMilliseconds(): number {
    return Date.now();
  }
}

export class DefaultIntelligenceIdGenerator implements IntelligenceIdGenerator {
  nextId(namespace: string): string {
    return `${namespace}_${globalThis.crypto.randomUUID()}`;
  }
}

export class DeterministicHasher implements IntelligenceHasher {
  hash(value: unknown): string {
    const input = stableSerialize(value);
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < input.length; index += 1) {
      const code = input.charCodeAt(index);
      first ^= code;
      first = Math.imul(first, 0x01000193);
      second ^= code + index;
      second = Math.imul(second, 0x85ebca6b);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  }
}

export function createDefaultRuntimeServices(): IntelligenceRuntimeServices {
  return Object.freeze({
    clock: new DefaultIntelligenceClock(),
    ids: new DefaultIntelligenceIdGenerator(),
    hasher: new DeterministicHasher(),
  });
}

export class FixedIntelligenceClock implements IntelligenceClock {
  private milliseconds: number;

  constructor(timestamp: string) {
    this.milliseconds = Date.parse(timestamp);
  }

  now(): string {
    return new Date(this.milliseconds).toISOString();
  }

  nowMilliseconds(): number {
    return this.milliseconds;
  }

  advance(milliseconds: number): void {
    this.milliseconds += milliseconds;
  }
}

export class SequenceIdGenerator implements IntelligenceIdGenerator {
  private current = 0;

  nextId(namespace: string): string {
    this.current += 1;
    return `${namespace}_${this.current}`;
  }
}
