import 'server-only';
import { OpenAiResponsesClient } from './responses-client-core';

let sharedClient: OpenAiResponsesClient | null = null;

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value ? Number(value) : fallback;
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function getOpenAiResponsesClient(): OpenAiResponsesClient {
  if (!sharedClient) {
    sharedClient = new OpenAiResponsesClient({
      apiKey: process.env.OPENAI_API_KEY ?? '',
      defaultModel: process.env.OPENAI_MODEL,
      timeoutMs: boundedInteger(process.env.OPENAI_TIMEOUT_MS, 60_000, 5_000, 120_000),
      maximumAttempts: boundedInteger(process.env.OPENAI_MAXIMUM_ATTEMPTS, 2, 1, 3),
    });
  }
  return sharedClient;
}
