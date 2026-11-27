/* Optional browser effects. Load before app.js in both studio shells. */
window.Delight = (() => {
  const comboNotes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  const haptics = { tap: 8, correct: [12, 24, 16], wrong: [20, 20, 20], complete: [15, 30, 15, 30, 25] };
  let soundEnabled = () => false;
  let audio;
  let currentTransition;

  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function withViewTransition(updateFn, kind = "default") {
    const dataset = document.documentElement?.dataset;
    if (prefersReducedMotion() || !dataset || typeof document.startViewTransition !== "function") {
      return updateFn();
    }
    const token = {};
    currentTransition = token;
    dataset.vt = kind;
    const clear = () => {
      if (currentTransition !== token) return;
      delete dataset.vt;
      currentTransition = undefined;
    };
    let updating = false;
    let transition;
    try {
      transition = document.startViewTransition(() => {
        updating = true;
        return updateFn();
      });
    } catch (error) {
      clear();
      if (updating) throw error;
      return updateFn();
    }
    transition.finished.finally(clear).catch(() => {});
    return transition;
  }

  async function primeAudio() {
    if (!soundEnabled()) return null;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return null;
      audio ??= new Audio();
      if (audio.state === "suspended") await audio.resume();
      return audio.state === "running" ? audio : null;
    } catch (_) {
      return null;
    }
  }

  function tone(ctx, frequency, start, duration, volume, type) {
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(envelope);
    envelope.connect(ctx.destination);
    osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
    osc.start(start);
    osc.stop(start + duration);
  }

  // Each note is [frequency, delay, duration, gain scale, optional voice]. Bells add a soft octave shimmer; wood adds a
  // short inharmonic partial (about 2.76x, like a struck wood block) that dies almost instantly.
  async function playNotes(notes, { bell, wood, volume }) {
    const ctx = await primeAudio();
    if (!ctx || !soundEnabled()) return false;
    try {
      const now = ctx.currentTime;
      for (const [frequency, delay, duration, gain = 1, voice] of notes) {
        tone(ctx, frequency, now + delay, duration, volume * gain, voice || (bell || wood ? "sine" : "triangle"));
        if (voice) continue;
        if (bell) tone(ctx, frequency * 2, now + delay, duration * 0.55, volume * gain * 0.22, "triangle");
        if (wood) tone(ctx, frequency * 2.76, now + delay, duration * 0.32, volume * gain * 0.3, "sine");
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function playComboChime(combo) {
    const rung = Math.max(0, Math.min(comboNotes.length - 1, (Math.floor(combo) || 1) - 1));
    // Bell root plus a quiet triangle fifth a beat later: the chime climbs with the combo and stays consonant.
    return playNotes([[comboNotes[rung], 0, 0.22], [comboNotes[rung] * 1.5, 0.045, 0.18, 0.35, "triangle"]], { bell: true, volume: 0.075 });
  }

  function playCompleteFanfare() {
    return playNotes([[523.25, 0, 0.29], [659.25, 0.07, 0.28], [783.99, 0.14, 0.26], [1174.66, 0.20, 0.22]],
      { bell: true, volume: 0.065 });
  }

  function playSoftNudge() {
    return playNotes([[329.63, 0, 0.085], [261.63, 0.07, 0.11, 0.85]], { wood: true, volume: 0.06 });
  }

  function triggerHaptic(kind) {
    if (prefersReducedMotion() || !Object.hasOwn(haptics, kind)) return;
    try { window.navigator?.vibrate?.(haptics[kind]); } catch (_) {}
  }

  function springCurve(name) {
    const styles = window.getComputedStyle?.(document.documentElement);
    return styles?.getPropertyValue(`--spring-${name}`).trim() || "ease-out";
  }

  // A burst of stars and a soft ring around a celebrating element (Kubo on a correct answer).
  function sparkleRing(anchor, count = 8) {
    const layer = document.getElementById("fx-layer");
    if (prefersReducedMotion() || !layer || !anchor?.getBoundingClientRect) return;
    const box = anchor.getBoundingClientRect();
    if (!box.width) return;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.max(box.width, box.height) * 0.62;
    const ring = document.createElement("span");
    ring.className = "fx-ring";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.width = ring.style.height = `${radius * 2}px`;
    layer.append(ring);
    const nodes = [ring];
    const pieces = [ring.animate?.([
      { transform: "translate(-50%, -50%) scale(.55)", opacity: 0.9 },
      { transform: "translate(-50%, -50%) scale(1.15)", opacity: 0 },
    ], { duration: 520, easing: "cubic-bezier(.23, 1, .32, 1)", fill: "both" })];
    for (let i = 0; i < count; i++) {
      const star = document.createElement("span");
      star.className = `fx-star tone-${i % 3}`;
      star.style.left = `${x}px`;
      star.style.top = `${y}px`;
      layer.append(star);
      nodes.push(star);
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const reach = radius * (i % 2 ? 1.05 : 1.3);
      const sx = Math.cos(angle) * reach;
      const sy = Math.sin(angle) * reach;
      pieces.push(star.animate?.([
        { transform: "translate(-50%, -50%) scale(.3) rotate(0deg)", opacity: 0 },
        { transform: `translate(calc(-50% + ${sx * 0.8}px), calc(-50% + ${sy * 0.8}px)) scale(1) rotate(45deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(.4) rotate(90deg)`, opacity: 0 },
      ], { duration: 560, delay: 60 + i * 12, easing: "cubic-bezier(.23, 1, .32, 1)", fill: "both" }));
    }
    Promise.all(pieces.map((animation) => animation?.finished)).catch(() => {}).finally(() => nodes.forEach((node) => node.remove()));
  }

  function flyXp(origin, target) {
    const layer = document.getElementById("fx-layer");
    if (prefersReducedMotion() || !layer || !origin || !target?.animate) return;
    const from = origin.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const x = from.left + from.width / 2;
    const y = from.top + from.height / 2;
    const dx = to.left + to.width / 2 - x;
    const dy = to.top + to.height / 2 - y;
    const animations = Array.from({ length: 7 }, (_, index) => {
      const spark = document.createElement("span");
      spark.className = "fx-xp-orb";
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      layer.append(spark);
      // Orbs fan out on launch, then converge on the badge: a sideways bow that fades to zero and a
      // lift that peaks early, so the flight reads as thrown rather than slid.
      const spread = (index - 3) * 15;
      const keyframes = Array.from({ length: 17 }, (_, step) => {
        const t = step / 16;
        const bow = Math.sin(Math.PI * t) * (1 - t * 0.35);
        const px = t * t * dx * 0.35 + t * dx * 0.65 + bow * spread;
        const py = t * dy - Math.sin(Math.PI * Math.min(1, t * 1.15)) * (36 + (index % 3) * 10);
        return { transform: `translate(${px}px, ${py}px) scale(${0.55 + bow * 0.7})`, opacity: t < 0.86 ? 1 : (1 - t) / 0.14 };
      });
      const flight = spark.animate(keyframes, { duration: 640, delay: index * 38, easing: "cubic-bezier(.45, .05, .25, 1)", fill: "both" });
      return flight.finished.catch(() => {}).finally(() => spark.remove());
    });
    // The badge settles once, when the last orb lands, rather than bouncing per orb.
    Promise.all(animations).then(() => {
      if (!target.isConnected || prefersReducedMotion()) return;
      target.classList.remove("xp-catch");
      void target.offsetWidth;
      target.classList.add("xp-catch");
      target.addEventListener("animationend", () => target.classList.remove("xp-catch"), { once: true });
    }).catch(() => {});
  }

  return {
    setSoundEnabled: (readPreference) => { soundEnabled = readPreference; },
    primeAudio, prefersReducedMotion, withViewTransition, springCurve,
    playComboChime, playCompleteFanfare, playSoftNudge, triggerHaptic, flyXp, sparkleRing,
  };
})();
