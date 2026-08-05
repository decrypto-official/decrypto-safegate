/**
 * keccak256, as Ethereum uses it.
 *
 * Needed to turn a function signature into its 4-byte selector. The alternative
 * was a table of hand-copied hex constants, which is exactly the kind of
 * unverifiable magic number this project should not contain: a wrong selector
 * would make the tool report a capability gap that is not there, or miss one
 * that is, and nothing would say so.
 *
 * Note this is NOT SHA3-256. Node's crypto has `sha3-256`, which is the NIST
 * standard and pads with 0x06; Ethereum kept the original Keccak padding of
 * 0x01 and the two produce completely different digests. That difference is
 * the single most common way this gets implemented wrong, so the tests lock it
 * against published vectors.
 *
 * Used only to derive constants from constant strings at module load. It hashes
 * no user input and guards nothing, so the usual "don't roll your own crypto"
 * hazard does not apply in the way it normally would — a mistake here shows up
 * immediately as a wrong selector, and the test vectors catch it. If you would
 * still rather depend on a reviewed implementation, this is a single file with
 * one exported function and js-sha3 is a drop-in replacement.
 *
 * Structure follows the reference implementation. BigInt lanes are used over
 * split 32-bit halves because this runs a few dozen times at startup and
 * clarity is worth more here than speed.
 */

const MASK = (1n << 64n) - 1n;

const ROUND_CONSTANTS: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** Rotation offsets, in the order the rho/pi step visits lanes. */
const ROTATION = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];

/** Lane permutation for the same step. */
const PI_LANE = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

function rotl64(value: bigint, shift: number): bigint {
  const s = BigInt(shift);
  return ((value << s) | (value >> (64n - s))) & MASK;
}

/** The Keccak-f[1600] permutation, in place. */
function permute(state: bigint[]): void {
  const bc = new Array<bigint>(5);

  for (let round = 0; round < 24; round += 1) {
    // Theta
    for (let i = 0; i < 5; i += 1) {
      bc[i] = state[i]! ^ state[i + 5]! ^ state[i + 10]! ^ state[i + 15]! ^ state[i + 20]!;
    }
    for (let i = 0; i < 5; i += 1) {
      const t = bc[(i + 4) % 5]! ^ rotl64(bc[(i + 1) % 5]!, 1);
      for (let j = 0; j < 25; j += 5) state[j + i] = state[j + i]! ^ t;
    }

    // Rho and Pi
    let t = state[1]!;
    for (let i = 0; i < 24; i += 1) {
      const j = PI_LANE[i]!;
      const held = state[j]!;
      state[j] = rotl64(t, ROTATION[i]!);
      t = held;
    }

    // Chi
    for (let j = 0; j < 25; j += 5) {
      for (let i = 0; i < 5; i += 1) bc[i] = state[j + i]!;
      for (let i = 0; i < 5; i += 1) {
        state[j + i] = state[j + i]! ^ (~bc[(i + 1) % 5]! & MASK & bc[(i + 2) % 5]!);
      }
    }

    // Iota
    state[0] = state[0]! ^ ROUND_CONSTANTS[round]!;
  }
}

/** Rate in bytes for a 256-bit digest: 200 - 2 * 32. */
const RATE = 136;

/** keccak256 of raw bytes. Returns 32 bytes. */
export function keccak256(input: Uint8Array): Uint8Array {
  const state = new Array<bigint>(25).fill(0n);

  // Pad: 0x01 immediately after the message, 0x80 in the final byte of the
  // last block. Ethereum's padding, not NIST's 0x06.
  const padded = new Uint8Array(Math.ceil((input.length + 1) / RATE) * RATE);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] = padded[padded.length - 1]! ^ 0x80;

  // Absorb
  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let i = 0; i < RATE / 8; i += 1) {
      let lane = 0n;
      for (let b = 7; b >= 0; b -= 1) {
        lane = (lane << 8n) | BigInt(padded[offset + i * 8 + b]!);
      }
      state[i] = state[i]! ^ lane;
    }
    permute(state);
  }

  // Squeeze. One block covers 32 bytes, so no second permutation is needed.
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i += 1) {
    let lane = state[i]!;
    for (let b = 0; b < 8; b += 1) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

/** keccak256 of a UTF-8 string, as lowercase hex with an 0x prefix. */
export function keccak256Hex(text: string): string {
  const digest = keccak256(new TextEncoder().encode(text));
  return '0x' + Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The 4-byte selector for a Solidity function signature.
 *
 * The signature must be canonical: no argument names, no spaces, and expanded
 * aliases, so `transfer(address,uint256)` rather than `transfer(address to,
 * uint256 amount)` or `transfer(address,uint)`.
 */
export function selectorOf(signature: string): string {
  return keccak256Hex(signature).slice(0, 10);
}
