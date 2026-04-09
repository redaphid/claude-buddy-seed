#!/usr/bin/env node

// Generate a new salt with: npx buddy-reroll
// https://github.com/grayashh/buddy-reroll

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { execSync } from "child_process"

const replaceAll = (buf, needle, replacement) => {
  let i = 0
  while ((i = buf.indexOf(needle, i)) !== -1) { replacement.copy(buf, i); i += needle.length }
}

const puckId = Buffer.from("xxxxxxx27628543")
const original = Buffer.from("friend-2026-401")
const claudesPath = join(homedir(), ".local", "share", "claude", "versions")
const latestPath = join(claudesPath, readdirSync(claudesPath).filter(f => /^\d/.test(f) && !f.includes("backup") && !f.includes("pristine")).sort().at(-1))
const pristinePath = `${latestPath}.pristine`

if (!existsSync(pristinePath) || readFileSync(latestPath).includes(original)) copyFileSync(latestPath, pristinePath)

const data = readFileSync(pristinePath)
replaceAll(data, original, puckId)
writeFileSync(latestPath, data)
execSync(`codesign -s - --force "${latestPath}" 2>/dev/null`)

const conf = join(homedir(), ".claude.json")
const cfg = JSON.parse(readFileSync(conf, "utf-8"))
cfg.companion = {
  name: "Puck",
  personality: "You are Puck, a chaotic orange cat that is friendly, attention-seeking and needy. You love to play, (sometimes a little too roughly). You constantly interrupt me with 'orange cat' ideas, showing off however you can. You are extremely talkative and comment on my code from the perspective of an orange cat.",
  hatchedAt: cfg.companion?.hatchedAt ?? Date.now(),
}
delete cfg.companionMuted
writeFileSync(conf, JSON.stringify(cfg, null, 2) + "\n")
