import type { Chain } from './types.js';

/**
 * Why an address cannot be scored at all.
 *
 * `no-code`              an EVM address with no bytecode: a wallet, or nothing
 * `eip7702-delegation`   an EVM wallet carrying an EIP-7702 delegation designator
 * `no-account`           a Solana address with no account
 * `not-a-mint`           a Solana account that is not a token mint
 *
 * Before 0.2.0 these produced a score. Every probe on an empty address reads as
 * "checked, nothing there", which is 0 on every axis at 100% coverage: the
 * best result the tool can print, for an address that holds no token.
 */
export type UnscoreableReason = 'no-code' | 'eip7702-delegation' | 'no-account' | 'not-a-mint';

export class UnscoreableAddressError extends Error {
  constructor(
    readonly chain: Chain,
    readonly address: string,
    readonly reason: UnscoreableReason,
    detail: string
  ) {
    super(detail);
    this.name = 'UnscoreableAddressError';
  }
}
