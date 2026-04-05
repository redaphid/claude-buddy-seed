// Wyhash v4.2 — Pure JavaScript implementation
// Ported from @pencroff-lab/wyhash-ts (Apache-2.0)
// https://github.com/pencroff-lab/wyhash-ts
//
// Produces identical output to Bun.hash() for string inputs.

const secret = [
  0xa0761d6478bd642fn,
  0xe7037ed1a0b428dbn,
  0x8ebc6af09c88c6e3n,
  0x589965cc75374cc3n,
];

function read(data, offset, bytes) {
  let result = 0n;
  for (let i = 0; i < bytes && offset + i < data.length; i++) {
    result |= BigInt(data[offset + i]) << (BigInt(i) * 8n);
  }
  return BigInt.asUintN(64, result);
}

function mum(a, b) {
  const x = a * b;
  return [BigInt.asUintN(64, x), BigInt.asUintN(64, x >> 64n)];
}

function mix(a, b) {
  const [aMul, bMul] = mum(a, b);
  return aMul ^ bMul;
}

function sum64(seed, input) {
  let a, b;
  let state0 = seed ^ mix(seed ^ secret[0], secret[1]);
  const len = input.length;

  if (len <= 16) {
    if (len >= 4) {
      const end = len - 4;
      const quarter = (len >> 3) << 2;
      a = (read(input, 0, 4) << 32n) | read(input, quarter, 4);
      b = (read(input, end, 4) << 32n) | read(input, end - quarter, 4);
    } else if (len > 0) {
      a = (BigInt(input[0]) << 16n) | (BigInt(input[len >> 1]) << 8n) | BigInt(input[len - 1]);
      b = 0n;
    } else {
      a = 0n;
      b = 0n;
    }
  } else {
    const state = [state0, state0, state0];
    let i = 0;

    if (len >= 48) {
      while (i + 48 < len) {
        for (let j = 0; j < 3; j++) {
          const aRound = read(input, i + 8 * (2 * j), 8);
          const bRound = read(input, i + 8 * (2 * j + 1), 8);
          state[j] = mix(aRound ^ secret[j + 1], bRound ^ state[j]);
        }
        i += 48;
      }
      state[0] ^= state[1] ^ state[2];
    }

    const remaining = input.subarray(i);
    let k = 0;
    while (k + 16 < remaining.length) {
      state[0] = mix(read(remaining, k, 8) ^ secret[1], read(remaining, k + 8, 8) ^ state[0]);
      k += 16;
    }

    a = read(input, len - 16, 8);
    b = read(input, len - 8, 8);
    state0 = state[0];
  }

  a ^= secret[1];
  b ^= state0;
  [a, b] = mum(a, b);
  return mix(a ^ secret[0] ^ BigInt(len), b ^ secret[1]);
}

const encoder = new TextEncoder();

export function wyhash(seed, key) {
  return sum64(BigInt.asUintN(64, seed), encoder.encode(key));
}
