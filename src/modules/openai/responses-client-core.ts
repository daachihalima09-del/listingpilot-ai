export type OpenAiResponsesErrorCode =
  | 'NOT_CONFIGURED'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'TIMED_OUT'
  | 'REQUEST_FAILED'
  | 'REFUSED'
  | 'MALFORMED_RESPONSE';

export class OpenAiResponsesError extends Error {
  readonly code: OpenAiResponsesErrorCode;
  readonly statusCode: number;
  readonly requestId: string | null;

  constructor(
    code: OpenAiResponsesErrorCode,
    message: string,
    statusCode: number,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = 'OpenAiResponsesError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}

export interface StructuredResponseRequest<T> {
  readonly schemaName: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly instructions: string;
  readonly input: unknown;
  readonly parse: (value: unknown) => T;
  readonly model?: string;
  readonly maxOutputTokens?: number;
  readonly verbosity?: 'low' | 'medium' | 'high';
  readonly reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  readonly signal?: AbortSignal;
  readonly onOpenAiResponse?: (requestId: string | null) => void;
  readonly onResponseParsed?: () => void;
}

export interface StructuredResponseResult<T> {
  readonly data: T;
  readonly requestId: string | null;
}

interface ResponsesBody {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
}

export interface OpenAiResponsesClientOptions {
  readonly apiKey: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maximumAttempts?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly logger?: Pick<Console, 'error' | 'warn'>;
}

function outputText(body: ResponsesBody): string {
  if (body.output_text) return body.output_text;
  for (const output of body.output ?? []) {
    if (output.type !== 'message') continue;
    for (const content of output.content ?? []) {
      if (content.type === 'output_text' && content.text) return content.text;
      if (content.type === 'refusal' && content.refusal) {
        throw new OpenAiResponsesError('REFUSED', 'The generation request was refused.', 422);
      }
    }
  }
  throw new OpenAiResponsesError(
    'MALFORMED_RESPONSE',
    'The response did not contain structured output.',
    502,
  );
}

function retryable(status: number): boolean {
  return status === 429 || [500, 502, 503, 504].includes(status);
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1_000, 5_000);
  }
  return Math.min(250 * (2 ** (attempt - 1)), 2_000);
}

export class OpenAiResponsesClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maximumAttempts: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly logger: Pick<Console, 'error' | 'warn'>;

  constructor(options: OpenAiResponsesClientOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiResponsesError(
        'NOT_CONFIGURED',
        'Generation is not configured on the server.',
        503,
      );
    }
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maximumAttempts = Math.max(1, Math.min(options.maximumAttempts ?? 2, 3));
    this.sleep = options.sleep ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.logger = options.logger ?? console;
  }

  async createStructuredResponse<T>(
    request: StructuredResponseRequest<T>,
  ): Promise<StructuredResponseResult<T>> {
    let lastError: OpenAiResponsesError | null = null;
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('timeout'), this.timeoutMs);
      const abortForCaller = () => controller.abort('caller');
      request.signal?.addEventListener('abort', abortForCaller, { once: true });
      try {
        const response = await this.fetcher('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model ?? 'gpt-5.6-sol',
            store: false,
            reasoning: { effort: request.reasoningEffort ?? 'low' },
            max_output_tokens: request.maxOutputTokens ?? 8_000,
            instructions: request.instructions,
            input: JSON.stringify(request.input),
            text: {
              verbosity: request.verbosity ?? 'medium',
              format: {
                type: 'json_schema',
                name: request.schemaName,
                strict: true,
                schema: request.schema,
              },
            },
          }),
          signal: controller.signal,
        });
        const requestId = response.headers.get('x-request-id');
        if (!response.ok) {
          const code: OpenAiResponsesErrorCode = response.status === 401
            ? 'AUTHENTICATION_FAILED'
            : response.status === 429
              ? 'RATE_LIMITED'
              : 'REQUEST_FAILED';
          lastError = new OpenAiResponsesError(
            code,
            code === 'RATE_LIMITED'
              ? 'Generation is temporarily rate limited. Please try again.'
              : 'The generation provider could not complete the request.',
            response.status === 429 ? 429 : 502,
            requestId,
          );
          this.logger.warn('OpenAI Responses API request failed.', {
            status: response.status,
            requestId,
            attempt,
          });
          if (retryable(response.status) && attempt < this.maximumAttempts) {
            await this.sleep(retryDelay(response, attempt));
            continue;
          }
          throw lastError;
        }
        request.onOpenAiResponse?.(requestId);
        const body = await response.json() as ResponsesBody;
        let decoded: unknown;
        try {
          decoded = JSON.parse(outputText(body));
        } catch (error) {
          if (error instanceof OpenAiResponsesError) throw error;
          throw new OpenAiResponsesError(
            'MALFORMED_RESPONSE',
            'The structured response could not be decoded.',
            502,
            requestId,
          );
        }
        try {
          const data = request.parse(decoded);
          request.onResponseParsed?.();
          return { data, requestId };
        } catch {
          throw new OpenAiResponsesError(
            'MALFORMED_RESPONSE',
            'The structured response failed validation.',
            502,
            requestId,
          );
        }
      } catch (error) {
        if (error instanceof OpenAiResponsesError) throw error;
        if (controller.signal.aborted) {
          throw new OpenAiResponsesError(
            'TIMED_OUT',
            'The generation request timed out. Please try again.',
            504,
          );
        }
        lastError = new OpenAiResponsesError(
          'REQUEST_FAILED',
          'The generation provider could not be reached.',
          502,
        );
        this.logger.error('OpenAI Responses API network failure.', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          attempt,
        });
        if (attempt < this.maximumAttempts) {
          await this.sleep(250 * attempt);
          continue;
        }
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener('abort', abortForCaller);
      }
    }
    throw lastError ?? new OpenAiResponsesError(
      'REQUEST_FAILED',
      'The generation provider could not complete the request.',
      502,
    );
  }
}
