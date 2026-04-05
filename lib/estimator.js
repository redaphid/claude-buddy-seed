import { RARITY_WEIGHTS } from "./companion.js";

export function estimateAttempts(target) {
  if (!target || Object.keys(target).length === 0) return 1;

  let probability = 1;

  if (target.species) probability *= 1 / 18;
  if (target.rarity) probability *= RARITY_WEIGHTS[target.rarity] / 100;
  if (target.eye) probability *= 1 / 6;
  if (target.hat && target.hat !== "none" && target.rarity !== "common") probability *= 1 / 8;
  if (target.shiny === true) probability *= 0.01;
  if (target.peak) probability *= 1 / 5;
  if (target.dump) probability *= 1 / 4;

  return Math.round(1 / probability);
}

export function formatProgress(attempts, elapsed, expected, workers) {
  const pct = Math.min(100, Math.round((attempts / expected) * 100));
  const rate = attempts / (elapsed / 1000);

  let rateStr;
  if (rate >= 1_000_000) {
    rateStr = (rate / 1_000_000).toFixed(1) + "M tries/s";
  } else if (rate >= 1_000) {
    rateStr = (rate / 1_000).toFixed(1) + "k tries/s";
  } else {
    rateStr = rate.toFixed(1) + " tries/s";
  }

  const remaining = Math.max(0, (expected - attempts) / rate);
  let etaStr;
  if (remaining < 60) {
    etaStr = Math.round(remaining) + "s";
  } else {
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.round(remaining % 60);
    etaStr = minutes + "m " + seconds + "s";
  }

  return `${pct}% | ${rateStr} | ~${etaStr} left | ${workers} cores`;
}
