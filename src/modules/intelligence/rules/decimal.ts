export interface ExactDecimal {
  readonly negative: boolean;
  readonly digits: bigint;
  readonly scale: number;
}

export function parseExactDecimal(value: unknown): ExactDecimal | null {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/u.test(value)) return null;
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  return {
    negative,
    digits: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

export function compareExactDecimals(left: ExactDecimal, right: ExactDecimal): -1 | 0 | 1 {
  const scale = Math.max(left.scale, right.scale);
  const ten = BigInt(10);
  const leftMagnitude = left.digits * (ten ** BigInt(scale - left.scale));
  const rightMagnitude = right.digits * (ten ** BigInt(scale - right.scale));
  const leftSigned = left.negative ? -leftMagnitude : leftMagnitude;
  const rightSigned = right.negative ? -rightMagnitude : rightMagnitude;
  if (leftSigned < rightSigned) return -1;
  if (leftSigned > rightSigned) return 1;
  return 0;
}
