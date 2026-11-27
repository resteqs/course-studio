// Prototype helpers: variant switcher, motion speed, tiny synth sounds, coin/confetti bursts. Throwaway.
export function reviewBar({ title, axis, variants, onSwitch, controls = "", note = "" }) {
  const bar = document.createElement("div");
  bar.className = "review-bar";
  bar.innerHTML = `<a href="../">← All prototypes</a><strong>${title}</strong>
    <div class="rb-variants" role="group" aria-label="Variants">${variants.map((v, i) =>
      `<button type="button" data-v="${i}" aria-pressed="false"><kbd>${i + 1}</kbd>${v}</button>`).join("")}</div>
    <span class="rb-axis">Axis: ${axis}</span>
    <label class="rb-ctl">Motion <input type="range" id="rb-speed" min="0.5" max="2" step="0.1" value="1" aria-label="Motion speed multiplier"><span id="rb-speed-val">1.0×</span></label>
    <label class="rb-ctl"><input type="checkbox" id="rb-sound" checked> Sound</label>
    ${controls}
    ${note ? `<div class="rb-note">${note}</div>` : ""}`;
  document.body.prepend(bar);
  const btns = [...bar.querySelectorAll("[data-v]")];
  const params = new URLSearchParams(location.search);
  let current = -1;
  const set = (i) => {
    if (i === current || i < 0 || i >= variants.length) return;
    current = i;
    btns.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    params.set("v", String(i + 1));
    history.replaceState(null, "", `?${params}`);
    onSwitch(i);
  };
  btns.forEach((b) => b.addEventListener("click", () => set(Number(b.dataset.v))));
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea") || e.metaKey || e.ctrlKey || !e.altKey) return;
    const n = Number(e.key); if (n >= 1 && n <= variants.length) { e.preventDefault(); set(n - 1); }
  });
  const speed = bar.querySelector("#rb-speed");
  speed.addEventListener("input", () => {
    document.documentElement.style.setProperty("--speed", speed.value);
    bar.querySelector("#rb-speed-val").textContent = `${Number(speed.value).toFixed(1)}×`;
  });
  set(Math.max(0, Math.min(variants.length - 1, Number(params.get("v") || 1) - 1)));
  return { set, get: () => current };
}
export const speed = () => Number(getComputedStyle(document.documentElement).getPropertyValue("--speed")) || 1;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms * speed()));
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let ctx;
export function sfx(kind) {
  if (!document.getElementById("rb-sound")?.checked) return;
  try {
    ctx ||= new AudioContext();
    const notes = { correct: [660, 880], wrong: [220, 175], tap: [520], coin: [988, 1319], streak: [523, 659, 784, 1047], chest: [392, 523, 784], combo: [784, 988, 1175] }[kind] || [440];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.07;
      o.type = kind === "wrong" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
    });
  } catch {}
}

function layer() {
  let l = document.querySelector(".fx-layer");
  if (!l) { l = document.createElement("div"); l.className = "fx-layer"; l.setAttribute("aria-hidden", "true"); document.body.append(l); }
  return l;
}
// Physics coins: launched from an element, fall with gravity, optionally fly to a target.
export function coins(fromEl, n = 12, toEl = null) {
  if (reduced()) return;
  const l = layer(), r = fromEl.getBoundingClientRect(), t = toEl?.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div"); c.className = "coin"; l.append(c);
    let x = r.left + r.width / 2, y = r.top + r.height / 2, vx = (Math.random() - .5) * 9, vy = -7 - Math.random() * 6, life = 0;
    const step = () => {
      life++;
      if (t && life > 26) { x += (t.left + t.width / 2 - x) * .2; y += (t.top + t.height / 2 - y) * .2; }
      else { vy += .45; x += vx; y += vy; }
      c.style.transform = `translate(${x - 9}px, ${y - 9}px) rotate(${life * 12}deg) scaleX(${Math.abs(Math.cos(life / 4))})`;
      if (life < (t ? 46 : 70)) requestAnimationFrame(step); else c.remove();
    };
    setTimeout(() => requestAnimationFrame(step), i * 28);
  }
}
export function confetti(fromEl, n = 36) {
  if (reduced()) return;
  const l = layer(), r = fromEl.getBoundingClientRect(), colors = ["#22c55e", "#93a3ff", "#f5b82e", "#fb7185", "#7dd3fc"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div"); c.className = "confetti"; c.style.background = colors[i % colors.length]; l.append(c);
    let x = r.left + r.width / 2, y = r.top + r.height / 3, vx = (Math.random() - .5) * 14, vy = -8 - Math.random() * 8, rot = Math.random() * 360, life = 0;
    const step = () => { life++; vy += .38; vx *= .985; x += vx; y += vy; rot += vx * 3;
      c.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`; c.style.opacity = String(Math.max(0, 1 - life / 90));
      if (life < 90) requestAnimationFrame(step); else c.remove(); };
    requestAnimationFrame(step);
  }
}
export function countUp(el, to, ms = 700, fmt = (v) => Math.round(v)) {
  if (reduced()) { el.textContent = fmt(to); return Promise.resolve(); }
  return new Promise((res) => {
    const t0 = performance.now(), dur = ms * speed();
    const tick = (now) => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e); if (p < 1) requestAnimationFrame(tick); else res(); };
    requestAnimationFrame(tick);
  });
}
