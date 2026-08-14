import 'server-only';
import { OpenAiResponsesClient } from './responses-client-core';

let sharedClient: OpenAiResponsesClient | null = null;

export function getOpenAiResponsesClient(): OpenAiResponsesClient {
  if (!sharedClient) {
    sharedClient = new OpenAiResponsesClient({
      apiKey: process.env.OPENAI_API_KEY ?? '',
    });
  }
  return sharedClient;
}
