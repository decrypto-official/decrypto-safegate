import type { CSSProperties } from 'react';

/** Custom properties in a style prop, without a cast at every call site. */
export function vars(values: Record<`--${string}`, string | number>): CSSProperties {
  return values as unknown as CSSProperties;
}
