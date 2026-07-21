import { NextResponse } from 'next/server';
import { z } from 'zod';
import { productAnalysisJsonSchema, productAnalysisSchema } from '@/lib/analysis-schema';
import { extractProductPage, ProductPageExtractionError } from '@/lib/product-page-extractor';

export const runtime = 'nodejs';

const analyzeRequestSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('raw-specifications'),
    specifications: z.string().trim().min(1).max(20_000),
  }).strict(),
  z.object({
    source: z.literal('product-url'),
    url: z.string().trim().min(1).max(2_048),
  }).strict(),
]);

interface OpenAIResponseBody {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
}

function readOutputText(response: OpenAIResponseBody) {
  if (response.output_text) {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    if (item.type !== 'message') {
      continue;
    }

    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) {
        return content.text;
      }

      if (content.type === 'refusal' && content.refusal) {
        throw new Error('The analysis request was refused. Revise the input and try again.');
      }
    }
  }

  throw new Error('The analysis completed without a usable response.');
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OpenAI analysis is not configured on the server.' },
      { status: 503 },
    );
  }

  let parsedRequest: z.infer<typeof analyzeRequestSchema>;
  try {
    parsedRequest = analyzeRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Provide valid raw specifications or a valid product URL before analyzing.' },
      { status: 400 },
    );
  }

  let analysisInput: string;
  let sourceInstruction: string;
  try {
    if (parsedRequest.source === 'product-url') {
      const extractedPage = await extractProductPage(parsedRequest.url);
      analysisInput = extractedPage.pageText;
      sourceInstruction = `Use source "Product page: ${new URL(extractedPage.finalUrl).hostname}" for supplied facts.`;
    } else {
      analysisInput = parsedRequest.specifications;
      sourceInstruction = 'Use source "Pasted specifications" for supplied facts.';
    }
  } catch (error) {
    if (error instanceof ProductPageExtractionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: 'The product page could not be prepared for analysis.' },
      { status: 502 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 5_000,
        instructions: [
          'Role: You are ListingPilot, an experienced e-commerce product specialist producing publication-ready Shopify catalog content.',
          'Goal: turn the supplied raw specifications into a credible, benefits-led listing—not a restatement of the input.',
          'Evidence: treat navigation, cookie, promotion, and unrelated recommendation text as noise. Directly supplied facts are the only basis for Verified status. Never give an inferred value 100% confidence.',
          'Inferences: when the product family is reasonably identifiable, you may infer a likely category-typical value. Prefix its value with "Likely: ", set status to Likely, use source "Product family inference", set sourcesCount to 0, and assign 40–75 confidence. If a reasonable inference is not possible, use value "Missing", status Missing, source "Not provided", sourcesCount 0, and include the field in missingFields.',
          'Verification: mark contradictory supplied values as Conflict. Otherwise use Verified only for directly supported facts. Every truth row must include one short reasoning sentence that explains the decision and confidence.',
          `${sourceInstruction} Use sourcesCount 1 for directly supplied facts.`,
          'Listing quality: write a natural publication-quality title of 100–140 characters. Use a confidently identifiable product family, key technologies, use cases, and customer value; do not pad with unsupported model numbers or claims.',
          'Write a 150–250 word rich description that explains customer benefits, relevant technologies, likely use cases, and shopping value in polished commerce language. Separate direct facts from any inferred wording; do not make unsupported performance promises.',
          'Write exactly 10–15 detailed, concise marketing feature bullets. Return keyFeatures as newline-separated bullets beginning with "• ". Use customer-focused phrasing and retain uncertainty where needed.',
          'Write SEO fields and comma-separated tags consistent with the grounded listing.',
        ].join(' '),
        input: analysisInput,
        text: {
          verbosity: 'medium',
          format: {
            type: 'json_schema',
            name: 'listingpilot_product_analysis',
            strict: true,
            schema: productAnalysisJsonSchema,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!openAIResponse.ok) {
      const requestId = openAIResponse.headers.get('x-request-id');
      console.error('OpenAI analysis failed', {
        status: openAIResponse.status,
        requestId,
      });

      if (openAIResponse.status === 401) {
        return NextResponse.json(
          { error: 'OpenAI authentication failed. Check the server API-key configuration.' },
          { status: 502 },
        );
      }

      return NextResponse.json(
        { error: 'OpenAI could not analyze this product input. Please try again.' },
        { status: 502 },
      );
    }

    const responseBody = await openAIResponse.json() as OpenAIResponseBody;
    const analysis = productAnalysisSchema.parse(JSON.parse(readOutputText(responseBody)));
    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'The OpenAI analysis timed out. Please try again.' },
        { status: 504 },
      );
    }

    console.error('Unable to complete product analysis', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { error: 'The OpenAI response could not be validated. Please try again.' },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
