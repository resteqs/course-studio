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

function prefRemove(key) {
  try {
    localStorage.removeItem("course_studio_" + key);
    localStorage.removeItem("schlossallee_" + key);
  } catch (_) {}
}

function userScope() {
  return state.sbUser?.id ? "u_" + encodeURIComponent(state.sbUser.id) : "local";
}

function clearUserStorage(purgeUserId = null) {
  ["achievements", "reviewed_cards", "mascot_color", "mascot_accessory", "mascot_shape"].forEach(prefRemove);
  if (!purgeUserId) return;
  const scope = "u_" + encodeURIComponent(purgeUserId) + "_";
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("course_studio_draft_" + scope) || k.startsWith("course_studio_bet_" + scope))) {
        localStorage.removeItem(k);
      }
    }
  } catch (_) {}
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

// The 3D lip is derived from the final banner color so every unit keeps a visible ledge.
function bannerLipColor(bgHex) {
  return "#" + colorHex(bgHex).slice(1).match(/../g)
    .map((part) => Math.round(parseInt(part, 16) * 0.7).toString(16).padStart(2, "0")).join("");
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
  { id: "sky", name: "Sky", body: "#0EA5E9", shade: "#0369A1", hi: "#BAE6FD" },
  { id: "coral", name: "Coral", body: "#F43F5E", shade: "#BE123C", hi: "#FDA4AF" },
  { id: "amber", name: "Amber", body: "#F59E0B", shade: "#B45309", hi: "#FDE68A" },
  { id: "violet", name: "Violet", body: "#8B5CF6", shade: "#6D28D9", hi: "#DDD6FE" },
  { id: "teal", name: "Teal", body: "#14B8A6", shade: "#0F766E", hi: "#99F6E4" },
  { id: "rose", name: "Rose", body: "#EC4899", shade: "#BE185D", hi: "#FBCFE8" },
  { id: "mint", name: "Mint", body: "#6EE7B7", shade: "#10B981", hi: "#ECFDF5" },
  { id: "cobalt", name: "Cobalt", body: "#2563EB", shade: "#1E40AF", hi: "#BFDBFE" },
  { id: "gold", name: "Gold", body: "#EAB308", shade: "#A16207", hi: "#FEF08A" },
  { id: "crimson", name: "Crimson", body: "#DC2626", shade: "#991B1B", hi: "#FECACA" },
  { id: "obsidian", name: "Obsidian", body: "#334155", shade: "#0F172A", hi: "#94A3B8" },
];

// Fallback rank rewards, mirroring dopamine.LEVEL_REWARDS (the local server sends the same list).
const DEFAULT_LEVEL_REWARDS = [
  { level: 1, threshold: 0, accessory: "none", shapes: ["cube"], colors: ["indigo", "emerald", "sky"], label: "Classic Cube (Indigo, Emerald & Sky)" },
  { level: 2, threshold: 80, accessory: "headphones", shapes: ["orb"], colors: ["coral", "amber"], label: "Headphones, Orb shape & Coral/Amber" },
  { level: 3, threshold: 180, accessory: "glasses", shapes: [], colors: ["violet", "teal"], label: "Cool Glasses & Violet/Teal" },
  { level: 4, threshold: 300, accessory: "beanie", shapes: ["prism"], colors: ["rose"], label: "Cozy Beanie, Triangle Prism & Rose" },
  { level: 5, threshold: 440, accessory: "gradcap", shapes: [], colors: ["mint"], label: "Graduation Cap & Mint" },
  { level: 6, threshold: 600, accessory: "bowtie", shapes: ["hexagon"], colors: ["cobalt"], label: "Bow Tie, Hexagon shape & Cobalt" },
  { level: 7, threshold: 780, accessory: "visor", shapes: [], colors: ["gold"], label: "Cyber Visor & Gold" },
  { level: 8, threshold: 980, accessory: "wizard", shapes: ["diamond"], colors: ["crimson"], label: "Wizard Hat, Diamond shape & Crimson" },
  { level: 9, threshold: 1200, accessory: "aura", shapes: [], colors: ["obsidian"], label: "Golden Sparkle Aura & Obsidian" },
  { level: 10, threshold: 1450, accessory: "crown", shapes: [], colors: [], label: "Royal Crown" },
];
const ACCESSORY_NAMES = {
  none: "Classic", headphones: "Headphones", glasses: "Cool Glasses", beanie: "Cozy Beanie", gradcap: "Grad Cap",
  bowtie: "Bow Tie", visor: "Cyber Visor", wizard: "Wizard Hat", aura: "Sparkle Aura", crown: "Royal Crown",
};
const MASCOT_SHAPES = [
  { id: "cube", name: "Cube" },
  { id: "orb", name: "Orb" },
  { id: "prism", name: "Prism" },
  { id: "hexagon", name: "Hexagon" },
  { id: "diamond", name: "Diamond" },
];

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
  // Anki Cards session state
  drillCards: [],
  drillIdx: 0,
  drillRevealed: false,
  drillSessionXp: 0,
  drillGoodCount: 0,
  drillCombo: 0,
  drillMood: "thinking",
  masteryOpen: false,
  achShowAll: false,
  reviewedCards: Number(prefGet("reviewed_cards")) || 0,
  // Inline End-of-Unit Recall Sprint state (per district id)
  unitSprint: Object.create(null),
  combo: 0,
  theme: prefGet("theme") === "light" ? "light" : "dark",
  mascotColor: prefGet("mascot_color") || "#4F46E5",
  mascotAccessory: prefGet("mascot_accessory") || "none",
  mascotShape: prefGet("mascot_shape") || "cube",
  achievements: loadAchievements(),
  timer: { mode: "focus", total: 1500, left: 1500, running: false, interval: null, popoverOpen: false, cycle: 0 },
  speechTimer: null,
  sbClient: null,
  sbUser: null,
  sbProfile: null,
  passwordRecovery: false,
  authNotice: null,
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
  { id: "first_step", title: "First Move", desc: "Complete your first lesson step", icon: "star", xp: 15 },
  { id: "combo_3", title: "On a Roll", desc: "Hit a 3× correct answer streak", icon: "flame", xp: 20 },
  { id: "combo_5", title: "Unstoppable", desc: "Hit a 5× correct answer streak", icon: "flame", xp: 35 },
  { id: "code_cracker", title: "Code Cracker", desc: "Pass your first code exercise", icon: "code", xp: 30 },
  { id: "lab_explorer", title: "Lab Explorer", desc: "Complete an interactive lab", icon: "sliders", xp: 25 },
  { id: "card_shark", title: "Card Shark", desc: "Review 10 Anki cards", icon: "cards", xp: 25 },
  { id: "sprint_done", title: "Deep Focus", desc: "Complete a Pomodoro focus session", icon: "clock", xp: 25 },
  { id: "style_icon", title: "Style Icon", desc: "Customize your Kubo's look", icon: "gift", xp: 15 },
  { id: "district_clear", title: "Unit Complete", desc: "Complete all steps in a unit", icon: "crown", xp: 40 },
  { id: "halfway_hero", title: "Halfway Hero", desc: "Complete half of the course", icon: "target", xp: 50 },
  { id: "ppo_boss", title: "PPO Master", desc: "Complete Unit 5 (PPO Deep Dive)", icon: "bolt", xp: 75 },
  { id: "full_mastery", title: "Full Mastery", desc: "Complete every step in the course", icon: "check", xp: 100 },
];

function paletteForColor(hex) {
  return MASCOT_PALETTES.find((p) => p.body.toLowerCase() === String(hex || "").toLowerCase()) || MASCOT_PALETTES[0];
}

function applyUserMascotColor(hex) {
  const p = paletteForColor(hex);
  state.mascotColor = p.body;
  prefSet("mascot_color", p.body);
  document.documentElement.style.setProperty("--mascot-body", p.body);
  document.documentElement.style.setProperty("--mascot-shade", p.shade);
  document.documentElement.style.setProperty("--mascot-highlight", p.hi);
}
applyUserMascotColor(state.mascotColor);
if (state.theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
else document.documentElement.removeAttribute("data-theme");

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

function isShapeUnlocked(shapeId) {
  if (!MASCOT_SHAPES.some((x) => x.id === shapeId)) return false;
  const r = levelRewards().find((x) => (x.shapes || []).includes(shapeId));
  return !r || currentXp() >= r.threshold;
}

function shapeUnlockReward(shapeId) {
  return levelRewards().find((x) => (x.shapes || []).includes(shapeId)) || levelRewards()[0];
}

function equippedShape() {
  return isShapeUnlocked(state.mascotShape) ? state.mascotShape : "cube";
}

function applyUserShape(shape) {
  state.mascotShape = MASCOT_SHAPES.some((x) => x.id === shape) ? shape : "cube";
  prefSet("mascot_shape", state.mascotShape);
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
  prefSet("mascot_accessory", valid);
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
  eye: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.1 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.3 3.1"/><path d="M6.6 6.9C4 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.9-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/></svg>`,
  mail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7.5 8 5.5 8-5.5"/></svg>`,
  alert: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.2M12 16.3v.2"/></svg>`,
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.7v.2"/></svg>`,
  checkCircle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.3 12.3 2.6 2.6 4.9-5.3"/></svg>`,
  chevronDown: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
  chevronRight: `<svg class="unlock-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
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
  if (acc === "beanie") {
    return {
      back: "",
      front: `<path d="M15 14C15 2.5 49 2.5 49 14Z" fill="#2563EB"/>
        <path d="M24 6.5c-.6 2.4-.8 4.8-.6 7.5M32 4.6v9.4M40 6.5c.6 2.4.8 4.8.6 7.5" stroke="#1E40AF" stroke-width="1.4" stroke-linecap="round" fill="none"/>
        <rect x="13" y="12" width="38" height="6.5" rx="3.25" fill="#1E40AF"/>
        <circle cx="32" cy="3.4" r="3.4" fill="#F8FAFC"/>`,
      head: true,
    };
  }
  if (acc === "bowtie") {
    return {
      back: "",
      front: `<path d="M31 47.4 22.6 42.8v9.2Z M33 47.4l8.4-4.6v9.2Z" fill="#E11D48" stroke="#9F1239" stroke-width="1.2" stroke-linejoin="round"/>
        <rect x="29.6" y="45.1" width="4.8" height="4.6" rx="1.4" fill="#9F1239"/>`,
      head: false,
    };
  }
  if (acc === "visor") {
    return {
      back: "",
      front: `<rect x="12" y="24.2" width="40" height="11.6" rx="5.8" fill="#0EA5E9" fill-opacity="0.55" stroke="#0369A1" stroke-width="1.6"/>
        <path d="M16.5 27.6h12" stroke="#E0F2FE" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>`,
      head: false,
    };
  }
  if (acc === "wizard") {
    return {
      back: "",
      front: `<path d="M33 -5 46.5 13.2H17.5Z" fill="#6D28D9" stroke="#4C1D95" stroke-width="1.2" stroke-linejoin="round"/>
        <ellipse cx="32" cy="13.4" rx="19" ry="3.3" fill="#4C1D95"/>
        <path d="M30 3.6l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z" fill="#FBBF24"/>`,
      head: true,
    };
  }
  return { back: "", front: "", head: false };
}

// Each shape: body path, its 3D shade (same path, lower), a specular highlight, and offsets
// that keep the face and head accessories seated on the silhouette.
const SHAPE_GEOMETRY = {
  cube: {
    body: (fill, dy) => `<rect x="9" y="${10 + dy}" width="46" height="40" rx="15" fill="${fill}"/>`,
    hi: "M17 15.5c4-2.5 26-2.5 30 0",
    face: 0, head: 0,
  },
  orb: {
    body: (fill, dy) => `<circle cx="32" cy="${31 + dy}" r="22.5" fill="${fill}"/>`,
    hi: "M20.5 16.5c6-4.6 17-4.6 23 0",
    face: 0, head: -0.5,
  },
  prism: {
    body: (fill, dy) => `<path d="M32 ${7.5 + dy} 57 ${50 + dy}H7Z" fill="${fill}" stroke="${fill}" stroke-width="7" stroke-linejoin="round"/>`,
    hi: "M27.6 15.4c2.4-3.4 6.4-3.4 8.8 0",
    face: 4, head: -3,
  },
  hexagon: {
    body: (fill, dy) => `<path d="M32 ${8 + dy} 51.5 ${19 + dy}v22L32 ${52 + dy} 12.5 ${41 + dy}v-22Z" fill="${fill}" stroke="${fill}" stroke-width="5" stroke-linejoin="round"/>`,
    hi: "M21.5 18.4 32 12.4l10.5 6",
    face: 0, head: -2,
  },
  diamond: {
    body: (fill, dy) => `<rect x="14" y="${13 + dy}" width="36" height="36" rx="10" transform="rotate(45 32 ${31 + dy})" fill="${fill}"/>`,
    hi: "M25.5 13.6c3-3.4 10-3.4 13 0",
    face: 1, head: -3,
  },
};

function mascotHtml(mood = "idle", size = 56, customColor = null, speaking = false, idAttr = "", accessory = null, shape = null) {
  const pal = customColor ? paletteForColor(customColor) : null;
  const colorVars = pal ? `style="--kb:${pal.body}; --ks:${pal.shade}; --kh:${pal.hi};"` : "";
  const acc = accessory !== null ? accessory : (customColor ? "none" : equippedAccessory());
  const layers = accessoryLayers(Object.hasOwn(ACCESSORY_NAMES, acc) ? acc : "none");
  const shapeId = shape !== null ? shape : (customColor ? "cube" : equippedShape());
  const geo = SHAPE_GEOMETRY[shapeId] || SHAPE_GEOMETRY.cube;

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
    <span ${idAttr ? `id="${idAttr}"` : ""} class="kubo-wrap mood-${mood} acc-${acc} shape-${shapeId} ${speaking ? "speaking" : ""}" ${colorVars} aria-hidden="true">
      <svg class="kubo-svg" viewBox="0 0 64 60" width="${size}" height="${Math.round(size * 0.94)}" fill="none">
        ${layers.back}
        <ellipse cx="32" cy="56" rx="18" ry="3.5" fill="currentColor" opacity="0.12"/>
        <g class="kubo-body-group">
          ${geo.body("var(--kubo-shade)", 3)}
          ${geo.body("var(--kubo-body)", 0)}
          <path d="${geo.hi}" stroke="var(--kubo-hi)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/>
          <g class="kubo-face" transform="translate(0 ${geo.face})">${eyesEl}${restMouth}${talkMouth}</g>
          <g transform="translate(0 ${layers.head ? geo.head : geo.face})">${layers.front}</g>
          ${crown ? `<g transform="translate(0 ${geo.head})">${crown}</g>` : ""}
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

// A 20ms filtered noise tick: the fallback tap must never sound like a beep.
function playClick(ctx) {
  const length = Math.round(ctx.sampleRate * 0.02);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  gain.gain.value = 0.18;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioMaster || ctx.destination);
  source.start();
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
      playClick(ctx);
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
  prefSet("achievements", JSON.stringify(state.achievements));
  playSound("achievement");
  const el = document.createElement("div");
  el.className = "toast-achievement";
  el.innerHTML = `${mascotHtml("proud", 44)}<div class="toast-ach-copy"><div class="toast-ach-kicker">Achievement unlocked</div><div class="toast-ach-title">${esc(def.title)}</div><div class="toast-ach-sub">${esc(def.desc)}</div></div><span class="toast-ach-xp">+${def.xp} XP</span>`;
  document.getElementById("toast-container").appendChild(el);
  spawnSparkles(el, 18);
  setTimeout(() => el.remove(), 4600);
  claimAchievementXp(def);
}

// Awards the achievement XP once per progress record (event "ach-<id>"), locally or in the cloud course.
async function claimAchievementXp(def) {
  if (!state.data || state.data.gamification.completed_events.includes(`ach-${def.id}`)) {
    syncProgressToSupabase();
    return;
  }
  const course = state.course;
  try {
    const res = await api("/api/achievement/claim", { achievement_id: def.id });
    if (state.course !== course || !res?.state) return;
    state.data = res.state;
    if (state.data && !state.passwordRecovery && state.view !== "courses") {
      renderTopbar();
      if (state.view === "map") renderMap();
    }
  } catch (err) {
    toast(err.message || "Achievement XP could not be saved.");
  }
  syncProgressToSupabase();
}

function stepCounts() {
  const all = state.data.districts.flatMap((d) => d.steps);
  return { total: all.length, done: all.filter((s) => isStepDone(s.id)).length };
}

function checkProgressAchievements() {
  if (!state.data) return;
  const { total, done } = stepCounts();
  if (done >= 1) unlockAchievement("first_step");
  if (state.combo >= 3) unlockAchievement("combo_3");
  if (state.combo >= 5) unlockAchievement("combo_5");
  if (state.data.districts.some((d) => d.steps.every((s) => isStepDone(s.id)))) unlockAchievement("district_clear");
  const ppo = state.data.districts.find((d) => d.id === "M4") || state.data.districts[4];
  if (ppo && ppo.steps.every((s) => isStepDone(s.id))) unlockAchievement("ppo_boss");
  if (total && done * 2 >= total) unlockAchievement("halfway_hero");
  if (total && done === total) unlockAchievement("full_mastery");
}

function countCardReview() {
  state.reviewedCards += 1;
  prefSet("reviewed_cards", String(state.reviewedCards));
  if (state.reviewedCards >= 10) unlockAchievement("card_shark");
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
  const callback = readAuthRedirect();
  try {
    // The URL callback is handled explicitly below, so a failed link never falls back to a cached session.
    state.sbClient = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { detectSessionInUrl: false } });
    state.sbClient.auth.onAuthStateChange?.((event, session) => {
      if (event === "PASSWORD_RECOVERY") setTimeout(() => enterPasswordRecovery(session), 0);
      if (event === "SIGNED_OUT" && state.sbUser) setTimeout(() => {
        if (state.sbUser) clearSession().catch((err) => toast(err.message));
      }, 0);
    });
    const { session, failed } = callback.present
      ? await consumeAuthCallback(callback).catch(() => ({ session: null, failed: true }))
      : await cachedSession();
    if (callback.present || callback.stray) history.replaceState(null, "", authRedirectUrl());
    if (failed) {
      setRecoveryFlag(false);
      state.authNotice = callbackFailureNotice(callback);
      return;
    }
    if (!session?.user) {
      setRecoveryFlag(false);
      return;
    }
    state.sbUser = session.user;
    if (callback.present && callback.recovery) setRecoveryFlag(true, session.user.id);
    else if (!callback.present && recoveryFlagStored(session.user.id)) state.passwordRecovery = true;
    else setRecoveryFlag(false);
    if (!state.passwordRecovery) await loadCloudProfileAndFriends();
  } catch (_) {
    state.sbClient = null;
  }
}

async function cachedSession() {
  const { data, error } = await state.sbClient.auth.getSession();
  return { session: error ? null : data?.session ?? null, failed: false };
}

// Establishes the session the email link carries. Any failure is reported, never papered over.
async function consumeAuthCallback(callback) {
  if (callback.error) return { session: null, failed: true };
  const auth = state.sbClient.auth;
  let result = null;
  if (callback.accessToken && callback.refreshToken) {
    result = await auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
  } else if (callback.code && typeof auth.exchangeCodeForSession === "function") {
    result = await auth.exchangeCodeForSession(callback.code);
  } else if (callback.tokenHash) {
    result = await auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.recovery ? "recovery" : callback.type || "email" });
  }
  const session = result?.data?.session ?? null;
  return { session, failed: Boolean(!result || result.error || !session?.user) };
}

function callbackFailureNotice(callback) {
  if (callback.recovery || /otp_expired|expired|invalid|access_denied/.test(callback.error)) {
    return { tone: "err", mode: "reset", text: "That reset link has expired or could not be verified. Enter your email to get a fresh one." };
  }
  return { tone: "err", mode: "sign-in", text: "We couldn't verify that email link. Sign in, or request a new link." };
}

async function loadCloudProfileAndFriends() {
  if (!state.sbClient || !state.sbUser) return;
  const { data: prof } = await state.sbClient.from("profiles").select("*").eq("id", state.sbUser.id).maybeSingle();
  if (prof) {
    state.sbProfile = prof;
    applyUserMascotColor(prof.mascot_color || "#4F46E5");
    applyUserAccessory(prof.mascot_accessory || "none");
    applyUserShape(prof.mascot_shape || "cube");
    state.achievements = Array.isArray(prof.achievements) ? [...prof.achievements] : [];
    prefSet("achievements", JSON.stringify(state.achievements));
  }
  const { data: edges } = await state.sbClient
    .from("friendships")
    .select("user_id, friend_id")
    .or(`user_id.eq.${state.sbUser.id},friend_id.eq.${state.sbUser.id}`);
  const friendIds = Array.from(new Set((edges || []).map((e) => (e.user_id === state.sbUser.id ? e.friend_id : e.user_id))));
  if (friendIds.length) {
    const { data: fProfs } = await state.sbClient
      .from("profiles")
      .select("id, username, display_name, mascot_color, mascot_accessory, mascot_shape, xp, streak_days, current_step_id")
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
        mascot_shape: state.mascotShape,
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
  const authTheme = document.getElementById("auth-theme");
  if (authTheme) {
    // Swap only the icon so anything typed into the auth form survives the theme change.
    authTheme.innerHTML = state.theme === "dark" ? ICONS.sun : ICONS.moon;
    authTheme.setAttribute("aria-label", state.theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    return;
  }
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
    toast(`Rank up: ${xp.level} (+${xp.gained} XP)${reward && reward.level > 1 ? `, unlocked ${reward.label}` : ""}`);
  } else if (xp && xp.gained > 0) {
    if (soundKind) playSound(soundKind, state.combo);
    spawnSparkles(anchorEl, 14);
    spawnXpFloat(state.combo >= 2 ? `+${xp.gained} XP (${state.combo}×)` : `+${xp.gained} XP`, anchorEl);
  } else {
    if (soundKind) playSound(soundKind, state.combo);
    spawnSparkles(anchorEl, 10);
  }
  checkProgressAchievements();
  syncProgressToSupabase();
}

// Pomodoro focus timer
const TIMER_MODES = {
  focus: { tab: "Focus", title: "Focus session", minutes: 25 },
  short: { tab: "Short break", title: "Short break", minutes: 5 },
  long: { tab: "Long break", title: "Long break", minutes: 15 },
};
const TIMER_PRESETS = [5, 15, 25, 45];
const RING_RADIUS = 64;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
state.timer.durations = { focus: 25, short: 5, long: 15 };

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function stopTimerInterval() {
  clearInterval(state.timer.interval);
  state.timer.interval = null;
  state.timer.running = false;
}

function setTimerMode(mode) {
  stopTimerInterval();
  state.timer.mode = mode;
  state.timer.total = state.timer.durations[mode] * 60;
  state.timer.left = state.timer.total;
  patchTimerUi();
}

function setTimerMinutes(mins) {
  state.timer.durations[state.timer.mode] = Math.max(1, Math.min(180, Math.round(mins)));
  setTimerMode(state.timer.mode);
}

function claimFocusSprint(course, minutes) {
  if (state.course !== course || !state.data) return;
  if (state.inFlight) {
    setTimeout(() => claimFocusSprint(course, minutes), 150);
    return;
  }
  guarded(null, async () => {
    const res = await api("/api/sprint/claim", { minutes });
    if (state.course !== course) return;
    state.data = res.state;
    toast(`Focus session complete: +${res.xp?.gained ?? 0} XP`);
    unlockAchievement("sprint_done");
    if (state.view !== "courses") renderTopbar();
  });
}

function finishTimerSession(course) {
  stopTimerInterval();
  if (state.timer.mode === "focus") {
    state.timer.cycle = Math.min(4, state.timer.cycle + 1);
    playSound("timer");
    claimFocusSprint(course, Math.round(state.timer.total / 60));
    setTimerMode(state.timer.cycle >= 4 ? "long" : "short");
  } else {
    playSound("continue");
    if (state.timer.mode === "long") state.timer.cycle = 0;
    setTimerMode("focus");
  }
}

function toggleTimer() {
  if (state.timer.running) {
    stopTimerInterval();
  } else {
    state.timer.running = true;
    const course = state.course;
    const endsAt = Date.now() + state.timer.left * 1000;
    state.timer.interval = setInterval(() => {
      state.timer.left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (state.timer.left <= 0) finishTimerSession(course);
      else patchTimerUi();
    }, 1000);
  }
  patchTimerUi();
}

function resetTimer() {
  stopTimerInterval();
  state.timer.left = state.timer.total;
  patchTimerUi();
}

function timerWidgetHtml() {
  const t = state.timer;
  const mode = TIMER_MODES[t.mode];
  const dots = Array.from({ length: 4 }, (_, i) => `<span class="pomo-dot ${i < t.cycle ? "done" : ""}"></span>`).join("");
  const popover = `<div id="timer-popover" class="timer-popover" data-open="${t.popoverOpen}" ${t.popoverOpen ? "" : "inert"} role="dialog" aria-label="Pomodoro timer">
      <div class="pomo-tabs" role="group" aria-label="Timer mode">
        ${Object.entries(TIMER_MODES).map(([id, m]) => `<button type="button" class="pomo-tab" data-mode="${id}" aria-pressed="${t.mode === id}">${m.tab}</button>`).join("")}
      </div>
      <div class="pomo-ring-wrap">
        <svg class="pomo-ring" viewBox="0 0 148 148" width="148" height="148" aria-hidden="true">
          <circle class="pomo-track" cx="74" cy="74" r="${RING_RADIUS}"/>
          <circle id="pomo-arc" class="pomo-arc ${t.mode === "focus" ? "" : "break"}" cx="74" cy="74" r="${RING_RADIUS}" transform="rotate(-90 74 74)"
            stroke-dasharray="${RING_LENGTH.toFixed(2)}" stroke-dashoffset="${(RING_LENGTH * (1 - t.left / t.total)).toFixed(2)}"/>
        </svg>
        <div class="pomo-readout">
          <span id="pomo-time" class="pomo-time">${formatTime(t.left)}</span>
          <span id="pomo-mode" class="pomo-mode">${mode.title}</span>
        </div>
      </div>
      <div class="pomo-controls">
        <button type="button" id="pomo-toggle" class="btn-tactile go pill">${t.running ? "Pause" : "Start"}</button>
        <button type="button" id="pomo-reset" class="btn-tactile secondary pill">Reset</button>
      </div>
      <div class="pomo-cycle">
        <span class="pomo-dots" aria-label="${t.cycle} of 4 focus sessions done">${dots}</span>
        <span id="pomo-note" class="pomo-note" ${t.mode === "focus" ? "" : "hidden"}>+25 XP on completion</span>
      </div>
      <details class="pomo-custom">
        <summary>Session length</summary>
        <div class="timer-presets">
          ${TIMER_PRESETS.map((m) => `<button type="button" class="timer-preset-btn" data-mins="${m}" aria-pressed="${t.durations[t.mode] === m}">${m}m</button>`).join("")}
        </div>
        <div class="timer-custom-row">
          <input id="timer-custom-in" aria-label="Custom session length in minutes" class="timer-custom-input" type="text" inputmode="numeric" placeholder="Minutes" value="${t.durations[t.mode]}"/>
          <button type="button" id="timer-custom-set" class="timer-set-btn">Set</button>
        </div>
      </details>
      <div id="timer-feedback" role="status" class="modal-msg"></div>
    </div>`;

  return `
    <div class="timer-anchor" id="timer-anchor">
      <div class="timer-capsule ${t.running ? "running" : ""}">
        <button id="timer-open-pop" class="timer-time-btn" aria-label="Open Pomodoro timer" aria-expanded="${t.popoverOpen}" aria-controls="timer-popover" aria-haspopup="dialog">
          ${ICONS.clock}
          <span id="timer-readout" class="timer-readout">${formatTime(t.left)}</span>
        </button>
        <button id="timer-toggle" class="timer-act-btn ${t.running ? "active" : ""}" aria-label="${t.running ? "Pause" : "Start"} timer">
          ${t.running ? ICONS.pause : ICONS.play}
        </button>
      </div>
      ${popover}
    </div>`;
}

// Updates the capsule and the open panel in place so focus and the open <details> survive every tick.
function patchTimerUi() {
  const t = state.timer;
  const readout = document.getElementById("timer-readout");
  if (readout) readout.textContent = formatTime(t.left);
  document.querySelector(".timer-capsule")?.classList.toggle("running", t.running);
  const tog = document.getElementById("timer-toggle");
  if (tog) {
    tog.classList.toggle("active", t.running);
    tog.setAttribute("aria-label", `${t.running ? "Pause" : "Start"} timer`);
    tog.innerHTML = t.running ? ICONS.pause : ICONS.play;
  }
  const pop = document.getElementById("timer-popover");
  if (!pop) return;
  pop.querySelector("#pomo-time").textContent = formatTime(t.left);
  pop.querySelector("#pomo-mode").textContent = TIMER_MODES[t.mode].title;
  const arc = pop.querySelector("#pomo-arc");
  arc.setAttribute("stroke-dashoffset", (RING_LENGTH * (1 - t.left / t.total)).toFixed(2));
  arc.classList.toggle("break", t.mode !== "focus");
  pop.querySelector("#pomo-toggle").textContent = t.running ? "Pause" : "Start";
  pop.querySelector("#pomo-note").hidden = t.mode !== "focus";
  pop.querySelectorAll(".pomo-tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === t.mode)));
  pop.querySelectorAll("[data-mins]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.mins) === t.durations[t.mode])));
  pop.querySelectorAll(".pomo-dot").forEach((d, i) => d.classList.toggle("done", i < t.cycle));
  pop.querySelector(".pomo-dots").setAttribute("aria-label", `${t.cycle} of 4 focus sessions done`);
  const input = pop.querySelector("#timer-custom-in");
  if (document.activeElement !== input) input.value = t.durations[t.mode];
}

function bindTimerControls() {
  const openBtn = document.getElementById("timer-open-pop");
  if (openBtn) {
    openBtn.onclick = (e) => {
      e.stopPropagation();
      closeMapPopovers();
      state.timer.popoverOpen = !state.timer.popoverOpen;
      patchTimerPopover();
    };
  }
  const tog = document.getElementById("timer-toggle");
  if (tog) tog.onclick = (e) => { e.stopPropagation(); toggleTimer(); };

  const pop = document.getElementById("timer-popover");
  if (!pop) return;
  pop.onclick = (e) => e.stopPropagation();
  pop.querySelectorAll(".pomo-tab").forEach((b) => { b.onclick = () => setTimerMode(b.dataset.mode); });
  pop.querySelector("#pomo-toggle").onclick = toggleTimer;
  pop.querySelector("#pomo-reset").onclick = resetTimer;
  pop.querySelectorAll("[data-mins]").forEach((b) => { b.onclick = () => setTimerMinutes(Number(b.dataset.mins)); });
  const inp = pop.querySelector("#timer-custom-in");
  const feedback = pop.querySelector("#timer-feedback");
  inp.oninput = () => {
    inp.removeAttribute("aria-invalid");
    feedback.textContent = "";
  };
  const applyCustom = () => {
    const n = Number((inp.value || "").trim());
    if (Number.isInteger(n) && n >= 1 && n <= 180) {
      setTimerMinutes(n);
      return;
    }
    inp.setAttribute("aria-invalid", "true");
    feedback.textContent = "Enter a whole number from 1 to 180.";
    inp.focus();
  };
  pop.querySelector("#timer-custom-set").onclick = applyCustom;
  inp.onkeydown = (e) => { if (e.key === "Enter") applyCustom(); };
}

function patchTimerPopover(restoreFocus = false) {
  const pop = document.getElementById("timer-popover");
  const trigger = document.getElementById("timer-open-pop");
  if (!pop || !trigger) return;
  pop.dataset.open = String(state.timer.popoverOpen);
  pop.inert = !state.timer.popoverOpen;
  trigger.setAttribute("aria-expanded", String(state.timer.popoverOpen));
  if (state.timer.popoverOpen) pop.querySelector("button")?.focus({ preventScroll: true });
  else if (restoreFocus) trigger.focus();
}

// Course-map "Jump to" popovers
function closeMapPopovers(restoreFocus = false) {
  document.querySelectorAll(".jump-popover[data-open=\"true\"]").forEach((pop) => {
    pop.dataset.open = "false";
    pop.inert = true;
    const trigger = document.querySelector(`[aria-controls="${pop.id}"]`);
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger?.focus();
  });
}

function toggleMapPopover(trigger) {
  const pop = document.getElementById(trigger.getAttribute("aria-controls"));
  const open = pop.dataset.open !== "true";
  closeMapPopovers();
  state.timer.popoverOpen = false;
  patchTimerPopover();
  pop.dataset.open = String(open);
  pop.inert = !open;
  trigger.setAttribute("aria-expanded", String(open));
  if (open) pop.querySelector("button")?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  if (state.timer.popoverOpen) {
    state.timer.popoverOpen = false;
    patchTimerPopover();
  }
  if (!event.target.closest?.(".jump-anchor")) closeMapPopovers();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || state.modalOpen) return;
  if (state.timer.popoverOpen) {
    state.timer.popoverOpen = false;
    patchTimerPopover(true);
  }
  closeMapPopovers(true);
});

// Calm Top Bar
function renderTopbar() {
  const bar = document.getElementById("topbar");
  const g = state.data.gamification;
  const themeIcon = state.theme === "dark" ? ICONS.sun : ICONS.moon;
  const themeLabel = state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const soundButton = `<button id="btn-sound" class="icon-ghost" aria-label="${g.sound_enabled ? "Mute sound effects" : "Turn on sound effects"}" aria-pressed="${g.sound_enabled}">${g.sound_enabled ? ICONS.volOn : ICONS.volOff}</button>`;

  if (state.view === "mission") {
    const d = state.data.districts[state.districtIdx];
    const ratio = (state.stepIdx + 1) / d.steps.length;
    const milestones = d.steps.slice(1).map((_, i) => {
      const at = (i + 1) / d.steps.length;
      return `<span class="progress-milestone ${at < ratio ? "passed" : ""}" style="left:${(at * 100).toFixed(2)}%"></span>`;
    }).join("");
    renderPreserving(bar, `
      <div class="lesson-topbar-inner">
        <div class="lesson-topbar-left">
          <button id="btn-exit-lesson" class="icon-ghost" aria-label="Back to course">${ICONS.close}</button>
        </div>
        <div class="progress-track lesson-progress" role="progressbar" aria-label="Unit progress" aria-valuemin="0" aria-valuemax="${d.steps.length}" aria-valuenow="${state.stepIdx + 1}">
          <div class="progress-fill" style="--progress: ${ratio.toFixed(4)}"></div>
          ${milestones}
        </div>
        <div class="lesson-topbar-right">
          <span class="lesson-stat" title="Day streak"><span class="lesson-stat-icon warn">${ICONS.flame}</span><span class="tabular">${esc(g.streak_days)}</span><span class="sr-only"> day streak</span></span>
          <span class="lesson-stat" title="Total XP"><span class="lesson-stat-icon accent">${ICONS.bolt}</span><span class="tabular">${numberFormat.format(g.xp)}</span><span class="sr-only"> XP</span></span>
          ${timerWidgetHtml()}
          ${soundButton}
        </div>
      </div>`, ".progress-fill");
    document.getElementById("btn-exit-lesson").onclick = () => { if (state.inFlight) return; playSound("tap"); state.view = "map"; state.lastRenderedStepId = null; render(); };
    document.getElementById("btn-sound").onclick = toggleSound;
    bindTimerControls();
    return;
  }

  const accountLabel = state.sbProfile ? `@${state.sbProfile.username}` : "Settings";

  renderPreserving(bar, `
    <div class="topbar-inner">
      <div class="topbar-left">
        <button id="btn-brand" class="wordmark">${mascotHtml("idle", 28)}<span>Delightful Learn</span></button>
        <nav class="nav-tabs" aria-label="Sections">
          <button id="tab-map" class="nav-tab ${state.view === "map" ? "active" : ""}" ${state.view === "map" ? 'aria-current="page"' : ""}>${ICONS.book}<span>Course</span></button>
          <button id="tab-drill" class="nav-tab ${state.view === "drill" ? "active" : ""}" ${state.view === "drill" ? 'aria-current="page"' : ""}>${ICONS.cards}<span>Anki Cards</span><span class="tab-count" aria-label="${numberFormat.format(state.data.srs.due_count)} due">${numberFormat.format(state.data.srs.due_count)}</span></button>
        </nav>
      </div>
      <div class="topbar-right">
        ${state.sbUser ? `<button id="btn-courses" class="nav-tab courses-tab">Courses</button>` : ""}
        ${timerWidgetHtml()}
        <button id="btn-theme" class="icon-ghost" aria-label="${themeLabel}">${themeIcon}</button>
        ${soundButton}
        <button id="btn-account" class="avatar-btn" aria-label="Open settings for ${esc(accountLabel)}">
          ${mascotHtml("idle", 22)}
          <span>${esc(accountLabel)}</span>
        </button>
      </div>
    </div>`);

  document.getElementById("btn-courses")?.addEventListener("click", showCourses);
  document.getElementById("btn-brand").onclick = () => { if (state.inFlight) return; playSound("tap"); state.view = "map"; render(); };
  document.getElementById("tab-map").onclick = () => { if (state.inFlight) return; playSound("tap"); state.view = "map"; render(); };
  document.getElementById("tab-drill").onclick = () => { playSound("tap"); startDrillSession(); };
  document.getElementById("btn-account").onclick = (event) => { playSound("tap"); openSettingsModal("account", event.currentTarget); };
  document.getElementById("btn-theme").onclick = toggleTheme;
  document.getElementById("btn-sound").onclick = toggleSound;
  bindTimerControls();
}

async function toggleSound() {
  if (state.inFlight || !state.data) return;
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
  const pref = document.getElementById("pref-sound");
  if (pref) pref.setAttribute("aria-checked", String(next));
  if (next) playSound("correct");
}

// Dialog shell shared by Kubo Rewards, Settings and course dialogs
function closeModal() {
  const dialog = document.querySelector("#modal-host dialog[open]");
  if (!dialog) return;
  stopAuthTimer();
  dialog.close();
  setTimeout(() => dialog.remove(), 140);
  document.body.classList.remove("dialog-open");
  state.modalOpen = false;
  const trigger = state.modalTrigger;
  const target = trigger?.isConnected ? trigger : document.getElementById(trigger?.id || "create-course");
  target?.focus?.();
  state.modalTrigger = null;
}

function showDialog(title, content, trigger = document.activeElement, extraClass = "") {
  const host = document.getElementById("modal-host");
  if (!state.modalOpen) state.modalTrigger = trigger;
  state.timer.popoverOpen = false;
  patchTimerPopover();
  closeMapPopovers();
  host.innerHTML = `<dialog class="modal-card studio-dialog ${extraClass}" aria-labelledby="dialog-title">
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
    const controls = [...dialog.querySelectorAll("button, input, select, textarea, a[href], summary, [tabindex='0']")]
      .filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return dialog;
}

function refreshAfterLookChange() {
  if (state.view !== "courses" && state.data) renderTopbar();
  if (state.view === "map" && state.data) renderMap();
}

// Kubo Rewards Workshop: look customization only
function openRewardsModal(trigger) {
  const xp = currentXp();
  const n = nextUnlock();
  const level = state.data?.gamification.level || "Rank 1";
  const lockNote = (r) => `Lv.${numberFormat.format(r.level)}, ${numberFormat.format(r.threshold)} XP`;

  const shapes = MASCOT_SHAPES.map((sh) => {
    const unlocked = isShapeUnlocked(sh.id);
    const reward = shapeUnlockReward(sh.id);
    return `<button type="button" class="look-tile ${unlocked ? "" : "locked"}" data-shape="${sh.id}" aria-pressed="${equippedShape() === sh.id}" ${unlocked ? "" : "disabled"}
        aria-label="${sh.name}${unlocked ? "" : `, unlocks at ${lockNote(reward)}`}">
      ${mascotHtml("idle", 36, null, false, "", "none", sh.id)}
      <span class="look-tile-name">${sh.name}</span>
      <span class="look-tile-lvl">${unlocked ? `Lv.${reward.level}` : `${ICONS.lock} ${lockNote(reward)}`}</span>
    </button>`;
  }).join("");

  const swatches = MASCOT_PALETTES.map((p) => {
    const unlocked = isColorUnlocked(p.id);
    const active = state.mascotColor.toLowerCase() === p.body.toLowerCase();
    return `<button type="button" class="color-swatch ${unlocked ? "" : "locked"}" data-color="${p.body}" aria-pressed="${active}" ${unlocked ? "" : "disabled"}
        aria-label="${p.name}${unlocked ? "" : `, unlocks at Level ${colorUnlockLevel(p.id)}`}" title="${p.name}"
        style="background:${p.body}; box-shadow:0 3px 0 ${p.shade};">${unlocked ? "" : ICONS.lock}</button>`;
  }).join("");

  const accTiles = levelRewards().map((r) => {
    const unlocked = xp >= r.threshold;
    return `<button type="button" class="look-tile ${unlocked ? "" : "locked"}" data-acc="${esc(r.accessory)}" aria-pressed="${equippedAccessory() === r.accessory}" ${unlocked ? "" : "disabled"}
        aria-label="${esc(ACCESSORY_NAMES[r.accessory])}${unlocked ? "" : `, unlocks at ${lockNote(r)}`}">
      ${mascotHtml("idle", 36, null, false, "", r.accessory)}
      <span class="look-tile-name">${esc(ACCESSORY_NAMES[r.accessory])}</span>
      <span class="look-tile-lvl">${unlocked ? `Lv.${r.level}` : `${ICONS.lock} ${lockNote(r)}`}</span>
    </button>`;
  }).join("");

  const ranks = levelRewards().map((r) => `
    <li class="rank-row ${xp >= r.threshold ? "unlocked" : ""}">
      <span class="rank-row-lvl">Lv.${r.level}</span>
      <span class="rank-row-label">${esc(r.label)}</span>
      <span class="rank-row-xp tabular">${xp >= r.threshold ? ICONS.check : `${numberFormat.format(r.threshold)} XP`}</span>
    </li>`).join("");

  const dialog = showDialog("Kubo Rewards", `
    <div class="rewards-hero">
      <div id="rewards-preview" class="rewards-preview">${mascotHtml("happy", 84)}</div>
      <div class="rewards-hero-copy">
        <div class="rewards-rank">${esc(level)}</div>
        <div class="rewards-xp tabular">${numberFormat.format(xp)} XP</div>
        <p class="rewards-next">${n ? `Next: ${esc(n.label)} at ${numberFormat.format(n.threshold)} XP` : "Every reward is unlocked."}</p>
      </div>
    </div>
    <section class="modal-section"><h3 class="modal-label">Shape</h3><div class="look-grid shapes">${shapes}</div></section>
    <section class="modal-section"><h3 class="modal-label">Color</h3><div class="color-swatches">${swatches}</div></section>
    <section class="modal-section"><h3 class="modal-label">Accessories</h3><div class="look-grid">${accTiles}</div></section>
    <section class="modal-section"><h3 class="modal-label">Rank rewards</h3><ol class="rank-list">${ranks}</ol></section>`, trigger, "wide");

  const patch = () => {
    dialog.querySelector("#rewards-preview").innerHTML = mascotHtml("happy", 84);
    dialog.querySelectorAll("[data-shape]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.shape === equippedShape())));
    dialog.querySelectorAll("[data-acc]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.acc === equippedAccessory())));
    dialog.querySelectorAll("[data-color]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.color === state.mascotColor)));
    refreshAfterLookChange();
    unlockAchievement("style_icon");
    syncProgressToSupabase();
  };
  dialog.querySelectorAll("[data-shape]").forEach((b) => { b.onclick = () => { playSound("tap"); applyUserShape(b.dataset.shape); patch(); }; });
  dialog.querySelectorAll("[data-acc]").forEach((b) => { b.onclick = () => { playSound("tap"); applyUserAccessory(b.dataset.acc); patch(); }; });
  dialog.querySelectorAll("[data-color]").forEach((b) => { b.onclick = () => { playSound("tap"); applyUserMascotColor(b.dataset.color); patch(); }; });
}

// Settings: Account | Friends | Anki Sync | Preferences
const SETTINGS_TABS = [
  { id: "account", label: "Account" },
  { id: "friends", label: "Friends" },
  { id: "anki", label: "Anki Sync" },
  { id: "prefs", label: "Preferences" },
];

function switchHtml(id, label, on) {
  return `<div class="pref-row"><span id="${id}-label">${label}</span>
    <button type="button" id="${id}" class="switch" role="switch" aria-checked="${on}" aria-labelledby="${id}-label"><span class="switch-knob"></span></button></div>`;
}

function openSettingsModal(initialTab = "account", trigger = document.activeElement) {
  const tab = SETTINGS_TABS.some((t) => t.id === initialTab) ? initialTab : "account";
  const dialog = showDialog("Settings", `
    <div class="settings-tabs" role="tablist" aria-label="Settings sections">
      ${SETTINGS_TABS.map((t) => `<button type="button" role="tab" id="stab-${t.id}" class="settings-tab" aria-selected="${t.id === tab}" aria-controls="spanel-${t.id}" tabindex="${t.id === tab ? 0 : -1}">${t.label}</button>`).join("")}
    </div>
    ${SETTINGS_TABS.map((t) => `<section role="tabpanel" id="spanel-${t.id}" class="settings-panel" aria-labelledby="stab-${t.id}" ${t.id === tab ? "" : "hidden"}></section>`).join("")}`, trigger, "wide settings-dialog");

  const renderers = { account: renderAccountPanel, friends: renderFriendsPanel, anki: renderAnkiPanel, prefs: renderPrefsPanel };
  const select = (id, focus = false) => {
    dialog.querySelectorAll(".settings-tab").forEach((b) => {
      const on = b.id === `stab-${id}`;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    dialog.querySelectorAll(".settings-panel").forEach((panel) => { panel.hidden = panel.id !== `spanel-${id}`; });
    renderers[id](dialog.querySelector(`#spanel-${id}`));
  };
  const tabs = [...dialog.querySelectorAll(".settings-tab")];
  tabs.forEach((b, i) => {
    b.onclick = () => select(b.id.slice(5));
    b.onkeydown = (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length].id.slice(5), true);
    };
  });
  select(tab);
}

function panelMessage(panel) {
  const msg = panel.querySelector(".modal-msg");
  return (text, err = false) => {
    msg.textContent = text;
    msg.classList.toggle("err", err);
  };
}

function renderAccountPanel(panel) {
  if (!state.sbClient || !state.sbUser) {
    panel.innerHTML = `<p class="settings-copy">Accounts are offline. This studio isn't linked to Supabase, so your progress stays on this device.</p>`;
    return;
  }
  const email = state.sbUser.email || "";
  panel.innerHTML = `
    <div class="account-summary">
      ${mascotHtml("happy", 52)}
      <div class="account-summary-copy">
        <div class="account-name">@${esc(state.sbProfile?.username || email)}</div>
        <div class="account-email">${esc(email)}</div>
      </div>
      <button type="button" id="acct-kubo" class="btn-tactile secondary pill small">Customize Kubo</button>
    </div>
    <div class="settings-block">
      <h3 class="modal-label">Password</h3>
      <p class="settings-copy">We'll email you a link to choose a new password.</p>
      <button type="button" id="acct-reset" class="btn-tactile secondary">Send password reset link</button>
    </div>
    <div class="settings-block">
      <div class="form-row wrap">
        <button type="button" id="acct-courses" class="btn-tactile secondary">Switch course</button>
        <button type="button" id="acct-signout" class="btn-tactile secondary">Sign out</button>
      </div>
    </div>
    <div class="settings-block danger-zone">
      <h3 class="modal-label">Delete account</h3>
      <p class="settings-copy">This permanently deletes your profile, friends and course progress. It can't be undone.</p>
      <button type="button" id="acct-delete" class="btn-ghost danger flush" aria-expanded="false" aria-controls="acct-delete-confirm">Delete account…</button>
      <div id="acct-delete-confirm" class="form-stack" hidden>
        <label for="acct-delete-input">Type DELETE to confirm</label>
        <input id="acct-delete-input" class="text-field" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <div class="form-row">
          <button type="button" id="acct-delete-go" class="btn-tactile danger" disabled>Delete my account</button>
          <button type="button" id="acct-delete-cancel" class="btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
    <div class="modal-msg" role="status"></div>`;
  const say = panelMessage(panel);
  panel.querySelector("#acct-kubo").onclick = () => openRewardsModal(state.modalTrigger);
  const reset = panel.querySelector("#acct-reset");
  reset.onclick = () => guarded(reset, async () => {
    const left = cooldownLeft("recovery", email);
    if (left > 0) return say(`A link was just sent. You can send another in ${left} seconds.`);
    const { error } = await state.sbClient.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
    if (error) return say(friendlyAuthError(error, "reset").text, true);
    markEmailSent("recovery", email);
    say(`Reset link sent to ${email}.`);
  });
  const signOutBtn = panel.querySelector("#acct-signout");
  signOutBtn.onclick = () => guarded(signOutBtn, signOut);
  panel.querySelector("#acct-courses").onclick = () => { closeModal(); showCourses(); };

  const del = panel.querySelector("#acct-delete");
  const confirmBox = panel.querySelector("#acct-delete-confirm");
  const input = panel.querySelector("#acct-delete-input");
  const go = panel.querySelector("#acct-delete-go");
  const showConfirm = (open) => {
    confirmBox.hidden = !open;
    del.hidden = open;
    del.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
    else { input.value = ""; go.disabled = true; del.focus(); }
  };
  del.onclick = () => showConfirm(true);
  panel.querySelector("#acct-delete-cancel").onclick = () => showConfirm(false);
  input.oninput = () => { go.disabled = input.value.trim() !== "DELETE"; };
  go.onclick = () => guarded(go, async () => {
    if (input.value.trim() !== "DELETE") return;
    const deletedId = state.sbUser?.id || null;
    await rpc("delete_my_account");
    await state.sbClient.auth.signOut({ scope: "local" });
    clearUserStorage(deletedId);
    await clearSession();
    toast("Your account was deleted.");
  });
}

function friendRowHtml(f, removable) {
  return `<div class="squad-row">
    ${mascotHtml("idle", 26, f.mascot_color, false, "", f.mascot_accessory || "none", f.mascot_shape || "cube")}
    <div class="squad-info">
      <div class="squad-name">${esc(f.display_name)} <span class="squad-handle">@${esc(f.username)}</span></div>
      <div class="squad-meta">${numberFormat.format(f.xp)} XP, ${esc(f.streak_days)}-day streak</div>
    </div>
    ${removable ? `<button type="button" class="btn-ghost small" data-remove="${esc(f.id)}" aria-label="Remove ${esc(f.display_name)}">Remove</button>` : ""}
  </div>`;
}

function renderFriendsPanel(panel) {
  if (!state.sbUser) {
    panel.innerHTML = `
      <p class="settings-copy">Friends need an account. Until this studio is linked to Supabase, you can preview how teammates appear on the path.</p>
      <button type="button" id="btn-toggle-demo" class="btn-tactile secondary full">${state.demoSquadOn ? "Hide demo teammates" : "Show demo teammates"}</button>`;
    const demo = panel.querySelector("#btn-toggle-demo");
    demo.onclick = () => {
      state.demoSquadOn = !state.demoSquadOn;
      prefSet("demo_squad", state.demoSquadOn ? "1" : "0");
      demo.textContent = state.demoSquadOn ? "Hide demo teammates" : "Show demo teammates";
      if (state.view === "map") renderMap();
    };
    return;
  }
  panel.innerHTML = `
    <form id="add-friend" class="form-row add-friend">
      <label class="sr-only" for="add-friend-input">Teammate username</label>
      <input id="add-friend-input" class="text-field" placeholder="@username" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button type="submit" class="btn-tactile go">Add</button>
    </form>
    <div class="modal-msg" role="status"></div>
    <div class="squad-list settings-squad">${state.friends.length
      ? state.friends.map((f) => friendRowHtml(f, true)).join("")
      : `<p class="squad-empty">No teammates yet. Add one by their @username to see their progress on your path.</p>`}</div>`;
  const say = panelMessage(panel);
  const form = panel.querySelector("#add-friend");
  form.onsubmit = (event) => {
    event.preventDefault();
    guarded(form.querySelector("button"), async () => {
      const uname = form.querySelector("input").value.trim().toLowerCase().replace(/^@/, "");
      if (!/^[a-z0-9_]{2,24}$/.test(uname)) return say("Enter a valid teammate username.", true);
      const { data: target, error: findError } = await state.sbClient.from("profiles").select("id, username").eq("username", uname).maybeSingle();
      if (findError) throw findError;
      if (!target) return say(`No user @${uname} found.`, true);
      if (target.id === state.sbUser.id) return say("That's your own account.", true);
      if (state.friends.some((f) => f.id === target.id)) return say(`@${uname} is already on your squad.`, true);
      const { error } = await state.sbClient.from("friendships").insert({ user_id: state.sbUser.id, friend_id: target.id });
      if (error) throw error;
      await loadCloudProfileAndFriends();
      playSound("correct");
      if (state.view === "map") renderMap();
      renderFriendsPanel(panel);
      panelMessage(panel)(`Added @${uname}.`);
    });
  };
  panel.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => guarded(button, async () => {
      const me = state.sbUser.id, them = button.dataset.remove;
      const { error } = await state.sbClient.from("friendships").delete()
        .or(`and(user_id.eq.${me},friend_id.eq.${them}),and(user_id.eq.${them},friend_id.eq.${me})`);
      if (error) throw error;
      await loadCloudProfileAndFriends();
      if (state.view === "map") renderMap();
      renderFriendsPanel(panel);
      panel.querySelector("#add-friend-input").focus();
    });
  });
}

function ankiBase() {
  return STATIC_MODE ? RUNNER_URL : "";
}

function adoptLocalState(res) {
  if (res?.state && !cloudCourse()) state.data = res.state;
}

async function renderAnkiPanel(panel) {
  panel.innerHTML = `<p class="settings-copy" role="status">Checking your local companion…</p>`;
  let status = null;
  try {
    status = await request(ankiBase() + "/api/anki/status", null, { signal: AbortSignal.timeout(2500) });
  } catch (_) {
    status = null;
  }
  if (!panel.isConnected) return;
  const download = `<a class="settings-link" href="${ankiBase()}/api/anki/download" download>Download Anki deck (.apkg)</a>`;
  if (!status) {
    panel.innerHTML = `
      <p class="settings-copy">Automatic AnkiWeb sync runs through the local companion on your computer. Start it in the course folder, then check again:</p>
      <pre class="settings-code"><code>uv run rl-studio</code></pre>
      <button type="button" id="anki-check" class="btn-tactile secondary">Check connection</button>`;
    panel.querySelector("#anki-check").onclick = () => renderAnkiPanel(panel);
    return;
  }
  if (status.connected) {
    const via = status.backend === "headless" ? "AnkiWeb" : "AnkiConnect";
    panel.innerHTML = `
      <p class="status-badge ok"><span class="status-dot online"></span>Connected via ${via}</p>
      <p class="settings-copy">Unlocked cards sync to Anki automatically as you study.</p>
      <div class="form-row wrap">
        <button type="button" id="anki-sync" class="btn-tactile go">Sync now</button>
        ${status.backend === "headless" ? `<button type="button" id="anki-logout" class="btn-tactile secondary">Disconnect AnkiWeb</button>` : ""}
      </div>
      <div class="modal-msg" role="status"></div>
      <p class="settings-fallback">${download}</p>`;
    const say = panelMessage(panel);
    const sync = panel.querySelector("#anki-sync");
    sync.onclick = () => guarded(sync, async () => {
      const res = await request(ankiBase() + "/api/anki/sync", {});
      if (!res.ok) return say(res.error || "Anki sync failed.", true);
      adoptLocalState(res);
      say("Synced with Anki.");
    });
    const logout = panel.querySelector("#anki-logout");
    if (logout) logout.onclick = () => guarded(logout, async () => {
      adoptLocalState(await request(ankiBase() + "/api/anki/logout", {}));
      await renderAnkiPanel(panel);
    });
    return;
  }
  panel.innerHTML = `
    <p class="settings-copy">Sign in to AnkiWeb once and your unlocked cards sync automatically.</p>
    <form id="anki-login" class="form-stack">
      <label for="anki-user">AnkiWeb email</label>
      <input id="anki-user" name="username" class="text-field" type="email" autocomplete="username" required>
      <label for="anki-pass">AnkiWeb password</label>
      <input id="anki-pass" name="password" class="text-field" type="password" autocomplete="current-password" required>
      <button type="submit" class="btn-tactile go">Connect AnkiWeb</button>
    </form>
    <div class="modal-msg" role="status"></div>
    <p class="settings-fallback">${download}</p>`;
  const say = panelMessage(panel);
  const form = panel.querySelector("#anki-login");
  form.onsubmit = (event) => {
    event.preventDefault();
    const submit = form.querySelector("button");
    guarded(submit, async () => {
      submit.textContent = "Connecting…";
      try {
        const res = await request(ankiBase() + "/api/anki/login", { username: form.elements.username.value.trim(), password: form.elements.password.value });
        adoptLocalState(res);
        toast("AnkiWeb connected. Your unlocked cards are synced.");
        await renderAnkiPanel(panel);
      } catch (err) {
        if (submit.isConnected) submit.textContent = "Connect AnkiWeb";
        say(err.message, true);
      }
    });
  };
}

function renderPrefsPanel(panel) {
  panel.innerHTML = `
    ${switchHtml("pref-theme", "Dark mode", state.theme === "dark")}
    ${state.data ? switchHtml("pref-sound", "Sound effects", Boolean(state.data.gamification.sound_enabled)) : ""}
    <div class="settings-block">
      <h3 class="modal-label">Code drafts</h3>
      <p class="settings-copy">Your code exercise drafts are saved in this browser.</p>
      <button type="button" id="pref-drafts" class="btn-tactile secondary">Reset local code drafts</button>
      <div id="pref-drafts-confirm" class="form-row wrap" hidden>
        <span class="settings-copy">Delete every saved draft?</span>
        <button type="button" id="pref-drafts-go" class="btn-tactile danger small">Delete drafts</button>
        <button type="button" id="pref-drafts-cancel" class="btn-ghost">Cancel</button>
      </div>
      <div class="modal-msg" role="status"></div>
    </div>`;
  const theme = panel.querySelector("#pref-theme");
  theme.onclick = () => { toggleTheme(); theme.setAttribute("aria-checked", String(state.theme === "dark")); };
  const sound = panel.querySelector("#pref-sound");
  if (sound) sound.onclick = toggleSound;
  const say = panelMessage(panel);
  const open = panel.querySelector("#pref-drafts");
  const confirmRow = panel.querySelector("#pref-drafts-confirm");
  const show = (on) => { confirmRow.hidden = !on; open.hidden = on; (on ? panel.querySelector("#pref-drafts-go") : open).focus(); };
  open.onclick = () => show(true);
  panel.querySelector("#pref-drafts-cancel").onclick = () => show(false);
  panel.querySelector("#pref-drafts-go").onclick = () => {
    let removed = 0;
    try {
      for (const key of Object.keys(localStorage)) {
        if ((key.startsWith("course_studio_draft_") || key.startsWith("schlossallee_draft_")) && !key.endsWith("_notes")) {
          localStorage.removeItem(key);
          removed++;
        }
      }
    } catch (_) {
      return say("Browser storage is unavailable.", true);
    }
    show(false);
    say(removed ? `Deleted ${removed} saved draft${removed === 1 ? "" : "s"}.` : "There were no saved drafts.");
  };
}

// VIEW 1: Centered Course Path
const STEP_KIND_LABELS = {
  bet: "Intuition Bet",
  story_concept: "Concept",
  viz: "Interactive Lab",
  mcq: "Check",
  numeric: "Hand-Check",
  poe: "Predict",
  live_lab: "PyTorch Lab",
  code: "Code Exercise",
  debrief: "Unit Review",
};
const LAB_KINDS = new Set(["viz", "live_lab", "code"]);

function sizedIcon(name, size, stroke = null) {
  let svg = ICONS[name].replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
  if (stroke) svg = svg.replace(/stroke-width="[\d.]+"/, `stroke-width="${stroke}"`);
  return svg;
}

function stepPuckGlyph(kind, done, isCurrent) {
  if (done) return sizedIcon("check", 26, 3);
  if (kind === "bet") return sizedIcon("hint", 24, 2.5);
  if (isCurrent) return sizedIcon("star", 25);
  if (kind === "code") return sizedIcon("code", 24, 2.5);
  if (LAB_KINDS.has(kind)) return sizedIcon("sliders", 24, 2.5);
  if (kind === "debrief") return sizedIcon("flag", 24, 2.5);
  return sizedIcon("bolt", 24, 2.5);
}

function stepKindLabel(kind) {
  return Object.hasOwn(STEP_KIND_LABELS, kind) ? STEP_KIND_LABELS[kind] : esc(kind);
}

function nextUnlockHtml() {
  const n = nextUnlock();
  if (!n) {
    return `<button id="btn-rank-reward" class="next-unlock">
      ${mascotHtml("proud", 30)}<span><strong>Every Kubo reward unlocked.</strong> Change your look anytime.</span>${ICONS.chevronRight}</button>`;
  }
  return `<button id="btn-rank-reward" class="next-unlock">
    ${mascotHtml("idle", 30, null, false, "", n.accessory)}
    <span><strong class="tabular">Next unlock at ${numberFormat.format(n.threshold)} XP</strong> ${esc(n.label)}</span>${ICONS.chevronRight}</button>`;
}

function achievementRowsHtml() {
  const unlocked = (a) => state.achievements.includes(a.id);
  const ordered = [...ACHIEVEMENT_DEFS.filter(unlocked), ...ACHIEVEMENT_DEFS.filter((a) => !unlocked(a))];
  const shown = state.achShowAll ? ordered : ordered.slice(0, 6);
  return shown.map((a) => `
    <div class="ach-row ${unlocked(a) ? "unlocked" : ""}">
      <span class="ach-badge">${ICONS[a.icon] || ICONS.star}</span>
      <div class="ach-info">
        <div class="ach-name">${esc(a.title)}</div>
        <div class="ach-desc">${esc(a.desc)}</div>
      </div>
      <span class="ach-xp tabular">+${a.xp} XP</span>
    </div>`).join("");
}

function jumpPopoversHtml() {
  const units = state.data.districts.map((d, di) => {
    const done = d.steps.filter((s) => isStepDone(s.id)).length;
    return `<li><button type="button" class="jump-item" data-jump-unit="${di}">
      <span class="jump-dot" style="background:${bannerColor(d.color)}"></span>
      <span class="jump-title">${esc(d.chapter)}</span>
      <span class="jump-meta tabular">${done}/${d.steps.length}</span>
    </button></li>`;
  }).join("");
  const labs = state.data.districts.map((d, di) => {
    const items = d.steps.map((s, si) => ({ s, si })).filter(({ s }) => LAB_KINDS.has(s.kind));
    if (!items.length) return "";
    return `<li class="jump-group"><span class="jump-group-name">Unit ${di + 1}: ${esc(d.chapter)}</span><ul>
      ${items.map(({ s, si }) => `<li><button type="button" class="jump-item" data-di="${di}" data-si="${si}">
        <span class="jump-icon ${isStepDone(s.id) ? "done" : ""}">${isStepDone(s.id) ? sizedIcon("check", 14, 3) : sizedIcon(s.kind === "code" ? "code" : "sliders", 14)}</span>
        <span class="jump-title">${mdToHtml(s.title, true)}</span>
        <span class="jump-meta">${stepKindLabel(s.kind)}</span>
      </button></li>`).join("")}
    </ul></li>`;
  }).join("");
  return {
    units: `<div id="jump-units" class="jump-popover" data-open="false" inert role="dialog" aria-label="Jump to unit"><ul class="jump-list">${units}</ul></div>`,
    labs: `<div id="jump-labs" class="jump-popover" data-open="false" inert role="dialog" aria-label="Jump to lab"><ul class="jump-list">${labs}</ul></div>`,
  };
}

function renderMap({ sheen = false } = {}) {
  document.body.classList.remove("mode-mission");
  document.getElementById("lesson-footer-host").innerHTML = "";
  const root = document.getElementById("app-root");
  const g = state.data.gamification;
  const next = findNextStep();
  const { total: totalSteps, done: doneSteps } = stepCounts();
  const totalLabs = state.data.districts.reduce((acc, d) => acc + d.steps.filter((s) => LAB_KINDS.has(s.kind)).length, 0);
  const squad = activeSquadList();
  const meta = state.data.course_meta || {};
  const title = state.course?.title || meta.title || "Reinforcement Learning & PPO";
  const description = state.course?.description || meta.description || "An interactive path from the RL loop to a working PPO pipeline, with active recall and PyTorch labs.";
  const offsets = [0, 34, 0, -30, 0, 32, 0, -28, 0, 26];

  const pathHtml = state.data.districts.map((d, di) => {
    const unitDone = d.steps.filter((s) => isStepDone(s.id)).length;
    const bg = bannerColor(d.color);
    const nodes = d.steps.map((s, si) => {
      const done = isStepDone(s.id);
      const isCurrent = di === next.di && si === next.si;
      const cls = isCurrent ? "current" : (done ? "done" : "upcoming");
      const hereFriends = squad.filter((f) => f.current_step_id === s.id);
      const friendPinsHtml = hereFriends.length
        ? `<div class="friend-pins">${hereFriends.map((f) =>
            `<span class="friend-pin" title="${esc(f.display_name)}, ${numberFormat.format(f.xp)} XP">${mascotHtml("idle", 18, f.mascot_color, false, "", f.mascot_accessory || "none", f.mascot_shape || "cube")}<span>${esc(f.display_name)}</span></span>`
          ).join("")}</div>`
        : "";

      return `
        <div class="path-node-row ${isCurrent ? "is-current" : ""}">
          <div class="node-slot" style="--offset:${offsets[si % offsets.length]}px;">
            <div class="node-wrap">
              ${isCurrent ? `
                <svg class="node-active-ring" viewBox="0 0 128 106" fill="none" aria-hidden="true">
                  <ellipse cx="64" cy="56" rx="56" ry="42" stroke="var(--accent-border)" stroke-width="3"/>
                  <ellipse cx="64" cy="56" rx="48" ry="35" stroke="var(--accent-solid)" stroke-width="2" stroke-dasharray="6 5" opacity="0.55"/>
                </svg>
                <div class="node-start-pill"><span class="start-bubble">${g.xp > 0 ? "Next" : "Start"}</span></div>` : ""}
              <button class="node-puck ${cls}" tabindex="-1" aria-hidden="true" data-di="${di}" data-si="${si}">
                <span class="node-puck-base"></span>
                <span class="node-puck-face">${stepPuckGlyph(s.kind, done, isCurrent)}</span>
              </button>
            </div>
          </div>
          <div class="node-label-col">
            <button class="node-label ${cls === "upcoming" ? "muted" : ""}" ${isCurrent ? 'aria-current="step"' : ""} data-di="${di}" data-si="${si}">
              <span class="node-label-title">${mdToHtml(s.title, true)}</span>
              <span class="node-label-kind">${stepKindLabel(s.kind)}</span>
            </button>
            ${friendPinsHtml}
          </div>
        </div>`;
    }).join("");

    return `
      <section class="district-section" id="unit-${di}" aria-labelledby="unit-title-${di}">
        <div class="unit-banner" style="--unit-bg:${bg}; --unit-lip:${bannerLipColor(bg)};">
          <div class="unit-banner-text">
            <div class="unit-kicker">Unit ${di + 1}</div>
            <h2 class="unit-title" id="unit-title-${di}">${esc(d.chapter)}</h2>
          </div>
          <span class="unit-progress-pill" aria-label="${unitDone} of ${d.steps.length} steps done">${unitDone} / ${d.steps.length}</span>
        </div>
        <div class="nodes-track">${nodes}</div>
      </section>`;
  }).join("");

  const me = {
    id: "me",
    display_name: state.sbProfile ? `${state.sbProfile.display_name} (You)` : "You",
    mascot_color: state.mascotColor,
    mascot_accessory: equippedAccessory(),
    mascot_shape: equippedShape(),
    xp: g.xp,
    current_step_id: next.s.id,
    isMe: true,
  };
  const squadHtml = squad.length
    ? [...squad, me].sort((a, b) => b.xp - a.xp).map((m) => `
        <div class="squad-row ${m.isMe ? "is-me" : ""}">
          ${mascotHtml("idle", 26, m.mascot_color, false, "", m.mascot_accessory || "none", m.mascot_shape || "cube")}
          <div class="squad-info">
            <div class="squad-name">${esc(m.display_name)}</div>
            <div class="squad-meta">${esc(stepNameById(m.current_step_id))}</div>
          </div>
          <span class="squad-xp">${numberFormat.format(m.xp)} XP</span>
        </div>`).join("")
    : `<p class="squad-empty">Add a teammate to see their progress next to yours.</p>
       <button id="btn-open-squad" class="btn-tactile secondary full small">${ICONS.users} Add a teammate</button>`;

  const pops = jumpPopoversHtml();
  renderPreserving(root, `
    <div class="path-layout">
      <aside class="path-sidebar" aria-label="Course overview">
        <div class="sidebar-panel">
          <section class="sidebar-section">
            <h1 class="course-title">${esc(title)}</h1>
            <p class="overview-tagline">${esc(description)}</p>
            <div class="stat-pills">
              <div class="jump-anchor">
                <button type="button" class="stat-pill" id="pill-units" aria-haspopup="dialog" aria-expanded="false" aria-controls="jump-units">${ICONS.book}<span class="tabular">${state.data.districts.length}</span> Units${ICONS.chevronDown}</button>
                ${pops.units}
              </div>
              <div class="jump-anchor">
                <button type="button" class="stat-pill" id="pill-labs" aria-haspopup="dialog" aria-expanded="false" aria-controls="jump-labs">${ICONS.sliders}<span class="tabular">${totalLabs}</span> Labs${ICONS.chevronDown}</button>
                ${pops.labs}
              </div>
              <button type="button" class="stat-pill" id="pill-cards">${ICONS.cards}<span class="tabular">${numberFormat.format(state.data.srs.total_cards)}</span> Cards</button>
            </div>
          </section>

          <section class="sidebar-section">
            <div class="next-card-kicker">Up next</div>
            <p class="next-card-title">${mdToHtml(next.s.title, true)}</p>
            <button id="btn-sidebar-start" class="btn-tactile go full pill ${sheen ? "sheen-once" : ""}">${g.xp > 0 ? "Continue" : "Start"}</button>
          </section>

          <section class="sidebar-section">
            <div class="rank-stats-row">
              <div class="rank-stat-box">
                <span class="rank-stat-icon warn">${ICONS.flame}</span>
                <div><div class="rank-stat-val">${esc(g.streak_days)}d</div><div class="rank-stat-lbl">Streak</div></div>
              </div>
              <div class="rank-stat-box">
                <span class="rank-stat-icon accent">${ICONS.bolt}</span>
                <div><div class="rank-stat-val">${numberFormat.format(g.xp)}</div><div class="rank-stat-lbl">Total XP</div></div>
              </div>
            </div>
            <div class="rank-header">
              <span class="rank-name">${esc(g.level)}</span>
              <span class="rank-xp">${g.xp >= g.next_threshold && !nextUnlock() ? `${numberFormat.format(g.xp)} XP (Max rank)` : `${numberFormat.format(g.xp)} / ${numberFormat.format(g.next_threshold)} XP`}</span>
            </div>
            <div class="xp-bar-track"><div class="xp-bar-fill" style="--progress: ${(g.pct / 100).toFixed(4)}"></div></div>
            <div class="rank-meta">
              <span class="tabular">${doneSteps} of ${totalSteps} steps</span>
              <span>${numberFormat.format(state.data.srs.unlocked_count)} cards unlocked</span>
            </div>
            ${nextUnlockHtml()}
          </section>
        </div>
      </aside>

      <div class="path-column">${pathHtml}</div>

      <aside class="path-right-rail" aria-label="Squad and achievements">
        <div class="squad-card">
          <div class="rail-head">
            <h2>Squad</h2>
            <button id="btn-manage-squad" class="rail-link">${state.sbUser ? "Add friend" : "Manage"}</button>
          </div>
          <div class="squad-list">${squadHtml}</div>
        </div>

        <div class="ach-card">
          <div class="rail-head">
            <h2>Achievements <span class="rail-count tabular">${state.achievements.length}/${ACHIEVEMENT_DEFS.length}</span></h2>
            <button id="btn-ach-all" class="rail-link" aria-expanded="${state.achShowAll}">${state.achShowAll ? "Top 6" : `All ${ACHIEVEMENT_DEFS.length}`}</button>
          </div>
          <div class="ach-list ${state.achShowAll ? "expanded" : ""}">${achievementRowsHtml()}</div>
        </div>
      </aside>
    </div>`, ".sidebar-panel .xp-bar-fill");

  renderMath(root);
  const openStep = (di, si) => {
    if (state.inFlight) return;
    primeAudio();
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
  root.querySelectorAll("[data-jump-unit]").forEach((el) => {
    el.onclick = () => {
      closeMapPopovers();
      const target = document.getElementById(`unit-${el.dataset.jumpUnit}`);
      target?.scrollIntoView({ behavior: prefersReducedMotion() ? "instant" : "smooth", block: "start" });
      target?.querySelector(".node-label")?.focus({ preventScroll: true });
    };
  });
  root.querySelectorAll(".jump-anchor > .stat-pill").forEach((pill) => {
    pill.onclick = (event) => { event.stopPropagation(); toggleMapPopover(pill); };
  });
  document.getElementById("pill-cards").onclick = () => { playSound("tap"); startDrillSession(); };
  document.getElementById("btn-sidebar-start").onclick = () => openStep(next.di, next.si);
  document.getElementById("btn-rank-reward").onclick = (event) => { playSound("tap"); openRewardsModal(event.currentTarget); };
  const ms = document.getElementById("btn-manage-squad");
  ms.onclick = () => { playSound("tap"); openSettingsModal("friends", ms); };
  const os = document.getElementById("btn-open-squad");
  if (os) os.onclick = () => { playSound("tap"); openSettingsModal("friends", os); };
  const all = document.getElementById("btn-ach-all");
  all.onclick = () => {
    state.achShowAll = !state.achShowAll;
    all.setAttribute("aria-expanded", String(state.achShowAll));
    all.textContent = state.achShowAll ? "Top 6" : `All ${ACHIEVEMENT_DEFS.length}`;
    const list = root.querySelector(".ach-list");
    list.classList.toggle("expanded", state.achShowAll);
    list.innerHTML = achievementRowsHtml();
  };
}

// Theme-Aware Interactive Visualizers
function setRangeFill(el) {
  const pct = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
  el.style.setProperty("--fill", `${pct.toFixed(1)}%`);
}

function mountVisualizer(vizType, container) {
  const mounts = { bellman_backup: mountBellmanBackup, policy_baseline: mountPolicyBaseline, reward_shaping: mountRewardShaping };
  if (Object.hasOwn(mounts, vizType)) return mounts[vizType](container);
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
      b.textContent = `L = ${yM.toFixed(2)} (${flat ? "grad = 0" : "active"})`;

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

// Seeded PRNG so every learner sees the same first render and "Resample" is reproducible per session.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rangeHtml(id, label, min, max, step, value, digits) {
  return `<div class="range-group" id="${id}-group">
    <label for="${id}"><span>${label}</span><span id="${id}-val" class="range-val">${Number(value).toFixed(digits)}</span></label>
    <input class="slider-range" type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"/>
  </div>`;
}

function readRange(container, id, digits) {
  const el = container.querySelector(`#${id}`);
  setRangeFill(el);
  const v = Number(el.value);
  container.querySelector(`#${id}-val`).textContent = v.toFixed(digits);
  return v;
}

const fmtSigned = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);

function mountBellmanBackup(container) {
  container.innerHTML = `
    <div class="viz-stage">
      <div class="viz-controls">
        ${rangeHtml("bb-gamma", "Discount γ", 0.5, 1, 0.01, 0.9, 2)}
        ${rangeHtml("bb-p", "Risk p of hitting the hotel", 0, 1, 0.05, 0.3, 2)}
        ${rangeHtml("bb-alpha", "TD step size α", 0.05, 1, 0.05, 0.5, 2)}
      </div>
      <div class="viz-actions">
        <button type="button" id="bb-sweep" class="btn-tactile go">Bellman sweep</button>
        <button type="button" id="bb-td" class="btn-tactile secondary">Sample TD step</button>
        <button type="button" id="bb-reset" class="btn-tactile secondary">Reset to 0</button>
      </div>
      <div class="viz-grid">
        <div class="viz-cell">
          <div class="viz-cell-header"><span class="viz-cell-name">The board</span><span id="bb-pill1" class="viz-pill">p* = 0.53</span></div>
          <svg id="bb-board" viewBox="0 0 340 192" width="100%" role="img" aria-label="Three squares with learned values"></svg>
        </div>
        <div class="viz-cell">
          <div class="viz-cell-header"><span class="viz-cell-name">Targets for Safe Street</span><span id="bb-pill2" class="viz-pill">sweeps: 0</span></div>
          <svg id="bb-targets" viewBox="0 0 340 192" width="100%" role="img" aria-label="Number line of TD and Bellman targets"></svg>
        </div>
      </div>
      <div class="viz-legend">
        <span class="viz-legend-item"><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="var(--ink-3)"/></svg>One-sample TD targets (size = probability)</span>
        <span class="viz-legend-item"><svg width="12" height="12"><path d="M6 1 11 6 6 11 1 6Z" fill="var(--accent-solid)"/></svg>Bellman target</span>
        <span class="viz-legend-item"><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="var(--go)"/></svg>V(Safe)</span>
      </div>
      <p class="viz-insight">A Bellman sweep averages over both outcomes using p. A TD step sees only one outcome, jumps toward it, and lands on the same answer on average.</p>
    </div>`;

  const rng = mulberry32(20261126);
  let V = { go: 0, safe: 0, hotel: 0 };
  let sweeps = 0;
  let token = "go";
  let lastTarget = null;
  let lastAction = "sweep";

  const draw = () => {
    const gamma = readRange(container, "bb-gamma", 2);
    const p = readRange(container, "bb-p", 2);
    readRange(container, "bb-alpha", 2);
    const exact = { hotel: -1, safe: 1 - p - gamma * p };
    exact.go = gamma * exact.safe;
    container.querySelector("#bb-pill1").textContent = `p* = ${(1 / (1 + gamma)).toFixed(2)}`;
    container.querySelector("#bb-pill2").textContent = lastAction === "td" && lastTarget !== null
      ? `last TD target: ${fmtSigned(lastTarget)}`
      : `sweeps: ${sweeps}`;

    const squares = [["go", "Go", 10], ["safe", "Safe Street", 132], ["hotel", "Hotel Trap", 254]];
    const barX = (x, v) => x + 38 + Math.max(-1, Math.min(1, v)) * 30;
    let board = `
      <text x="110" y="30" font-size="13" fill="var(--ink-2)" text-anchor="middle">r=0</text>
      <text x="232" y="30" font-size="13" fill="var(--ink-2)" text-anchor="middle">p, r=0</text>
      <path d="M88 64h38M210 64h38" stroke="var(--line-strong)" stroke-width="2" marker-end="url(#bb-arrow)"/>
      <path d="M170 122v24M292 122v24" stroke="var(--line-strong)" stroke-width="2" marker-end="url(#bb-arrow)"/>
      <text x="176" y="139" font-size="13" fill="var(--ink-2)">1−p, +1</text>
      <text x="298" y="139" font-size="13" fill="var(--ink-2)">r=−1</text>
      <rect x="140" y="152" width="60" height="24" rx="12" fill="var(--go-tint)" stroke="var(--go)"/>
      <text x="170" y="169" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="middle">win</text>
      <rect x="262" y="152" width="60" height="24" rx="12" fill="var(--danger-tint)" stroke="var(--danger)"/>
      <text x="292" y="169" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="middle">lose</text>
      <defs><marker id="bb-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8Z" fill="var(--line-strong)"/></marker></defs>`;
    squares.forEach(([key, name, x]) => {
      const v = V[key];
      const zero = x + 38;
      board += `
        <rect x="${x}" y="40" width="76" height="82" rx="14" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.5"/>
        <text x="${zero}" y="58" font-size="12" font-weight="700" fill="var(--ink-2)" text-anchor="middle">${name}</text>
        <text x="${zero}" y="88" font-size="18" font-weight="900" fill="var(--ink)" text-anchor="middle">${fmtSigned(v)}</text>
        <rect x="${x + 8}" y="100" width="60" height="7" rx="3.5" fill="var(--line)"/>
        <rect x="${Math.min(zero, barX(x, v))}" y="100" width="${Math.abs(barX(x, v) - zero)}" height="7" rx="3.5" fill="${v >= 0 ? "var(--go)" : "var(--danger)"}"/>
        <line x1="${barX(x, exact[key])}" y1="96" x2="${barX(x, exact[key])}" y2="111" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2 2"/>`;
      if (token === key) board += `<circle cx="${zero}" cy="40" r="6.5" fill="var(--accent-solid)" stroke="var(--surface)" stroke-width="2.5"/>`;
    });
    container.querySelector("#bb-board").innerHTML = board;

    const toX = (v) => 24 + ((Math.max(-1.2, Math.min(1.2, v)) + 1.2) / 2.4) * 292;
    const hotelTarget = gamma * V.hotel;
    const bellman = p * gamma * V.hotel + (1 - p);
    const diamond = (x, y, r) => `M${x} ${y - r} ${x + r} ${y} ${x} ${y + r} ${x - r} ${y}Z`;
    container.querySelector("#bb-targets").innerHTML = `
      <text x="24" y="28" font-size="14" font-weight="700" fill="var(--accent)">Bellman target ${fmtSigned(bellman)}</text>
      <text x="24" y="50" font-size="14" font-weight="700" fill="var(--go-ink)">V(Safe) ${fmtSigned(V.safe)}</text>
      <line x1="24" y1="112" x2="316" y2="112" stroke="var(--line-strong)" stroke-width="1.5"/>
      ${[-1, 0, 1].map((t) => `<line x1="${toX(t)}" y1="106" x2="${toX(t)}" y2="118" stroke="var(--line-strong)"/>
        <text x="${toX(t)}" y="138" font-size="13" fill="var(--ink-2)" text-anchor="middle">${t === 0 ? "0" : fmtSigned(t).replace(".00", "")}</text>`).join("")}
      ${lastTarget !== null ? `<line x1="${toX(lastTarget)}" y1="76" x2="${toX(lastTarget)}" y2="148" stroke="var(--warn)" stroke-width="2.5" stroke-linecap="round"/>` : ""}
      <circle cx="${toX(hotelTarget)}" cy="112" r="${3 + 7 * p}" fill="var(--ink-3)" opacity="0.8"/>
      <circle cx="${toX(1)}" cy="112" r="${3 + 7 * (1 - p)}" fill="var(--ink-3)" opacity="0.8"/>
      <path d="${diamond(toX(bellman), 112, 9)}" fill="var(--accent-solid)" stroke="var(--surface)" stroke-width="1.5"/>
      <circle cx="${toX(V.safe)}" cy="112" r="5.5" fill="var(--go)" stroke="var(--surface)" stroke-width="2"/>
      <text x="170" y="176" font-size="13" fill="var(--ink-2)" text-anchor="middle">Value scale (−1.2 to +1.2)</text>`;
  };

  container.querySelector("#bb-sweep").onclick = () => {
    const gamma = Number(container.querySelector("#bb-gamma").value);
    const p = Number(container.querySelector("#bb-p").value);
    const old = { ...V };
    V = { hotel: -1, safe: p * gamma * old.hotel + (1 - p) * 1, go: gamma * old.safe };
    sweeps++;
    lastAction = "sweep";
    draw();
  };
  container.querySelector("#bb-td").onclick = () => {
    const gamma = Number(container.querySelector("#bb-gamma").value);
    const p = Number(container.querySelector("#bb-p").value);
    const alpha = Number(container.querySelector("#bb-alpha").value);
    const sq = token;
    let target;
    if (sq === "go") {
      target = 0 + gamma * V.safe;
      token = "safe";
    } else if (sq === "safe") {
      if (rng() < p) {
        target = 0 + gamma * V.hotel;
        token = "hotel";
      } else {
        target = 1;
        token = "go";
      }
    } else {
      target = -1;
      token = "go";
    }
    V[sq] += alpha * (target - V[sq]);
    lastTarget = target;
    lastAction = "td";
    draw();
  };
  container.querySelector("#bb-reset").onclick = () => {
    V = { go: 0, safe: 0, hotel: 0 };
    sweeps = 0;
    token = "go";
    lastTarget = null;
    lastAction = "sweep";
    draw();
  };
  container.querySelectorAll("input").forEach((el) => (el.oninput = draw));
  draw();
}

function mountPolicyBaseline(container) {
  const N = 20, MU_BUY = 3, MU_PASS = 2;
  container.innerHTML = `
    <div class="viz-stage">
      <div class="viz-controls">
        ${rangeHtml("pb-b", "Baseline b", 0, 4, 0.1, 0, 1)}
        ${rangeHtml("pb-pi", "π(BUY) right now", 0.1, 0.9, 0.05, 0.5, 2)}
        ${rangeHtml("pb-sig", "Return noise σ", 0, 2, 0.1, 0.5, 1)}
      </div>
      <div class="viz-actions">
        <button type="button" id="pb-resample" class="btn-tactile secondary">Resample 20 games</button>
        <button type="button" id="pb-snap" class="btn-tactile go">Snap b to E[R]</button>
      </div>
      <div class="viz-grid">
        <div class="viz-cell">
          <div class="viz-cell-header"><span class="viz-cell-name">20 sampled gradients</span><span id="pb-pill1" class="viz-pill">wrong way: 0 / 20</span></div>
          <svg id="pb-arrows" viewBox="0 0 340 192" width="100%" role="img" aria-label="One gradient arrow per sampled game"></svg>
        </div>
        <div class="viz-cell">
          <div class="viz-cell-header"><span class="viz-cell-name">Spread vs. baseline</span><span id="pb-pill2" class="viz-pill">std = 1.27</span></div>
          <svg id="pb-curve" viewBox="0 0 340 192" width="100%" role="img" aria-label="Gradient standard deviation as the baseline changes"></svg>
        </div>
      </div>
      <div class="viz-legend">
        <span class="viz-legend-item"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--go)" stroke-width="3"/></svg>BUY game</span>
        <span class="viz-legend-item"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--danger)" stroke-width="3"/></svg>PASS game</span>
        <span class="viz-legend-item"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--accent-solid)" stroke-width="5"/></svg>Sample mean</span>
      </div>
      <p class="viz-insight">The baseline never changes where the average arrow points. It only decides how much the individual arrows argue about it. The spread bottoms out at b* = (1−π)×3 + π×2, which equals E[R] only when π = 0.5.</p>
    </div>`;

  let seed = 7;
  let draws = [];
  const resample = () => {
    const rng = mulberry32(seed);
    draws = Array.from({ length: N }, () => ({ ua: rng(), u1: rng(), u2: rng() }));
  };

  const draw = () => {
    const b = readRange(container, "pb-b", 1);
    const pi = readRange(container, "pb-pi", 2);
    const sig = readRange(container, "pb-sig", 1);
    const Eg = pi * (1 - pi) * (MU_BUY - MU_PASS);
    const stdAt = (base) => {
      const Eg2 = pi * (1 - pi) ** 2 * (sig ** 2 + (MU_BUY - base) ** 2) + (1 - pi) * pi ** 2 * (sig ** 2 + (MU_PASS - base) ** 2);
      return Math.sqrt(Math.max(0, Eg2 - Eg * Eg));
    };
    const ER = pi * MU_BUY + (1 - pi) * MU_PASS;
    const bStar = (1 - pi) * MU_BUY + pi * MU_PASS;

    const games = draws.map(({ ua, u1, u2 }) => {
      const buy = ua < pi;
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2);
      const R = (buy ? MU_BUY : MU_PASS) + sig * z;
      return { buy, g: buy ? (1 - pi) * (R - b) : -pi * (R - b) };
    });
    const wrong = games.filter((x) => Math.sign(x.g) === -Math.sign(Eg) && x.g !== 0).length;
    const mean = games.reduce((acc, x) => acc + x.g, 0) / N;
    container.querySelector("#pb-pill1").textContent = `wrong way: ${wrong} / ${N}`;
    container.querySelector("#pb-pill2").textContent = `std = ${stdAt(b).toFixed(2)}`;

    const ZERO = 170, SCALE = 48, MAXLEN = 150;
    const len = (g) => Math.max(-MAXLEN, Math.min(MAXLEN, g * SCALE));
    let arrows = `<line x1="${ZERO}" y1="10" x2="${ZERO}" y2="168" stroke="var(--line-strong)" stroke-width="1.5"/>`;
    games.forEach((x, i) => {
      const y = 16 + i * 6.4;
      const l = len(x.g);
      const isWrong = Math.sign(x.g) === -Math.sign(Eg) && x.g !== 0;
      const color = x.buy ? "var(--go)" : "var(--danger)";
      const end = ZERO + l, dir = Math.sign(l) || 1;
      arrows += `<g opacity="${isWrong ? 0.4 : 1}">
        <line x1="${ZERO}" y1="${y}" x2="${end - dir * 3}" y2="${y}" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>
        ${Math.abs(l) > 4 ? `<path d="M${end} ${y} ${end - dir * 5} ${y - 3} ${end - dir * 5} ${y + 3}Z" fill="${color}"/>` : ""}
        ${isWrong ? `<path d="M${end + dir * 6 - 2.5} ${y - 2.5}l5 5m0 -5l-5 5" stroke="var(--ink-3)" stroke-width="1.4" stroke-linecap="round"/>` : ""}
      </g>`;
    });
    const mEnd = ZERO + len(mean), mDir = Math.sign(len(mean)) || 1;
    arrows += `
      <line x1="${ZERO}" y1="160" x2="${mEnd - mDir * 4}" y2="160" stroke="var(--accent-solid)" stroke-width="5" stroke-linecap="round"/>
      ${Math.abs(len(mean)) > 6 ? `<path d="M${mEnd + mDir * 2} 160 ${mEnd - mDir * 7} 154 ${mEnd - mDir * 7} 166Z" fill="var(--accent-solid)"/>` : ""}
      <line x1="${ZERO + len(Eg)}" y1="151" x2="${ZERO + len(Eg)}" y2="169" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="3 2"/>
      <text x="170" y="186" font-size="12.5" fill="var(--ink-2)" text-anchor="middle">mean ${fmtSigned(mean)}, E[g] ${fmtSigned(Eg)} (dashed)</text>`;
    container.querySelector("#pb-arrows").innerHTML = arrows;

    const toX = (base) => 30 + (base / 4) * 290;
    const samples = Array.from({ length: 81 }, (_, i) => (i / 80) * 4);
    const maxStd = Math.max(0.5, ...samples.map(stdAt), Eg);
    const toY = (v) => 158 - (v / maxStd) * 126;
    const pts = samples.map((base) => `${toX(base).toFixed(1)},${toY(stdAt(base)).toFixed(1)}`);
    const sameLine = Math.abs(toX(ER) - toX(bStar)) < 22;
    container.querySelector("#pb-curve").innerHTML = `
      <line x1="30" y1="158" x2="320" y2="158" stroke="var(--line-strong)" stroke-width="1.5"/>
      <polygon points="30,158 ${pts.join(" ")} 320,158" fill="var(--accent-tint)"/>
      <polyline points="${pts.join(" ")}" fill="none" stroke="var(--accent-solid)" stroke-width="2.6"/>
      <line x1="30" y1="${toY(Eg)}" x2="320" y2="${toY(Eg)}" stroke="var(--ink-2)" stroke-width="1.4" stroke-dasharray="5 4"/>
      <text x="316" y="${toY(Eg) - 6}" font-size="12" fill="var(--ink-2)" text-anchor="end">mean step, unchanged</text>
      <line x1="${toX(ER)}" y1="24" x2="${toX(ER)}" y2="158" stroke="var(--ink)" stroke-width="1.4" stroke-dasharray="4 3"/>
      <text x="${toX(ER)}" y="18" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="middle">E[R]</text>
      <line x1="${toX(bStar)}" y1="${sameLine ? 38 : 24}" x2="${toX(bStar)}" y2="158" stroke="var(--ink-3)" stroke-width="1.4" stroke-dasharray="2 3"/>
      <text x="${toX(bStar)}" y="${sameLine ? 34 : 18}" font-size="13" font-weight="700" fill="var(--ink-3)" text-anchor="middle">b*</text>
      <circle cx="${toX(b)}" cy="${toY(stdAt(b))}" r="6" fill="var(--go)" stroke="var(--surface)" stroke-width="2"/>
      <text x="30" y="176" font-size="13" fill="var(--ink-2)" text-anchor="middle">0</text>
      <text x="320" y="176" font-size="13" fill="var(--ink-2)" text-anchor="middle">4</text>
      <text x="175" y="186" font-size="13" fill="var(--ink-2)" text-anchor="middle">Baseline b</text>`;
  };

  container.querySelector("#pb-resample").onclick = () => { seed++; resample(); draw(); };
  container.querySelector("#pb-snap").onclick = () => {
    const pi = Number(container.querySelector("#pb-pi").value);
    container.querySelector("#pb-b").value = (Math.round((pi * MU_BUY + (1 - pi) * MU_PASS) * 10) / 10).toFixed(1);
    draw();
  };
  container.querySelectorAll("input").forEach((el) => (el.oninput = draw));
  resample();
  draw();
}

function mountRewardShaping(container) {
  const PLANS = {
    A: { name: "Plan A: Buy then win", cash: [8, 2, 3, 5, 7], nw: [8, 8, 9, 11, 14], outcome: 1 },
    B: { name: "Plan B: Hoard cash", cash: [8, 8, 9, 9, 8], nw: [8, 8, 9, 9, 8], outcome: -1 },
  };
  const MODES = [["sparse", "Sparse"], ["naive", "Naive cash bonus"], ["potential", "Potential shaping"]];
  let mode = "naive";
  container.innerHTML = `
    <div class="viz-stage">
      <div class="viz-seg" role="group" aria-label="Reward design">
        ${MODES.map(([id, label]) => `<button type="button" class="btn-tactile secondary" data-rs-mode="${id}" aria-pressed="${id === mode}">${label}</button>`).join("")}
      </div>
      <div class="viz-controls">
        ${rangeHtml("rs-c", "Cash bonus c per step", 0, 1, 0.05, 0.6, 2)}
        ${rangeHtml("rs-k", "Potential scale k", 0, 2, 0.1, 0.5, 1)}
        ${rangeHtml("rs-gamma", "Discount γ", 0.8, 1, 0.01, 0.95, 2)}
      </div>
      <div class="viz-grid">
        <div class="viz-cell">
          <div class="viz-cell-header"><span class="viz-cell-name">Reward per step</span><span class="viz-pill-row"><span id="rs-ga" class="viz-pill">Plan A G₀ = 1.41</span><span id="rs-gb" class="viz-pill">Plan B G₀ = 1.90</span></span></div>
          <svg id="rs-steps" viewBox="0 0 340 192" width="100%" role="img" aria-label="Per-step rewards for both plans"></svg>
        </div>
        <div class="viz-cell">
          <div class="viz-cell-header"><span class="viz-cell-name">Which plan does the bot prefer?</span><span id="rs-prefer" class="viz-pill">Prefers: Plan A</span></div>
          <svg id="rs-compare" viewBox="0 0 340 192" width="100%" role="img" aria-label="Discounted return of each plan"></svg>
        </div>
      </div>
      <div class="viz-legend">
        <span class="viz-legend-item"><svg width="12" height="12"><rect width="12" height="12" rx="3" fill="var(--ink-3)"/></svg>Sparse win/loss</span>
        <span class="viz-legend-item"><svg width="12" height="12"><rect width="12" height="12" rx="3" fill="var(--warn)"/></svg>Cash bonus</span>
        <span class="viz-legend-item"><svg width="12" height="12"><rect width="12" height="12" rx="3" fill="var(--accent-solid)"/></svg>Potential shaping F</span>
        <span class="viz-legend-item">Numbers under bars: cash / net worth</span>
      </div>
      <p class="viz-insight">A naive bonus is a second goal the bot can chase instead of winning. Potential shaping only moves reward earlier in time, and every plan pays it back by the end.</p>
    </div>`;

  const rewardsFor = (plan, c, k, gamma) => {
    const phi = plan.nw.map((n) => (k * n) / 10).concat(0);
    return plan.cash.map((cash, t) => {
      const sparse = t < 4 ? 0 : plan.outcome;
      let extra = 0;
      if (mode === "naive" && cash >= 8) extra = c;
      if (mode === "potential") extra = gamma * phi[t + 1] - phi[t];
      return { sparse, extra };
    });
  };
  const discounted = (steps, gamma, withExtra = true) => steps.reduce((acc, r, t) => acc + gamma ** t * (r.sparse + (withExtra ? r.extra : 0)), 0);

  const draw = () => {
    const c = readRange(container, "rs-c", 2);
    const k = readRange(container, "rs-k", 1);
    const gamma = readRange(container, "rs-gamma", 2);
    container.querySelector("#rs-c-group").hidden = mode !== "naive";
    container.querySelector("#rs-k-group").hidden = mode !== "potential";
    container.querySelectorAll("[data-rs-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rsMode === mode)));

    const steps = { A: rewardsFor(PLANS.A, c, k, gamma), B: rewardsFor(PLANS.B, c, k, gamma) };
    const G = { A: discounted(steps.A, gamma), B: discounted(steps.B, gamma) };
    const sparseG = { A: discounted(steps.A, gamma, false), B: discounted(steps.B, gamma, false) };
    container.querySelector("#rs-ga").textContent = `Plan A G₀ = ${G.A.toFixed(2)}`;
    container.querySelector("#rs-gb").textContent = `Plan B G₀ = ${G.B.toFixed(2)}`;
    const prefersB = G.B > G.A;
    const pill = container.querySelector("#rs-prefer");
    pill.textContent = prefersB ? "Prefers: Plan B (reward hack)" : "Prefers: Plan A";
    pill.className = "viz-pill " + (prefersB ? "danger" : "go");

    const extraColor = mode === "potential" ? "var(--accent-solid)" : "var(--warn)";
    const UNIT = 16, CLAMP = 26;
    const h = (v) => Math.min(CLAMP, Math.abs(v) * UNIT);
    let svg = "";
    [["A", 38, 78], ["B", 114, 154]].forEach(([key, base, numY]) => {
      const plan = PLANS[key];
      svg += `<text x="6" y="${base + 5}" font-size="14" font-weight="700" fill="var(--ink-2)">${key}</text>
        <line x1="24" y1="${base}" x2="330" y2="${base}" stroke="var(--line-strong)"/>`;
      steps[key].forEach((r, t) => {
        const x = 48 + t * 56;
        let up = base, down = base, bars = "";
        [[r.sparse, "var(--ink-3)"], [r.extra, extraColor]].forEach(([v, color]) => {
          if (!v) return;
          const hh = h(v);
          if (v > 0) { up -= hh; bars += `<rect x="${x}" y="${up}" width="22" height="${hh}" rx="3" fill="${color}"/>`; }
          else { bars += `<rect x="${x}" y="${down}" width="22" height="${hh}" rx="3" fill="${color}"/>`; down += hh; }
        });
        const tip = mode === "potential" && key === "A" && t === 4
          ? `<title>The ${fmtSigned(r.extra)} here is the potential being paid back when the game ends. That's the telescoping in action.</title>` : "";
        svg += `<g>${tip}<rect x="${x - 4}" y="${base - CLAMP - 4}" width="30" height="${2 * CLAMP + 8}" fill="transparent"/>${bars}</g>`;
        svg += `<text x="${x + 11}" y="${numY}" font-size="11" fill="var(--ink-2)" text-anchor="middle">${plan.cash[t]} / ${plan.nw[t]}</text>`;
        if (t === 4) {
          const fy = r.sparse > 0 ? up - 4 : base - 6;
          const fx = x + 26;
          svg += `<path d="M${fx} ${fy}v-14l9 3.5-9 3.5" stroke="${r.sparse > 0 ? "var(--go)" : "var(--danger)"}" stroke-width="1.8" stroke-linejoin="round" fill="${r.sparse > 0 ? "var(--go)" : "var(--danger)"}"/>`;
        }
      });
    });
    [0, 1, 2, 3, 4].forEach((t) => { svg += `<text x="${59 + t * 56}" y="178" font-size="12" fill="var(--ink-2)" text-anchor="middle">t=${t}</text>`; });
    container.querySelector("#rs-steps").innerHTML = svg;

    const toX = (v) => 30 + ((Math.max(-2, Math.min(4, v)) + 2) / 6) * 290;
    const zero = toX(0);
    const bar = (key, y, color) => {
      const x0 = Math.min(zero, toX(G[key])), w = Math.abs(toX(G[key]) - zero);
      const gx0 = Math.min(zero, toX(sparseG[key])), gw = Math.abs(toX(sparseG[key]) - zero);
      const labelX = G[key] >= 0 ? Math.min(toX(G[key]) + 6, 300) : Math.max(toX(G[key]) - 6, 40);
      return `<text x="30" y="${y - 8}" font-size="12.5" font-weight="700" fill="var(--ink-2)">${PLANS[key].name}</text>
        <rect x="${gx0}" y="${y}" width="${gw}" height="24" rx="5" fill="var(--line)"/>
        <rect x="${x0}" y="${y + 5}" width="${w}" height="14" rx="4" fill="${color}"/>
        <text x="${labelX}" y="${y + 17}" font-size="14" font-weight="700" fill="var(--ink)" text-anchor="${G[key] >= 0 ? "start" : "end"}">${fmtSigned(G[key])}</text>`;
    };
    const SB = [0, 1, 2, 3, 4].reduce((acc, t) => acc + gamma ** t, 0);
    const modeLine = mode === "naive"
      ? `Flips when c > ${((2 * gamma ** 4) / (SB - 1)).toFixed(2)}`
      : mode === "potential"
        ? `Shaping adds −Φ(s₀) = −${((k * 8) / 10).toFixed(2)} to both plans`
        : "Only the final win or loss counts.";
    container.querySelector("#rs-compare").innerHTML = `
      ${bar("A", 30, "var(--go)")}
      ${bar("B", 84, "var(--warn)")}
      <line x1="${zero}" y1="18" x2="${zero}" y2="128" stroke="var(--line-strong)" stroke-dasharray="3 3"/>
      <line x1="30" y1="128" x2="320" y2="128" stroke="var(--line-strong)" stroke-width="1.5"/>
      ${[-2, -1, 0, 1, 2, 3, 4].map((v) => `<line x1="${toX(v)}" y1="124" x2="${toX(v)}" y2="132" stroke="var(--line-strong)"/>
        <text x="${toX(v)}" y="146" font-size="13" fill="var(--ink-2)" text-anchor="middle">${v < 0 ? "−" + Math.abs(v) : v}</text>`).join("")}
      <text x="175" y="176" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="middle">${modeLine}</text>`;
  };

  container.querySelectorAll("[data-rs-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.rsMode; draw(); }; });
  container.querySelectorAll("input").forEach((el) => (el.oninput = draw));
  draw();
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

function animateKuboSpeech(rawMd, bubbleEl, kuboEl) {
  if (!bubbleEl) return;
  if (state.speechTimer) { clearTimeout(state.speechTimer); state.speechTimer = null; }
  kuboEl?.classList.remove("speaking");

  // Render complete semantic HTML immediately so screen readers and fast readers never wait.
  bubbleEl.innerHTML = mdToHtml(rawMd, true);
  renderMath(bubbleEl);
  if (prefersReducedMotion()) return;

  bubbleEl.classList.remove("enter");
  void bubbleEl.offsetWidth;
  bubbleEl.classList.add("enter");
  kuboEl?.classList.add("speaking");
  state.speechTimer = setTimeout(() => {
    state.speechTimer = null;
    kuboEl?.classList.remove("speaking");
  }, 320);
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
            <div class="unit-sprint-title">Unit card review complete</div>
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
        <span class="unit-sprint-title">${isInterleaved ? "Mixed review" : "Quick card review"}</span>
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
      countCardReview();
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

function betKey(stepId) {
  return "bet_" + draftKey({ id: stepId }).slice("draft_".length);
}

function readBet(stepId) {
  try {
    const bet = JSON.parse(prefGet(betKey(stepId)));
    return typeof bet?.choice === "string" && typeof bet.reason === "string" ? bet : null;
  } catch (_) {
    return null;
  }
}

function betHtml(step) {
  const saved = readBet(step.id);
  const locked = isStepDone(step.id);
  return `
    <fieldset id="bet-options" class="bet-options" ${locked ? "disabled" : ""}>
      <legend class="bet-prompt">${mdToHtml(step.prompt, true)}</legend>
      <div class="choice-list bet-choices">${step.options.map((option, i) => `
        <label class="choice-tile bet-tile">
          <input type="radio" name="opening-bet" value="${i}" ${option === saved?.choice ? "checked" : ""}>
          <span>${esc(option)}</span>
        </label>`).join("")}</div>
      <input id="bet-reason" class="text-field bet-reason" type="text" maxlength="200"
        aria-label="Why? (optional)" placeholder="Why? (optional, saved for the end of this unit)"
        value="${esc(saved?.reason)}">
    </fieldset>`;
}

function betRevealHtml(step) {
  if (!step.bet_step_id || !step.bet_reveal_md) return "";
  const bet = readBet(step.bet_step_id);
  return `<section class="bet-reveal">
    <h2>Opening Bet Reveal</h2>
    ${bet
      ? `<div class="bet-reveal-summary"><p>At the start of this unit you bet: <strong>${esc(bet.choice)}</strong></p>
        <span class="bet-answer">Answer: ${esc(step.bet_answer)}</span></div>
        ${bet.reason ? `<blockquote>${esc(bet.reason)}</blockquote>` : ""}`
      : `<p>Opening bet answer: <strong>${esc(step.bet_answer)}</strong></p>`}
    <div class="prose">${mdToHtml(step.bet_reveal_md)}</div>
  </section>`;
}

function sourcesHtml(sources) {
  if (!Array.isArray(sources) || !sources.length) return "";
  const items = sources.map((src) => {
    if (!src || typeof src.url !== "string" || !/^https:\/\//i.test(src.url)) return "";
    let url;
    try { url = new URL(src.url); } catch (_) { return ""; }
    if (!url.hostname || url.username || url.password) return "";
    return `<li><a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(src.label)}</a>
      ${src.why ? `<p>${esc(src.why)}</p>` : ""}</li>`;
  }).filter(Boolean);
  if (!items.length) return "";
  return `<details class="sources-box">
    <summary>Go deeper (${items.length} primary ${items.length === 1 ? "source" : "sources"})</summary>
    <ul>${items.join("")}</ul>
  </details>`;
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
    const badge = cls === "ok" ? `<span class="feedback-check" aria-hidden="true">${ICONS.check}</span>` : "";
    drawerHtml = `<div class="feedback-drawer ${cls}" role="status"><div class="feedback-inner">${mascotHtml(mood, 44)}${badge}<div class="feedback-copy"><strong>${headline}</strong><span>${mdToHtml(text, true)}</span></div></div></div>`;
  }

  const needsCheck = (s.kind === "mcq" || s.kind === "numeric" || s.kind === "poe") && !(fb && fb.correct);
  const needsBet = s.kind === "bet" && !isStepDone(s.id);
  const betOptions = document.getElementById("bet-options");
  const checkedBet = () => betOptions?.querySelector('input[type="radio"]:checked');
  const checkDisabled = (s.kind === "mcq" && state.selectedMcq[s.id] === undefined) || (needsBet && !checkedBet());
  const primaryLabel = needsBet ? "Lock in bet" : needsCheck ? (s.kind === "poe" ? "Lock Prediction" : "Check") : (isLast ? "Finish Unit" : "Continue");
  const footerBtnVariant = (s.kind === "code" && !fb?.passed) ||
    (s.kind === "live_lab" && !state.labCache[s.id]) ? "secondary" : "go";
  const sheen = state.footerSheen && !needsCheck && footerBtnVariant === "go" ? "sheen-once" : "";
  state.footerSheen = false;

  footerHost.innerHTML = `
    <div class="lesson-footer-bar">
      ${drawerHtml}
      <div class="footer-actions">
        <button id="btn-prev" class="btn-ghost flush" ${state.stepIdx === 0 ? "disabled" : ""}>← Previous</button>
        <button id="btn-primary-footer" class="btn-tactile pill ${footerBtnVariant} ${sheen}" ${checkDisabled ? "disabled" : ""}>${primaryLabel}</button>
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

  const primary = document.getElementById("btn-primary-footer");
  if (needsBet) betOptions.onchange = () => {
    primary.disabled = !checkedBet() || state.inFlight;
  };
  primary.onclick = (event) => {
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
          if (res.correct) { state.combo++; state.footerSheen = true; handleXp(res.xp, btnEl, "correct"); }
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
          if (res.correct) { state.combo++; state.footerSheen = true; handleXp(res.xp, btnEl, "correct"); }
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
            state.footerSheen = true;
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
      if (needsBet) {
        const selected = checkedBet();
        if (!selected) return;
        const choice = s.options[Number(selected.value)];
        const reason = document.getElementById("bet-reason").value.trim().slice(0, 200);
        if (!prefSet(betKey(s.id), JSON.stringify({ choice, reason }))) {
          toast("Your browser couldn't save this bet. Enable local storage and try again.");
          return;
        }
        betOptions.disabled = true;
      }
      if (needsBet || ["story_concept", "viz", "live_lab", "debrief"].includes(s.kind)) {
        try {
          const res = await api("/api/complete_step", { step_id: s.id });
          state.data = res.state;
          handleXp(res.xp, btnEl, null);
        } finally {
          if (needsBet) betOptions.disabled = isStepDone(s.id);
        }
        if (needsBet) toast("Bet locked. We'll revisit it at the end of the unit!");
        if (s.kind === "viz" || s.kind === "live_lab") unlockAchievement("lab_explorer");
      } else {
        spawnSparkles(btnEl, 10);
      }

      if (isLast) {
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
        <div id="kubo-speech-bubble" class="kubo-speech-bubble">${mdToHtml(story, true)}</div>
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

  if (s.kind === "bet") body += betHtml(s);

  if (s.kind === "viz") body += `<div id="viz-mount"></div>`;

  if (s.kind === "mcq") {
    const letters = "ABCD";
    const picked = state.selectedMcq[s.id];
    body += `<div class="prose"><p class="stem">${mdToHtml(s.question, true)}</p></div>
      <div class="choice-list">${s.options.map((opt, i) => {
        let cls = "";
        if (fb && fb.choice === i) cls = fb.correct ? "correct" : "wrong";
        else if (picked === i) cls = "selected";
        return `<button class="choice-tile ${cls}" data-opt="${i}" aria-pressed="${picked === i}"><span class="choice-key">${letters[i]}</span><span>${mdToHtml(opt, true)}</span></button>`;
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
      <div class="code-frame">
        <div id="code-shell" class="code-shell" style="--editor-height:${state.editorHeight}px">
          <div id="code-gutter" class="code-gutter" aria-hidden="true"></div>
          <textarea id="code-editor" class="code-editor" wrap="off" aria-label="Python code editor" aria-describedby="editor-help" spellcheck="false"></textarea>
        </div>
        <div id="code-resize" class="code-resize-handle" role="separator" aria-orientation="horizontal" aria-label="Resize code editor" aria-valuemin="${EDITOR_MIN}" aria-valuemax="${EDITOR_MAX}" aria-valuenow="${state.editorHeight}" tabindex="0"></div>
      </div>
      <div id="runner-card" class="runner-card" hidden>
        <p>Requires local PyTorch runner: <code>uv run rl-studio</code></p>
        <button id="check-runner" class="btn-tactile secondary">Check Local Runner</button>
      </div>
      <div class="code-toolbar">
        <button id="btn-run-code" class="btn-tactile go">${RUN_LABEL}</button>
        <button id="btn-reset-code" class="btn-ghost">${ICONS.reset} Reset</button>
        <button id="btn-editor-size" class="btn-ghost" aria-pressed="${state.editorHeight >= EDITOR_EXPANDED}">${state.editorHeight >= EDITOR_EXPANDED ? "Compact" : "Expand"}</button>
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
    body += betRevealHtml(s);
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

  body += sourcesHtml(s.sources);

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

// VIEW 3: Anki Cards (spaced-repetition review)
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

function drillRevealButtonHtml() {
  return `<button id="d-reveal" class="btn-tactile secondary full">Show answer</button>`;
}

function masteryPanelHtml() {
  const mods = Object.values(state.data.srs.by_module || {});
  return `
    <div class="mastery-wrap">
      <button type="button" id="btn-mastery" class="btn-ghost mastery-toggle" aria-expanded="${state.masteryOpen}" aria-controls="mastery-panel">
        ${ICONS.cards} Chapter mastery
      </button>
      <div id="mastery-panel" class="mastery-panel" ${state.masteryOpen ? "" : "hidden"}>
        <p class="deck-section-sub">Cards unlock as you complete each chapter. Open a chapter to see its progress.</p>
        ${mods.map((m) => {
          const pct = m.total ? Math.round((m.mastered / m.total) * 100) : 0;
          return `<details class="mastery-row">
            <summary>
              <span class="deck-mini-name"><span class="street-dot" style="background:${colorHex(m.color)};"></span>${esc(m.chapter || m.street)}</span>
              <span class="deck-mini-count">${pct}% mastered</span>
            </summary>
            <div class="mastery-detail">
              <div class="xp-bar-track"><div class="xp-bar-fill" style="background:${colorHex(m.color)}; --progress: ${(pct / 100).toFixed(3)}"></div></div>
              <div class="mastery-stats tabular"><span>${esc(m.unlocked)} of ${esc(m.total)} unlocked</span><span>${esc(m.mastered)} mastered</span></div>
            </div>
          </details>`;
        }).join("")}
      </div>
    </div>`;
}

function ankiStatusHtml() {
  return state.data.anki_connected
    ? `<span class="status-badge ok"><span class="status-dot online"></span>Auto-synced with Anki</span>`
    : `<button type="button" id="btn-anki-setup" class="btn-ghost small anki-setup">Set up Anki sync</button>`;
}

function bindDrillChrome(root) {
  const setup = root.querySelector("#btn-anki-setup");
  if (setup) setup.onclick = () => { playSound("tap"); openSettingsModal("anki", setup); };
  const toggle = root.querySelector("#btn-mastery");
  toggle.onclick = () => {
    state.masteryOpen = !state.masteryOpen;
    toggle.setAttribute("aria-expanded", String(state.masteryOpen));
    root.querySelector("#mastery-panel").hidden = !state.masteryOpen;
  };
}

function renderDrill() {
  document.body.classList.remove("mode-mission");
  document.getElementById("lesson-footer-host").innerHTML = "";
  const root = document.getElementById("app-root");
  const cards = state.drillCards;

  if (!cards.length || state.drillIdx >= cards.length) {
    const reviewed = cards.length;
    const acc = reviewed ? Math.round((state.drillGoodCount / reviewed) * 100) : 100;
    root.innerHTML = `
      <div class="drill-stage">
        <div class="drill-head"><h1 class="drill-title">Anki Cards</h1>${ankiStatusHtml()}</div>
        <div class="flashcard drill-done">
          ${mascotHtml("proud", 68)}
          <h2>Review complete</h2>
          <p>${reviewed ? state.data.anki_connected ? "Your reviews are scheduled and synced to Anki." : "Your reviews are scheduled." : "No cards due right now. Great work staying on top of reviews."}</p>
          <div class="drill-summary-grid">
            <div class="summary-tile"><div class="summary-val">${reviewed}</div><div class="summary-lbl">Cards reviewed</div></div>
            <div class="summary-tile"><div class="summary-val">${acc}%</div><div class="summary-lbl">Recalled</div></div>
            <div class="summary-tile"><div class="summary-val">+${state.drillSessionXp}</div><div class="summary-lbl">Session XP</div></div>
          </div>
          <div class="drill-done-actions">
            <button id="d-home" class="btn-tactile go pill">Back to course</button>
            <button id="d-again" class="btn-tactile secondary pill">Practice more cards</button>
          </div>
        </div>
        ${masteryPanelHtml()}
      </div>`;
    bindDrillChrome(root);
    document.getElementById("d-home").onclick = () => { if (state.inFlight) return; playSound("tap"); state.view = "map"; render(); };
    document.getElementById("d-again").onclick = () => { playSound("tap"); startDrillSession(); };
    return;
  }

  const c = cards[state.drillIdx];
  const ratio = state.drillIdx / Math.max(cards.length, 1);

  renderPreserving(root, `
    <div class="drill-stage">
      <div class="drill-head"><h1 class="drill-title">Anki Cards</h1>${ankiStatusHtml()}</div>
      <div class="drill-hud">
        <div class="drill-hud-left">
          ${mascotHtml(state.drillMood, 44)}
          <div class="progress-track"><div class="progress-fill" style="--progress: ${ratio.toFixed(4)}"></div></div>
        </div>
        <div class="drill-hud-stats">
          <span class="drill-stat-pill" title="Correct answers in a row this session"><span class="rank-stat-icon go">${ICONS.target}</span> ${state.drillCombo} in a row</span>
          <span class="drill-stat-pill"><span class="rank-stat-icon accent">${ICONS.bolt}</span> +${state.drillSessionXp} XP</span>
        </div>
      </div>

      <div class="flashcard drill-card">
        <div class="flashcard-top">
          <span class="card-counter">Card ${state.drillIdx + 1} of ${cards.length}</span>
          ${state.data.srs.due_count === 0 ? `<span class="practice-pill">Practice review (0 due)</span>` : ""}
        </div>
        <div class="flashcard-front">${cardHtml(c.front)}</div>
        <div id="d-answer-slot" class="flashcard-answer-slot">${state.drillRevealed ? `<div class="flashcard-back">${cardHtml(c.back)}</div>` : ""}</div>
        <div id="d-actions" class="flashcard-actions">${state.drillRevealed ? ratingButtonsHtml(c, false) : drillRevealButtonHtml()}</div>
      </div>

      ${masteryPanelHtml()}
    </div>`, ".drill-hud .progress-fill");

  renderMath(root);
  bindDrillChrome(root);

  const bindRatings = () => root.querySelectorAll(".rate-btn").forEach((b) => {
    b.onclick = (event) => guarded(b, async () => {
      if (event.detail > 1 || performance.now() < state.ratingCooldown) return;
      state.ratingCooldown = performance.now() + 320;
      primeAudio();
      const q = Number(b.dataset.q);
      const res = await api("/api/srs/rate", { card_id: c.card_id, quality: q });
      state.data = res.state;
      countCardReview();
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
  // same action area, so the card never re-mounts or jumps.
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

// Anki Cards keyboard shortcuts: Space reveals, 1-4 rate
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
  if (state.view !== "mission" || state.passwordRecovery) disposeEditor();
  if (state.passwordRecovery && state.sbUser) return renderAuth("update-password");
  // Whenever accounts are configured, nobody browses signed out. Without Supabase, local studio opens offline.
  if ((state.sbClient || STATIC_MODE) && !state.sbUser) return renderAuth();
  if (state.view === "courses") return renderCourses();
  renderTopbar();
  if (state.view === "map") renderMap({ sheen: true });
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
    if (state.sbUser && !state.passwordRecovery) await enterCloud();
    else render();
  } catch (err) {
    document.getElementById("app-root").textContent = err.message || "Delightful Learn could not start.";
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
  const allowedKinds = new Set(["bet", "story_concept", "viz", "mcq", "numeric", "poe", "code", "live_lab", "debrief"]);
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
      if (step.kind === "bet" && (typeof step.prompt !== "string" ||
          !Array.isArray(step.options) || step.options.length < 2 ||
          step.options.some((option) => typeof option !== "string" || !option.trim()) ||
          new Set(step.options).size !== step.options.length)) {
        throw new Error("Each intuition bet needs a prompt and distinct choices.");
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
  if (state.sbUser) prefSet("active_course_" + state.sbUser.id, "");
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

// Cloud writes use an optimistic version check, so they run one at a time.
let progressQueue = Promise.resolve();
function updateCloudProgress(path, body) {
  const run = progressQueue.then(() => writeCloudProgress(path, body));
  progressQueue = run.catch(() => {});
  return run;
}

async function writeCloudProgress(path, body) {
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
  } else if (path === "/api/achievement/claim") {
    const def = ACHIEVEMENT_DEFS.find((a) => a.id === body.achievement_id);
    if (!def) throw new Error("Unknown achievement.");
    result.xp = award("ach-" + def.id, def.xp);
  } else {
    const district = course.content.districts.find((d) => d.steps.some((s) => s.id === body.step_id));
    const step = district?.steps.find((s) => s.id === body.step_id);
    if (!step) throw new Error("That lesson step is unavailable.");
    unlock(district.id);
    let points = ({ bet: 10, story_concept: 10, viz: 15, live_lab: 20, debrief: 30 })[step.kind] ?? 10;
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

// ==================== Auth: sign in · sign up · reset · check email · recovery ====================
const AUTH_COOLDOWN_SECONDS = 60;
const RECOVERY_FLAG_KEY = "course_studio_pw_recovery";
const authEmailSentAt = new Map();
let authTimer = null;

const AUTH_VIEWS = {
  "sign-in": { mood: "happy", title: "Sign in", sub: "Welcome back. Pick up right where you left off.", submit: "Sign in", busy: "Signing in…" },
  "sign-up": { mood: "happy", title: "Create your account", sub: "Save your progress and learn alongside your squad.", submit: "Create account", busy: "Creating account…" },
  reset: { mood: "thinking", title: "Reset password", sub: "Enter your email and we'll send you a link to choose a new one.", submit: "Send reset link", busy: "Sending reset link…" },
  "check-email": { mood: "happy", title: "Check your email" },
  "update-password": { mood: "happy", title: "Set a new password", sub: "Choose a new password to finish signing in.", submit: "Update password", busy: "Updating password…" },
};

// Where Supabase should send people back to: this page's canonical URL (directories end in "/"),
// matching the redirect allow-list in supabase/config.toml.
function authRedirectUrl() {
  let path = window.location.pathname;
  if (!path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path.slice(path.lastIndexOf("/") + 1))) path += "/";
  return window.location.origin + path;
}

function stopAuthTimer() {
  clearInterval(authTimer);
  authTimer = null;
}

// The recovery marker is bound to the user the reset link signed in, so it can't leak onto another session.
function setRecoveryFlag(on, uid = null) {
  state.passwordRecovery = on;
  try {
    if (on && uid) sessionStorage.setItem(RECOVERY_FLAG_KEY, JSON.stringify({ uid }));
    else if (!on) sessionStorage.removeItem(RECOVERY_FLAG_KEY);
  } catch (_) {}
}

function recoveryFlagStored(uid) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(RECOVERY_FLAG_KEY) || "null");
    return Boolean(uid) && stored?.uid === uid;
  } catch (_) {
    return false;
  }
}

// Reads Supabase redirect parameters before anything touches the URL.
function readAuthRedirect() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const param = (key) => hash.get(key) ?? query.get(key);
  const errorCode = param("error") || param("error_code");
  const error = errorCode ? `${param("error_code") || ""} ${param("error") || ""} ${param("error_description") || ""}`.toLowerCase() : "";
  const accessToken = hash.get("access_token");
  const code = query.get("code");
  const tokenHash = query.get("token_hash");
  const type = param("type");
  return {
    present: Boolean(error || accessToken || code || tokenHash),
    stray: Boolean(type || hash.has("refresh_token")),
    error,
    accessToken,
    refreshToken: hash.get("refresh_token"),
    code,
    tokenHash,
    type,
    recovery: type === "recovery",
  };
}

// PASSWORD_RECOVERY can arrive after init has already started entering the app.
function enterPasswordRecovery(session) {
  if (!session?.user) return;
  const showing = document.querySelector('.auth-view[data-mode="update-password"]');
  setRecoveryFlag(true, session.user.id);
  state.sbUser = session.user;
  if (showing) return;
  closeModal();
  render();
}

function friendlyAuthError(err, mode) {
  const raw = `${err?.code || ""} ${err?.message || ""} ${err?.status || ""}`.toLowerCase();
  const wait = raw.match(/after (\d+) seconds?/);
  if (/invalid login credentials|invalid_credentials/.test(raw)) {
    return { tone: "err", text: "Incorrect email or password. Double-check your details or reset your password.", action: { label: "Reset password", mode: "reset" } };
  }
  if (/email not confirmed|email_not_confirmed/.test(raw)) {
    return { tone: "err", text: "Confirm your email before signing in. Need a new confirmation link?", action: { label: "Send a new link", send: "signup" } };
  }
  if (/already registered|already been registered|user_already_exists|email_exists/.test(raw)) {
    return { tone: "err", text: "An account with this email already exists. Sign in instead, or reset your password if you forgot it.", action: { label: "Sign in instead", mode: "sign-in" } };
  }
  if (wait || /rate limit|rate_limit|too many|429|for security purposes/.test(raw)) {
    const seconds = wait ? Number(wait[1]) : 0;
    return { tone: "err", text: seconds ? `Too many attempts. Wait ${seconds} seconds, then try again.` : "Too many attempts. Wait a minute, then try again." };
  }
  if (/same_password|different from the old|same as the old/.test(raw)) {
    return { tone: "err", text: "Your new password must be different from your current one." };
  }
  if (/weak_password|password should|at least 6/.test(raw)) {
    return { tone: "err", text: "Choose a stronger password with at least 6 characters." };
  }
  if (/unable to validate email|invalid email|email_address_invalid|invalid format/.test(raw)) {
    return { tone: "err", text: "Enter a valid email address, like name@example.com." };
  }
  if (/signups not allowed|signup_disabled/.test(raw)) {
    return { tone: "err", text: "New sign-ups are turned off right now. Ask your course admin for access." };
  }
  if (/database error saving new user|duplicate key|unique/.test(raw)) {
    return { tone: "err", text: "That username is already taken. Try a different one." };
  }
  if (mode === "update-password" && /session|jwt|expired|not authenticated/.test(raw)) {
    return { tone: "err", text: "Your reset link has expired. Request a new one to choose a password.", action: { label: "Send a new link", mode: "reset" } };
  }
  if (/failed to fetch|network|load failed/.test(raw)) {
    return { tone: "err", text: "We can't reach the account service. Check your connection and try again." };
  }
  if (err?.userFacing) return { tone: "err", text: err.message };
  return { tone: "err", text: "Something went wrong on our side. Try again in a moment." };
}

function themeButtonHtml(id) {
  const dark = state.theme === "dark";
  return `<button id="${id}" class="icon-ghost" type="button" aria-label="${dark ? "Switch to light theme" : "Switch to dark theme"}">${dark ? ICONS.sun : ICONS.moon}</button>`;
}

function authFieldHtml(ctx, { name, label, type = "text", autocomplete, hint = "", attrs = "", value = "", toggleLabel = "password" }) {
  const id = `${ctx.uid}-${name}`;
  const hintId = hint ? `${id}-hint` : "";
  const input = `<input id="${id}" class="text-field auth-input" name="${name}" type="${type}" autocomplete="${autocomplete}"${hintId ? ` aria-describedby="${hintId}"` : ""}${value ? ` value="${esc(value)}"` : ""} ${attrs} required>`;
  const control = type === "password"
    ? `<div class="pw-wrap">${input}<button type="button" class="pw-toggle" aria-label="Show ${toggleLabel}" data-label="${toggleLabel}" aria-pressed="false" aria-controls="${id}">${ICONS.eye}</button></div>`
    : input;
  return `<div class="auth-field"><label for="${id}">${label}</label>${control}${hint ? `<p class="auth-hint" id="${hintId}">${hint}</p>` : ""}</div>`;
}

function authEmailField(ctx) {
  return authFieldHtml(ctx, {
    name: "email", label: "Email", type: "email", autocomplete: "email", value: ctx.email,
    attrs: 'inputmode="email" autocapitalize="off" spellcheck="false"',
  });
}

function authSubmitHtml(label, extraClass = "go pill auth-submit", type = "submit") {
  return `<button class="btn-tactile full ${extraClass}" type="${type}"><span class="auth-spinner" aria-hidden="true"></span><span class="auth-submit-label">${label}</span></button>`;
}

function authViewHtml(ctx, mode) {
  const view = AUTH_VIEWS[mode];
  const heading = ctx.modal ? "h3" : "h1";
  const signup = ctx.kind === "signup";
  const sub = mode === "check-email"
    ? `We sent a ${signup ? "confirmation" : "password reset"} link to <strong class="auth-email">${esc(ctx.email)}</strong>. Open the link in your inbox to ${signup ? "finish creating your account" : "choose a new password"}.`
    : mode === "update-password" && state.sbUser?.email
      ? `Choose a new password for <strong class="auth-email">${esc(state.sbUser.email)}</strong>.`
      : view.sub;
  const badge = mode === "check-email" ? `<span class="auth-badge${ctx.modal ? " solo" : ""}" aria-hidden="true">${ICONS.mail}</span>` : "";
  const hero = `<div class="auth-hero">
      ${ctx.modal ? badge : `<div class="auth-kubo">${mascotHtml(view.mood, 68)}${badge}</div>`}
      <${heading} class="auth-title" tabindex="-1">${view.title}</${heading}>
      <p class="auth-sub">${sub}</p>
    </div>
    <div class="auth-alert-slot"></div>`;

  if (mode === "check-email") {
    return `<div class="auth-view${ctx.modal ? " compact" : ""}" data-mode="${mode}">
      ${hero}
      <p class="auth-hint auth-center">Didn't see it? Check your spam folder or send another link.</p>
      <div class="auth-actions">
        ${authSubmitHtml("Resend email", "secondary auth-resend", "button")}
        <button type="button" class="btn-ghost auth-back" data-auth-go="sign-in">Back to sign in</button>
      </div>
    </div>`;
  }

  let fields = "";
  let foot = "";
  if (mode === "sign-in") {
    fields = authEmailField(ctx) + authFieldHtml(ctx, { name: "password", label: "Password", type: "password", autocomplete: "current-password" });
    foot = `<p class="auth-foot">New here? <button type="button" class="auth-link strong" data-auth-go="sign-up">Create an account</button></p>
      <p class="auth-foot"><button type="button" class="auth-link" data-auth-go="reset">Reset password</button></p>`;
  } else if (mode === "sign-up") {
    fields = authFieldHtml(ctx, {
      name: "username", label: "Username", autocomplete: "username", hint: "Letters, numbers, and underscores",
      attrs: 'minlength="2" maxlength="24" pattern="[A-Za-z0-9_]{2,24}" autocapitalize="off" spellcheck="false"',
    }) + authEmailField(ctx) + authFieldHtml(ctx, {
      name: "password", label: "Password", type: "password", autocomplete: "new-password", hint: "At least 6 characters", attrs: 'minlength="6"',
    });
    foot = `<p class="auth-foot">Already have an account? <button type="button" class="auth-link strong" data-auth-go="sign-in">Sign in</button></p>`;
  } else if (mode === "reset") {
    fields = authEmailField(ctx);
    foot = `<p class="auth-foot"><button type="button" class="auth-link" data-auth-go="sign-in">Back to sign in</button></p>`;
  } else {
    fields = authFieldHtml(ctx, { name: "password", label: "New password", type: "password", autocomplete: "new-password", hint: "At least 6 characters", attrs: 'minlength="6"', toggleLabel: "new password" })
      + authFieldHtml(ctx, { name: "confirm", label: "Confirm new password", type: "password", autocomplete: "new-password", attrs: 'minlength="6"', toggleLabel: "confirm password" });
    foot = `<p class="auth-foot"><button type="button" class="auth-link" data-auth-action="cancel-recovery">Cancel and sign out</button></p>`;
  }

  return `<div class="auth-view${ctx.modal ? " compact" : ""}" data-mode="${mode}">
    ${hero}
    <form class="auth-form" novalidate>
      ${fields}
      ${authSubmitHtml(view.submit)}
    </form>
    <div class="auth-foots">${foot}</div>
  </div>`;
}

function setAuthMood(ctx, mood) {
  const wrap = ctx.host.querySelector(".auth-kubo .kubo-wrap");
  if (!wrap || (mood !== "oops" && wrap.classList.contains(`mood-${mood}`))) return;
  wrap.outerHTML = mascotHtml(mood, 68);
}

function showAuthAlert(ctx, alert) {
  const slot = ctx.host.querySelector(".auth-alert-slot");
  if (!slot) return;
  if (!alert) {
    ctx.host.querySelectorAll("[aria-describedby]").forEach((input) => describeWithAlert(ctx, input, false));
    if (slot.firstChild) {
      slot.replaceChildren();
      setAuthMood(ctx, AUTH_VIEWS[ctx.mode].mood);
    }
    return;
  }
  const icon = alert.tone === "err" ? ICONS.alert : alert.tone === "ok" ? ICONS.checkCircle : ICONS.info;
  const action = !alert.action ? ""
    : alert.action.send
      ? `<button type="button" class="auth-link" data-auth-action="resend-confirmation">${esc(alert.action.label)}</button>`
      : `<button type="button" class="auth-link" data-auth-go="${esc(alert.action.mode)}">${esc(alert.action.label)}</button>`;
  slot.innerHTML = `<div class="auth-alert ${alert.tone}" role="${alert.tone === "err" ? "alert" : "status"}">
    <span class="auth-alert-icon" aria-hidden="true">${icon}</span>
    <div class="auth-alert-body"><p id="${ctx.uid}-alert">${esc(alert.text)}</p>${action}</div>
  </div>`;
  if (alert.tone === "err") setAuthMood(ctx, "oops");
  else if (alert.tone === "ok") setAuthMood(ctx, "happy");
}

function describeWithAlert(ctx, input, on) {
  const alertId = `${ctx.uid}-alert`;
  const ids = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== alertId);
  if (on) ids.push(alertId);
  if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
  else input.removeAttribute("aria-describedby");
}

function togglePasswordVisibility(button) {
  const input = document.getElementById(button.getAttribute("aria-controls"));
  if (!input) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  button.setAttribute("aria-pressed", String(show));
  button.setAttribute("aria-label", `${show ? "Hide" : "Show"} ${button.dataset.label || "password"}`);
  button.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
}

function validateAuthForm(ctx, form) {
  const field = (name) => form.querySelector(`[name="${name}"]`);
  const fail = (input, text) => {
    showAuthAlert(ctx, { tone: "err", text });
    input.setAttribute("aria-invalid", "true");
    describeWithAlert(ctx, input, true);
    input.focus();
    return false;
  };
  form.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  const username = field("username"), email = field("email"), password = field("password"), confirm = field("confirm");
  if (username && !/^[A-Za-z0-9_]{2,24}$/.test(username.value.trim())) {
    return fail(username, "Pick a username with 2–24 letters, numbers, or underscores.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    return fail(email, email.value.trim() ? "Enter a valid email address, like name@example.com." : "Enter your email address.");
  }
  if (password && !password.value) return fail(password, ctx.mode === "sign-in" ? "Enter your password." : "Choose a password.");
  if (password && ctx.mode !== "sign-in" && password.value.length < 6) return fail(password, "Use at least 6 characters for your password.");
  if (confirm && confirm.value !== password.value) return fail(confirm, "Passwords don't match.");
  return true;
}

// Shows immediate loading feedback on the pressed button; returns true when the action succeeded.
async function authBusy(ctx, button, busyLabel, action) {
  if (state.inFlight) return false;
  state.inFlight = true;
  const label = button.querySelector(".auth-submit-label");
  const idle = label.innerHTML;
  // Navigation and "Cancel" stay disabled until the request settles.
  const peers = [...ctx.host.querySelectorAll("[data-auth-go], [data-auth-action]")];
  peers.forEach((el) => { el.disabled = true; });
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  label.textContent = busyLabel;
  try {
    await action();
    return true;
  } catch (err) {
    showAuthAlert(ctx, friendlyAuthError(err, ctx.mode));
    return false;
  } finally {
    state.inFlight = false;
    peers.forEach((el) => { el.disabled = false; });
    if (button.isConnected) {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      label.innerHTML = idle;
    }
  }
}

function emailKey(kind, email) {
  return `${kind}:${String(email).trim().toLowerCase()}`;
}

function markEmailSent(kind, email) {
  authEmailSentAt.set(emailKey(kind, email), Date.now());
}

function cooldownLeft(kind, email) {
  const sentAt = authEmailSentAt.get(emailKey(kind, email));
  if (!sentAt) return 0;
  return Math.max(0, Math.ceil((AUTH_COOLDOWN_SECONDS * 1000 - (Date.now() - sentAt)) / 1000));
}

function startResendCooldown(ctx) {
  stopAuthTimer();
  const button = ctx.host.querySelector(".auth-resend");
  if (!button) return;
  const label = button.querySelector(".auth-submit-label");
  let shown = null;
  const tick = () => {
    if (!button.isConnected) return stopAuthTimer();
    const left = cooldownLeft(ctx.kind, ctx.email);
    if (left !== shown) {
      shown = left;
      button.disabled = left > 0;
      label.innerHTML = left > 0 ? `Resend email <span class="auth-count">(${left}s)</span>` : "Resend email";
    }
    if (!left) stopAuthTimer();
  };
  tick();
  if (shown > 0) authTimer = setInterval(tick, 250);
}

function focusAuthView(ctx) {
  const target = ctx.host.querySelector(".auth-input") || ctx.host.querySelector(".auth-title");
  target?.focus({ preventScroll: ctx.modal });
}

// `email` is the address a request was actually sent to; it always wins over whatever is typed now.
function showAuthMode(ctx, mode, { notice = null, focus = true, kind, email } = {}) {
  stopAuthTimer();
  const typed = ctx.host.querySelector('input[name="email"]')?.value.trim();
  if (email) ctx.email = email;
  else if (typed) ctx.email = typed;
  if (kind) ctx.kind = kind;
  ctx.mode = AUTH_VIEWS[mode] ? mode : "sign-in";
  ctx.host.innerHTML = authViewHtml(ctx, ctx.mode);
  bindAuthView(ctx);
  if (notice) showAuthAlert(ctx, notice);
  if (ctx.mode === "check-email") startResendCooldown(ctx);
  if (focus) focusAuthView(ctx);
}

function mountAuth(host, { mode = "sign-in", modal = false, after, notice = null, focus = true } = {}) {
  const ctx = { host, modal, after, email: "", kind: "recovery", mode, uid: modal ? "auth-m" : "auth-p" };
  host.onclick = (event) => {
    const toggle = event.target.closest(".pw-toggle");
    if (toggle) return togglePasswordVisibility(toggle);
    const go = event.target.closest("[data-auth-go]");
    if (go && !state.inFlight) {
      playSound("tap");
      // detail === 0 means the click came from the keyboard: swap views without the entry fade.
      host.toggleAttribute("data-instant", event.detail === 0);
      return showAuthMode(ctx, go.dataset.authGo);
    }
    const resend = event.target.closest('[data-auth-action="resend-confirmation"]');
    if (resend) return resendConfirmation(ctx, resend);
    const cancel = event.target.closest('[data-auth-action="cancel-recovery"]');
    if (cancel) cancelPasswordRecovery(cancel);
  };
  showAuthMode(ctx, mode, { notice, focus });
  return ctx;
}

function bindAuthView(ctx) {
  const resend = ctx.host.querySelector(".auth-resend");
  if (resend) resend.onclick = () => resendAuthEmail(ctx, resend);
  const form = ctx.host.querySelector(".auth-form");
  if (!form) return;
  form.oninput = (event) => {
    if (event.target.getAttribute?.("aria-invalid") !== "true") return;
    event.target.removeAttribute("aria-invalid");
    describeWithAlert(ctx, event.target, false);
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    if (state.inFlight) return;
    showAuthAlert(ctx, null);
    if (!validateAuthForm(ctx, form)) return;
    const values = Object.fromEntries(new FormData(form));
    const handler = { "sign-in": authSignIn, "sign-up": authSignUp, reset: authRequestReset, "update-password": authUpdatePassword }[ctx.mode];
    authBusy(ctx, form.querySelector(".auth-submit"), AUTH_VIEWS[ctx.mode].busy, () => handler(ctx, values));
  };
}

async function finishAuth(ctx, session) {
  if (!session?.user) throw Object.assign(new Error("We couldn't start your session. Try signing in again."), { userFacing: true });
  setRecoveryFlag(false);
  state.sbUser = session.user;
  await loadCloudProfileAndFriends();
  await ctx.after();
}

async function authSignIn(ctx, values) {
  const email = values.email.trim();
  ctx.submittedEmail = email;
  const { data, error } = await state.sbClient.auth.signInWithPassword({ email, password: values.password });
  if (error) throw error;
  await finishAuth(ctx, data.session);
}

async function authSignUp(ctx, values) {
  const email = values.email.trim();
  const username = values.username.trim().toLowerCase();
  const { data, error } = await state.sbClient.auth.signUp({
    email,
    password: values.password,
    options: { emailRedirectTo: authRedirectUrl(), data: { username, display_name: username } },
  });
  if (error) throw error;
  if (data.session) return finishAuth(ctx, data.session);
  // Supabase obfuscates existing accounts here; the confirmation screen stays generic on purpose.
  markEmailSent("signup", email);
  showAuthMode(ctx, "check-email", { kind: "signup", email });
}

async function authRequestReset(ctx, values) {
  const email = values.email.trim();
  if (cooldownLeft("recovery", email) === 0) {
    const { error } = await state.sbClient.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
    if (error) throw error;
    markEmailSent("recovery", email);
  }
  showAuthMode(ctx, "check-email", { kind: "recovery", email });
}

async function resendAuthEmail(ctx, button) {
  if (state.inFlight || cooldownLeft(ctx.kind, ctx.email) > 0) return;
  showAuthAlert(ctx, null);
  const { kind, email } = ctx;
  const sent = await authBusy(ctx, button, "Sending…", async () => {
    const { error } = kind === "signup"
      ? await state.sbClient.auth.resend({ type: "signup", email, options: { emailRedirectTo: authRedirectUrl() } })
      : await state.sbClient.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
    if (error) throw error;
    markEmailSent(kind, email);
  });
  if (!button.isConnected) return;
  if (sent) showAuthAlert(ctx, { tone: "ok", text: `Sent! A new link is on its way to ${email}.` });
  startResendCooldown(ctx);
}

// "Send a new link" on the unconfirmed-email error: sends first, then shows the check-email screen.
async function resendConfirmation(ctx, button) {
  const email = ctx.submittedEmail;
  if (!email || state.inFlight) return;
  if (cooldownLeft("signup", email) > 0) return showAuthMode(ctx, "check-email", { kind: "signup", email });
  state.inFlight = true;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Sending a new link…";
  let failure = null;
  try {
    const { error } = await state.sbClient.auth.resend({ type: "signup", email, options: { emailRedirectTo: authRedirectUrl() } });
    if (error) throw error;
    markEmailSent("signup", email);
  } catch (err) {
    failure = err;
  } finally {
    state.inFlight = false;
  }
  if (!ctx.host.isConnected) return;
  if (failure) showAuthAlert(ctx, friendlyAuthError(failure, ctx.mode));
  else showAuthMode(ctx, "check-email", { kind: "signup", email });
}

async function authUpdatePassword(ctx, values) {
  const { data, error } = await state.sbClient.auth.updateUser({ password: values.password });
  if (error) throw error;
  setRecoveryFlag(false);
  history.replaceState(null, "", authRedirectUrl());
  if (data?.user) state.sbUser = data.user;
  setAuthMood(ctx, "happy");
  toast("Password updated! Welcome back.");
  playSound("correct");
  await loadCloudProfileAndFriends();
  await enterCloud();
}

// The recovery flag is cleared by clearSession() once signOut() succeeds, never before.
function cancelPasswordRecovery(button) {
  if (state.inFlight) return;
  return guarded(button, signOut);
}

function renderAuth(mode) {
  stopAuthTimer();
  document.body.classList.remove("mode-mission");
  document.getElementById("lesson-footer-host").replaceChildren();
  const bar = document.getElementById("topbar");
  bar.innerHTML = `<div class="topbar-inner auth-topbar">
    <span class="auth-wordmark">${mascotHtml("idle", 26)}<span>Delightful Learn</span></span>
    ${themeButtonHtml("auth-theme")}
  </div>`;
  bar.querySelector("#auth-theme").onclick = toggleTheme;
  const root = document.getElementById("app-root");
  if (!state.sbClient) {
    root.innerHTML = `<section class="auth-screen"><div class="auth-card"><div class="auth-view" data-mode="offline">
      <div class="auth-hero">
        <div class="auth-kubo">${mascotHtml("oops", 68)}</div>
        <h1 class="auth-title">Accounts are offline</h1>
        <p class="auth-sub">We can't reach the account service right now. Reload the page to try again.</p>
      </div>
      <button id="auth-reload" class="btn-tactile secondary full" type="button">Reload</button>
    </div></div></section>`;
    root.querySelector("#auth-reload").onclick = () => window.location.reload();
    return;
  }
  root.innerHTML = `<section class="auth-screen"><div class="auth-card" id="auth-panel"></div></section>`;
  const notice = state.authNotice;
  state.authNotice = null;
  const recovering = state.passwordRecovery && state.sbUser;
  mountAuth(root.querySelector("#auth-panel"), {
    mode: recovering ? "update-password" : mode || notice?.mode || "sign-in",
    notice,
    after: enterCloud,
    focus: recovering || Boolean(notice) || matchMedia("(pointer: fine)").matches,
  });
}

async function enterCloud() {
  state.view = "courses";
  try {
    await listCourses();
    const saved = prefGet("active_course_" + state.sbUser.id);
    const course = state.courses.find((c) => c.id === saved) || (STATIC_MODE ? state.courses[0] : null);
    if (course) return await openCourse(course);
    if (!STATIC_MODE && state.data) {
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
  if (!state.sbUser) return;
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
    <span class="wordmark">${mascotHtml("idle", 28)}<span>Delightful Learn</span></span>
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
  stopAuthTimer();
  setRecoveryFlag(false);
  state.sbUser = null;
  state.sbProfile = null;
  state.friends = [];
  state.courses = [];
  state.course = null;
  state.progress = null;
  state.data = null;
  state.achievements = [];
  state.reviewedCards = 0;
  state.mascotColor = "#4F46E5";
  state.mascotAccessory = "none";
  state.mascotShape = "cube";
  clearUserStorage();
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

const EDITOR_MIN = 220;
const EDITOR_MAX = 680;
const EDITOR_COMPACT = 280;
const EDITOR_EXPANDED = 520;
state.editorHeight = EDITOR_COMPACT;

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
  return "draft_" + userScope() + "_" + encodeURIComponent(state.course?.id || "local") + "_" + encodeURIComponent(step.id);
}

function codeResultsHtml(res) {
  if (!res) return "";
  const line = String(res.stderr ?? "").match(/File "[^"\n]*solution\.py", line (\d+)/)?.[1];
  const checks = res.checks?.length ? res.checks : [{ name: "Verification", passed: res.passed }];
  return `<ul class="checks-list" aria-label="Verification results">${checks.map((check) => `
    <li><span class="check-icon ${check.passed ? "pass" : "fail"}" aria-hidden="true">${check.passed ? sizedIcon("check", 16, 2.8) : sizedIcon("close", 16, 2.4)}</span>
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

  bindEditorSizing(shell);

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
        state.footerSheen = true;
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

// Write height directly to the editor scroll surfaces to avoid parent custom-property recalcs during drag.
function bindEditorSizing(shell) {
  const handle = document.getElementById("code-resize");
  const toggle = document.getElementById("btn-editor-size");
  const apply = (height) => {
    state.editorHeight = Math.round(Math.max(EDITOR_MIN, Math.min(EDITOR_MAX, height)));
    const px = `${state.editorHeight}px`;
    const scroller = shell.querySelector(".cm-scroller");
    if (scroller) scroller.style.height = px;
    const ta = shell.querySelector(".code-editor");
    const gutter = shell.querySelector(".code-gutter");
    if (ta) ta.style.height = px;
    if (gutter) gutter.style.height = px;
    handle.setAttribute("aria-valuenow", String(state.editorHeight));
    const expanded = state.editorHeight >= EDITOR_EXPANDED;
    toggle.textContent = expanded ? "Compact" : "Expand";
    toggle.setAttribute("aria-pressed", String(expanded));
  };
  toggle.onclick = () => apply(state.editorHeight >= EDITOR_EXPANDED ? EDITOR_COMPACT : EDITOR_EXPANDED);
  handle.onpointerdown = (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY, startH = state.editorHeight;
    handle.classList.add("dragging");
    handle.onpointermove = (move) => apply(startH + move.clientY - startY);
    handle.onpointerup = handle.onpointercancel = () => {
      handle.classList.remove("dragging");
      handle.onpointermove = handle.onpointerup = handle.onpointercancel = null;
    };
  };
  handle.onkeydown = (event) => {
    const delta = { ArrowUp: -20, ArrowDown: 20 }[event.key];
    if (!delta) return;
    event.preventDefault();
    apply(state.editorHeight + delta);
  };
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
      status.textContent = "Showing precomputed PyTorch run. Run uv run rl-studio locally for live custom params";
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
      state.footerSheen = true;
      renderMissionFooter();
    } catch (err) {
      if (out.isConnected && currentStepId() === expectedStepId) status.textContent = err.message;
    } finally {
      run.innerHTML = `${ICONS.play} Run PyTorch Simulation`;
    }
  });
}

init();
