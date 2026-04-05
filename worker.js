import { rollFrom, matches, SALT_LEN } from "./lib/companion.js";

const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
const REPORT_INTERVAL = 50_000;

function randomSalt() {
  let s = "";
  for (let i = 0; i < SALT_LEN; i++) {
    s += CHARSET[(Math.random() * CHARSET.length) | 0];
  }
  return s;
}

self.onmessage = (e) => {
  const { userId, target } = e.data;
  const start = performance.now();
  let attempts = 0;

  for (;;) {
    attempts++;
    const salt = randomSalt();
    const result = rollFrom(salt, userId);

    if (matches(result, target)) {
      self.postMessage({ type: "found", salt, result, attempts, elapsed: performance.now() - start });
      return;
    }

    if (attempts % REPORT_INTERVAL === 0) {
      self.postMessage({ type: "progress", attempts, elapsed: performance.now() - start });
    }
  }
};
