const CONFIG = window.APP_CONFIG || {};
const STATIC_MODE = CONFIG.staticMode === true;
const ASSET_BASE = CONFIG.assetBase || "/static";
const numberFormat = new Intl.NumberFormat();

function esc(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
}

function prefGet(key) {
  try {
    const current = localStorage.getItem("course_studio_" + key);
    if (current !== null) return current;
    const legacy = localStorage.getItem("schlossallee_" + key);
    if (legacy !== null) prefSet(key, legacy);
    return legacy;
  } catch (_) {
    return null;
  }
}

function prefSet(key, value) {
  try {
    localStorage.setItem("course_studio_" + key, value);
    return true;
  } catch (_) {
    return false;
  }
}

function loadAchievements() {
  try {
    const values = JSON.parse(prefGet("achievements") || "[]");
    return Array.isArray(values) ? values : [];
  } catch (_) {
    return [];
  }
}

function colorHex(value) {
  return /^#[a-f0-9]{6}$/i.test(value) ? value : "#4f46e5";
}

function bannerColor(value) {
  const hex = colorHex(value);
  const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16));
  const linear = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const luminance = () => channels.reduce((sum, c, i) => sum + linear(c / 255) * [0.2126, 0.7152, 0.0722][i], 0);
  while (luminance() > 0.181) channels.forEach((c, i) => { channels[i] = Math.floor(c * 0.92); });
  return "#" + channels.map((c) => c.toString(16).padStart(2, "0")).join("");
}

// Recall cards already contain paragraph and line-break markup.
function cardHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value ?? "");
  const allowed = new Set(["P", "BR", "B", "STRONG", "I", "EM", "UL", "OL", "LI", "CODE", "PRE", "SUB", "SUP", "SPAN", "DIV", "BLOCKQUOTE", "HR"]);
  for (const node of template.content.querySelectorAll("*")) {
    if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || !allowed.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent));
      continue;
    }
    for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
  }
  return template.innerHTML;
}

function currentStepId() {
  return state.view === "mission" ? state.data?.districts[state.districtIdx]?.steps[state.stepIdx]?.id : null;
}

function renderPreserving(container, html, selector) {
  const previous = selector ? container.querySelector(selector) : null;
  const template = document.createElement("template");
  template.innerHTML = html;
  const next = selector ? template.content.querySelector(selector) : null;
  let style;
  if (previous && next) {
    style = next.getAttribute("style");
    next.replaceWith(previous);
  }
  const oldTimer = container.querySelector('#timer-popover[data-open="true"]');
  const newTimer = template.content.querySelector('#timer-popover[data-open="true"]');
  if (oldTimer && newTimer) newTimer.replaceWith(oldTimer);
  container.replaceChildren(template.content);
  if (style) requestAnimationFrame(() => {
    if (previous.isConnected) previous.setAttribute("style", style);
  });
}

const MASCOT_PALETTES = [
  { id: "indigo", name: "Indigo", body: "#4F46E5", shade: "#3730A3", hi: "#A5B4FC" },
  { id: "emerald", name: "Emerald", body: "#10B981", shade: "#047857", hi: "#A7F3D0" },
  { id: "coral", name: "Coral", body: "#F43F5E", shade: "#BE123C", hi: "#FDA4AF" },
  { id: "amber", name: "Amber", body: "#F59E0B", shade: "#B45309", hi: "#FDE68A" },
  { id: "sky", name: "Sky", body: "#0EA5E9", shade: "#0369A1", hi: "#BAE6FD" },
  { id: "violet", name: "Violet", body: "#8B5CF6", shade: "#6D28D9", hi: "#DDD6FE" },
];

// Fallback rank rewards (the server sends the authoritative list in gamification.level_rewards)
const DEFAULT_LEVEL_REWARDS = [
  { level: 1, threshold: 0, accessory: "none", colors: ["indigo", "emerald", "sky"], label: "Classic Kubo (Indigo, Emerald & Sky)" },
  { level: 2, threshold: 80, accessory: "headphones", colors: ["coral", "amber"], label: "Headphones & Coral/Amber" },
  { level: 3, threshold: 180, accessory: "glasses", colors: ["violet"], label: "Cool Glasses & Violet" },
  { level: 4, threshold: 300, accessory: "gradcap", colors: [], label: "Graduation Cap" },
  { level: 5, threshold: 450, accessory: "aura", colors: [], label: "Golden Sparkle Aura" },
  { level: 6, threshold: 620, accessory: "crown", colors: [], label: "Royal Crown" },
];
const ACCESSORY_NAMES = { none: "Classic", headphones: "Headphones", glasses: "Cool Glasses", gradcap: "Grad Cap", aura: "Sparkle Aura", crown: "Royal Crown" };

const DEMO_SQUAD = [
  { id: "demo-1", username: "lena", display_name: "Lena", mascot_color: "#10B981", mascot_accessory: "headphones", xp: 145, streak_days: 4, current_step_id: "" },
  { id: "demo-2", username: "max", display_name: "Max", mascot_color: "#F43F5E", xp: 95, streak_days: 3, current_step_id: "" },
  { id: "demo-3", username: "jonas", display_name: "Jonas", mascot_color: "#F59E0B", mascot_accessory: "glasses", xp: 260, streak_days: 6, current_step_id: "" },
  { id: "demo-4", username: "sofia", display_name: "Sofia", mascot_color: "#0EA5E9", xp: 40, streak_days: 2, current_step_id: "" },
];

const state = {
  data: null,
  view: "map", // "map" | "mission" | "drill"
  districtIdx: 0,
  stepIdx: 0,
  navDir: "fade",
  lastRenderedStepId: null,
  selectedMcq: Object.create(null),
  hintState: Object.create(null),
  stepFeedback: Object.create(null),
  labCache: Object.create(null),
  // Recall Drill session state
  drillCards: [],
  drillIdx: 0,
  drillRevealed: false,
  drillSessionXp: 0,
  drillGoodCount: 0,
  drillCombo: 0,
  drillMood: "thinking",
  // Inline End-of-Unit Recall Sprint state (per district id)
  unitSprint: Object.create(null),
  combo: 0,
  theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
  mascotColor: prefGet("mascot_color") || "#4F46E5",
  mascotAccessory: prefGet("mascot_accessory") || "none",
  achievements: loadAchievements(),
  timer: { total: 900, left: 900, running: false, interval: null, popoverOpen: false },
  speechTimer: null,
  sbClient: null,
  sbUser: null,
  sbProfile: null,
  friends: [],
  demoSquadOn: prefGet("demo_squad") === "1",
  modalOpen: false,
  inFlight: false,
  footerCooldown: 0,
  ratingCooldown: 0,
  course: null,
  courses: [],
  progress: null,
};

const ACHIEVEMENT_DEFS = [
  { id: "first_step", title: "First Move", desc: "Complete your first lesson step", icon: "star" },
  { id: "combo_3", title: "On a Roll", desc: "Hit a 3× correct answer streak", icon: "flame" },
  { id: "code_cracker", title: "PyTorch Verified", desc: "Pass your first local code test", icon: "code" },
  { id: "district_clear", title: "Chapter Complete", desc: "Complete all steps in a chapter", icon: "crown" },
  { id: "ppo_boss", title: "PPO Master", desc: "Clear Unit 5 (PPO Deep Dive)", icon: "bolt" },
  { id: "sprint_done", title: "Deep Focus", desc: "Finish a full focus timer sprint", icon: "clock" },
];

function paletteForColor(hex) {
  return MASCOT_PALETTES.find((p) => p.body.toLowerCase() === String(hex || "").toLowerCase()) || MASCOT_PALETTES[0];
}

function applyUserMascotColor(hex) {
  const p = paletteForColor(hex);
  state.mascotColor = p.body;
  try { localStorage.setItem("course_studio_mascot_color", p.body); } catch (_) {}
  document.documentElement.style.setProperty("--mascot-body", p.body);
  document.documentElement.style.setProperty("--mascot-shade", p.shade);
  document.documentElement.style.setProperty("--mascot-highlight", p.hi);
}
applyUserMascotColor(state.mascotColor);

// Rank Rewards: Levels Unlock Kubo Customizations
function levelRewards() {
  const g = state.data && state.data.gamification;
  return g?.level_rewards?.filter((r) => Object.hasOwn(ACCESSORY_NAMES, r.accessory)) || DEFAULT_LEVEL_REWARDS;
}

function currentXp() {
  return (state.data && state.data.gamification.xp) || 0;
}

function isAccessoryUnlocked(acc) {
  if (!Object.hasOwn(ACCESSORY_NAMES, acc)) return false;
  if (acc === "none") return true;
  const r = levelRewards().find((x) => x.accessory === acc);
  return Boolean(r && currentXp() >= r.threshold);
}

function isColorUnlocked(paletteId) {
  const r = levelRewards().find((x) => (x.colors || []).includes(paletteId));
  return !r || currentXp() >= r.threshold;
}

function colorUnlockLevel(paletteId) {
  const r = levelRewards().find((x) => (x.colors || []).includes(paletteId));
  return r ? r.level : 1;
}

function nextUnlock() {
  return levelRewards().find((r) => currentXp() < r.threshold) || null;
}

function equippedAccessory() {
  return isAccessoryUnlocked(state.mascotAccessory) ? state.mascotAccessory : "none";
}

function applyUserAccessory(acc) {
  const valid = Object.hasOwn(ACCESSORY_NAMES, acc) ? acc : "none";
  state.mascotAccessory = valid;
  try { localStorage.setItem("course_studio_mascot_accessory", valid); } catch (_) {}
}

// Crisp Single-Weight Icons
const ICONS = {
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  check: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  star: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 14.9 8.6l6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6-4.8-4.6 6.6-.9L12 2.5Z"/></svg>`,
  play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>`,
  pause: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  reset: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
  target: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>`,
  lock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  gift: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="5" rx="1.5"/><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8v13M12 8S10.5 3 7.8 3.6C6 4 6.3 7 8 8M12 8s1.5-5 4.2-4.4C18 4 17.7 7 16 8"/></svg>`,
  flame: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/></svg>`,
  bolt: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>`,
  book: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  cards: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="14" height="14" rx="2.5"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/></svg>`,
  code: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>`,
  sliders: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>`,
  flag: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a2 2 0 0 1 2-2h11l-2.5 5L17 12H6"/></svg>`,
  crown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 18 2-11 5 4 3-6 3 6 5-4 2 11H2Z"/></svg>`,
  clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  users: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  hint: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.3 1 2.3h6c0-1 .3-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>`,
  volOn: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  volOff: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>`,
  sun: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
  moon: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`,
};

// Expressive Kubo Mascot (Clean Mouth Swap + Rank Accessories)
function accessoryLayers(acc) {
  if (acc === "aura") {
    const spark = (cls, x, y, r) =>
      `<path class="kubo-aura-spark ${cls}" d="M${x} ${y - r}l${r * 0.3} ${r * 0.7} ${r * 0.7} ${r * 0.3}-${r * 0.7} ${r * 0.3}-${r * 0.3} ${r * 0.7}-${r * 0.3}-${r * 0.7}-${r * 0.7}-${r * 0.3} ${r * 0.7}-${r * 0.3}Z" fill="#FBBF24"/>`;
    return {
      back: `<g class="kubo-aura">
          <ellipse cx="32" cy="31" rx="31" ry="28" fill="#FBBF24" opacity="0.16"/>
          <ellipse cx="32" cy="31" rx="27.5" ry="24.5" stroke="#FBBF24" stroke-width="1.6" stroke-dasharray="2 4" stroke-linecap="round" opacity="0.8"/>
        </g>
        ${spark("s1", 5, 12, 3.4)}${spark("s2", 59, 15, 2.8)}${spark("s3", 58, 45, 3)}${spark("s4", 6, 44, 2.4)}`,
      front: "",
      head: false,
    };
  }
  if (acc === "headphones") {
    return {
      back: "",
      front: `<path d="M10.5 26C10.5 1.5 53.5 1.5 53.5 26" stroke="#27272A" stroke-width="3.4" stroke-linecap="round" fill="none"/>
        <rect x="4.5" y="21" width="8.5" height="15" rx="3.8" fill="#27272A"/>
        <rect x="6.6" y="23.4" width="4.3" height="10.2" rx="2.1" fill="#F43F5E"/>
        <rect x="51" y="21" width="8.5" height="15" rx="3.8" fill="#27272A"/>
        <rect x="53.1" y="23.4" width="4.3" height="10.2" rx="2.1" fill="#F43F5E"/>`,
      head: true,
    };
  }
  if (acc === "glasses") {
    return {
      back: "",
      front: `<g class="kubo-glasses">
          <path d="M16.5 28.4 10 26.6M47.5 28.4 54 26.6" stroke="#18181B" stroke-width="2" stroke-linecap="round"/>
          <rect x="16" y="24.6" width="15" height="11.4" rx="4.4" fill="#18181B" fill-opacity="0.82" stroke="#18181B" stroke-width="2"/>
          <rect x="33" y="24.6" width="15" height="11.4" rx="4.4" fill="#18181B" fill-opacity="0.82" stroke="#18181B" stroke-width="2"/>
          <path d="M31 28.6c.7-.9 1.3-.9 2 0" stroke="#18181B" stroke-width="2" stroke-linecap="round" fill="none"/>
          <path d="M19 27.6l4.2-.1M36 27.6l4.2-.1" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>
        </g>`,
      head: false,
    };
  }
  if (acc === "gradcap") {
    return {
      back: "",
      front: `<path d="M21 9.5v5.2c0 2.6 22 2.6 22 0V9.5" fill="#1F2937"/>
        <path d="M32 1 52.5 7.6 32 14.2 11.5 7.6Z" fill="#111827" stroke="#374151" stroke-width="1" stroke-linejoin="round"/>
        <path d="M32 7.6 50 8.4v8" stroke="#F59E0B" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        <circle cx="50" cy="17.4" r="1.9" fill="#F59E0B"/>`,
      head: true,
    };
  }
  if (acc === "crown") {
    return {
      back: "",
      front: `<path d="M19.5 13.5 21.8 3.5 27.6 9 32 1.5 36.4 9 42.2 3.5 44.5 13.5Z" fill="#F59E0B" stroke="#B45309" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="32" cy="9.6" r="1.6" fill="#F43F5E"/>
        <circle cx="25" cy="11" r="1.1" fill="#38BDF8"/>
        <circle cx="39" cy="11" r="1.1" fill="#38BDF8"/>`,
      head: true,
    };
  }
  return { back: "", front: "", head: false };
}

function mascotHtml(mood = "idle", size = 56, customColor = null, speaking = false, idAttr = "", accessory = null) {
  const pal = customColor ? paletteForColor(customColor) : null;
  const colorVars = pal ? `style="--kb:${pal.body}; --ks:${pal.shade}; --kh:${pal.hi};"` : "";
  const acc = accessory !== null ? accessory : (customColor ? "none" : equippedAccessory());
  const layers = accessoryLayers(Object.hasOwn(ACCESSORY_NAMES, acc) ? acc : "none");

  const crown = mood === "proud" && !layers.head
    ? `<path d="M21 14 24 6l8 5 8-5 3 8H21Z" fill="#F59E0B" stroke="#B45309" stroke-width="1.6" stroke-linejoin="round"/>`
    : "";

  const restMouth = (mood === "happy" || mood === "proud")
    ? `<path class="kubo-mouth-smile" d="M26 37.5c2 3.2 10 3.2 12 0" stroke="#18181B" stroke-width="2.6" stroke-linecap="round" fill="none"/>`
    : mood === "oops"
      ? `<path class="kubo-mouth-smile" d="M28 40c2-1.8 6-1.8 8 0" stroke="#18181B" stroke-width="2.4" stroke-linecap="round" fill="none"/>`
      : mood === "thinking"
        ? `<path class="kubo-mouth-smile" d="M28.5 38.2c1.5 1.8 5.5 1.8 7 0" stroke="#18181B" stroke-width="2.4" stroke-linecap="round" fill="none"/>`
        : `<path class="kubo-mouth-smile" d="M27.5 38c1.6 2.2 7.4 2.2 9 0" stroke="#18181B" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;

  const talkMouth = `<ellipse class="kubo-mouth-talk" cx="32" cy="39" rx="4.2" ry="3.0" fill="#18181B"/>`;

  let eyesEl = "";
  if (mood === "happy" || mood === "proud") {
    eyesEl = `
      <path d="M20 31c1.6-3.2 5.4-3.2 7 0" stroke="#18181B" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M37 31c1.6-3.2 5.4-3.2 7 0" stroke="#18181B" stroke-width="3" stroke-linecap="round" fill="none"/>
      <ellipse cx="18" cy="36.5" rx="3.2" ry="1.8" fill="var(--mascot-cheek)" opacity="0.85"/>
      <ellipse cx="46" cy="36.5" rx="3.2" ry="1.8" fill="var(--mascot-cheek)" opacity="0.85"/>`;
  } else if (mood === "oops") {
    eyesEl = `
      <circle cx="23.5" cy="31" r="4.6" fill="#FFFFFF"/>
      <circle cx="40.5" cy="31" r="4.6" fill="#FFFFFF"/>
      <circle cx="24" cy="31.5" r="2.3" fill="#18181B"/>
      <circle cx="41" cy="31.5" r="2.3" fill="#18181B"/>`;
  } else if (mood === "thinking") {
    // Warm, curious & encouraging: bright centered eyes, a little sparkle, soft cheeks.
    eyesEl = `
      <g class="kubo-eyes">
        <circle cx="23.5" cy="30.2" r="5.3" fill="#FFFFFF"/>
        <circle cx="40.5" cy="30.2" r="5.3" fill="#FFFFFF"/>
        <circle cx="23.7" cy="29.8" r="2.7" fill="#18181B"/>
        <circle cx="40.7" cy="29.8" r="2.7" fill="#18181B"/>
        <circle cx="24.9" cy="28.4" r="1.05" fill="#FFFFFF"/>
        <circle cx="41.9" cy="28.4" r="1.05" fill="#FFFFFF"/>
      </g>
      <ellipse cx="18" cy="36.5" rx="2.8" ry="1.5" fill="var(--mascot-cheek)" opacity="0.7"/>
      <ellipse cx="46" cy="36.5" rx="2.8" ry="1.5" fill="var(--mascot-cheek)" opacity="0.7"/>`;
  } else {
    eyesEl = `
      <g class="kubo-eyes">
        <circle cx="23.5" cy="30.5" r="5.2" fill="#FFFFFF"/>
        <circle cx="40.5" cy="30.5" r="5.2" fill="#FFFFFF"/>
        <circle cx="24.3" cy="30.5" r="2.5" fill="#18181B"/>
        <circle cx="41.3" cy="30.5" r="2.5" fill="#18181B"/>
        <circle cx="25.5" cy="29" r="1" fill="#FFFFFF"/>
        <circle cx="42.5" cy="29" r="1" fill="#FFFFFF"/>
      </g>
      <ellipse cx="18" cy="36.5" rx="2.6" ry="1.4" fill="var(--mascot-cheek)" opacity="0.55"/>
      <ellipse cx="46" cy="36.5" rx="2.6" ry="1.4" fill="var(--mascot-cheek)" opacity="0.55"/>`;
  }

  return `
    <span ${idAttr ? `id="${idAttr}"` : ""} class="kubo-wrap mood-${mood} acc-${acc} ${speaking ? "speaking" : ""}" ${colorVars} aria-hidden="true">
      <svg class="kubo-svg" viewBox="0 0 64 60" width="${size}" height="${Math.round(size * 0.94)}" fill="none">
        ${layers.back}
        <ellipse cx="32" cy="56" rx="18" ry="3.5" fill="currentColor" opacity="0.12"/>
        <g class="kubo-body-group">
          <rect x="9" y="13" width="46" height="41" rx="15" fill="var(--kubo-shade)"/>
          <rect x="9" y="10" width="46" height="40" rx="15" fill="var(--kubo-body)"/>
          <path d="M17 15.5c4-2.5 26-2.5 30 0" stroke="var(--kubo-hi)" stroke-width="3.2" stroke-linecap="round" opacity="0.7"/>
          <g class="kubo-face">${eyesEl}${restMouth}${talkMouth}</g>
          ${layers.front}
          ${crown}
        </g>
      </svg>
    </span>`;
}

// Loud, Crisp, Always-Unlocked Web Audio Engine
let audioCtx = null;
let audioMaster = null;

function primeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      audioCtx = new AC();
      const comp = audioCtx.createDynamicsCompressor();
      audioMaster = audioCtx.createGain();
      audioMaster.gain.value = 0.85;
      audioMaster.connect(comp);
      comp.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (_) {
    return null;
  }
}

window.addEventListener("pointerdown", () => { primeAudio(); unlockSfxPools(); }, { passive: true });
window.addEventListener("keydown", () => { primeAudio(); unlockSfxPools(); }, { passive: true });

// Real .wav SFX: Preloaded <audio> Pools (Web Audio = fallback only)
const SFX_NAMES = ["tap", "continue", "correct", "combo", "wrong", "code_pass", "achievement", "timer"];
const SFX_VOLUME = { tap: 0.55, continue: 0.75, correct: 0.85, combo: 0.85, wrong: 0.7, code_pass: 0.85, achievement: 0.9, timer: 0.85 };
const SFX_POOL_SIZE = 4;
const sfxPools = {};
let sfxUnlocked = false;

function initSfxPools() {
  if (typeof Audio === "undefined") return;
  SFX_NAMES.forEach((name) => {
    const els = [];
    for (let i = 0; i < SFX_POOL_SIZE; i++) {
      const el = new Audio(`${ASSET_BASE}/sfx/${esc(name)}.wav`);
      el.preload = "auto";
      el.volume = SFX_VOLUME[name] ?? 0.8;
      els.push(el);
    }
    sfxPools[name] = { els, next: 0, failed: false };
    els[0].addEventListener("error", () => { sfxPools[name].failed = true; }, { once: true });
    els.forEach((el) => { try { el.load(); } catch (_) {} });
  });
}
initSfxPools();

// Safari only lets an <audio> element play later if it was started inside a user gesture once.
function unlockSfxPools() {
  if (sfxUnlocked) return;
  sfxUnlocked = true;
  Object.values(sfxPools).forEach((pool) => {
    pool.els.forEach((el) => {
      if (!el.paused) return;
      el.muted = true;
      const p = el.play();
      if (p && p.then) {
        p.then(() => { el.pause(); el.currentTime = 0; el.muted = false; })
          .catch(() => { el.muted = false; });
      } else {
        el.pause(); el.muted = false;
      }
    });
  });
}

function sfxNameFor(kind, comboBoost) {
  if (kind === "miss" || kind === "wrong") return "wrong";
  if (kind === "levelup" || kind === "achievement") return "achievement";
  if (kind === "win" || kind === "correct") return comboBoost >= 2 ? "combo" : "correct";
  return SFX_NAMES.includes(kind) ? kind : null;
}

function playWav(name) {
  const pool = sfxPools[name];
  if (!pool || pool.failed) return Promise.reject(new Error("no pool"));
  // Round-robin through the pool so rapid taps overlap instead of cutting each other off.
  const el = pool.els[pool.next];
  pool.next = (pool.next + 1) % pool.els.length;
  try {
    el.muted = false;
    el.currentTime = 0;
    const p = el.play();
    return p && p.then ? p : Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

function playTone(ctx, freq, startOffset, dur, vol = 0.32, type = "sine", overtone = true) {
  const dest = audioMaster || ctx.destination;
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(now);
  osc.stop(now + dur + 0.03);

  if (overtone) {
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(freq * 2, now);
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.linearRampToValueAtTime(vol * 0.34, now + 0.009);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.6);
    o2.connect(g2);
    g2.connect(dest);
    o2.start(now);
    o2.stop(now + dur * 0.65);
  }
}

function playSound(kind = "correct", comboBoost = 0) {
  if (state.data && !state.data.gamification.sound_enabled) return;
  const name = sfxNameFor(kind, comboBoost);
  if (!name) return;
  playWav(name).catch(() => playSynth(kind, comboBoost));
}

// Web Audio synth fallback (used only if a .wav cannot be played).
async function playSynth(kind = "correct", comboBoost = 0) {
  try {
    const ctx = primeAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
    const shift = Math.pow(1.06, Math.min(comboBoost, 5));

    if (kind === "tap") {
      playTone(ctx, 480, 0, 0.06, 0.14, "sine", false);
    } else if (kind === "continue") {
      playTone(ctx, 523.25, 0.00, 0.14, 0.22);
      playTone(ctx, 659.25, 0.06, 0.20, 0.24);
    } else if (kind === "correct" || kind === "win" || kind === "combo") {
      playTone(ctx, 523.25 * shift, 0.00, 0.22, 0.28);
      playTone(ctx, 659.25 * shift, 0.075, 0.26, 0.30);
      playTone(ctx, 783.99 * shift, 0.15, 0.38, 0.32);
    } else if (kind === "code_pass") {
      [523.25, 659.25, 783.99, 987.77, 1046.5].forEach((f, i) =>
        playTone(ctx, f, i * 0.065, 0.36, 0.28)
      );
    } else if (kind === "achievement" || kind === "levelup") {
      [392.0, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        playTone(ctx, f, i * 0.075, i === 4 ? 0.56 : 0.25, 0.30)
      );
    } else if (kind === "timer") {
      [659.25, 880.0, 1046.5].forEach((f, i) => playTone(ctx, f, i * 0.11, 0.46, 0.28));
    } else if (kind === "miss" || kind === "wrong") {
      playTone(ctx, 250, 0.00, 0.15, 0.26, "triangle", false);
      playTone(ctx, 180, 0.095, 0.24, 0.28, "triangle", false);
    }
  } catch (_) {}
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function spawnSparkles(anchorEl, count = 14) {
  if (prefersReducedMotion()) return;
  const layer = document.getElementById("fx-layer");
  if (!layer) return;
  const rect = anchorEl ? anchorEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight - 120, width: 0, height: 0 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ["#22C55E", "#6366F1", "#F59E0B", "#38BDF8", "#F472B6"];

  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "fx-spark";
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.background = colors[i % colors.length];
    layer.appendChild(el);
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
    const dist = 42 + Math.random() * 58;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 18;
    const anim = el.animate([
      { transform: "translate(-50%, -50%) scale(0.4) rotate(0deg)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${120 + i * 25}deg)`, opacity: 1, offset: 0.65 },
      { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 22}px)) scale(0.2) rotate(${240 + i * 25}deg)`, opacity: 0 },
    ], { duration: 540 + Math.random() * 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" });
    anim.onfinish = () => el.remove();
  }
}

function spawnXpFloat(label, anchorEl) {
  if (prefersReducedMotion()) return;
  const layer = document.getElementById("fx-layer");
  if (!layer) return;
  const rect = anchorEl ? anchorEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight - 110, width: 0 };
  const el = document.createElement("div");
  el.className = "fx-xp-float";
  el.textContent = label;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top - 8}px`;
  layer.appendChild(el);
  const anim = el.animate([
    { transform: "translate(-50%, 6px) scale(0.88)", opacity: 0 },
    { transform: "translate(-50%, -18px) scale(1)", opacity: 1, offset: 0.25 },
    { transform: "translate(-50%, -48px) scale(0.96)", opacity: 0 },
  ], { duration: 920, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" });
  anim.onfinish = () => el.remove();
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 2900);
}

function unlockAchievement(id) {
  if (state.achievements.includes(id)) return;
  const def = ACHIEVEMENT_DEFS.find((a) => a.id === id);
  if (!def) return;
  state.achievements.push(id);
  try { localStorage.setItem("course_studio_achievements", JSON.stringify(state.achievements)); } catch (_) {}
  playSound("achievement");
  const el = document.createElement("div");
  el.className = "toast-achievement";
  el.innerHTML = `${mascotHtml("proud", 44)}<div><div class="toast-ach-kicker">Achievement Unlocked</div><div class="toast-ach-title">${def.title}</div><div class="toast-ach-sub">${def.desc}</div></div>`;
  document.getElementById("toast-container").appendChild(el);
  spawnSparkles(el, 18);
  setTimeout(() => el.remove(), 4600);
  syncProgressToSupabase();
}

// Supabase Client, Auth & Friends
function getSupabaseConfig() {
  const srv = (state.data && state.data.supabase) || {};
  return { url: CONFIG.supabaseUrl || srv.url || "", anonKey: CONFIG.supabaseAnonKey || srv.anon_key || "" };
}

async function initSupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey || !window.supabase) {
    state.sbClient = null;
    return;
  }
  try {
    state.sbClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    const { data: { session } } = await state.sbClient.auth.getSession();
    state.sbClient.auth.onAuthStateChange?.((event) => {
      if (event === "SIGNED_OUT" && state.sbUser) setTimeout(() => {
        if (state.sbUser) clearSession().catch((err) => toast(err.message));
      }, 0);
    });
    if (session && session.user) {
      state.sbUser = session.user;
      await loadCloudProfileAndFriends();
    }
  } catch (_) {
    state.sbClient = null;
  }
}

async function loadCloudProfileAndFriends() {
  if (!state.sbClient || !state.sbUser) return;
  const { data: prof } = await state.sbClient.from("profiles").select("*").eq("id", state.sbUser.id).maybeSingle();
  if (prof) {
    state.sbProfile = prof;
    applyUserMascotColor(prof.mascot_color);
    if (prof.mascot_accessory) applyUserAccessory(prof.mascot_accessory);
    if (Array.isArray(prof.achievements)) {
      const merged = Array.from(new Set([...state.achievements, ...prof.achievements]));
      state.achievements = merged;
      try { localStorage.setItem("course_studio_achievements", JSON.stringify(merged)); } catch (_) {}
    }
  }
  const { data: edges } = await state.sbClient
    .from("friendships")
    .select("user_id, friend_id")
    .or(`user_id.eq.${state.sbUser.id},friend_id.eq.${state.sbUser.id}`);
  const friendIds = Array.from(new Set((edges || []).map((e) => (e.user_id === state.sbUser.id ? e.friend_id : e.user_id))));
  if (friendIds.length) {
    const { data: fProfs } = await state.sbClient
      .from("profiles")
      .select("id, username, display_name, mascot_color, mascot_accessory, xp, streak_days, current_step_id")
      .in("id", friendIds);
    state.friends = fProfs || [];
  } else {
    state.friends = [];
  }
}

async function syncProgressToSupabase() {
  if (!state.sbClient || !state.sbUser || !state.data) return;
  const g = state.data.gamification;
  const next = findNextStep();
  const completedSteps = g.completed_events.filter((e) => e.startsWith("step-")).map((e) => e.slice(5));
  try {
    await state.sbClient
      .from("profiles")
      .update({
        mascot_color: state.mascotColor,
        mascot_accessory: state.mascotAccessory,
        xp: g.xp,
        streak_days: g.streak_days,
        current_step_id: next.s.id,
        completed_steps: completedSteps,
        achievements: state.achievements,
      })
      .eq("id", state.sbUser.id);
  } catch (_) {}
}

function activeSquadList() {
  if (state.sbUser && state.friends.length) return state.friends;
  if (state.demoSquadOn && !cloudCourse()) {
    const stepIds = state.data.districts.flatMap((d) => d.steps.map((s) => s.id));
    return DEMO_SQUAD.map((profile, index) => ({ ...profile, current_step_id: stepIds[index] }));
  }
  return [];
}

function stepNameById(stepId) {
  if (!state.data) return "";
  for (const d of state.data.districts) {
    for (const s of d.steps) {
      if (s.id === stepId) return d.chapter;
    }
  }
  return "";
}

// Theme Toggle
function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.classList.add("theme-switching");
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("theme-switching")));
  if (state.theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("course_studio_theme", state.theme); } catch (_) {}
  activeEditor?.setTheme();
  playSound("tap");
  if (state.view === "courses") renderCourses();
  else if (state.data) renderTopbar();
}

// Markdown + KaTeX
function mdToHtml(md, inline = false) {
  if (!md) return "";
  const mathSlots = [];
  let safe = String(md).replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\)/g, (m) => {
    mathSlots.push(esc(m));
    return `@@MATH${mathSlots.length - 1}@@`;
  });
  safe = esc(safe)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  if (inline) {
    return safe.replace(/@@MATH(\d+)@@/g, (slot, i) => mathSlots[Number(i)] ?? slot);
  }
  safe = safe.replace(/^&gt;\s*(.+)$/gm, "<blockquote>$1</blockquote>");
  const lines = safe.split("\n");
  let out = "", inUl = false, inOl = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^[-•]\s+/.test(t)) {
      if (!inUl) { out += "<ul>"; inUl = true; }
      out += `<li>${t.replace(/^[-•]\s+/, "")}</li>`;
    } else if (/^\d+\.\s+/.test(t)) {
      if (!inOl) { out += "<ol>"; inOl = true; }
      out += `<li>${t.replace(/^\d+\.\s+/, "")}</li>`;
    } else {
      if (inUl) { out += "</ul>"; inUl = false; }
      if (inOl) { out += "</ol>"; inOl = false; }
      if (t.startsWith("<blockquote>")) out += t;
      else if (t) out += `<p>${t}</p>`;
    }
  }
  if (inUl) out += "</ul>";
  if (inOl) out += "</ol>";
  return out.replace(/@@MATH(\d+)@@/g, (slot, i) => mathSlots[Number(i)] ?? slot);
}

function renderMath(el) {
  if (window.renderMathInElement) {
    window.renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
    });
  }
}

async function request(path, body = null, options = {}) {
  const opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
  const response = await fetch(path, { ...opts, ...options });
  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const detail = typeof json?.detail === "string" ? json.detail : null;
    throw new Error(detail || `Request failed (${response.status}).`);
  }
  return response.json();
}

async function api(path, body = null) {
  if (!cloudCourse()) return request(path, body, { signal: AbortSignal.timeout(path === "/api/run_lab" ? 120000 : 25000) });
  if (path === "/api/sound") {
    prefSet("sound", body.enabled ? "on" : "off");
    return { sound_enabled: body.enabled };
  }
  return updateCloudProgress(path, body);
}

function isStepDone(stepId) {
  return state.data.gamification.completed_events.includes(`step-${stepId}`);
}

function findNextStep() {
  for (let di = 0; di < state.data.districts.length; di++) {
    const d = state.data.districts[di];
    for (let si = 0; si < d.steps.length; si++) {
      if (!isStepDone(d.steps[si].id)) return { di, si, d, s: d.steps[si] };
    }
  }
  const d = state.data.districts[0];
  return { di: 0, si: 0, d, s: d.steps[0] };
}

// soundKind = null means the caller already played its sound (e.g. Continue inside the click gesture).
function handleXp(xp, anchorEl = null, soundKind = "correct") {
  if (xp && xp.leveled_up) {
    playSound("levelup");
    spawnSparkles(anchorEl, 22);
    const reward = [...levelRewards()].reverse().find((r) => (xp.xp || 0) >= r.threshold);
    toast(`Rank up: ${xp.level} (+${xp.gained} XP)${reward && reward.level > 1 ? ` · Unlocked ${reward.label}` : ""}`);
  } else if (xp && xp.gained > 0) {
    if (soundKind) playSound(soundKind, state.combo);
    spawnSparkles(anchorEl, 14);
    spawnXpFloat(state.combo >= 2 ? `+${xp.gained} XP · ${state.combo}×` : `+${xp.gained} XP`, anchorEl);
  } else {
    if (soundKind) playSound(soundKind, state.combo);
    spawnSparkles(anchorEl, 10);
  }
  const doneCount = state.data.gamification.completed_events.filter((e) => e.startsWith("step-")).length;
  if (doneCount >= 1) unlockAchievement("first_step");
  if (state.combo >= 3) unlockAchievement("combo_3");
  syncProgressToSupabase();
}

// Interactive Focus Timer with Popover
function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function setTimerMinutes(mins) {
  const clamped = Math.max(1, Math.min(180, Math.round(mins)));
  clearInterval(state.timer.interval);
  state.timer.running = false;
  state.timer.total = clamped * 60;
  state.timer.left = clamped * 60;
  state.timer.popoverOpen = false;
  playSound("tap");
  renderTopbar();
  document.getElementById("timer-open-pop")?.focus();
}

function claimFocusSprint(course, minutes) {
  if (state.course !== course) return;
  if (state.inFlight) {
    setTimeout(() => claimFocusSprint(course, minutes), 150);
    return;
  }
  guarded(null, async () => {
    const res = await api("/api/sprint/claim", { minutes });
    if (state.course !== course) return;
    state.data = res.state;
    unlockAchievement("sprint_done");
    toast(`Focus sprint complete · +${res.xp?.gained ?? 0} XP`);
    if (state.view !== "courses") renderTopbar();
    syncProgressToSupabase();
  });
}

function toggleTimer() {
  state.timer.popoverOpen = false;
  playSound("tap");
  if (state.timer.running) {
    clearInterval(state.timer.interval);
    state.timer.running = false;
  } else {
    state.timer.running = true;
    const course = state.course;
    state.timer.interval = setInterval(() => {
      state.timer.left -= 1;
      if (state.timer.left <= 0) {
        clearInterval(state.timer.interval);
        state.timer.running = false;
        state.timer.left = state.timer.total;
        playSound("timer");
        claimFocusSprint(course, Math.round(state.timer.total / 60));
      }
      const ro = document.getElementById("timer-readout");
      if (ro) ro.textContent = formatTime(state.timer.left);
    }, 1000);
  }
  renderTopbar();
}

function resetTimer() {
  clearInterval(state.timer.interval);
  state.timer.running = false;
  state.timer.left = state.timer.total;
  state.timer.popoverOpen = false;
  playSound("tap");
  renderTopbar();
}

function timerWidgetHtml() {
  const showReset = state.timer.running || state.timer.left !== state.timer.total;
  const curMin = Math.round(state.timer.total / 60);
  const presets = [5, 10, 15, 25, 45];
  const popover = `<div id="timer-popover" class="timer-popover" data-open="${state.timer.popoverOpen}" ${state.timer.popoverOpen ? "" : "inert"} role="dialog" aria-label="Set focus timer">
         <div class="timer-pop-label">Focus timer duration</div>
         <div class="timer-presets">
           ${presets.map((m) => `<button class="timer-preset-btn ${curMin === m ? "active" : ""}" data-mins="${m}">${m}m</button>`).join("")}
         </div>
         <div class="timer-custom-row">
           <input id="timer-custom-in" aria-label="Custom timer duration in minutes" class="timer-custom-input" type="text" inputmode="numeric" placeholder="Custom min" value="${curMin}"/>
           <button id="timer-custom-set" class="timer-set-btn">Set</button>
         </div>
         <div id="timer-feedback" role="status" class="modal-msg"></div>
       </div>`;

  return `
    <div class="timer-anchor" id="timer-anchor">
      <div class="timer-capsule ${state.timer.running ? "running" : ""}">
        <button id="timer-open-pop" class="timer-time-btn" aria-label="Adjust focus timer duration" aria-expanded="${state.timer.popoverOpen}" aria-controls="timer-popover" aria-haspopup="dialog" title="Adjust focus timer duration">
          ${ICONS.clock}
          <span id="timer-readout" class="timer-readout">${formatTime(state.timer.left)}</span>
        </button>
        <button id="timer-toggle" class="timer-act-btn ${state.timer.running ? "active" : ""}" aria-label="${state.timer.running ? "Pause" : "Start"} timer" title="${state.timer.running ? "Pause" : "Start"} focus timer">
          ${state.timer.running ? ICONS.pause : ICONS.play}
        </button>
        ${showReset ? `<button id="timer-reset" class="timer-act-btn ghost" aria-label="Reset timer" title="Reset timer">${ICONS.reset}</button>` : ""}
      </div>
      ${popover}
    </div>`;
}

function bindTimerControls() {
  const openBtn = document.getElementById("timer-open-pop");
  const tog = document.getElementById("timer-toggle");
  const rst = document.getElementById("timer-reset");
  if (openBtn) {
    openBtn.onclick = (e) => {
      e.stopPropagation();
      playSound("tap");
      state.timer.popoverOpen = !state.timer.popoverOpen;
      patchTimerPopover();
      if (state.timer.popoverOpen) {
        const ci = document.getElementById("timer-custom-in");
        if (ci) ci.select();
      }
    };
  }
  if (tog) tog.onclick = (e) => { e.stopPropagation(); toggleTimer(); };
  if (rst) rst.onclick = (e) => { e.stopPropagation(); resetTimer(); };

  const pop = document.getElementById("timer-popover");
  if (pop) {
    pop.onclick = (e) => e.stopPropagation();
    pop.querySelectorAll("[data-mins]").forEach((b) => {
      b.onclick = () => setTimerMinutes(Number(b.dataset.mins));
    });
    const setBtn = document.getElementById("timer-custom-set");
    const inp = document.getElementById("timer-custom-in");
    inp.oninput = () => {
      inp.removeAttribute("aria-invalid");
      document.getElementById("timer-feedback").textContent = "";
    };
    const applyCustom = () => {
      const n = Number((inp.value || "").trim());
      if (Number.isInteger(n) && n >= 1 && n <= 180) setTimerMinutes(n);
      else {
        inp.setAttribute("aria-invalid", "true");
        document.getElementById("timer-feedback").textContent = "Enter a whole number from 1 to 180.";
        inp.focus();
      }
    };
    if (setBtn) setBtn.onclick = applyCustom;
    if (inp) inp.onkeydown = (e) => { if (e.key === "Enter") applyCustom(); };
  }
}

function patchTimerPopover(restoreFocus = false) {
  const pop = document.getElementById("timer-popover");
  const trigger = document.getElementById("timer-open-pop");
  if (!pop || !trigger) return;
  pop.dataset.open = String(state.timer.popoverOpen);
  pop.inert = !state.timer.popoverOpen;
  trigger.setAttribute("aria-expanded", String(state.timer.popoverOpen));
  if (restoreFocus) trigger.focus();
}

document.addEventListener("click", () => {
  if (state.timer.popoverOpen) {
    state.timer.popoverOpen = false;
    patchTimerPopover();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !state.modalOpen && state.timer.popoverOpen) {
    state.timer.popoverOpen = false;
    patchTimerPopover(true);
  }
});

// Calm Top Bar (Delightful Learn)
function renderTopbar() {
  const bar = document.getElementById("topbar");
  const g = state.data.gamification;
  const themeIcon = state.theme === "dark" ? ICONS.sun : ICONS.moon;
  const themeLabel = state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  if (state.view === "mission") {
    const d = state.data.districts[state.districtIdx];
    const ratio = (state.stepIdx + 1) / d.steps.length;
    renderPreserving(bar, `
      <div class="lesson-topbar-inner">
        <div class="lesson-topbar-left">
          <button id="btn-exit-lesson" class="icon-ghost" aria-label="Back to Course" title="Back to Course">${ICONS.close}</button>
          <span class="lesson-topbar-street">${esc(d.chapter)}</span>
        </div>
        <div class="progress-track" aria-label="Unit progress">
          <div class="progress-fill" style="--progress: ${ratio.toFixed(4)}"></div>
        </div>
        <div class="lesson-topbar-right">
          ${timerWidgetHtml()}
          <button id="btn-theme" class="icon-ghost" aria-label="${themeLabel}" title="${themeLabel}">${themeIcon}</button>
          <button id="btn-sound" class="icon-ghost" aria-label="Toggle sound" title="Toggle sound">${g.sound_enabled ? ICONS.volOn : ICONS.volOff}</button>
        </div>
      </div>`, ".progress-fill");
    document.getElementById("btn-exit-lesson").onclick = () => { if (state.inFlight) return; playSound("tap"); state.view = "map"; state.lastRenderedStepId = null; render(); };
    document.getElementById("btn-theme").onclick = toggleTheme;
    document.getElementById("btn-sound").onclick = toggleSound;
    bindTimerControls();
    return;
  }

  const profileLabel = state.sbProfile ? `@${state.sbProfile.username}` : "Account";

  renderPreserving(bar, `
    <div class="topbar-inner">
      <div class="topbar-left">
        <button id="btn-brand" class="wordmark">${mascotHtml("idle", 28)}<span>Delightful Learn</span></button>
        <nav class="nav-tabs">
          <button id="tab-map" aria-label="Course" class="nav-tab ${state.view === "map" ? "active" : ""}">${ICONS.book}<span>Course</span></button>
          <button id="tab-drill" aria-label="Recall Drill" class="nav-tab ${state.view === "drill" ? "active" : ""}">${ICONS.cards}<span>Recall Drill</span><span class="tab-count">${numberFormat.format(state.data.srs.due_count)}</span></button>
        </nav>
      </div>
      <div class="topbar-right">
        <button id="btn-courses" class="nav-tab">Courses</button>
        ${timerWidgetHtml()}
        <button id="btn-theme" class="icon-ghost" aria-label="${themeLabel}" title="${themeLabel}">${themeIcon}</button>
        <button id="btn-sound" class="icon-ghost" aria-label="Toggle sound" title="Toggle sound">${g.sound_enabled ? ICONS.volOn : ICONS.volOff}</button>
        <button id="btn-account" aria-label="Profile and Squad" class="avatar-btn" title="Profile, mascot color & friends">
          ${mascotHtml("idle", 22)}
          <span>${esc(profileLabel)}</span>
        </button>
      </div>
    </div>`);

  document.getElementById("btn-courses").onclick = showCourses;
  document.getElementById("btn-brand").onclick = () => { if (state.inFlight) return; playSound("tap"); state.view = "map"; render(); };
  document.getElementById("tab-map").onclick = () => { if (state.inFlight) return; playSound("tap"); state.view = "map"; render(); };
  document.getElementById("tab-drill").onclick = () => {
    playSound("tap");
    startDrillSession();
  };
  document.getElementById("btn-account").onclick = (event) => { playSound("tap"); openAccountModal(event.currentTarget); };
  document.getElementById("btn-theme").onclick = toggleTheme;
  document.getElementById("btn-sound").onclick = toggleSound;
  bindTimerControls();
}

async function toggleSound() {
  if (state.inFlight) return;
  primeAudio();
  const next = !state.data.gamification.sound_enabled;
  try {
    await api("/api/sound", { enabled: next });
  } catch (err) {
    toast(err.message);
    return;
  }
  state.data.gamification.sound_enabled = next;
  renderTopbar();
  if (next) playSound("correct");
}

// Clean Consumer Account & Squad Modal
function closeModal() {
  const dialog = document.querySelector("#modal-host dialog[open]");
  if (!dialog) return;
  dialog.close();
  setTimeout(() => dialog.remove(), 140);
  document.body.classList.remove("dialog-open");
  state.modalOpen = false;
  const trigger = state.modalTrigger;
  const target = trigger?.isConnected ? trigger : document.getElementById(trigger?.id || "create-course");
  target?.focus?.();
  state.modalTrigger = null;
}

function showDialog(title, content, trigger = document.activeElement) {
  const host = document.getElementById("modal-host");
  if (!state.modalOpen) state.modalTrigger = trigger;
  state.timer.popoverOpen = false;
  patchTimerPopover();
  host.innerHTML = `<dialog class="modal-card studio-dialog" aria-labelledby="dialog-title">
    <div class="modal-head">
      <h2 id="dialog-title">${esc(title)}</h2>
      <button id="btn-close-modal" class="icon-ghost" aria-label="Close">${ICONS.close}</button>
    </div>${content}
  </dialog>`;
  const dialog = host.querySelector("dialog");
  state.modalOpen = true;
  document.body.classList.add("dialog-open");
  dialog.showModal();
  dialog.querySelector("#btn-close-modal").focus();
  dialog.oncancel = (event) => { event.preventDefault(); closeModal(); };
  dialog.onclick = (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeModal();
  };
  dialog.querySelector("#btn-close-modal").onclick = closeModal;
  dialog.onkeydown = (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button, input, select, textarea, a[href]")].filter((el) => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
}

function openAccountModal(trigger) {
  const host = document.getElementById("modal-host");
  const hasSb = Boolean(state.sbClient);

  const swatches = MASCOT_PALETTES.map((p) => {
    const unlocked = isColorUnlocked(p.id);
    const active = state.mascotColor.toLowerCase() === p.body.toLowerCase();
    return `
    <button class="color-swatch ${active ? "active" : ""} ${unlocked ? "" : "locked"}"
            data-color="${p.body}" aria-pressed="${active}" ${unlocked ? "" : `disabled aria-disabled="true"`}
            title="${unlocked ? p.name : `${p.name} · unlocks at Lv.${colorUnlockLevel(p.id)}`}"
            aria-label="${unlocked ? p.name : `${p.name}, locked until Level ${colorUnlockLevel(p.id)}`}"
            style="background:${p.body}; box-shadow:0 3px 0 ${p.shade};">${unlocked ? "" : ICONS.lock}</button>`;
  }).join("");

  const accTiles = levelRewards().map((r) => {
    const unlocked = currentXp() >= r.threshold;
    const active = equippedAccessory() === r.accessory;
    return `
      <button class="acc-tile ${active ? "active" : ""} ${unlocked ? "" : "locked"}" data-acc="${esc(r.accessory)}"
              ${unlocked ? "" : `disabled aria-disabled="true"`} aria-pressed="${active}"
              title="${unlocked ? ACCESSORY_NAMES[r.accessory] : `Unlocks at Lv.${numberFormat.format(r.level)} (${numberFormat.format(r.threshold)} XP)`}">
        ${mascotHtml("idle", 34, null, false, "", r.accessory)}
        <span class="acc-tile-name">${esc(ACCESSORY_NAMES[r.accessory])}</span>
        <span class="acc-tile-lvl">${unlocked ? `Lv.${numberFormat.format(r.level)}` : `${ICONS.lock} Lv.${numberFormat.format(r.level)} · ${numberFormat.format(r.threshold)} XP`}</span>
      </button>`;
  }).join("");

  let authSection = "";
  if (!hasSb) {
    authSection = `
      <div class="modal-section">
        <span class="modal-label">Multiplayer Squad</span>
        <p style="font-size:14px; color:var(--ink-2); margin:0 0 14px; line-height:1.5;">
          Cloud login &amp; friends activate automatically once this server is linked to your Supabase project. In the meantime, you can preview how teammates appear on the path.
        </p>
        <button id="btn-toggle-demo" class="btn-tactile secondary full">
          ${state.demoSquadOn ? "Hide Demo Teammates" : "Preview Demo Teammates on Path"}
        </button>
      </div>`;
  } else if (!state.sbUser) {
    authSection = `<div id="account-auth" class="modal-section">${authFormHtml(false)}</div>`;
  } else {
    const friendsList = state.friends.length
      ? state.friends.map((f) => `
          <div class="squad-row">
            ${mascotHtml("idle", 26, f.mascot_color, false, "", f.mascot_accessory || "none")}
            <div class="squad-info">
              <div class="squad-name">${esc(f.display_name)} (@${esc(f.username)})</div>
              <div class="squad-meta">${esc(stepNameById(f.current_step_id))} · ${esc(f.streak_days)}d streak</div>
            </div>
            <span class="squad-xp">${numberFormat.format(f.xp)} XP</span>
          </div>`).join("")
      : `<p class="squad-empty">No friends added yet. Add a teammate by their @username below.</p>`;

    authSection = `
      <div class="modal-section">
        <span class="modal-label">Signed in as @${esc(state.sbProfile?.username || state.sbUser.email)}</span>
        <div class="form-row" style="margin-bottom:12px;">
          <input id="add-friend-input" class="text-field" placeholder="Teammate @username"/>
          <button id="btn-add-friend" class="btn-tactile go" style="flex-shrink:0;">Add</button>
        </div>
        <div class="squad-list">${friendsList}</div>
        <div id="modal-msg" class="modal-msg"></div>
        <div style="margin-top:14px;">
          <button id="btn-signout" class="btn-ghost flush">Sign out</button>
        </div>
      </div>`;
  }

  showDialog("Profile & Squad", `        <div style="display:flex; align-items:center; gap:16px;">
          <div id="profile-kubo-preview">${mascotHtml("happy", 58)}</div>
          <div>
            <span class="modal-label">Your Kubo Color</span>
            <div class="color-swatches">${swatches}</div>
          </div>
        </div>
        <div class="modal-section">
          <span class="modal-label">Kubo Accessories · Unlocked by Rank</span>
          <div class="acc-grid">${accTiles}</div>
        </div>
        ${authSection}`, trigger);

  const patchMascot = () => {
    host.querySelector("#profile-kubo-preview").innerHTML = mascotHtml("happy", 58);
    host.querySelectorAll("[data-acc], [data-color]").forEach((button) => {
      const active = button.dataset.acc ? button.dataset.acc === equippedAccessory() : button.dataset.color === state.mascotColor;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (state.view !== "courses") renderTopbar();
    if (state.view === "map") renderMap();
  };

  host.querySelectorAll(".acc-tile").forEach((b) => {
    b.onclick = async () => {
      if (b.disabled) return;
      playSound("tap");
      applyUserAccessory(b.dataset.acc);
      patchMascot();
      await syncProgressToSupabase();
    };
  });

  host.querySelectorAll(".color-swatch").forEach((b) => {
    b.onclick = async () => {
      if (b.disabled) return;
      playSound("tap");
      applyUserMascotColor(b.dataset.color);
      patchMascot();
      await syncProgressToSupabase();
    };
  });

  const msgEl = document.getElementById("modal-msg");
  const setMsg = (txt, err = false) => { if (msgEl) { msgEl.textContent = txt; msgEl.className = "modal-msg" + (err ? " err" : ""); } };

  const demoBtn = document.getElementById("btn-toggle-demo");
  if (demoBtn) {
    demoBtn.onclick = () => {
      playSound("tap");
      state.demoSquadOn = !state.demoSquadOn;
      localStorage.setItem("course_studio_demo_squad", state.demoSquadOn ? "1" : "0");
      renderMap();
      demoBtn.textContent = state.demoSquadOn ? "Hide Demo Teammates" : "Preview Demo Teammates on Path";
    };
  }

  const auth = host.querySelector("#account-auth");
  if (auth) bindAuth(auth, false, async () => {
    closeModal();
    await enterCloud();
  });

  const addFriendBtn = document.getElementById("btn-add-friend");
  if (addFriendBtn) {
    addFriendBtn.onclick = async () => {
      const uname = document.getElementById("add-friend-input").value.trim().toLowerCase().replace(/^@/, "");
      if (!/^[a-z0-9_]{2,24}$/.test(uname)) return setMsg("Enter a valid teammate username.", true);
      const { data: target } = await state.sbClient.from("profiles").select("id, username").eq("username", uname).maybeSingle();
      if (!target) return setMsg(`No user @${uname} found.`, true);
      if (target.id === state.sbUser.id) return setMsg("That's your own account.", true);
      const { error } = await state.sbClient.from("friendships").insert({ user_id: state.sbUser.id, friend_id: target.id });
      if (error) return setMsg(error.message, true);
      await loadCloudProfileAndFriends();
      playSound("correct");
      render();
      openAccountModal();
    };
  }

  const signOutBtn = document.getElementById("btn-signout");
  if (signOutBtn) {
    signOutBtn.onclick = () => guarded(signOutBtn, signOut);
  }
}

// VIEW 1: Centered Course Path
function stepPuckGlyph(kind, done, isCurrent) {
  if (done) return ICONS.check;
  if (isCurrent) return ICONS.star;
  if (kind === "code") return ICONS.code;
  if (kind === "viz" || kind === "live_lab") return ICONS.sliders;
  if (kind === "debrief") return ICONS.flag;
  return ICONS.bolt;
}

function nextUnlockHtml() {
  const n = nextUnlock();
  if (!n) {
    return `<button id="btn-rank-reward" class="next-unlock" style="border:none; width:100%; text-align:left; cursor:pointer; font:inherit;">
      ${mascotHtml("proud", 30)}<span><strong>Every Kubo reward unlocked.</strong> Pick your look in Profile.</span></button>`;
  }
  return `<button id="btn-rank-reward" class="next-unlock" style="border:none; width:100%; text-align:left; cursor:pointer; font:inherit;">
    ${mascotHtml("idle", 30, null, false, "", n.accessory)}
    <span><strong class="tabular">Next unlock at ${numberFormat.format(n.threshold)} XP</strong> ${esc(n.label)}</span></button>`;
}

function renderMap() {
  document.body.classList.remove("mode-mission");
  document.getElementById("lesson-footer-host").innerHTML = "";
  const root = document.getElementById("app-root");
  const g = state.data.gamification;
  const next = findNextStep();
  const totalSteps = state.data.districts.reduce((acc, d) => acc + d.steps.length, 0);
  const doneSteps = g.completed_events.filter((e) => e.startsWith("step-")).length;
  const totalCode = state.data.districts.reduce((acc, d) => acc + d.steps.filter((s) => s.kind === "code").length, 0);
  const squad = activeSquadList();

  const offsets = [0, 34, 0, -30, 0, 32, 0, -28, 0, 26];
  const kindLabels = {
    story_concept: "Concept",
    viz: "Interactive Lab",
    mcq: "Check",
    numeric: "Hand-Check",
    poe: "Predict",
    live_lab: "PyTorch Lab",
    code: "Code Exercise",
    debrief: "Unit Review",
  };

  const pathHtml = state.data.districts.map((d, di) => {
    const unitDone = d.steps.filter((s) => isStepDone(s.id)).length;
    const nodes = d.steps.map((s, si) => {
      const done = isStepDone(s.id);
      const isCurrent = di === next.di && si === next.si;
      const cls = isCurrent ? "current" : (done ? "done" : "upcoming");
      const offset = offsets[si % offsets.length];
      const hereFriends = squad.filter((f) => f.current_step_id === s.id);
      const friendPinsHtml = hereFriends.length
        ? `<div class="friend-pins">${hereFriends.map((f) =>
            `<span class="friend-pin" title="${esc(f.display_name)} · ${numberFormat.format(f.xp)} XP">${mascotHtml("idle", 18, f.mascot_color, false, "", f.mascot_accessory || "none")}<span>${esc(f.display_name)}</span></span>`
          ).join("")}</div>`
        : "";

      return `
        <div class="path-node-row ${isCurrent ? "is-current" : ""}">
          <div class="node-slot" style="--offset:${offset}px;">
            <div class="node-wrap">
              ${isCurrent ? `
                <svg class="node-active-ring" viewBox="0 0 128 106" fill="none" aria-hidden="true">
                  <ellipse cx="64" cy="56" rx="56" ry="42" stroke="var(--accent-border)" stroke-width="3"/>
                  <ellipse cx="64" cy="56" rx="48" ry="35" stroke="var(--accent-solid)" stroke-width="2" stroke-dasharray="6 5" opacity="0.55"/>
                </svg>
                <div class="node-start-pill">
                  <span class="start-bubble">${g.xp > 0 ? "Next" : "Start"}</span>
                </div>
` : ""}
              <button class="node-puck ${cls}" tabindex="-1" data-di="${di}" data-si="${si}" ${isCurrent ? 'aria-current="step"' : ""} aria-label="${esc(s.title)}">
                <span class="node-puck-base"></span>
                <span class="node-puck-face">${stepPuckGlyph(s.kind, done, isCurrent)}</span>
              </button>
            </div>
          </div>
          <div class="node-label-col">
            <button class="node-label ${cls === "upcoming" ? "muted" : ""}" ${isCurrent ? 'aria-current="step"' : ""} data-di="${di}" data-si="${si}">
              <span class="node-label-title">${mdToHtml(s.title, true)}</span>
              <span class="node-label-kind">${Object.hasOwn(kindLabels, s.kind) ? kindLabels[s.kind] : esc(s.kind)}</span>
            </button>
            ${friendPinsHtml}
          </div>
        </div>`;
    }).join("");

    return `
      <section class="district-section">
        <div class="unit-banner" style="--unit-bg:${bannerColor(d.color)}; --unit-lip:${bannerColor(d.color_lip || d.color)};">
          <div class="unit-banner-text">
            <div class="unit-kicker">Unit ${di + 1} · ${esc(d.subtitle)}</div>
            <div class="unit-title">${esc(d.chapter)}</div>
          </div>
          <span class="unit-progress-pill">${unitDone} / ${d.steps.length}</span>
        </div>
        <div class="nodes-track">${nodes}</div>
      </section>`;
  }).join("");

  const achHtml = ACHIEVEMENT_DEFS.map((a) => {
    const unlocked = state.achievements.includes(a.id);
    return `
      <div class="ach-row ${unlocked ? "unlocked" : ""}">
        <span class="ach-badge">${ICONS[a.icon] || ICONS.star}</span>
        <div class="ach-info">
          <div class="ach-name">${a.title}</div>
          <div class="ach-desc">${a.desc}</div>
        </div>
      </div>`;
  }).join("");

  const squadHtml = squad.length
    ? [...squad, {
        id: "me",
        display_name: state.sbProfile ? `${state.sbProfile.display_name} (You)` : "You",
        mascot_color: state.mascotColor,
        mascot_accessory: equippedAccessory(),
        xp: g.xp,
        streak_days: g.streak_days,
        current_step_id: next.s.id,
        isMe: true,
      }].sort((a, b) => b.xp - a.xp).map((m) => `
        <div class="squad-row ${m.isMe ? "is-me" : ""}">
          ${mascotHtml("idle", 26, m.mascot_color, false, "", m.mascot_accessory || "none")}
          <div class="squad-info">
            <div class="squad-name">${esc(m.display_name)}</div>
            <div class="squad-meta">${esc(stepNameById(m.current_step_id))}</div>
          </div>
          <span class="squad-xp">${numberFormat.format(m.xp)} XP</span>
        </div>`).join("")
    : `<p class="squad-empty">Add a teammate to see their progress.</p>
       <button id="btn-open-squad" class="btn-tactile secondary full" style="min-height:40px; font-size:13.5px;">${ICONS.users} Open Squad</button>`;

  renderPreserving(root, `
    <div class="path-layout">
      <aside class="path-sidebar">
        <div class="overview-card">
          <div class="overview-head">
              <h1>${esc(state.course?.title || "Local Studio")}</h1>
          </div>
          <p class="overview-tagline">${esc(state.course?.description ?? "Lessons, labs, and recall practice on this device.")}</p>
          <div class="overview-stats">
            <span class="stat-item">${ICONS.book} ${state.data.districts.length} Units</span>
            <span class="stat-item">${ICONS.code} ${totalCode} Labs</span>
            <span class="stat-item">${ICONS.cards} ${numberFormat.format(state.data.srs.total_cards)} Cards</span>
          </div>
        </div>

        <div class="next-card">
          <div class="next-card-kicker">Up next · ${esc(next.d.chapter)}</div>
          <p class="next-card-title">${mdToHtml(next.s.title, true)}</p>
          <button id="btn-sidebar-start" class="btn-tactile go full">
            ${g.xp > 0 ? "Continue" : "Start"}
          </button>
        </div>

        <div class="rank-card">
          <div class="rank-stats-row">
            <div class="rank-stat-box">
              <span style="color:var(--warn); display:inline-flex;">${ICONS.flame}</span>
              <div>
                <div class="rank-stat-val">${esc(g.streak_days)}d</div>
                <div class="rank-stat-lbl">Streak</div>
              </div>
            </div>
            <div class="rank-stat-box">
              <span style="color:var(--accent); display:inline-flex;">${ICONS.bolt}</span>
              <div>
                <div class="rank-stat-val">${numberFormat.format(g.xp)}</div>
                <div class="rank-stat-lbl">Total XP</div>
              </div>
            </div>
          </div>
          <div class="rank-header">
            <span class="rank-name">${esc(g.level)}</span>
            <span class="rank-xp">${numberFormat.format(g.xp)} / ${numberFormat.format(g.next_threshold)} XP</span>
          </div>
          <div class="xp-bar-track"><div class="xp-bar-fill" style="--progress: ${(g.pct / 100).toFixed(4)}"></div></div>
          <div class="rank-meta">
            <span class="tabular">${doneSteps} of ${totalSteps} steps</span>
            <span>${numberFormat.format(state.data.srs.unlocked_count)} cards unlocked</span>
          </div>
          ${nextUnlockHtml()}
        </div>
      </aside>

      <div class="path-column">${pathHtml}</div>

      <aside class="path-right-rail">
        <div class="squad-card">
          <div class="rail-head">
            <span>Squad</span>
            <button id="btn-manage-squad" class="rail-link">${state.sbUser ? "Add friend" : "Manage"}</button>
          </div>
          <div class="squad-list">${squadHtml}</div>
        </div>

        <div class="ach-card">
          <div class="rail-head">
            <span>Achievements</span>
            <span class="tabular">${state.achievements.length}/${ACHIEVEMENT_DEFS.length}</span>
          </div>
          <div class="ach-list">${achHtml}</div>
        </div>
      </aside>
    </div>`, ".rank-card .xp-bar-fill");

  renderMath(root);
  const openStep = (di, si) => {
    primeAudio();
    playSound("tap");
    state.districtIdx = di;
    state.stepIdx = si;
    state.navDir = "fade";
    state.lastRenderedStepId = null;
    state.view = "mission";
    render();
  };
  root.querySelectorAll("[data-di]").forEach((el) => {
    el.onclick = () => openStep(Number(el.dataset.di), Number(el.dataset.si));
  });
  document.getElementById("btn-sidebar-start").onclick = () => openStep(next.di, next.si);
  const rr = document.getElementById("btn-rank-reward");
  if (rr) rr.onclick = () => { playSound("tap"); openAccountModal(rr); };
  const ms = document.getElementById("btn-manage-squad");
  if (ms) ms.onclick = () => { playSound("tap"); openAccountModal(ms); };
  const os = document.getElementById("btn-open-squad");
  if (os) os.onclick = () => { playSound("tap"); openAccountModal(os); };
}

// Theme-Aware Interactive Visualizers
function setRangeFill(el) {
  const pct = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
  el.style.setProperty("--fill", `${pct.toFixed(1)}%`);
}

function mountVisualizer(vizType, container) {
  if (vizType === "gamma_horizon") {
    container.innerHTML = `
      <div class="viz-stage">
        <div class="viz-controls">
          <div class="range-group">
            <label for="s-gamma"><span>Discount factor γ</span><span id="v-gamma" class="range-val">0.950</span></label>
            <input class="slider-range" type="range" id="s-gamma" min="0.50" max="0.995" step="0.005" value="0.95" />
          </div>
          <div class="range-group">
            <label for="s-win"><span>Sparse +1 Win Step</span><span id="v-win" class="range-val">40</span></label>
            <input class="slider-range" type="range" id="s-win" min="5" max="90" step="5" value="40" />
          </div>
        </div>
        <div class="viz-grid">
          <div class="viz-cell">
            <div class="viz-cell-header"><span class="viz-cell-name">Discount weight γᵏ</span><span id="t-hor" class="viz-pill">Horizon ≈ 20</span></div>
            <svg id="svg-decay" viewBox="0 0 340 192" width="100%"></svg>
          </div>
          <div class="viz-cell">
            <div class="viz-cell-header"><span class="viz-cell-name">Return Gₜ back to step 0</span><span id="t-g0" class="viz-pill">G₀ = 0.129</span></div>
            <svg id="svg-ret" viewBox="0 0 340 192" width="100%"></svg>
          </div>
        </div>
      </div>`;
    const draw = () => {
      const sg = container.querySelector("#s-gamma"), sw = container.querySelector("#s-win");
      setRangeFill(sg); setRangeFill(sw);
      const g = Number(sg.value), w = Number(sw.value);
      container.querySelector("#v-gamma").textContent = g.toFixed(3);
      container.querySelector("#v-win").textContent = w;
      const hor = (1 / Math.max(1 - g, 1e-4)).toFixed(0);
      const g0 = Math.pow(g, w);
      container.querySelector("#t-hor").textContent = `Horizon ≈ ${hor} steps`;
      container.querySelector("#t-g0").textContent = `G₀ = ${g0.toFixed(3)}`;

      const pts1 = [];
      for (let k = 0; k <= 95; k += 2) pts1.push(`${(32 + (k / 95) * 292).toFixed(1)},${(156 - Math.pow(g, k) * 132).toFixed(1)}`);
      const wx = 32 + (w / 95) * 292, wy = 156 - g0 * 132;
      container.querySelector("#svg-decay").innerHTML = `
        <line x1="32" y1="24" x2="324" y2="24" stroke="var(--line)"/>
        <line x1="32" y1="90" x2="324" y2="90" stroke="var(--line)"/>
        <line x1="32" y1="156" x2="324" y2="156" stroke="var(--line-strong)"/>
        <polygon points="32,156 ${pts1.join(" ")} 324,156" fill="var(--accent-tint)"/>
        <polyline points="${pts1.join(" ")}" fill="none" stroke="var(--accent-solid)" stroke-width="2.6"/>
        <line x1="${wx}" y1="24" x2="${wx}" y2="156" stroke="var(--go)" stroke-dasharray="4 3" stroke-width="1.6"/>
        <circle cx="${wx}" cy="${wy}" r="5.5" fill="var(--go)" stroke="var(--surface)" stroke-width="2"/>
        <text x="178" y="182" font-size="13" fill="var(--ink-2)" text-anchor="middle">Future steps k (0 → 95)</text>`;

      const pts2 = [];
      for (let t = 0; t <= w; t++) pts2.push(`${(32 + (t / Math.max(w, 1)) * 292).toFixed(1)},${(156 - Math.pow(g, w - t) * 132).toFixed(1)}`);
      container.querySelector("#svg-ret").innerHTML = `
        <line x1="32" y1="24" x2="324" y2="24" stroke="var(--line)"/>
        <line x1="32" y1="90" x2="324" y2="90" stroke="var(--line)"/>
        <line x1="32" y1="156" x2="324" y2="156" stroke="var(--line-strong)"/>
        <polygon points="32,156 ${pts2.join(" ")} 324,156" fill="var(--go-tint)"/>
        <polyline points="${pts2.join(" ")}" fill="none" stroke="var(--go)" stroke-width="2.6"/>
        <circle cx="32" cy="${(156 - g0 * 132).toFixed(1)}" r="5.5" fill="var(--accent-solid)" stroke="var(--surface)" stroke-width="2"/>
        <text x="178" y="182" font-size="13" fill="var(--ink-2)" text-anchor="middle">Decision step t (0 → ${w})</text>`;
    };
    container.querySelectorAll("input").forEach((el) => (el.oninput = draw));
    draw();
  }

  if (vizType === "action_masking") {
    const names = ["ROLL", "BUY", "BUILD", "END"];
    const initL = [1.2, 2.5, -0.3, 0.8];
    const initM = [true, false, true, true];
    container.innerHTML = `
      <div class="viz-stage">
        <div class="viz-controls">
          ${names.map((n, i) => `
            <div class="range-group">
              <label for="m-log-${i}">
                <span><input type="checkbox" id="m-leg-${i}" ${initM[i] ? "checked" : ""}/> ${n}</span>
                <span id="m-val-${i}" class="range-val">${initL[i].toFixed(1)}</span>
              </label>
              <input class="slider-range" type="range" id="m-log-${i}" min="-3" max="4" step="0.1" value="${initL[i]}"/>
            </div>`).join("")}
        </div>
        <div class="viz-grid">
          <div class="viz-cell">
            <div class="viz-cell-header"><span class="viz-cell-name">Unmasked vs. masked (−∞)</span><span class="viz-pill">Exact 0 illegal</span></div>
            <svg id="svg-mask-p" viewBox="0 0 340 192" width="100%"></svg>
          </div>
          <div class="viz-cell">
            <div class="viz-cell-header"><span class="viz-cell-name">Policy entropy</span><span id="t-ent" class="viz-pill">H = 0.000 nats</span></div>
            <svg id="svg-mask-h" viewBox="0 0 340 192" width="100%"></svg>
          </div>
        </div>
      </div>`;
    const sm = (a) => { const m = Math.max(...a), e = a.map((v) => Math.exp(v - m)), s = e.reduce((x, y) => x + y, 0); return e.map((v) => v / s); };
    const ent = (ps) => -ps.reduce((a, p) => (p > 1e-12 ? a + p * Math.log(p) : a), 0);
    const draw = () => {
      const logits = names.map((_, i) => { const el = container.querySelector(`#m-log-${i}`); setRangeFill(el); return Number(el.value); });
      const legal = names.map((_, i) => container.querySelector(`#m-leg-${i}`).checked);
      logits.forEach((v, i) => (container.querySelector(`#m-val-${i}`).textContent = v.toFixed(1)));
      if (!legal.some(Boolean)) { legal[0] = true; container.querySelector("#m-leg-0").checked = true; }
      const rawP = sm(logits);
      const mP = sm(logits.map((v, i) => (legal[i] ? v : -1e9))).map((p, i) => (legal[i] ? p : 0));
      const hRaw = ent(rawP), hMask = ent(mP), k = legal.filter(Boolean).length, hMax = Math.log(Math.max(k, 1));
      container.querySelector("#t-ent").textContent = `H = ${hMask.toFixed(3)} nats`;

      let bars = `<line x1="20" y1="154" x2="326" y2="154" stroke="var(--line-strong)"/>`;
      names.forEach((n, i) => {
        const bx = 34 + i * 74, h1 = rawP[i] * 120, h2 = mP[i] * 120;
        bars += `<rect x="${bx}" y="${154 - h1}" width="22" height="${h1}" rx="4" fill="var(--line)"/>`;
        bars += `<rect x="${bx + 24}" y="${154 - h2}" width="22" height="${h2}" rx="4" fill="${legal[i] ? "var(--go)" : "var(--danger)"}"/>`;
        bars += `<text x="${bx + 35}" y="${147 - h2}" font-size="12.5" font-weight="700" fill="var(--ink)" text-anchor="middle">${mP[i].toFixed(2)}</text>`;
        bars += `<text x="${bx + 23}" y="178" font-size="12.5" font-weight="700" fill="${legal[i] ? "var(--ink)" : "var(--danger)"}" text-anchor="middle">${n}</text>`;
      });
      container.querySelector("#svg-mask-p").innerHTML = bars;

      const maxH = Math.max(hRaw, hMax, 1.45);
      const items = [["Unmasked", hRaw, "var(--line-strong)"], ["Masked", hMask, "var(--accent-solid)"], [`Max ln(${k})`, hMax, "var(--go)"]];
      let hb = `<line x1="20" y1="154" x2="326" y2="154" stroke="var(--line-strong)"/>`;
      items.forEach(([lbl, val, col], i) => {
        const bx = 40 + i * 96, bh = (val / maxH) * 116;
        hb += `<rect x="${bx}" y="${154 - bh}" width="56" height="${bh}" rx="6" fill="${col}"/>`;
        hb += `<text x="${bx + 28}" y="${146 - bh}" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="middle">${val.toFixed(3)}</text>`;
        hb += `<text x="${bx + 28}" y="178" font-size="12.5" font-weight="700" fill="var(--ink-2)" text-anchor="middle">${lbl}</text>`;
      });
      container.querySelector("#svg-mask-h").innerHTML = hb;
    };
    container.querySelectorAll("input").forEach((el) => (el.oninput = draw));
    draw();
  }

  if (vizType === "gae_weights") {
    const deltas = [0.1, -0.2, 0.3, 0.9, -0.5, 0.4, 0.6, -0.3];
    container.innerHTML = `
      <div class="viz-stage">
        <div class="viz-controls">
          <div class="range-group"><label for="sg-g"><span>γ (discount)</span><span id="g-g" class="range-val">0.95</span></label><input class="slider-range" type="range" id="sg-g" min="0.50" max="0.99" step="0.01" value="0.95"/></div>
          <div class="range-group"><label for="sg-l"><span>λ (TD=0 ↔ MC=1)</span><span id="g-l" class="range-val">0.90</span></label><input class="slider-range" type="range" id="sg-l" min="0.00" max="1.00" step="0.05" value="0.90"/></div>
          <div class="range-group"><label for="sg-r"><span>Episode reset at t =</span><span id="g-r" class="range-val">4</span></label><input class="slider-range" type="range" id="sg-r" min="0" max="7" step="1" value="4"/></div>
        </div>
        <div class="viz-grid">
          <div class="viz-cell">
            <div class="viz-cell-header"><span class="viz-cell-name">GAE weights (γλ)^lag</span><span class="viz-pill clipped">Reset blocks leak</span></div>
            <svg id="svg-gae-w" viewBox="0 0 340 192" width="100%"></svg>
          </div>
          <div class="viz-cell">
            <div class="viz-cell-header"><span class="viz-cell-name">Contribution to A₀</span><span id="t-gae-sum" class="viz-pill">A₀ = +0.000</span></div>
            <svg id="svg-gae-c" viewBox="0 0 340 192" width="100%"></svg>
          </div>
        </div>
      </div>`;
    const draw = () => {
      const sg = container.querySelector("#sg-g"), sl = container.querySelector("#sg-l"), sr = container.querySelector("#sg-r");
      setRangeFill(sg); setRangeFill(sl); setRangeFill(sr);
      const g = Number(sg.value), l = Number(sl.value), rIdx = Number(sr.value);
      container.querySelector("#g-g").textContent = g.toFixed(2);
      container.querySelector("#g-l").textContent = l.toFixed(2);
      container.querySelector("#g-r").textContent = rIdx;
      let wS = `<line x1="20" y1="154" x2="326" y2="154" stroke="var(--line-strong)"/>`;
      let cS = `<line x1="20" y1="92" x2="326" y2="92" stroke="var(--line-strong)"/>`;
      let sum = 0;
      const wallX = 28 + (rIdx + 0.85) * 37;
      deltas.forEach((d, lag) => {
        const bx = 28 + lag * 37, rw = Math.pow(g * l, lag), ew = lag <= rIdx ? rw : 0, contrib = ew * d;
        sum += contrib;
        const h = rw * 124;
        wS += `<rect x="${bx}" y="${154 - h}" width="24" height="${h}" rx="4" fill="${lag <= rIdx ? "var(--accent-solid)" : "var(--danger-tint)"}" stroke="${lag <= rIdx ? "none" : "var(--danger)"}" stroke-dasharray="${lag <= rIdx ? "" : "3 2"}"/>`;
        wS += `<text x="${bx + 12}" y="178" font-size="12.5" fill="var(--ink-2)" text-anchor="middle">${lag}</text>`;
        const dh = Math.abs(d) * 66, dy = d >= 0 ? 92 - dh : 92;
        cS += `<rect x="${bx}" y="${dy}" width="24" height="${dh}" rx="4" fill="var(--line)"/>`;
        const ch = Math.abs(contrib) * 66, cy = contrib >= 0 ? 92 - ch : 92;
        cS += `<rect x="${bx + 4}" y="${cy}" width="16" height="${ch}" rx="3" fill="${contrib >= 0 ? "var(--go)" : "var(--danger)"}"/>`;
        cS += `<text x="${bx + 12}" y="178" font-size="12.5" fill="var(--ink-2)" text-anchor="middle">${lag}</text>`;
      });
      if (rIdx < 7) {
        wS += `<line x1="${wallX}" y1="16" x2="${wallX}" y2="158" stroke="var(--danger)" stroke-width="2" stroke-dasharray="4 3"/>`;
        cS += `<line x1="${wallX}" y1="16" x2="${wallX}" y2="158" stroke="var(--danger)" stroke-width="2" stroke-dasharray="4 3"/>`;
      }
      container.querySelector("#svg-gae-w").innerHTML = wS;
      container.querySelector("#svg-gae-c").innerHTML = cS;
      container.querySelector("#t-gae-sum").textContent = `A₀ = ${sum >= 0 ? "+" : ""}${sum.toFixed(3)}`;
    };
    container.querySelectorAll("input").forEach((el) => (el.oninput = draw));
    draw();
  }

  if (vizType === "ppo_clip") {
    container.innerHTML = `
      <div class="viz-stage">
        <div class="viz-controls">
          <div class="range-group"><label for="sp-eps"><span>Clip ε</span><span id="p-eps" class="range-val">0.20</span></label><input class="slider-range" type="range" id="sp-eps" min="0.05" max="0.45" step="0.05" value="0.20"/></div>
          <div class="range-group"><label for="sp-r"><span>Test ratio r(θ)</span><span id="p-r" class="range-val">1.30</span></label><input class="slider-range" type="range" id="sp-r" min="0.40" max="1.60" step="0.05" value="1.30"/></div>
        </div>
        <div class="viz-grid">
          <div class="viz-cell">
            <div class="viz-cell-header"><span class="viz-cell-name">Advantage A = +1</span><span id="b-pos" class="viz-pill">L = 1.20</span></div>
            <svg id="svg-ppo-pos" viewBox="0 0 340 202" width="100%"></svg>
          </div>
          <div class="viz-cell">
            <div class="viz-cell-header"><span class="viz-cell-name">Advantage A = −1</span><span id="b-neg" class="viz-pill">L = −1.30</span></div>
            <svg id="svg-ppo-neg" viewBox="0 0 340 202" width="100%"></svg>
          </div>
        </div>
        <div class="viz-legend">
          <span class="viz-legend-item"><svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="var(--accent-solid)" stroke-width="2.8"/></svg>Clipped surrogate</span>
          <span class="viz-legend-item"><svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="var(--ink-3)" stroke-width="1.8" stroke-dasharray="4 3"/></svg>Unclipped r·A</span>
          <span class="viz-legend-item"><svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill="var(--go)"/></svg>Current r(θ)</span>
        </div>
      </div>`;
    const drawOne = (svgId, badgeId, A, eps, rMark) => {
      const toX = (r) => 28 + ((r - 0.3) / 1.4) * 284;
      const toY = (v) => (A > 0 ? 166 - ((v - 0.2) / 1.6) * 142 : 24 + ((-v - 0.2) / 1.6) * 142);
      const clip = (r) => Math.max(1 - eps, Math.min(1 + eps, r));
      const surr = (r) => Math.min(r * A, clip(r) * A);
      const pRaw = [], pSur = [];
      for (let i = 0; i <= 140; i++) {
        const r = 0.3 + (i / 140) * 1.4;
        pRaw.push(`${toX(r).toFixed(1)},${toY(r * A).toFixed(1)}`);
        pSur.push(`${toX(r).toFixed(1)},${toY(surr(r)).toFixed(1)}`);
      }
      const xL = toX(1 - eps), xR = toX(1 + eps), x1 = toX(1.0);
      const yM = surr(rMark);
      const flat = (A > 0 && rMark > 1 + eps) || (A < 0 && rMark < 1 - eps);
      const b = container.querySelector(`#${badgeId}`);
      b.className = "viz-pill" + (flat ? " clipped" : "");
      b.textContent = `L = ${yM.toFixed(2)} · ${flat ? "grad = 0" : "active"}`;

      const lblOffset = eps <= 0.12 ? 14 : 0;
      container.querySelector(`#${svgId}`).innerHTML = `
        <rect x="${xL}" y="18" width="${xR - xL}" height="148" fill="var(--accent-tint)"/>
        <line x1="28" y1="166" x2="312" y2="166" stroke="var(--line-strong)"/>
        <line x1="${x1}" y1="18" x2="${x1}" y2="166" stroke="var(--line-strong)" stroke-dasharray="3 3"/>
        <polyline points="${pRaw.join(" ")}" fill="none" stroke="var(--ink-3)" stroke-width="1.8" stroke-dasharray="4 4"/>
        <polyline points="${pSur.join(" ")}" fill="none" stroke="${A > 0 ? "var(--accent-solid)" : "var(--danger)"}" stroke-width="2.8"/>
        <circle cx="${toX(rMark)}" cy="${toY(yM)}" r="6" fill="var(--go)" stroke="var(--surface)" stroke-width="2.2"/>
        <text x="${xL - lblOffset}" y="190" font-size="14" font-weight="700" fill="var(--ink-2)" text-anchor="middle">1−ε</text>
        <text x="${x1}" y="190" font-size="14" font-weight="700" fill="var(--ink)" text-anchor="middle">1.0</text>
        <text x="${xR + lblOffset}" y="190" font-size="14" font-weight="700" fill="var(--ink-2)" text-anchor="middle">1+ε</text>`;
    };
    const draw = () => {
      const se = container.querySelector("#sp-eps"), sr = container.querySelector("#sp-r");
      setRangeFill(se); setRangeFill(sr);
      const eps = Number(se.value), r = Number(sr.value);
      container.querySelector("#p-eps").textContent = eps.toFixed(2);
      container.querySelector("#p-r").textContent = r.toFixed(2);
      drawOne("svg-ppo-pos", "b-pos", +1, eps, r);
      drawOne("svg-ppo-neg", "b-neg", -1, eps, r);
    };
    container.querySelectorAll("input").forEach((el) => (el.oninput = draw));
    draw();
  }
}

// Live PyTorch Backend Labs
function sparklineHtml(seriesList, title) {
  const all = seriesList.flatMap((s) => s.data);
  const mn = Math.min(...all, 0), mx = Math.max(...all, 0.01), span = Math.max(mx - mn, 1e-4);
  const lines = seriesList.map((s) => {
    const pts = s.data.map((v, i) => `${(14 + (i / Math.max(s.data.length - 1, 1)) * 272).toFixed(1)},${(110 - ((v - mn) / span) * 90).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.3" stroke-dasharray="${s.dash || ""}"/>`;
  }).join("");
  const leg = seriesList.map((s) => `<span style="color:${s.color}; font-weight:700; margin-right:10px;">● ${esc(s.label)}</span>`).join("");
  return `<div class="viz-cell"><div class="viz-cell-header"><span class="viz-cell-name">${title}</span></div>
    <svg viewBox="0 0 300 128" width="100%">
      <line x1="14" y1="110" x2="286" y2="110" stroke="var(--line-strong)"/>
      ${lines}
      <text x="14" y="16" font-size="11.5" fill="var(--ink-2)">${mx.toFixed(2)}</text>
      <text x="14" y="125" font-size="11.5" fill="var(--ink-2)">${mn.toFixed(2)}</text>
    </svg><div style="font-size:12px;">${leg}</div></div>`;
}

function renderLabResult(data, outEl) {
  if (data.lab_type === "gridworld") {
    const arrows = ["↑", "→", "↓", "←"];
    const bg = (v) => (v >= 0.7 ? "#16A34A" : v >= 0.25 ? "#86EFAC" : v >= -0.1 ? "var(--stage)" : v >= -0.6 ? "#FDA4AF" : "#E11D48");
    const grids = ["10", "50", "400"].map((ep) => {
      const snap = data.snapshots[ep];
      const cells = snap.V.map((v, i) => {
        const lbl = i === 15 ? "GOAL" : (i === 5 || i === 11 ? "TRAP" : arrows[snap.arrows[i]]);
        const fg = Math.abs(v) > 0.6 ? "#ffffff" : (v >= -0.1 && v < 0.25 ? "var(--ink)" : "#18181B");
        return `<div class="gw-tile" style="background:${bg(v)}; color:${fg};"><span>${lbl}</span><small>${v.toFixed(2)}</small></div>`;
      }).join("");
      return `<div class="viz-cell"><div class="viz-cell-header"><span class="viz-cell-name">Episode ${ep}</span></div><div class="gw-grid">${cells}</div></div>`;
    }).join("");
    outEl.innerHTML = `<div class="gw-row">${grids}</div><div style="margin-top:14px;">${sparklineHtml([
      { label: "Monte Carlo RMSE", data: data.err_mc, color: "var(--warn)" },
      { label: "TD(0) RMSE", data: data.err_td, color: "var(--accent-solid)" },
    ], "Random walk RMSE: MC vs. TD(0)")}</div>`;
  }
  if (data.lab_type === "probes_4_5") {
    outEl.innerHTML = `<div class="viz-grid">
      ${sparklineHtml([{ label: "Probe 4", data: data.probe4, color: "var(--accent-solid)" }, { label: "Probe 5", data: data.probe5, color: "var(--go)" }], "REINFORCE + baseline (optimal = +1.0)")}
      <div class="viz-cell"><div class="viz-cell-header"><span class="viz-cell-name">Probe 5 policy by state</span></div>
        <p style="font-size:14px; margin:12px 0;"><code>obs = -1</code> → <strong>P(a₀) = ${esc(data.p_neg[0])}</strong>, P(a₁) = ${esc(data.p_neg[1])}</p>
        <p style="font-size:14px; margin:12px 0;"><code>obs = +1</code> → P(a₀) = ${esc(data.p_pos[0])}, <strong>P(a₁) = ${esc(data.p_pos[1])}</strong></p>
      </div></div>`;
  }
  if (data.lab_type === "ppo_epoch_drift") {
    const block = (title, epochs, col) => {
      const mx = Math.max(...epochs.flatMap((e) => e.counts), 1);
      const cols = epochs.map((ep, idx) => {
        const bars = ep.counts.map((c, bi) => { const h = (c / mx) * 68; return `<rect x="${4 + bi * 9}" y="${76 - h}" width="7" height="${h}" rx="2" fill="${col}"/>`; }).join("");
        return `<div class="viz-cell"><div class="viz-cell-header"><span class="viz-cell-name">Epoch ${idx + 1}</span><span class="viz-pill ${ep.clipfrac > 0.25 ? "clipped" : ""}">clip ${esc(ep.clipfrac)}</span></div><svg viewBox="0 0 152 82" width="100%">${bars}<line x1="76" y1="0" x2="76" y2="78" stroke="var(--ink)" stroke-dasharray="3 2"/></svg></div>`;
      }).join("");
      return `<p style="font-size:13.5px; font-weight:700; margin:14px 0 8px;">${title}</p><div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">${cols}</div>`;
    };
    outEl.innerHTML = block("Unclipped policy gradient (ratios drift off-policy)", data.runs.unclipped, "var(--danger)") +
                      block(`PPO clipped (ε = ${esc(data.eps)}, anchored near r = 1)`, data.runs.clipped, "var(--accent-solid)");
  }
  if (data.lab_type === "ppo_bug_lab") {
    const keys = [
      ["mean_return", "Episode return (truth)"],
      ["approx_kl", "Approx KL"],
      ["clip_fraction", "Clip fraction"],
      ["entropy", "Policy entropy"],
      ["value_loss", "Value loss"],
      ["explained_variance", "Explained variance"],
    ];
    outEl.innerHTML = `<div class="diag-grid">${keys.map(([k, t]) =>
      sparklineHtml([{ label: "Healthy", data: data.healthy[k], color: "var(--go)" }, { label: data.bug, data: data.broken[k], color: "var(--danger)", dash: "5 3" }], t)
    ).join("")}</div>`;
  }
  if (data.lab_type === "rent_race") {
    const rows = Object.entries(data.evals).map(([name, ev]) =>
      `<tr><td><strong>${esc(name)}</strong></td><td><strong>${(ev.mean * 100).toFixed(1)}% ± ${(ev.ci * 100).toFixed(1)}%</strong></td><td>${(ev.seat0 * 100).toFixed(1)}%</td><td>${(ev.seat1 * 100).toFixed(1)}%</td></tr>`
    ).join("");
    outEl.innerHTML = `
      <div class="viz-grid">
        ${sparklineHtml([
          { label: "sparse", data: data.curves.sparse.shaped_return, color: "var(--accent-solid)" },
          { label: "naive_hoard", data: data.curves.naive_hoard.shaped_return, color: "var(--danger)" },
          { label: "potential_nw", data: data.curves.potential_nw.shaped_return, color: "var(--go)" },
        ], "Shaped training return")}
        ${sparklineHtml([
          { label: "sparse", data: data.curves.sparse.win_rate, color: "var(--accent-solid)" },
          { label: "naive_hoard", data: data.curves.naive_hoard.win_rate, color: "var(--danger)" },
          { label: "potential_nw", data: data.curves.potential_nw.win_rate, color: "var(--go)" },
        ], "True win rate vs. random")}
      </div>
      <div class="viz-cell" style="margin-top:14px;">
        <div class="viz-cell-header"><span class="viz-cell-name">Held-out tournament (160 games, swapped seats)</span></div>
        <table class="eval-table">
          <thead><tr><th>Matchup</th><th>Win rate (95% CI)</th><th>Seat 0</th><th>Seat 1</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
}

// Wraps each plain-text word in a .word-fade span (math rendered by KaTeX is wrapped as one unit,
// never split). Returns the number of animated units.
function wrapWordsForFade(rootEl) {
  let wi = 0;
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.matches("code, .katex, .katex-display")) {
          const wrap = document.createElement("span");
          wrap.className = "word-fade";
          wrap.style.setProperty("--wi", String(wi++));
          child.replaceWith(wrap);
          wrap.appendChild(child);
        } else {
          walk(child);
        }
      } else if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()) {
        const frag = document.createDocumentFragment();
        child.nodeValue.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const span = document.createElement("span");
          span.className = "word-fade";
          span.style.setProperty("--wi", String(wi++));
          span.textContent = part;
          frag.appendChild(span);
        });
        child.replaceWith(frag);
      }
    });
  };
  walk(rootEl);
  return wi;
}

function animateKuboSpeech(rawMd, bubbleEl, kuboEl) {
  if (!bubbleEl) return;
  if (state.speechTimer) { clearTimeout(state.speechTimer); state.speechTimer = null; }
  if (kuboEl) kuboEl.classList.remove("speaking");

  // Render the FULL line immediately so wrapping never shifts while it animates.
  bubbleEl.innerHTML = mdToHtml(rawMd, true);
  renderMath(bubbleEl);

  const hasMath = /\$|\\\(|\\\[/.test(rawMd);
  if (prefersReducedMotion() || (hasMath && !window.renderMathInElement)) return;

  const units = wrapWordsForFade(bubbleEl);
  const finish = () => {
    if (state.speechTimer) { clearTimeout(state.speechTimer); state.speechTimer = null; }
    bubbleEl.querySelectorAll(".word-fade").forEach((w) => { w.style.animation = "none"; w.style.opacity = "1"; w.style.transform = "none"; });
    if (kuboEl) kuboEl.classList.remove("speaking");
  };
  bubbleEl.onclick = finish;

  // Mouth moves only during the short stagger wave, then closes back to his warm smile.
  const waveMs = Math.min(900, Math.max(600, units * 22 + 220));
  if (kuboEl) kuboEl.classList.add("speaking");
  state.speechTimer = setTimeout(() => {
    state.speechTimer = null;
    if (kuboEl) kuboEl.classList.remove("speaking");
  }, waveMs);
}

// Shared Honest 4-Button Flashcard Renderer
function ratingButtonsHtml(card, withPrompt = true) {
  const p = card.interval_previews || { "0": "<10m", "3": "1d", "4": "1d", "5": "4d" };
  const items = [
    ["0", "Again", p["0"]],
    ["3", "Hard", p["3"]],
    ["4", "Good", p["4"]],
    ["5", "Easy", p["5"]],
  ];
  const seen = new Set();
  const previews = items.map(([q, label, interval]) => {
    const show = !seen.has(interval) || q === "0";
    if (q !== "0") seen.add(interval);
    return [q, label, show ? interval : ""];
  });
  return `
    ${withPrompt ? `<p class="rate-prompt">How well did you recall this?</p>` : ""}
    <div class="rate-grid" role="group" aria-label="How well did you recall this?">
      ${previews.map(([q, lbl, iv]) => `
        <button class="rate-btn" data-q="${q}">
          <span class="rate-btn-label">${lbl}</span>
          <span class="rate-btn-int">${esc(iv)}</span>
        </button>`).join("")}
    </div>`;
}

// VIEW 2: Distraction-Free Lesson Player
function renderHints(stepId, hints) {
  const n = state.hintState[stepId] || 0;
  const shown = hints.slice(0, n).map(([lbl, txt], i) =>
    `<div class="hint-item"><strong>Hint ${i + 1}</strong> ${txt.includes("\n") ? `<pre>${esc(txt)}</pre>` : mdToHtml(txt, true)}</div>`
  ).join("");
  const btn = n < hints.length
    ? `<button id="btn-next-hint" class="btn-ghost flush">${ICONS.hint} Hint ${n + 1} of ${hints.length}</button>`
    : "";
  return `<div class="hint-block">${btn}${shown}</div>`;
}

function renderUnitSprintHtml(districtId) {
  const pack = (state.data.srs.unit_packs && state.data.srs.unit_packs[districtId]) || [];
  if (!pack.length) return "";
  if (!state.unitSprint[districtId]) {
    state.unitSprint[districtId] = { idx: 0, revealed: false, done: false };
  }
  const sp = state.unitSprint[districtId];
  if (sp.done || sp.idx >= pack.length) {
    return `
      <div class="unit-sprint-box">
        <div style="display:flex; align-items:center; gap:12px;">
          ${mascotHtml("proud", 44)}
          <div>
            <div class="unit-sprint-title">Unit Recall Sprint complete</div>
            <div style="font-size:13.5px; color:var(--ink-2);">All ${pack.length} cards scheduled${state.data.anki_connected ? " and synced to Anki" : ""}.</div>
          </div>
        </div>
      </div>`;
  }
  const c = pack[sp.idx];
  const isInterleaved = c.module !== districtId;
  return `
    <div class="unit-sprint-box" id="unit-sprint-box">
      <div class="unit-sprint-head">
        <span class="unit-sprint-title">Quick Recall Sprint ${isInterleaved ? "· Mixed Review" : ""}</span>
        <span class="card-counter">Card ${sp.idx + 1} of ${pack.length}</span>
      </div>
      <div class="flashcard" style="box-shadow:none; padding:22px 24px;">
        <div class="flashcard-top" style="margin-bottom:14px;">
          <span class="street-tag"><span class="street-dot" style="background:${colorHex(c.unit_color)};"></span>${esc(c.chapter || c.street)}</span>
        </div>
        <div class="flashcard-front" style="font-size:18.5px; margin-bottom:18px;">${cardHtml(c.front)}</div>
        ${sp.revealed
          ? `<div class="flashcard-back" style="margin-bottom:18px;">${cardHtml(c.back)}</div>${ratingButtonsHtml(c)}`
          : `<button id="btn-unit-sprint-reveal" class="btn-tactile secondary full">Show Answer</button>`}
      </div>
    </div>`;
}

function bindUnitSprint(districtId) {
  const box = document.getElementById("unit-sprint-box");
  if (!box) return;
  const pack = (state.data.srs.unit_packs && state.data.srs.unit_packs[districtId]) || [];
  const sp = state.unitSprint[districtId];
  const rev = document.getElementById("btn-unit-sprint-reveal");
  if (rev) {
    rev.onclick = () => guarded(rev, () => {
      primeAudio();
      playSound("tap");
      sp.revealed = true;
      const host = document.getElementById("unit-sprint-host");
      if (host) { host.innerHTML = renderUnitSprintHtml(districtId); renderMath(host); bindUnitSprint(districtId); }
    });
  }
  box.querySelectorAll(".rate-btn").forEach((b) => {
    b.onclick = (event) => guarded(b, async () => {
      if (event.detail > 1 || performance.now() < state.ratingCooldown) return;
      state.ratingCooldown = performance.now() + 320;
      primeAudio();
      const q = Number(b.dataset.q);
      const card = pack[sp.idx];
      const res = await api("/api/srs/rate", { card_id: card.card_id, quality: q });
      state.data = res.state;
      if (q >= 4) handleXp(res.xp, b, "correct");
      else playSound(q === 0 ? "wrong" : "tap");
      sp.idx += 1;
      sp.revealed = false;
      if (sp.idx >= pack.length) sp.done = true;
      const host = document.getElementById("unit-sprint-host");
      if (host) { host.innerHTML = renderUnitSprintHtml(districtId); renderMath(host); bindUnitSprint(districtId); }
      renderTopbar();
      syncProgressToSupabase();
    });
  });
}

function renderMissionFooter() {
  const footerHost = document.getElementById("lesson-footer-host");
  const d = state.data.districts[state.districtIdx];
  const s = d.steps[state.stepIdx];
  const fb = state.stepFeedback[s.id];
  const isLast = state.stepIdx === d.steps.length - 1;

  let drawerHtml = "";
  if (fb) {
    const isGood = Boolean(fb.correct || fb.passed);
    const cls = isGood ? (s.kind === "poe" ? "info" : "ok") : "err";
    const headline = s.kind === "poe" ? "Takeaway:" : (isGood ? "Correct:" : "Not quite:");
    const mood = isGood ? (state.combo >= 3 ? "proud" : "happy") : "oops";
    let text = s.kind === "poe" ? (fb.reveal_md || fb.explanation) : (fb.win_title || fb.explanation || "Check the test output above.");
    if (headline === "Correct:" && typeof text === "string") text = text.replace(/^Correct\.\s*/i, "");
    drawerHtml = `<div class="feedback-drawer ${cls}" role="status"><div class="feedback-inner">${mascotHtml(mood, 40)}<div class="feedback-copy"><strong>${headline}</strong><span>${mdToHtml(text, true)}</span></div></div></div>`;
  }

  const needsCheck = (s.kind === "mcq" || s.kind === "numeric" || s.kind === "poe") && !(fb && fb.correct);
  const checkDisabled = s.kind === "mcq" && state.selectedMcq[s.id] === undefined;
  const primaryLabel = needsCheck ? (s.kind === "poe" ? "Lock Prediction" : "Check") : (isLast ? "Finish Unit" : "Continue");
  const footerBtnVariant = (s.kind === "code" && !fb?.passed) ||
    (s.kind === "live_lab" && !state.labCache[s.id]) ? "secondary" : "go";

  footerHost.innerHTML = `
    <div class="lesson-footer-bar">
      ${drawerHtml}
      <div class="footer-actions">
        <button id="btn-prev" class="btn-ghost flush" ${state.stepIdx === 0 ? "disabled" : ""}>← Previous</button>
        <button id="btn-primary-footer" class="btn-tactile ${footerBtnVariant}" ${checkDisabled ? "disabled" : ""}>${primaryLabel}</button>
      </div>
    </div>`;

  renderMath(footerHost);

  document.getElementById("btn-prev").onclick = () => {
    if (!state.inFlight && state.stepIdx > 0) {
      primeAudio();
      playSound("tap");
      state.navDir = "prev";
      state.stepIdx--;
      renderTopbar();
      renderMission();
      document.getElementById("app-root").scrollTo({ top: 0 });
    }
  };

  document.getElementById("btn-primary-footer").onclick = (event) => {
    if (event.detail > 1 || performance.now() < state.footerCooldown) return;
    state.footerCooldown = performance.now() + 320;
    return guarded(event.currentTarget, async () => {
      const btnEl = document.getElementById("btn-primary-footer");
      if (needsCheck) {
        if (s.kind === "mcq") {
          const choice = state.selectedMcq[s.id];
          if (choice === undefined) return;
          const res = await api("/api/quiz", { step_id: s.id, choice });
          state.stepFeedback[s.id] = { choice, correct: res.correct, explanation: res.explanation };
          state.data = res.state;
          if (res.correct) { state.combo++; handleXp(res.xp, btnEl, "correct"); }
          else { state.combo = 0; playSound("miss"); }
          updateMcqTileStates(s);
          renderTopbar();
          renderMissionFooter();
        } else if (s.kind === "numeric") {
          const raw = document.getElementById("num-ans").value.trim().replace(",", ".");
          if (raw === "" || !Number.isFinite(Number(raw))) { playSound("miss"); return; }
          const res = await api("/api/quiz", { step_id: s.id, answer: Number(raw) });
          state.stepFeedback[s.id] = { val: raw, correct: res.correct, explanation: res.explanation };
          state.data = res.state;
          if (res.correct) { state.combo++; handleXp(res.xp, btnEl, "correct"); }
          else { state.combo = 0; playSound("miss"); }
          renderTopbar();
          renderMissionFooter();
        } else if (s.kind === "poe") {
          const pred = document.getElementById("poe-input").value;
          const res = await api("/api/quiz", { step_id: s.id, prediction: pred });
          state.stepFeedback[s.id] = { pred, correct: res.correct, reveal_md: res.reveal_md, explanation: res.explanation };
          if (res.state) state.data = res.state;
          if (res.correct) {
            state.combo++;
            handleXp(res.xp, btnEl, "correct");
            const inp = document.getElementById("poe-input");
            if (inp) inp.disabled = true;
          } else {
            playSound("miss");
          }
          renderTopbar();
          renderMissionFooter();
        }
        return;
      }

      // Keep the sound within the click gesture.
      playSound(s.kind === "debrief" ? "achievement" : "continue");
      if (["story_concept", "viz", "live_lab", "debrief"].includes(s.kind)) {
        const res = await api("/api/complete_step", { step_id: s.id });
        state.data = res.state;
        handleXp(res.xp, btnEl, null);
      } else {
        spawnSparkles(btnEl, 10);
      }

      if (isLast) {
        unlockAchievement("district_clear");
        if (d.id === "M4") unlockAchievement("ppo_boss");
        state.view = "map";
        state.lastRenderedStepId = null;
        render();
        window.scrollTo({ top: 0 });
      } else {
        state.navDir = "next";
        state.stepIdx++;
        renderTopbar();
        renderMission();
        document.getElementById("app-root").scrollTo({ top: 0 });
      }
    });
  };
}

function updateMcqTileStates(s) {
  const fb = state.stepFeedback[s.id];
  const picked = state.selectedMcq[s.id];
  document.querySelectorAll(".choice-tile").forEach((tile) => {
    const i = Number(tile.dataset.opt);
    tile.classList.remove("selected", "correct", "wrong");
    if (fb && fb.choice === i) tile.classList.add(fb.correct ? "correct" : "wrong");
    else if (picked === i) tile.classList.add("selected");
  });
}

function renderMission() {
  disposeEditor();
  document.body.classList.add("mode-mission");
  const root = document.getElementById("app-root");
  const d = state.data.districts[state.districtIdx];
  const s = d.steps[state.stepIdx];
  const fb = state.stepFeedback[s.id];
  const isNewStep = state.lastRenderedStepId !== s.id;
  state.lastRenderedStepId = s.id;

  const cueMood = s.kind === "debrief" ? "proud" : (["code", "mcq", "poe", "numeric"].includes(s.kind) ? "thinking" : "idle");
  const badgeMap = { bridge: "ML / NLP Bridge", warning: "Watch Out", misconception: "Common Myth", obsidian: "Obsidian Notes" };

  const prompts = {
    mcq: "Choose the answer you can explain.",
    numeric: "Work through the numbers before checking.",
    poe: "Write down what you expect to happen.",
  };
  const story = s.story || (Object.hasOwn(prompts, s.kind) ? prompts[s.kind] : "");
  let body = "";
  if (story) {
    body += `
      <div class="kubo-speech-row">
        ${mascotHtml(cueMood, 50, null, false, "lesson-kubo")}
        <div id="kubo-speech-bubble" class="kubo-speech-bubble" title="Click to show full line">${mdToHtml(story, true)}</div>
      </div>`;
  }
  if (s.body_md) body += `<div class="prose">${mdToHtml(s.body_md)}</div>`;
  if (s.callouts) {
    s.callouts.forEach((c) => {
      body += `
        <div class="note-surface ${esc(c.kind)}">
          <div class="note-surface-head">
            <span class="note-badge">${Object.hasOwn(badgeMap, c.kind) ? badgeMap[c.kind] : "Note"}</span>
            <span class="note-surface-title">${esc(c.title)}</span>
          </div>
          <p>${mdToHtml(c.body, true)}</p>
        </div>`;
    });
  }

  if (s.kind === "viz") body += `<div id="viz-mount"></div>`;

  if (s.kind === "mcq") {
    const letters = "ABCD";
    const picked = state.selectedMcq[s.id];
    body += `<div class="prose"><p class="stem">${mdToHtml(s.question, true)}</p></div>
      <div class="choice-list">${s.options.map((opt, i) => {
        let cls = "";
        if (fb && fb.choice === i) cls = fb.correct ? "correct" : "wrong";
        else if (picked === i) cls = "selected";
        return `<button class="choice-tile ${cls}" data-opt="${i}"><span class="choice-key">${letters[i]}</span><span>${mdToHtml(opt, true)}</span></button>`;
      }).join("")}</div>`;
    if (s.hints && s.hints.length) body += `<div id="hints-mount">${renderHints(s.id, s.hints)}</div>`;
  }

  if (s.kind === "numeric") {
    body += `<div class="prose"><p class="stem">${mdToHtml(s.question, true)}</p></div>
      <div style="margin:20px 0;"><input aria-label="Numeric answer" type="text" inputmode="decimal" autocomplete="off" id="num-ans" class="num-field" placeholder="e.g. 0.81" value="${esc(fb?.val)}"/></div>`;
    if (s.hints && s.hints.length) body += `<div id="hints-mount">${renderHints(s.id, s.hints)}</div>`;
  }

  if (s.kind === "poe") {
    body += `<div class="prose"><p class="stem">Predict before observing: ${mdToHtml(s.prompt, true)}</p></div>
      <textarea aria-label="Your prediction" id="poe-input" class="poe-field" placeholder="Write a 1–2 sentence prediction..." ${fb && fb.correct ? "disabled" : ""}>${esc(fb?.pred)}</textarea>`;
  }

  if (s.kind === "code") {
    body += `<div class="prose">${mdToHtml(s.prompt_md)}</div>
      <p class="editor-help" id="editor-help">Press Esc, then Tab to leave the editor.</p>
      <div id="code-shell" class="code-shell">
        <div id="code-gutter" class="code-gutter" aria-hidden="true"></div>
        <textarea id="code-editor" class="code-editor" wrap="off" aria-label="Python code editor" aria-describedby="editor-help" spellcheck="false"></textarea>
      </div>
      <div id="runner-card" class="runner-card" hidden>
        <p>Requires local PyTorch runner: <code>uv run rl-studio</code></p>
        <button id="check-runner" class="btn-tactile secondary">Check Local Runner</button>
      </div>
      <div class="code-toolbar">
        <button id="btn-run-code" class="btn-tactile go">${RUN_LABEL}</button>
        <button id="btn-reset-code" class="btn-ghost">${ICONS.reset} Reset</button>
        <div id="confirm-reset" class="reset-confirm" hidden>
          <span>Reset starter code?</span><button id="btn-reset-confirm" class="btn-ghost">Confirm</button>
          <button id="btn-reset-cancel" class="btn-ghost">Cancel</button>
        </div>
        <span id="draft-status" class="draft-status" role="status">${prefGet(draftKey(s)) === null ? "" : "Saved"}</span>
      </div>
      <div id="code-logs" role="region" aria-label="Code verification" aria-live="polite">${codeResultsHtml(fb)}</div>`;
    if (s.hints?.length) body += `<div id="hints-mount">${renderHints(s.id, s.hints)}</div>`;
  }

  if (s.kind === "live_lab") {
    let sel = "";
    if (s.lab_type === "ppo_bug_lab") {
      sel = `<select id="lab-bug-select" aria-label="Bug scenario" class="select-field">
        <option value="bug_same_logp">Scenario 1: old_log_probs == live new_log_probs (r ≡ 1)</option>
        <option value="bug_no_mask_recompute">Scenario 2: Missing legal_mask on PPO recompute</option>
        <option value="bug_flipped_entropy">Scenario 3: Flipped entropy sign (+c₂·H)</option>
        <option value="bug_zero_trunc_bootstrap">Scenario 4: Zeroed bootstrap at timeout</option>
      </select>`;
    }
    body += `<div class="viz-stage">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
        ${sel}
        <button id="btn-run-lab" class="btn-tactile go">${ICONS.play} Run PyTorch Simulation</button>
      </div>
      <p id="lab-status" class="editor-help" role="status"></p><div id="lab-output"></div>
    </div>`;
  }

  if (s.kind === "debrief") {
    const items = (s.obsidian_concepts || []).map((c) => `<li>${mdToHtml(c, true)}</li>`).join("");
    body += `
      <section class="note-surface obsidian">
        <h2>Obsidian Notes</h2>
        <div class="prose">${mdToHtml(s.obsidian_prompt || "Close this tab and write a short note in your own words in Obsidian for each concept below.")}</div>
        ${items ? `<ul>${items}</ul>` : ""}
        ${s.slopoly_link ? `<p>${mdToHtml(s.slopoly_link, true)}</p>` : ""}
        <label class="notes-checkbox"><input id="obsidian-written" type="checkbox" ${prefGet(draftKey(s) + "_notes") === "1" ? "checked" : ""}>I wrote my Obsidian notes</label>
      </section>
      <div id="unit-sprint-host">${renderUnitSprintHtml(d.id)}</div>`;
  }

  const enterCls = isNewStep ? (state.navDir === "next" ? "enter-next" : state.navDir === "prev" ? "enter-prev" : "enter-fade") : "";
  root.innerHTML = `<article class="lesson-stage ${enterCls}"><h1>${mdToHtml(s.title, true)}</h1>${body}</article>`;
  renderMath(root);
  renderMissionFooter();

  if (story && isNewStep) {
    animateKuboSpeech(story, document.getElementById("kubo-speech-bubble"), document.getElementById("lesson-kubo"));
  }
  if (s.kind === "viz") mountVisualizer(s.viz_type, document.getElementById("viz-mount"));
  if (s.kind === "debrief") {
    bindUnitSprint(d.id);
    document.getElementById("obsidian-written").onchange = (e) => prefSet(draftKey(s) + "_notes", e.target.checked ? "1" : "0");
  }

  if (s.kind === "numeric") {
    const inp = document.getElementById("num-ans");
    if (inp) inp.onkeydown = (e) => { if (e.key === "Enter" && !e.repeat) document.getElementById("btn-primary-footer").click(); };
  }

  if (s.kind === "mcq") {
    root.querySelectorAll(".choice-tile").forEach((btn) => {
      btn.onclick = () => {
        if (state.inFlight) return;
        primeAudio();
        playSound("tap");
        state.selectedMcq[s.id] = Number(btn.dataset.opt);
        if (state.stepFeedback[s.id] && !state.stepFeedback[s.id].correct) delete state.stepFeedback[s.id];
        updateMcqTileStates(s);
        renderMissionFooter();
      };
    });
  }

  if (s.kind === "code") mountCodeEditor(s);
  if (s.kind === "live_lab") mountLab(s);

  const bindHint = () => {
    const hBtn = document.getElementById("btn-next-hint");
    if (hBtn) {
      hBtn.onclick = () => {
        playSound("tap");
        state.hintState[s.id] = (state.hintState[s.id] || 0) + 1;
        const mount = document.getElementById("hints-mount");
        if (mount) {
          mount.innerHTML = renderHints(s.id, s.hints);
          renderMath(mount);
          bindHint();
        }
      };
    }
  };
  bindHint();
}

// VIEW 3: Gamified, Honest Active Recall Drill
function startDrillSession() {
  if (state.inFlight) return;
  state.view = "drill";
  state.drillCards = [...(state.data.srs.due_cards || [])];
  state.drillIdx = 0;
  state.drillRevealed = false;
  state.drillSessionXp = 0;
  state.drillGoodCount = 0;
  state.drillCombo = 0;
  state.drillMood = "thinking";
  render();
}

function deckMasteryHtml() {
  const mods = Object.values(state.data.srs.by_module || {});
  return `
    <div class="deck-section-head">
      <h3 class="deck-section-title">Card Mastery by Chapter</h3>
      <p class="deck-section-sub">Cards unlock automatically as you complete each chapter</p>
    </div>
    <div class="deck-mastery-grid">
      ${mods.map((m) => {
        const pct = m.total ? Math.round((m.mastered / m.total) * 100) : 0;
        return `
          <div class="deck-mini">
            <div class="deck-mini-top">
              <span class="deck-mini-name"><span class="street-dot" style="background:${colorHex(m.color)};"></span>${esc(m.chapter || m.street)}</span>
              <span class="deck-mini-count" >${esc(m.unlocked)}/${esc(m.total)} unlocked · ${esc(m.mastered)} mastered</span>
            </div>
            <div class="xp-bar-track"><div class="xp-bar-fill" style="background:${colorHex(m.color)}; --progress: ${(pct / 100).toFixed(3)}"></div></div>
          </div>`;
      }).join("")}
    </div>`;
}

function drillRevealButtonHtml() {
  return `<button id="d-reveal" class="btn-tactile secondary full">Show Answer</button>`;
}

function renderDrill() {
  document.body.classList.remove("mode-mission");
  document.getElementById("lesson-footer-host").innerHTML = "";
  const root = document.getElementById("app-root");
  const cards = state.drillCards;
  const ankiNote = cloudCourse()
    ? '<span class="drill-anki-status">Connect Local Studio for Anki sync</span>'
    : state.data.anki_connected
    ? `<span class="drill-anki-status"><span class="status-dot online"></span>Auto-synced with Anki</span>`
    : `<a class="drill-anki-status" href="/api/anki/download" style="text-decoration:none; color:var(--accent);">Download Anki deck (.apkg)</a>`;

  if (!cards.length || state.drillIdx >= cards.length) {
    const reviewed = cards.length;
    const acc = reviewed ? Math.round((state.drillGoodCount / reviewed) * 100) : 100;
    root.innerHTML = `
      <div class="drill-stage">
        <div class="flashcard" style="text-align:center;">
          ${mascotHtml("proud", 68)}
          <h2 style="margin:12px 0 6px; font-weight:900;">Recall session complete</h2>
          <p style="color:var(--ink-2); margin:0;">${reviewed ? state.data.anki_connected ? "Your reviews are scheduled and synced to Anki." : "Your reviews are scheduled." : "No cards due right now — great work staying on top of reviews."}</p>
          <div class="drill-summary-grid">
            <div class="summary-tile"><div class="summary-val">${reviewed}</div><div class="summary-lbl">Cards Reviewed</div></div>
            <div class="summary-tile"><div class="summary-val">${acc}%</div><div class="summary-lbl">Recalled</div></div>
            <div class="summary-tile"><div class="summary-val">+${state.drillSessionXp}</div><div class="summary-lbl">Session XP</div></div>
          </div>
          <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
            <button id="d-home" class="btn-tactile go">Back to Course</button>
            <button id="d-again" class="btn-tactile secondary">Practice More Cards</button>
          </div>
          <div style="margin-top:16px;">${ankiNote}</div>
        </div>
        ${deckMasteryHtml()}
      </div>`;
    document.getElementById("d-home").onclick = () => { if (state.inFlight) return; playSound("tap"); state.view = "map"; render(); };
    document.getElementById("d-again").onclick = () => { playSound("tap"); startDrillSession(); };
    return;
  }

  const c = cards[state.drillIdx];
  const ratio = state.drillIdx / Math.max(cards.length, 1);

  renderPreserving(root, `
    <div class="drill-stage">
      <div class="drill-hud">
        <div class="drill-hud-left">
          ${mascotHtml(state.drillMood, 44)}
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:13.5px; font-weight:900; color:var(--ink);">Daily Recall Sprint</span>
              ${ankiNote}
            </div>
            <div class="progress-track"><div class="progress-fill" style="--progress: ${ratio.toFixed(4)}"></div></div>
          </div>
        </div>
        <div class="drill-hud-stats">
          <span class="drill-stat-pill" title="Correct answers in a row this session"><span style="color:var(--go); display:inline-flex;">${ICONS.target}</span> ${state.drillCombo} in a row</span>
          <span class="drill-stat-pill"><span style="color:var(--accent); display:inline-flex;">${ICONS.bolt}</span> +${state.drillSessionXp} XP</span>
        </div>
      </div>

      <div class="flashcard drill-card">
        <div class="flashcard-top">
          <span class="card-counter">Card ${state.drillIdx + 1} of ${cards.length}</span>
        </div>
        <div class="flashcard-front">${cardHtml(c.front)}</div>
        <div id="d-answer-slot" class="flashcard-answer-slot">${state.drillRevealed ? `<div class="flashcard-back">${cardHtml(c.back)}</div>` : ""}</div>
        <div id="d-actions" class="flashcard-actions">${state.drillRevealed ? ratingButtonsHtml(c, false) : drillRevealButtonHtml()}</div>
      </div>

      ${deckMasteryHtml()}
    </div>`, ".drill-hud .progress-fill");

  renderMath(root);

  const bindRatings = () => root.querySelectorAll(".rate-btn").forEach((b) => {
    b.onclick = (event) => guarded(b, async () => {
      if (event.detail > 1 || performance.now() < state.ratingCooldown) return;
      state.ratingCooldown = performance.now() + 320;
      primeAudio();
      const q = Number(b.dataset.q);
      const res = await api("/api/srs/rate", { card_id: c.card_id, quality: q });
      state.data = res.state;
      if (q >= 3) {
        state.drillGoodCount++;
        state.drillCombo++;
        const gained = res.xp?.gained ?? 0;
        state.drillSessionXp += gained;
        state.drillMood = state.drillCombo >= 3 ? "proud" : "happy";
        playSound("correct", state.drillCombo);
        spawnSparkles(b, 10);
        if (gained > 0) spawnXpFloat(`+${gained} XP`, b);
      } else {
        state.drillCombo = 0;
        state.drillMood = "oops";
        playSound("wrong");
      }
      state.drillIdx++;
      state.drillRevealed = false;
      if (state.drillIdx >= state.drillCards.length) playSound("achievement");
      renderTopbar();
      renderDrill();
      syncProgressToSupabase();
    });
  });

  // Reveal in place: the answer fills its reserved slot and the rating row swaps into the
  // exact same action area — the card never re-mounts, collapses or jumps.
  const rev = document.getElementById("d-reveal");
  if (rev) {
    rev.onclick = () => guarded(rev, () => {
      primeAudio();
      playSound("tap");
      state.drillRevealed = true;
      const slot = document.getElementById("d-answer-slot");
      const actions = document.getElementById("d-actions");
      slot.innerHTML = `<div class="flashcard-back">${cardHtml(c.back)}</div>`;
      actions.innerHTML = ratingButtonsHtml(c, false);
      renderMath(slot);
      bindRatings();
    });
  } else {
    bindRatings();
  }
}

// Keyboard shortcuts inside Recall Drill (Space to reveal, 1-4 to rate!)
document.addEventListener("keydown", (e) => {
  if (e.repeat || state.inFlight || state.view !== "drill" || state.modalOpen || state.timer.popoverOpen) return;
  if (document.activeElement?.matches("input, textarea, select, button, [contenteditable]") && e.code === "Space") return;
  if (e.code === "Space" && !state.drillRevealed) {
    e.preventDefault();
    const rev = document.getElementById("d-reveal");
    if (rev) rev.click();
  } else if (state.drillRevealed) {
    const map = { Digit1: "0", Digit2: "3", Digit3: "4", Digit4: "5" };
    if (map[e.code]) {
      const btn = document.querySelector(`.rate-btn[data-q="${map[e.code]}"]`);
      if (btn) btn.click();
    }
  }
});

function disposeEditor() {
  activeEditor?.view.destroy();
  activeEditor = null;
}

function render() {
  if (state.view !== "mission") disposeEditor();
  if (STATIC_MODE && !state.sbUser) return renderAuth();
  if (state.view === "courses") return renderCourses();
  renderTopbar();
  if (state.view === "map") renderMap();
  else if (state.view === "mission") renderMission();
  else renderDrill();
}

async function init() {
  try {
    if (!STATIC_MODE) {
      state.data = await request("/api/state");
      state.combo = state.data.gamification.combo;
    }
    await initSupabase();
    if (state.sbUser) await enterCloud();
    else render();
  } catch (err) {
    document.getElementById("app-root").textContent = err.message || "Course Studio could not start.";
  }
}

function cloudCourse() {
  return state.course !== null;
}

async function rpc(name, args) {
  const { data, error } = await state.sbClient.rpc(name, args);
  if (error) throw error;
  return data;
}

async function listCourses() {
  const courses = await rpc("list_my_courses");
  state.courses = Array.isArray(courses) ? courses : [];
}

function validateCourse(content) {
  const districts = content?.districts;
  if (content?.schema_version !== 1 || !Array.isArray(districts) || !districts.length || !Array.isArray(content.cards)) {
    throw new Error("Use a version 1 course JSON with lesson units and a cards array.");
  }
  const allowedKinds = new Set(["story_concept", "viz", "mcq", "numeric", "poe", "code", "live_lab", "debrief"]);
  const unitIds = new Set();
  const stepIds = new Set();
  for (const unit of districts) {
    if (!unit?.id || typeof unit.id !== "string" || unitIds.has(unit.id) || !Array.isArray(unit.steps) || !unit.steps.length) {
      throw new Error("Each unit needs a unique ID and at least one step.");
    }
    unitIds.add(unit.id);
    for (const step of unit.steps) {
      if (!step?.id || typeof step.id !== "string" || stepIds.has(step.id) || !allowedKinds.has(step.kind)) {
        throw new Error("Each step needs a unique ID and a supported lesson type.");
      }
      if ((step.kind === "mcq" && (!Array.isArray(step.options) || !Number.isInteger(step.correct_index) ||
          step.correct_index < 0 || step.correct_index >= step.options.length)) ||
          (step.kind === "numeric" && !Number.isFinite(step.expected))) {
        throw new Error("Each quiz needs a valid answer.");
      }
      if ((step.callouts && (!Array.isArray(step.callouts) || step.callouts.some((c) => !c || typeof c !== "object"))) ||
          (step.hints && (!Array.isArray(step.hints) || step.hints.some((hint) => !Array.isArray(hint) || typeof hint[1] !== "string"))) ||
          (step.obsidian_concepts && !Array.isArray(step.obsidian_concepts))) {
        throw new Error("Use arrays for callouts, hints, and Obsidian concepts.");
      }
      stepIds.add(step.id);
    }
  }
  const cardIds = new Set();
  for (const card of content.cards) {
    if (!card?.card_id || typeof card.card_id !== "string" || cardIds.has(card.card_id) ||
        !unitIds.has(card.module) || typeof card.front !== "string" || typeof card.back !== "string") {
      throw new Error("Each recall card needs a unique ID, a valid unit ID, and text on both sides.");
    }
    cardIds.add(card.card_id);
  }
}

async function openCourse(course) {
  if (!course) throw new Error("Course is unavailable. Reload your course list and try again.");
  validateCourse(course.content);
  const user = state.sbUser.id;
  const { data, error } = await state.sbClient.from("course_progress").select("*")
    .eq("course_id", course.id).eq("user_id", user).maybeSingle();
  if (error) throw error;
  if (state.sbUser?.id !== user) return;
  clearInterval(state.timer.interval);
  state.timer.running = false;
  state.timer.left = state.timer.total;
  state.course = course;
  state.progressVersion = data?.updated_at ?? null;
  state.progress = {
    xp: data?.xp ?? 0,
    streak_days: data?.streak_days ?? 0,
    combo: data?.combo ?? 0,
    completed_events: data?.completed_events ?? [],
    srs_state: Object.assign(Object.create(null), data?.srs_state),
  };
  state.combo = state.progress.combo;
  resetCourseView();
  state.data = cloudState(state.progress);
  prefSet("active_course_" + user, course.id);
  closeModal();
  render();
  syncProgressToSupabase();
  probeRunner();
}

function resetCourseView() {
  state.view = "map";
  state.lastRenderedStepId = null;
  for (const key of ["selectedMcq", "hintState", "stepFeedback", "labCache", "unitSprint"]) {
    state[key] = Object.create(null);
  }
  state.drillCards = [];
}

async function openLocalStudio() {
  state.data = await request("/api/state");
  state.course = null;
  state.progress = null;
  state.combo = state.data.gamification.combo;
  prefSet("active_course_" + state.sbUser?.id, "");
  resetCourseView();
  closeModal();
  render();
}

function day(offset = 0, base) {
  const d = base ? new Date(base + "T12:00:00") : new Date();
  d.setDate(d.getDate() + offset);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function sm2(progress, quality, today = day()) {
  const { repetitions = 0, ease_factor = 2.5, interval_days = 0, lapses = 0 } = progress;
  if (quality >= 3 && repetitions >= 1 && progress.last_reviewed === today && progress.due_date > today) {
    return progress;
  }
  let interval = 0;
  if (quality >= 3) {
    if (!repetitions) interval = 1;
    else if (repetitions === 1) interval = quality === 3 ? 3 : 6;
    else interval = Math.max(1, Math.round(interval_days * (quality === 3 ? 1.2 : ease_factor * (quality === 5 ? 1.3 : 1))));
  }
  const missed = 5 - quality;
  return {
    unlocked: true,
    repetitions: quality < 3 ? 0 : repetitions + 1,
    ease_factor: Math.max(1.3, Math.round((ease_factor + 0.1 - missed * (0.08 + missed * 0.02)) * 1000) / 1000),
    interval_days: interval,
    lapses: lapses + Number(quality < 3),
    due_date: interval ? day(interval, today) : today,
    last_reviewed: today,
  };
}

function cloudState(progress) {
  const { districts, cards } = state.course.content;
  const today = day();
  const byModule = Object.create(null);
  const unitPacks = Object.create(null);
  const unlocked = [];
  const due = [];
  districts.forEach((district) => {
    const available = cards.filter((card) => card.module === district.id).map((card) => {
      const p = progress.srs_state[card.card_id] || {};
      const previews = Object.fromEntries([0, 3, 4, 5].map((q) => {
        const interval = sm2(p, q, today).interval_days;
        return [q, interval ? interval + "d" : "Today"];
      }));
      return { ...card, chapter: district.chapter, unit_color: district.color, interval_previews: previews };
    });
    const studied = available.filter((card) => progress.srs_state[card.card_id]?.unlocked);
    unitPacks[district.id] = [...available.slice(0, 3), ...unlocked.slice(-1)];
    unlocked.push(...studied);
    due.push(...studied.filter((card) => (progress.srs_state[card.card_id]?.due_date || today) <= today));
    byModule[district.id] = {
      chapter: district.chapter,
      color: district.color,
      unlocked: studied.length,
      total: available.length,
      mastered: studied.filter((card) => progress.srs_state[card.card_id].repetitions >= 2).length,
    };
  });
  const rank = [...DEFAULT_LEVEL_REWARDS].reverse().find((r) => progress.xp >= r.threshold) || DEFAULT_LEVEL_REWARDS[0];
  const next = DEFAULT_LEVEL_REWARDS[rank.level];
  return {
    districts,
    gamification: {
      ...progress,
      level: "Rank " + rank.level,
      next_threshold: next?.threshold ?? rank.threshold,
      pct: next ? ((progress.xp - rank.threshold) / (next.threshold - rank.threshold)) * 100 : 100,
      sound_enabled: prefGet("sound") !== "off",
    },
    srs: {
      due_count: due.length,
      total_cards: cards.length,
      unlocked_count: unlocked.length,
      due_cards: due.length ? due.slice(0, 12) : unlocked.slice(0, 8),
      unit_packs: unitPacks,
      by_module: byModule,
    },
    anki_connected: false,
  };
}

async function updateCloudProgress(path, body) {
  const course = state.course;
  const user = state.sbUser.id;
  const progress = structuredClone(state.progress);
  progress.srs_state = Object.assign(Object.create(null), progress.srs_state);
  const today = day();
  const award = (event, points) => {
    if (progress.completed_events.includes(event)) return { gained: 0 };
    progress.completed_events.push(event);
    const oldRank = DEFAULT_LEVEL_REWARDS.filter((r) => progress.xp >= r.threshold).length;
    progress.xp += points;
    const level = DEFAULT_LEVEL_REWARDS.filter((r) => progress.xp >= r.threshold).length;
    const dayEvent = "study-" + today;
    if (!progress.completed_events.includes(dayEvent)) {
      progress.streak_days = progress.completed_events.includes("study-" + day(-1)) ? progress.streak_days + 1 : 1;
      progress.completed_events.push(dayEvent);
    }
    return { gained: points, xp: progress.xp, level, leveled_up: level > oldRank };
  };
  const unlock = (unit) => {
    for (const card of course.content.cards.filter((c) => c.module === unit)) {
      progress.srs_state[card.card_id] = { ...progress.srs_state[card.card_id], unlocked: true };
    }
  };

  let result = {};
  if (path === "/api/srs/rate") {
    const card = course.content.cards.find((c) => c.card_id === body.card_id);
    if (!card || ![0, 3, 4, 5].includes(body.quality)) throw new Error("Invalid recall rating.");
    const prior = progress.srs_state[card.card_id] || {};
    progress.srs_state[card.card_id] = sm2(prior, body.quality, today);
    if (body.quality >= 3) result.xp = award(`review-${today}-${card.card_id}`, 10);
  } else if (path === "/api/sprint/claim") {
    result.xp = award("focus-" + new Date().toISOString().slice(0, 16), 25);
  } else {
    const district = course.content.districts.find((d) => d.steps.some((s) => s.id === body.step_id));
    const step = district?.steps.find((s) => s.id === body.step_id);
    if (!step) throw new Error("That lesson step is unavailable.");
    unlock(district.id);
    let points = ({ story_concept: 10, viz: 15, live_lab: 20, debrief: 30 })[step.kind] ?? 10;
    if (path === "/api/quiz") {
      if (step.kind === "mcq") {
        points = 20;
        result = { correct: body.choice === step.correct_index, explanation: step.explanations?.[body.choice] };
      } else if (step.kind === "numeric") {
        points = 25;
        const tol = step.tol ?? 0.01;
        const correct = Math.abs(body.answer - step.expected) <= tol;
        result = { correct, explanation: correct ? step.explanation : `Check your calculation. The tolerance is ±${tol}.` };
      } else {
        if ((body.prediction || "").trim().length < 8) return { correct: false, explanation: "Write a brief prediction before revealing the outcome." };
        points = 15;
        result = { correct: true, reveal_md: step.reveal_md };
      }
    } else if (path === "/api/run_code") {
      points = step.xp ?? 35;
      result = { passed: body.passed };
    }
    if (result.correct === false || result.passed === false) {
      progress.combo = 0;
    } else {
      if (result.correct || result.passed) progress.combo++;
      result.xp = award("step-" + step.id, points);
    }
  }
  const table = state.sbClient.from("course_progress");
  const save = state.progressVersion
    ? table.update(progress).eq("course_id", course.id).eq("user_id", user).eq("updated_at", state.progressVersion)
    : table.upsert({ course_id: course.id, user_id: user, ...progress }, { onConflict: "course_id,user_id", ignoreDuplicates: true });
  const { data, error } = await save.select("updated_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Progress changed in another session. Reopen this course to load your latest progress.");
  if (state.course !== course || state.sbUser?.id !== user) throw new Error("The course session ended.");
  state.progressVersion = data.updated_at;
  state.progress = progress;
  result.state = cloudState(progress);
  return result;
}

async function guarded(button, action) {
  if (state.inFlight || button?.disabled) return;
  state.inFlight = true;
  if (button) button.disabled = true;
  try {
    await action();
  } catch (err) {
    toast(err.message || "Try again.");
  } finally {
    state.inFlight = false;
    if (button?.isConnected) button.disabled = false;
  }
}

function authFormHtml(signUp) {
  return `<form id="auth-form" class="form-stack">
    <label>Email<input class="text-field" name="email" type="email" autocomplete="email" required></label>
    <label>Password<input class="text-field" name="password" type="password" autocomplete="${signUp ? "new-password" : "current-password"}" minlength="6" required></label>
    ${signUp ? '<label>Username<input class="text-field" name="username" maxlength="24" minlength="2" pattern="[A-Za-z0-9_]{2,24}" autocomplete="username" required></label>' : ""}
    <button class="btn-tactile go" type="submit">${signUp ? "Sign Up" : "Sign In"}</button>
    <button id="auth-switch" class="btn-ghost" type="button">${signUp ? "Already have an account? Sign in" : "Create an account"}</button>
    <div class="modal-msg" id="auth-message" role="status"></div>
  </form>`;
}

function bindAuth(host, signUp, after) {
  host.querySelector("#auth-switch").onclick = () => {
    host.innerHTML = authFormHtml(!signUp);
    bindAuth(host, !signUp, after);
    host.querySelector("input").focus();
  };
  const form = host.querySelector("form");
  form.onsubmit = (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    const message = host.querySelector("#auth-message");
    guarded(form.querySelector('[type="submit"]'), async () => {
      try {
        const credentials = { email: fields.get("email").trim(), password: fields.get("password") };
        const username = fields.get("username")?.toLowerCase();
        const { data, error } = signUp
          ? await state.sbClient.auth.signUp({ ...credentials, options: { data: { username, display_name: username } } })
          : await state.sbClient.auth.signInWithPassword(credentials);
        if (error) throw error;
        if (!data.session) {
          message.textContent = "Check your email to confirm your account, then sign in.";
          return;
        }
        state.sbUser = data.session.user;
        await loadCloudProfileAndFriends();
        await after();
      } catch (err) {
        message.textContent = err.message || "Could not sign in.";
      }
    });
  };
}

function renderAuth() {
  document.body.classList.remove("mode-mission");
  document.getElementById("topbar").replaceChildren();
  document.getElementById("lesson-footer-host").replaceChildren();
  const root = document.getElementById("app-root");
  root.innerHTML = `<section class="auth-gate">
    ${mascotHtml("happy", 70)}
    <h1>Sign in to Course Studio</h1>
    <p>Join a course and pick up where you left off.</p>
    <div id="auth-panel">${state.sbClient ? authFormHtml(false) : '<p role="status">Account service is unavailable. Reload to try again.</p>'}</div>
  </section>`;
  if (state.sbClient) bindAuth(root.querySelector("#auth-panel"), false, enterCloud);
}

async function enterCloud() {
  state.view = "courses";
  try {
    await listCourses();
    const saved = prefGet("active_course_" + state.sbUser.id);
    const course = state.courses.find((c) => c.id === saved) || (STATIC_MODE ? state.courses[0] : null);
    if (course) return await openCourse(course);
    if (!STATIC_MODE && state.data && state.courses.length) {
      state.view = "map";
      syncProgressToSupabase();
    }
  } catch (err) {
    toast(err.message);
  }
  render();
}

function showCourses() {
  if (state.inFlight) return;
  if (!state.sbUser && state.data) return openAccountModal(document.getElementById("btn-courses"));
  state.view = "courses";
  render();
  listCourses().then(() => { if (state.view === "courses" && state.sbUser) renderCourses(); })
    .catch((err) => toast(err.message));
}

function renderCourses() {
  document.body.classList.remove("mode-mission");
  document.getElementById("lesson-footer-host").replaceChildren();
  const bar = document.getElementById("topbar");
  bar.innerHTML = `<div class="topbar-inner courses-topbar">
    <span class="wordmark">${mascotHtml("idle", 28)}<span>Course Studio</span></span>
    <button id="btn-theme" class="icon-ghost" aria-label="Toggle color theme">${state.theme === "dark" ? ICONS.sun : ICONS.moon}</button>
    <button id="hub-signout" class="btn-ghost">Sign out</button>
  </div>`;
  bar.querySelector("#btn-theme").onclick = toggleTheme;
  bar.querySelector("#hub-signout").onclick = (e) => guarded(e.currentTarget, signOut);
  const root = document.getElementById("app-root");
  root.innerHTML = `<section class="courses-hub">
    <div class="courses-heading"><h1>Your courses</h1><button id="create-course" class="btn-tactile secondary">Create Course</button></div>
    ${!STATIC_MODE ? '<button id="open-local" class="btn-ghost">Open Local Studio</button>' : ""}
    <ul class="course-list">
      ${state.courses.map((course, index) => `<li class="course-row">
        <div><h2>${esc(course.title)}</h2><p>${esc(course.description)}</p></div>
        <div class="form-row"><button class="btn-tactile secondary" data-course="${index}">Open</button>
          <button class="btn-ghost" id="course-settings-${index}" data-settings="${index}" aria-label="Settings for ${esc(course.title)}">Settings</button></div>
      </li>`).join("")}
    </ul>
    ${state.courses.length ? "" : "<p>Enter an invite code to join your first course.</p>"}
    <form id="join-course" class="join-course">
      <label>Invite code<input name="code" class="text-field invite-input" pattern="[A-Z0-9]{6}" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="K7M9P2" required></label>
      <button type="submit" class="btn-tactile go">Join Course</button>
    </form>
  </section>`;
  root.querySelector("#create-course").onclick = (event) => { if (!state.inFlight) createCourseDialog(event); };
  const local = root.querySelector("#open-local");
  if (local) local.onclick = () => guarded(local, openLocalStudio);
  root.querySelectorAll("[data-course]").forEach((button) => {
    button.onclick = () => guarded(button, () => openCourse(state.courses[Number(button.dataset.course)]));
  });
  root.querySelectorAll("[data-settings]").forEach((button) => {
    button.onclick = () => courseSettings(state.courses[Number(button.dataset.settings)], button);
  });
  const form = root.querySelector("#join-course");
  form.elements.code.oninput = (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  form.onsubmit = (event) => {
    event.preventDefault();
    guarded(form.querySelector("button"), async () => {
      const joined = await rpc("join_course_by_code", { p_code: form.elements.code.value });
      await listCourses();
      await openCourse(state.courses.find((c) => c.id === joined.id));
    });
  };
}

function createCourseDialog(event) {
  showDialog("Create Course", `<form id="new-course" class="form-stack">
    <label>Title<input name="title" class="text-field" minlength="2" maxlength="120" required></label>
    <label>Description<textarea name="description" class="text-field" maxlength="500" rows="2"></textarea></label>
    <label>Course JSON<textarea name="content" class="text-field" rows="6" required></textarea></label>
    <div class="form-row"><label>Upload JSON<input name="file" type="file" accept=".json,application/json"></label>
    <button id="use-template" class="btn-ghost" type="button">Use Starter Template</button></div>
    <div class="modal-msg" role="status"></div>
    <button class="btn-tactile go" type="submit">Create Course</button>
  </form>`, event.currentTarget);
  const form = document.getElementById("new-course");
  form.elements.file.onchange = async () => {
    const file = form.elements.file.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast("Choose a JSON file under 5 MB.");
    try {
      form.elements.content.value = await file.text();
    } catch (_) {
      toast("The JSON file could not be read.");
    }
  };
  form.querySelector("#use-template").onclick = () => {
    if (form.elements.content.value.trim()) return toast("Clear the JSON field to insert the starter template.");
    form.elements.content.value = JSON.stringify({
      schema_version: 1,
      districts: [{ id: "unit-1", chapter: "First unit", steps: [{ id: "first-step", kind: "story_concept", title: "First lesson" }] }],
      cards: [],
      lab_snapshots: {},
    }, null, 2);
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    guarded(form.querySelector('[type="submit"]'), async () => {
      try {
        const content = JSON.parse(form.elements.content.value);
        validateCourse(content);
        const created = await rpc("create_course", {
          p_title: form.elements.title.value,
          p_description: form.elements.description.value,
          p_content: content,
        });
        await listCourses();
        renderCourses();
        courseSettings(state.courses.find((c) => c.id === created.id));
      } catch (err) {
        form.querySelector(".modal-msg").textContent = err.message;
      }
    });
  };
}

function courseSettings(course, trigger) {
  showDialog(course.title, `<div class="form-stack">
    ${course.role === "owner" && course.invite_code ? `<label>Invite code<input id="course-invite" class="text-field invite-input" readonly value="${esc(course.invite_code)}"></label>
      <div class="form-row"><button id="copy-invite" class="btn-tactile secondary">Copy Code</button>
      <button id="rotate-invite" class="btn-ghost">Rotate Invite Code</button></div>` : ""}
    <button id="leave-course" class="btn-ghost">Leave Course</button>
    <div id="leave-confirm" class="form-stack" hidden><p>Leave this course? You’ll need an invite to rejoin.</p>
      <div class="form-row"><button id="confirm-leave" class="btn-tactile secondary">Leave Course</button>
      <button id="cancel-leave" class="btn-ghost">Cancel</button></div></div>
  </div>`, trigger);
  const invite = document.getElementById("course-invite");
  if (invite) {
    document.getElementById("copy-invite").onclick = async () => {
      try { await navigator.clipboard.writeText(invite.value); toast("Invite code copied."); }
      catch (_) { invite.select(); toast("Copy the selected invite code."); }
    };
    const rotate = document.getElementById("rotate-invite");
    rotate.onclick = () => guarded(rotate, async () => {
      course.invite_code = await rpc("rotate_invite_code", { p_course_id: course.id });
      invite.value = course.invite_code;
      toast("Invite code rotated.");
    });
  }
  const leave = document.getElementById("leave-course");
  const confirmation = document.getElementById("leave-confirm");
  const confirm = document.getElementById("confirm-leave");
  leave.onclick = () => { confirmation.hidden = false; leave.hidden = true; confirm.focus(); };
  document.getElementById("cancel-leave").onclick = () => {
    confirmation.hidden = true; leave.hidden = false; leave.focus();
  };
  confirm.onclick = () => guarded(confirm, async () => {
    await rpc("leave_course", { p_course_id: course.id });
    if (state.course?.id === course.id) {
      state.course = null;
      state.data = null;
      state.progress = null;
      resetCourseView();
    }
    state.view = "courses";
    state.courses = state.courses.filter((entry) => entry.id !== course.id);
    closeModal();
    render();
    document.getElementById("create-course")?.focus();
    await listCourses();
  });
}

async function signOut() {
  const { error } = await state.sbClient.auth.signOut();
  if (error) throw error;
  await clearSession();
}

async function clearSession() {
  clearInterval(state.timer.interval);
  state.timer.running = false;
  state.timer.left = state.timer.total;
  state.sbUser = null;
  state.sbProfile = null;
  state.friends = [];
  state.courses = [];
  state.course = null;
  state.progress = null;
  state.data = null;
  resetCourseView();
  closeModal();
  if (STATIC_MODE) renderAuth();
  else await openLocalStudio();
}

const RUN_LABEL = `${ICONS.play} Run &amp; Verify (${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘Enter" : "Ctrl+Enter"})`;
const NUMPY_CHALLENGES = new Set(["m0_returns", "m3_gae"]);
const RUNNER_URL = CONFIG.localRunnerUrl || "http://127.0.0.1:8787";
const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const CM_DEPS = "?deps=@codemirror/state@6.7.6,@codemirror/view@6.44.0";

let runnerAvailable = false;
let runnerProbe = null;
let editorModules = null;
let activeEditor = null;

function probeRunner() {
  if (!runnerProbe) {
    runnerProbe = request(RUNNER_URL + "/api/health", null, { signal: AbortSignal.timeout(500) })
      .then((data) => data.ok === true && data.pytorch === true, () => false)
      .then((available) => { runnerAvailable = available; return available; })
      .finally(() => { runnerProbe = null; });
  }
  return runnerProbe;
}

function draftKey(step) {
  return "draft_" + encodeURIComponent(state.course?.id || "local") + "_" + encodeURIComponent(step.id);
}

function codeResultsHtml(res) {
  if (!res) return "";
  const line = String(res.stderr ?? "").match(/File "[^"\n]*solution\.py", line (\d+)/)?.[1];
  const checks = res.checks?.length ? res.checks : [{ name: "Verification", passed: res.passed }];
  return `<ul class="checks-list" aria-label="Verification results">${checks.map((check) => `
    <li><span aria-hidden="true">${check.passed ? "✅" : "❌"}</span>
      <div><strong>${esc(check.name)}</strong><span class="sr-only">${check.passed ? " passed" : " failed"}</span>
      ${check.detail ? `<p>${esc(check.detail)}</p>` : ""}</div></li>`).join("")}</ul>
    ${res.stdout ? `<details><summary>Program output</summary><pre class="terminal-log">${esc(res.stdout)}</pre></details>` : ""}
    ${line ? `<button class="btn-ghost flush" data-code-line="${line}">Go to line ${line}</button>` : ""}
    ${res.stderr ? `<details><summary>Traceback</summary><pre class="terminal-log err">${esc(res.stderr)}</pre></details>` : ""}`;
}

// Run student code in a worker owned by an opaque-origin frame. The worker has
// no access to this page's account, browser storage, or loopback runner.
function runInBrowser(code, checks) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.sandbox = "allow-scripts";
    const channel = new MessageChannel();
    const worker = `
      self.onmessage = async ({data}) => {
        try {
          importScripts(${JSON.stringify(PYODIDE_BASE + "pyodide.js")});
          const python = await loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_BASE)} });
          await python.loadPackage("numpy");
          const stdout = [], stderr = [];
          python.setStdout({ batched: (line) => { if (stdout.length < 200) stdout.push(line.slice(0, 1024)); } });
          python.setStderr({ batched: (line) => { if (stderr.length < 200) stderr.push(line.slice(0, 1024)); } });
          self.postMessage({ ready: true });
          const results = [];
          const detail = (error) => String(error).trim().split("\\n").at(-1);
          try {
            await python.runPythonAsync(data.code, { filename: "solution.py" });
            for (const check of data.checks) {
              try {
                await python.runPythonAsync(check.code);
                results.push({ name: check.name, passed: true });
              } catch (error) {
                results.push({ name: check.name, passed: false, detail: detail(error) });
                stderr.push(String(error).slice(0, 4096));
                break;
              }
            }
          } catch (error) {
            results.push({ name: "Loads without errors", passed: false, detail: detail(error) });
            stderr.push(String(error).slice(0, 4096));
          }
          self.postMessage({ passed: results.length === data.checks.length && results.every((r) => r.passed),
            checks: results, stdout: stdout.join("\\n"), stderr: stderr.join("\\n") });
        } catch {
          self.postMessage({ error: "Could not start browser Python. Check your connection or open Local Studio." });
        }
      };`;
    const bootstrap = `
      addEventListener("message", (event) => {
        if (event.source !== parent || !event.ports.length) return;
        const port = event.ports[0];
        const url = URL.createObjectURL(new Blob([${JSON.stringify(worker)}], {type: "text/javascript"}));
        const runner = new Worker(url);
        runner.onmessage = (event) => port.postMessage(event.data);
        runner.onerror = (event) => {
          event.preventDefault();
          port.postMessage({error: "Browser Python could not start."});
        };
        runner.postMessage(event.data);
      }, {once: true});`;
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; worker-src blob:; connect-src https://cdn.jsdelivr.net">
      <script>${bootstrap}<\/script>`;
    let timeout = setTimeout(() => finish(new Error("Browser Python took too long to load.")), 60000);
    function finish(err, result) {
      clearTimeout(timeout);
      channel.port1.close();
      frame.remove();
      if (err) reject(err);
      else resolve(result);
    }
    frame.onload = () => frame.contentWindow.postMessage({ code, checks }, "*", [channel.port2]);
    channel.port1.onmessage = ({ data }) => {
      if (data.ready) {
        clearTimeout(timeout);
        timeout = setTimeout(() => finish(new Error("Python took more than 15 seconds to finish.")), 15000);
      } else {
        finish(data.error ? new Error(data.error) : null, data);
      }
    };
    document.body.appendChild(frame);
  });
}

async function verifyCode(step, code) {
  const body = { step_id: step.id, challenge_id: step.challenge_id, code };
  if (!cloudCourse()) return api("/api/run_code", body);
  let result;
  if (await probeRunner()) {
    result = await request(RUNNER_URL + "/api/run_code", body, { signal: AbortSignal.timeout(25000) });
  } else {
    const checks = state.course.content.browser_checks?.[step.challenge_id];
    if (!NUMPY_CHALLENGES.has(step.challenge_id)) throw new Error("Requires local PyTorch runner: uv run rl-studio");
    if (!Array.isArray(checks) || !checks.length) throw new Error("Browser verification tests are missing for this course.");
    result = await runInBrowser(code, checks);
  }
  const progress = await updateCloudProgress("/api/run_code", { step_id: step.id, passed: result.passed });
  return { ...result, ...progress };
}

function patchRunnerCard(step) {
  const panel = document.getElementById("runner-card");
  const button = document.getElementById("btn-run-code");
  if (!panel || !button) return;
  const requiresRunner = cloudCourse() && !NUMPY_CHALLENGES.has(step.challenge_id) && !runnerAvailable;
  panel.hidden = !requiresRunner;
  button.disabled = requiresRunner;
}

function mountCodeEditor(step) {
  const shell = document.getElementById("code-shell");
  const ed = document.getElementById("code-editor");
  const gutter = document.getElementById("code-gutter");
  const status = document.getElementById("draft-status");
  const logs = document.getElementById("code-logs");
  const run = document.getElementById("btn-run-code");
  let cm = null;
  let tabReleased = false;
  let edited = false;
  const save = (code) => {
    edited = true;
    status.textContent = prefSet(draftKey(step), code) ? "Saved" : "Draft storage unavailable";
  };
  const syncGutter = () => {
    const lines = ed.value.split("\n").length;
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
    gutter.scrollTop = ed.scrollTop;
  };
  logs.onclick = (event) => {
    const line = Number(event.target.closest("[data-code-line]")?.dataset.codeLine);
    if (!line) return;
    if (cm) {
      if (line > cm.state.doc.lines) return;
      cm.dispatch({ selection: { anchor: cm.state.doc.line(line).from }, scrollIntoView: true });
      cm.focus();
    } else {
      const lines = ed.value.split("\n");
      if (line > lines.length) return;
      const start = line === 1 ? 0 : lines.slice(0, line - 1).join("\n").length + 1;
      ed.focus();
      ed.setSelectionRange(start, start + lines[line - 1].length);
      ed.scrollTop = Math.max(0, (line - 3) * parseFloat(getComputedStyle(ed).lineHeight));
    }
  };
  ed.value = prefGet(draftKey(step)) ?? step.starter_code ?? "";
  syncGutter();
  ed.onscroll = () => { gutter.scrollTop = ed.scrollTop; };
  ed.oninput = () => { save(ed.value); syncGutter(); };
  ed.onblur = () => { tabReleased = false; };
  ed.onkeydown = (event) => {
    if (event.key === "Escape") { tabReleased = true; return; }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      run.click();
      return;
    }
    const a = ed.selectionStart, b = ed.selectionEnd;
    const lineStart = a === 0 ? 0 : ed.value.lastIndexOf("\n", a - 1) + 1;
    const left = ed.value.slice(lineStart, a);
    if (event.key === "Tab" && !tabReleased) {
      event.preventDefault();
      if (event.shiftKey || ed.value.slice(a, b).includes("\n")) {
        const end = b > a && ed.value[b - 1] === "\n" ? b - 1 : b;
        const nextBreak = ed.value.indexOf("\n", end);
        const lineEnd = nextBreak < 0 ? ed.value.length : nextBreak;
        const affected = ed.value.slice(lineStart, lineEnd);
        const changed = event.shiftKey ? affected.replace(/^(?: {1,4}|\t)/gm, "") : affected.replace(/^/gm, "    ");
        if (affected === changed) return;
        ed.setSelectionRange(lineStart, lineEnd);
        document.execCommand("insertText", false, changed);
        if (a === b) ed.setSelectionRange(Math.max(lineStart, a + changed.length - affected.length), Math.max(lineStart, a + changed.length - affected.length));
        else ed.setSelectionRange(lineStart, lineStart + changed.length);
      } else {
        document.execCommand("insertText", false, "    ");
      }
    }
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      const indent = left.match(/^\s*/)[0] + (left.trimEnd().endsWith(":") ? "    " : "");
      document.execCommand("insertText", false, "\n" + indent);
    }
  };

  const reset = document.getElementById("btn-reset-code");
  const confirmation = document.getElementById("confirm-reset");
  const confirm = document.getElementById("btn-reset-confirm");
  reset.onclick = () => { confirmation.hidden = false; reset.hidden = true; confirm.focus(); };
  const cancel = () => { confirmation.hidden = true; reset.hidden = false; reset.focus(); };
  document.getElementById("btn-reset-cancel").onclick = cancel;
  confirm.onclick = () => {
    if (state.inFlight) return;
    const starter = step.starter_code || "";
    if (cm) cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: starter } });
    else {
      ed.focus();
      ed.select();
      if (!document.execCommand("insertText", false, starter)) ed.value = starter;
      syncGutter();
    }
    save(starter);
    delete state.stepFeedback[step.id];
    logs.replaceChildren();
    renderMissionFooter();
    cancel();
  };

  const checkRunner = document.getElementById("check-runner");
  checkRunner.onclick = () => guarded(checkRunner, async () => {
    if (await probeRunner()) toast("Local runner connected.");
    else toast("Start Local Studio with uv run rl-studio, then check again.");
    if (shell.isConnected) patchRunnerCard(step);
  });
  if (cloudCourse()) {
    patchRunnerCard(step);
    probeRunner().then(() => { if (shell.isConnected && !state.inFlight) patchRunnerCard(step); });
  }
  run.onclick = () => guarded(run, async () => {
    const expectedStepId = step.id;
    primeAudio();
    run.textContent = "Running…";
    try {
      const res = await verifyCode(step, cm ? cm.state.doc.toString() : ed.value);
      if (!shell.isConnected || currentStepId() !== expectedStepId) return;
      state.stepFeedback[step.id] = res;
      state.data = res.state;
      if (res.passed) {
        state.combo++;
        handleXp(res.xp, run, "code_pass");
        unlockAchievement("code_cracker");
      } else {
        state.combo = 0;
        playSound("miss");
      }
      logs.innerHTML = codeResultsHtml(res);
      renderTopbar();
      renderMissionFooter();
    } catch (err) {
      if (!shell.isConnected || currentStepId() !== expectedStepId) return;
      logs.innerHTML = codeResultsHtml({ passed: false, checks: [{ name: "Run could not finish", passed: false, detail: err.message }] });
    } finally {
      run.innerHTML = RUN_LABEL;
      if (logs.isConnected) logs.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "instant" : "smooth" });
    }
  }).finally(() => { if (cloudCourse() && shell.isConnected && !state.inFlight) patchRunnerCard(step); });

  editorModules ??= Promise.all([
    import("https://esm.sh/codemirror@6.0.1" + CM_DEPS),
    import("https://esm.sh/@codemirror/lang-python@6.1.6" + CM_DEPS),
    import("https://esm.sh/@codemirror/theme-one-dark@6.1.2" + CM_DEPS),
    import("https://esm.sh/@codemirror/view@6.44.0?deps=@codemirror/state@6.7.6"),
    import("https://esm.sh/@codemirror/commands@6.11.2" + CM_DEPS),
    import("https://esm.sh/@codemirror/state@6.7.6"),
  ]).catch(() => null);
  editorModules.then((modules) => {
    if (!modules || !shell.isConnected || edited || document.activeElement === ed) return;
    const [{ basicSetup }, { python }, { oneDark }, { EditorView, keymap },
      { indentMore, indentLess }, { Compartment }] = modules;
    const theme = new Compartment();
    try {
      cm = new EditorView({
        doc: ed.value,
        parent: shell,
        extensions: [
          basicSetup, python(), theme.of(state.theme === "dark" ? oneDark : []),
          EditorView.contentAttributes.of({ "aria-label": "Python code editor", "aria-describedby": "editor-help", spellcheck: "false" }),
          EditorView.updateListener.of((update) => { if (update.docChanged) save(update.state.doc.toString()); }),
          keymap.of([
            { key: "Mod-Enter", run: () => { run.click(); return true; } },
            { key: "Tab", run: (view) => tabReleased ? false : indentMore(view), shift: (view) => tabReleased ? false : indentLess(view) },
          ]),
          EditorView.domEventHandlers({
            keydown(event) { if (event.key === "Escape") tabReleased = true; },
            blur() { tabReleased = false; },
          }),
        ],
      });
      shell.classList.add("cm-ready");
      activeEditor = { view: cm, setTheme: () => cm.dispatch({ effects: theme.reconfigure(state.theme === "dark" ? oneDark : []) }) };
    } catch (_) {
      shell.querySelector(".cm-editor")?.remove();
      cm = null;
    }
  });
}

function mountLab(step) {
  const out = document.getElementById("lab-output");
  const status = document.getElementById("lab-status");
  const run = document.getElementById("btn-run-lab");
  const select = document.getElementById("lab-bug-select");
  const showSnapshot = () => {
    const snapshots = state.course?.content.lab_snapshots;
    const entry = (select && snapshots?.[step.lab_type + ":" + select.value]) || snapshots?.[step.lab_type];
    const snapshot = entry?.result || (entry?.lab_type && !entry.error ? entry : null);
    if (!snapshot) {
      out.replaceChildren();
      status.textContent = "No precomputed run is available. Start Local Studio to run this lab.";
      return false;
    }
    try {
      renderLabResult(snapshot, out);
      status.textContent = "Showing precomputed PyTorch run — run uv run rl-studio locally for live custom params";
      return true;
    } catch (_) {
      status.textContent = "The precomputed run could not be displayed.";
      return false;
    }
  };
  if (state.labCache[step.id]?.lab_type) renderLabResult(state.labCache[step.id], out);
  else if (cloudCourse()) showSnapshot();
  if (select) select.onchange = () => {
    if (cloudCourse() && !runnerAvailable) showSnapshot();
  };
  run.onclick = () => guarded(run, async () => {
    const expectedStepId = step.id;
    primeAudio();
    run.textContent = "Simulating…";
    try {
      if (cloudCourse() && !(await probeRunner())) {
        if (out.isConnected && currentStepId() === expectedStepId && showSnapshot()) {
          state.labCache[step.id] = { snapshot: true };
          renderMissionFooter();
        }
        return;
      }
      const params = select ? { bug: select.value } : {};
      const body = { lab_type: step.lab_type, params };
      const res = cloudCourse()
        ? await request(RUNNER_URL + "/api/run_lab", body, { signal: AbortSignal.timeout(120000) })
        : await api("/api/run_lab", body);
      if (!out.isConnected || currentStepId() !== expectedStepId) return;
      renderLabResult(res, out);
      state.labCache[step.id] = res;
      status.textContent = "";
      playSound("correct");
      renderMissionFooter();
    } catch (err) {
      if (out.isConnected && currentStepId() === expectedStepId) status.textContent = err.message;
    } finally {
      run.innerHTML = `${ICONS.play} Run PyTorch Simulation`;
    }
  });
}

init();
