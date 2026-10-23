import { createCimdNodeHandler } from '@/server/d1-cimd';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return createCimdNodeHandler(process.env.D1_GATEWAY_SERVICE_TOKEN ?? '')(request);
}
