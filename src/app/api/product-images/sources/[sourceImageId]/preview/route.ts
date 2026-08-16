import { getCurrentUser } from '@/modules/auth/server/context';
import { getProductSourceImage } from '@/modules/product-images/product-image-service.server';
import { downloadRemoteImage } from '@/modules/shopify/images/remote-image';
import { normalizeShopifyImageError } from '@/modules/shopify/images/image-errors';
import { shopifyImageErrorResponse, unauthenticatedImageResponse } from '@/modules/shopify/images/image-route-helpers.server';

type Context = { params: Promise<{ sourceImageId: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { sourceImageId } = await context.params;
    const source = await getProductSourceImage(user.id, sourceImageId);
    const image = await downloadRemoteImage(source.imageUrl, { timeoutMs: 8_000 });
    return new Response(Buffer.from(image.bytes), {
      headers: {
        'content-type': image.mimeType,
        'content-length': String(image.byteSize),
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return shopifyImageErrorResponse(normalizeShopifyImageError(error));
  }
}
