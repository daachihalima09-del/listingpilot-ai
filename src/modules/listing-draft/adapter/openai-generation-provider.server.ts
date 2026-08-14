import 'server-only';
import { getOpenAiResponsesClient } from '../../openai/responses-client.server';
import { OpenAiGenerationProvider } from './openai-generation-provider';
import type { ListingGenerationTrace } from '../persistence/generation-trace.server.ts';

export function createOpenAiGenerationProvider(trace?: ListingGenerationTrace): OpenAiGenerationProvider {
  return new OpenAiGenerationProvider(getOpenAiResponsesClient(), trace);
}
