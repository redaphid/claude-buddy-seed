import { wyhash } from "./wyhash.js";

const SALT_LEN = 15;

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const RARITY_TOTAL = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
const RARITY_FLOOR = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };

const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin",
  "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot",
  "rabbit", "mushroom", "chonk",
];

const EYES = ["·", "✦", "×", "◉", "@", "°"];
const HATS = ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"];
const STAT_NAMES = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];

const RARITY_LABELS = {
  common: "Common (60%)",
  uncommon: "Uncommon (25%)",
  rare: "Rare (10%)",
  epic: "Epic (4%)",
  legendary: "Legendary (1%)",
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  if (typeof Bun !== "undefined") return Number(BigInt(Bun.hash(value)) & 0xffffffffn);
  return Number(wyhash(0n, value) & 0xffffffffn);
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function rollRarity(rng) {
  let roll = rng() * RARITY_TOTAL;
  for (const rarity of RARITIES) {
    roll -= RARITY_WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return "common";
}

function rollFrom(salt, userId) {
  const rng = mulberry32(hashString(userId + salt));
  const rarity = rollRarity(rng);
  const species = pick(rng, SPECIES);
  const eye = pick(rng, EYES);
  const hat = rarity === "common" ? "none" : pick(rng, HATS);
  const shiny = rng() < 0.01;

  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);

  const stats = {};
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    else stats[name] = floor + Math.floor(rng() * 40);
  }

  return { rarity, species, eye, hat, shiny, stats, peak, dump };
}

function matches(roll, target) {
  if (target.species && roll.species !== target.species) return false;
  if (target.rarity && roll.rarity !== target.rarity) return false;
  if (target.eye && roll.eye !== target.eye) return false;
  if (target.hat && roll.hat !== target.hat) return false;
  if (target.shiny !== undefined && roll.shiny !== target.shiny) return false;
  if (target.peak && roll.peak !== target.peak) return false;
  if (target.dump && roll.dump !== target.dump) return false;
  return true;
}

export {
  SALT_LEN,
  EYES,
  HATS,
  RARITIES,
  RARITY_LABELS,
  RARITY_WEIGHTS,
  SPECIES,
  STAT_NAMES,
  matches,
  rollFrom,
};
