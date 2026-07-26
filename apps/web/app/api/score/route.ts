/**
 * Score endpoint.
 *
 * Note there is no `?format=value` or `?fields=score`. The full triple of axes,
 * coverage and reasoning is the only representation available, in the API as in
 * the CLI. A caller who wants a lone number has to strip it themselves, which
 * makes that a deliberate act rather than something the API invited.
 */

import { NextResponse } from 'next/server';
import { analyse } from '@safegate/pipeline.js';
import type { Chain } from '@safegate/types.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get('chain');
  const address = searchParams.get('address')?.trim();

  if (chain !== 'ethereum' && chain !== 'solana') {
    return NextResponse.json({ error: 'chain must be ethereum or solana' }, { status: 400 });
  }
  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  const valid = chain === 'ethereum' ? EVM_ADDRESS.test(address) : SOLANA_ADDRESS.test(address);
  if (!valid) {
    return NextResponse.json(
      {
        error:
          chain === 'ethereum'
            ? 'that does not look like an Ethereum address (expected 0x followed by 40 hex characters)'
            : 'that does not look like a Solana mint address (expected 32 to 44 base58 characters)',
      },
      { status: 400 }
    );
  }

  try {
    const score = await analyse(chain as Chain, address);
    return NextResponse.json(score, {
      // Scores are point-in-time. An upgradeable contract can change next block,
      // so a short cache is honest and a long one is not.
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `could not read the chain: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
