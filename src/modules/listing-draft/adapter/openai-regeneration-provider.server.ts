import 'server-only';
import { getOpenAiResponsesClient } from '../../openai/responses-client.server.ts';
import { OpenAiRegenerationProvider } from './openai-regeneration-provider.ts';

export function createOpenAiRegenerationProvider(): OpenAiRegenerationProvider {
  return new OpenAiRegenerationProvider(getOpenAiResponsesClient());
}
