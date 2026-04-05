import { render } from "preact";
import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { codeToHtml } from "shiki";
import {
  SPECIES,
  RARITIES,
  RARITY_LABELS,
  EYES,
  HATS,
  STAT_NAMES,
} from "./lib/companion.js";
import { estimateAttempts, formatProgress } from "./lib/estimator.js";
import { generateScript } from "./lib/script.js";

function CodeBlock({ code, lang = "javascript" }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    codeToHtml(code, { lang, theme: "github-dark" }).then((h) => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = h;
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [code, lang]);

  return html`<div class="code-highlight" ref=${ref}>
    ${!ready && html`<pre><code>${code}</code></pre>`}
  </div>`;
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);
  return html`<button type="button" class="small" onClick=${copy}>${copied ? "Copied!" : label}</button>`;
}

function Select({ id, label, value, onChange, options, labelFn }) {
  return html`
    <div class="field">
      <label for=${id}>${label}</label>
      <select id=${id} value=${value} onChange=${(e) => onChange(e.target.value)}>
        <option value="">any</option>
        ${options.map((o) => html`<option key=${o} value=${o}>${labelFn ? labelFn(o) : o}</option>`)}
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

function fmtRate(r) {
  if (r >= 1e6) return (r / 1e6).toFixed(1) + "M/s";
  if (r >= 1e3) return (r / 1e3).toFixed(0) + "k/s";
  return r.toFixed(0) + "/s";
}

function WorkerBars({ workers }) {
  if (!workers.length) return null;
  const maxRate = Math.max(...workers.map((w) => w.rate), 1);
  return html`
    <div class="worker-bars">
      ${workers.map(
        (w, i) => {
          const width = Math.max(1, Math.round((w.rate / maxRate) * 12));
          const bar = "\u2588".repeat(width) + "\u2591".repeat(12 - width);
          return html`<div key=${i} class="worker-row">
            <span class="worker-id">W${i}</span>
            <span class="worker-bar">${bar}</span>
            <span class="worker-rate">${w.rate > 0 ? fmtRate(w.rate) : "..."}</span>
          </div>`;
        }
      )}
    </div>
  `;
}

const UUID_CMD = `jq -r '.oauthAccount.accountUuid // .userID' ~/.claude.json`;

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
  const [workerStats, setWorkerStats] = useState([]);
  const [result, setResult] = useState(null);
  const workersRef = useRef([]);
  const attemptsRef = useRef([]);
  const prevRef = useRef([]);
  const startRef = useRef(0);

  const killWorkers = useCallback(() => {
    for (const w of workersRef.current) w.terminate();
    workersRef.current = [];
    attemptsRef.current = [];
    prevRef.current = [];
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
    prevRef.current = new Array(numWorkers).fill(null).map(() => ({ attempts: 0, time: performance.now() }));
    startRef.current = performance.now();
    setProgress(`Spawning ${numWorkers} workers...`);
    setWorkerStats(new Array(numWorkers).fill(null).map(() => ({ rate: 0 })));

    for (let i = 0; i < numWorkers; i++) {
      const w = new Worker("./worker.js", { type: "module" });
      workersRef.current.push(w);

      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "progress") {
          const now = performance.now();
          attemptsRef.current[i] = msg.attempts;
          const prev = prevRef.current[i];
          const dt = (now - prev.time) / 1000;
          const rate = dt > 0 ? (msg.attempts - prev.attempts) / dt : 0;
          prevRef.current[i] = { attempts: msg.attempts, time: now };

          const total = attemptsRef.current.reduce((a, b) => a + b, 0);
          const elapsed = now - startRef.current;
          setProgress(formatProgress(total, elapsed, expected, numWorkers));
          setWorkerStats((s) => {
            const next = [...s];
            next[i] = { rate };
            return next;
          });
          return;
        }
        if (msg.type === "found") {
          const total = attemptsRef.current.reduce((a, b) => a + b, 0);
          const elapsed = ((performance.now() - startRef.current) / 1000).toFixed(1);
          killWorkers();
          setSearching(false);
          setWorkerStats([]);
          setProgress(`Found in ${Math.max(total, msg.attempts).toLocaleString()} tries (${elapsed}s)`);
          setResult({ salt: msg.salt, roll: msg.result });
        }
      };

      w.postMessage({ userId: userId.trim(), target });
    }
  }, [userId, species, rarity, eye, hat, shiny, peak, dump, killWorkers]);

  const cancel = useCallback(() => {
    killWorkers();
    setSearching(false);
    setWorkerStats([]);
    setProgress("");
  }, [killWorkers]);

  const script = result ? generateScript(result.salt, result.roll) : "";

  return html`
    <main>
      <h1>buddy seed finder</h1>
      <p class="subtitle">
        Find the perfect salt for your Claude <code>/buddy</code> companion.
        Pure math — nothing on your machine is touched.
      </p>

      <section class="step">
        <h2><span class="step-num">1</span> Get your user ID</h2>
        <p class="hint">Run this in your terminal:</p>
        <div class="cmd-row">
          <code class="cmd">${UUID_CMD}</code>
          <${CopyButton} text=${UUID_CMD} />
        </div>
        <p class="hint">Paste the result here:</p>
        <div class="field">
          <input
            id="user-id"
            type="text"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            spellcheck="false"
            value=${userId}
            onInput=${(e) => setUserId(e.target.value)}
          />
        </div>
      </section>

      <section class="step">
        <h2><span class="step-num">2</span> Pick your buddy</h2>
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
          <button type="button" onClick=${search} disabled=${searching}>Reroll</button>
          ${searching && html`<button type="button" class="secondary" onClick=${cancel}>Cancel</button>`}
        </div>
        ${progress && html`<p class="progress ${searching ? "progress-searching" : ""}">${progress}</p>`}
        ${searching && workerStats.length > 0 && html`<${WorkerBars} workers=${workerStats} />`}
        ${result && html`
          <div class="result-card">
            <div class="salt-row">
              <code class="salt">${result.salt}</code>
              <${CopyButton} text=${result.salt} label="Copy salt" />
            </div>
            <div class="result-meta">
              <span><b>Species:</b> ${result.roll.species}</span>
              <span><b>Rarity:</b> ${result.roll.rarity}</span>
              <span><b>Eye:</b> ${result.roll.eye}</span>
              <span><b>Hat:</b> ${result.roll.hat}</span>
              <span><b>Shiny:</b> ${result.roll.shiny ? "yes" : "no"}</span>
            </div>
            <div class="stats">
              ${Object.entries(result.roll.stats).map(
                ([name, value]) => html`<${StatBar}
                  key=${name} name=${name} value=${value}
                  rarity=${result.roll.rarity}
                  isPeak=${name === result.roll.peak}
                  isDump=${name === result.roll.dump}
                />`
              )}
            </div>
          </div>
        `}
      </section>

      ${result && html`
        <section class="step">
          <h2><span class="step-num">3</span> Apply it</h2>
          <p class="hint">
            Save this as <code>~/.local/bin/puck</code> and run it after Claude updates.
          </p>
          <div class="script-block">
            <div class="script-header">
              <span>~/.local/bin/puck</span>
              <${CopyButton} text=${script} label="Copy script" />
            </div>
            <${CodeBlock} code=${script} />
          </div>
          <p class="hint">Then:</p>
          <div class="cmd-row">
            <code class="cmd">chmod +x ~/.local/bin/puck && puck</code>
            <${CopyButton} text="chmod +x ~/.local/bin/puck && puck" />
          </div>
        </section>
      `}
    </main>
  `;
}

render(html`<${App} />`, document.body);
