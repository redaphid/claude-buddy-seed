import { render } from "preact";
import { useState, useRef, useCallback } from "preact/hooks";
import { html } from "htm/preact";
import {
  SPECIES,
  RARITIES,
  RARITY_LABELS,
  RARITY_WEIGHTS,
  EYES,
  HATS,
  STAT_NAMES,
} from "./lib/companion.js";
import { estimateAttempts, formatProgress } from "./lib/estimator.js";

function Select({ id, label, value, onChange, options, labelFn }) {
  return html`
    <div class="field">
      <label for=${id}>${label}</label>
      <select id=${id} value=${value} onChange=${(e) => onChange(e.target.value)}>
        <option value="">any</option>
        ${options.map(
          (o) => html`<option key=${o} value=${o}>${labelFn ? labelFn(o) : o}</option>`
        )}
      </select>
    </div>
  `;
}

function StatBar({ name, value, rarity, isPeak, isDump }) {
  const filled = Math.min(10, Math.max(0, Math.round(value / 10)));
  return html`
    <div class="stat-row">
      <span class="stat-label ${isPeak ? "stat-peak" : ""} ${isDump ? "stat-dump" : ""}">
        ${name}
      </span>
      <span class="stat-bar rarity-${rarity}">
        ${"\u2588".repeat(filled)}${"\u2591".repeat(10 - filled)}
      </span>
      <span class="stat-value">${value}</span>
    </div>
  `;
}

function Result({ salt, result, onCopy }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(salt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [salt]);

  return html`
    <section class="result">
      <div class="salt-row">
        <code>${salt}</code>
        <button type="button" class="small" onClick=${copy}>
          ${copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div class="result-meta">
        <span><b>Species:</b> ${result.species}</span>
        <span><b>Rarity:</b> ${result.rarity}</span>
        <span><b>Eye:</b> ${result.eye}</span>
        <span><b>Hat:</b> ${result.hat}</span>
        <span><b>Shiny:</b> ${result.shiny ? "yes" : "no"}</span>
      </div>
      <div class="stats">
        ${Object.entries(result.stats).map(
          ([name, value]) =>
            html`<${StatBar}
              key=${name}
              name=${name}
              value=${value}
              rarity=${result.rarity}
              isPeak=${name === result.peak}
              isDump=${name === result.dump}
            />`
        )}
      </div>
    </section>
  `;
}

function App() {
  const [userId, setUserId] = useState("");
  const [species, setSpecies] = useState("");
  const [rarity, setRarity] = useState("");
  const [eye, setEye] = useState("");
  const [hat, setHat] = useState("");
  const [shiny, setShiny] = useState("");
  const [peak, setPeak] = useState("");
  const [dump, setDump] = useState("");

  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const workersRef = useRef([]);
  const attemptsRef = useRef([]);
  const startRef = useRef(0);

  const killWorkers = useCallback(() => {
    for (const w of workersRef.current) w.terminate();
    workersRef.current = [];
    attemptsRef.current = [];
  }, []);

  const search = useCallback(() => {
    if (!userId.trim()) return;

    const target = {};
    if (species) target.species = species;
    if (rarity) target.rarity = rarity;
    if (eye) target.eye = eye;
    if (hat) target.hat = hat;
    if (shiny === "true") target.shiny = true;
    if (shiny === "false") target.shiny = false;
    if (peak) target.peak = peak;
    if (dump) target.dump = dump;
    if (Object.keys(target).length === 0) return;

    killWorkers();
    setResult(null);
    setSearching(true);

    const expected = estimateAttempts(target);
    const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);
    attemptsRef.current = new Array(numWorkers).fill(0);
    startRef.current = performance.now();
    setProgress(`Spawning ${numWorkers} workers...`);

    for (let i = 0; i < numWorkers; i++) {
      const w = new Worker("./worker.js", { type: "module" });
      workersRef.current.push(w);

      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "progress") {
          attemptsRef.current[i] = msg.attempts;
          const total = attemptsRef.current.reduce((a, b) => a + b, 0);
          const elapsed = performance.now() - startRef.current;
          setProgress(formatProgress(total, elapsed, expected, numWorkers));
          return;
        }
        if (msg.type === "found") {
          const total = attemptsRef.current.reduce((a, b) => a + b, 0);
          const elapsed = ((performance.now() - startRef.current) / 1000).toFixed(1);
          killWorkers();
          setSearching(false);
          setProgress(
            `Found in ${Math.max(total, msg.attempts).toLocaleString()} tries (${elapsed}s)`
          );
          setResult({ salt: msg.salt, roll: msg.result });
        }
      };

      w.postMessage({ userId: userId.trim(), target });
    }
  }, [userId, species, rarity, eye, hat, shiny, peak, dump, killWorkers]);

  const cancel = useCallback(() => {
    killWorkers();
    setSearching(false);
    setProgress("");
  }, [killWorkers]);

  return html`
    <main>
      <h1>buddy seed finder</h1>
      <p class="subtitle">
        Find the perfect salt for your Claude <code>/buddy</code> companion.
        Pure math — nothing on your machine is touched.
      </p>

      <div class="field">
        <label for="user-id">User ID</label>
        <input
          id="user-id"
          type="text"
          placeholder="your Claude account UUID"
          spellcheck="false"
          value=${userId}
          onInput=${(e) => setUserId(e.target.value)}
        />
      </div>

      <div class="grid">
        <${Select} id="species" label="Species" value=${species} onChange=${setSpecies} options=${SPECIES} />
        <${Select} id="rarity" label="Rarity" value=${rarity} onChange=${setRarity} options=${RARITIES} labelFn=${(r) => RARITY_LABELS[r]} />
        <${Select} id="eye" label="Eye" value=${eye} onChange=${setEye} options=${EYES} />
        <${Select} id="hat" label="Hat" value=${hat} onChange=${setHat} options=${HATS} />
        <${Select} id="shiny" label="Shiny" value=${shiny} onChange=${setShiny} options=${["true", "false"]} labelFn=${(v) => (v === "true" ? "yes" : "no")} />
        <${Select} id="peak" label="Best stat" value=${peak} onChange=${setPeak} options=${STAT_NAMES} />
        <${Select} id="dump" label="Worst stat" value=${dump} onChange=${setDump} options=${STAT_NAMES} />
      </div>

      <div class="actions">
        <button type="button" onClick=${search} disabled=${searching}>
          Find salt
        </button>
        ${searching && html`
          <button type="button" class="secondary" onClick=${cancel}>
            Cancel
          </button>
        `}
      </div>

      ${progress && html`<p class="progress">${progress}</p>`}
      ${result && html`<${Result} salt=${result.salt} result=${result.roll} />`}
    </main>
  `;
}

render(html`<${App} />`, document.body);
