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
  ["achievements", "reviewed_cards", "mascot_color", "mascot_accessory", "mascot_shape", "mascot_effect"].forEach(prefRemove);
  if (!purgeUserId) return;
  const scope = "u_" + encodeURIComponent(purgeUserId) + "_";
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("course_studio_draft_" + scope) || k.startsWith("course_studio_bet_" + scope) || k.startsWith("course_studio_beat_" + scope))) {
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
  return state.view === "mission" ? activeLessonBeat().stepId : null;
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
  if (style && style !== previous.getAttribute("style")) requestAnimationFrame(() => {
    if (!previous.isConnected) return;
    const lessonProgress = previous.closest(".lesson-progress") && !prefersReducedMotion();
    previous.setAttribute("style", style);
    if (lessonProgress) {
      previous.classList.remove("progress-advance");
      requestAnimationFrame(() => previous.classList.add("progress-advance"));
    }
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
  { id: "glacier", name: "Glacier", body: "#38BDF8", shade: "#0284C7", hi: "#E0F2FE" },
  { id: "sakura", name: "Sakura", body: "#F472B6", shade: "#DB2777", hi: "#FCE7F3" },
  { id: "aurora", name: "Aurora", body: "#2DD4BF", shade: "#0D9488", hi: "#CCFBF1" },
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
  { level: 11, threshold: 1750, accessory: "frost_scarf", shapes: [], colors: [], label: "Frost Scarf" },
  { level: 12, threshold: 2100, accessory: "none", shapes: ["star"], colors: ["glacier"], label: "Star shape & Glacier" },
  { level: 13, threshold: 2500, accessory: "detective", shapes: [], colors: [], effects: ["sparkle"], label: "Detective Hat & Sparkle" },
  { level: 14, threshold: 2950, accessory: "chef_hat", shapes: [], colors: ["sakura"], label: "Chef Hat & Sakura" },
  { level: 15, threshold: 3450, accessory: "none", shapes: ["shield"], colors: [], effects: ["frost"], label: "Shield shape & Frost" },
  { level: 16, threshold: 4000, accessory: "halo", shapes: [], colors: [], label: "Halo" },
  { level: 17, threshold: 4600, accessory: "none", shapes: ["capsule"], colors: [], effects: ["flame"], label: "Capsule shape & Flame" },
  { level: 18, threshold: 5200, accessory: "astronaut", shapes: [], colors: ["aurora"], label: "Astronaut Helmet & Aurora" },
  { level: 19, threshold: 5850, accessory: "none", shapes: [], colors: [], effects: ["orbit"], label: "Orbit" },
  { level: 20, threshold: 6500, accessory: "flame_crown", shapes: [], colors: [], effects: ["rainbow"], label: "Flame Crown & Rainbow" },
];
// Rank names mirror dopamine.LEVELS.
const RANK_NAMES = [
  "Random Policy", "Bellman Explorer", "Gradient Tamer", "Advantage Hunter", "Critic Whisperer",
  "Mask Architect", "Trust Region Pilot", "PPO Tactician", "Self-Play Strategist", "Grandmaster",
  "Tabular Master", "Dyna Architect", "Deadly Triad Tamer", "DQN Pioneer", "Entropy Whisperer",
  "Alignment Sage", "Self-Play Titan", "League Champion", "Deep RL Virtuoso", "RL Legend",
];
const ACCESSORY_NAMES = {
  none: "Classic", headphones: "Headphones", glasses: "Cool Glasses", beanie: "Cozy Beanie", gradcap: "Grad Cap",
  bowtie: "Bow Tie", visor: "Cyber Visor", wizard: "Wizard Hat", aura: "Sparkle Aura", crown: "Royal Crown",
  frost_scarf: "Frost Scarf", astronaut: "Astronaut Helmet", chef_hat: "Chef Hat", detective: "Detective Hat",
  halo: "Halo", flame_crown: "Flame Crown",
};
const MASCOT_SHAPES = [
  { id: "cube", name: "Cube" },
  { id: "orb", name: "Orb" },
  { id: "prism", name: "Prism" },
  { id: "hexagon", name: "Hexagon" },
  { id: "diamond", name: "Diamond" },
  { id: "star", name: "Star" },
  { id: "shield", name: "Shield" },
  { id: "capsule", name: "Capsule" },
];
const MASCOT_EFFECTS = [
  { id: "none", name: "No aura" },
  { id: "sparkle", name: "Sparkle" },
  { id: "frost", name: "Frost" },
  { id: "flame", name: "Flame" },
  { id: "orbit", name: "Orbit" },
  { id: "rainbow", name: "Rainbow" },
];
// Mirrors dopamine.SHOP_ITEMS, DAILY_GOALS and the streak milestones exactly.
const SHOP_ITEMS = {
  streak_freeze: { cost: 40, label: "Streak Freeze" },
  xp_boost_15m: { cost: 35, label: "15-minute 2× XP Booster" },
  frost_scarf: { cost: 50, label: "Frost Scarf" },
  chef_hat: { cost: 60, label: "Chef Hat" },
  astronaut: { cost: 80, label: "Astronaut Helmet" },
  flame_crown: { cost: 120, label: "Flame Crown" },
  effect_frost: { cost: 65, label: "Frost Effect" },
  effect_flame: { cost: 75, label: "Flame Effect" },
  effect_rainbow: { cost: 110, label: "Rainbow Effect" },
};
const DAILY_GOALS = [30, 50, 100, 150];
// Invite codes use generate_invite_code's alphabet: no 0/O or 1/I, so "INVALID" never parses.
const INVITE_CODE_RE = /^[A-HJ-NP-Z2-9]{6,8}$/;
const STREAK_MILESTONES = [3, 7, 14, 30];
const MAX_STREAK_FREEZES = 5;
const MAX_BOOST_TOKENS = 10;
const BOOST_MINUTES = 15;
const PENDING_LINKS_KEY = "dl_pending_links";

const DEMO_SQUAD = [
  { id: "demo-1", username: "lena", display_name: "Lena", mascot_color: "#10B981", mascot_accessory: "headphones", mascot_shape: "orb", mascot_effect: "sparkle", xp: 145, weekly_xp: 95, streak_days: 4, streak_on_ice: false, current_step_id: "" },
  { id: "demo-2", username: "max", display_name: "Max", mascot_color: "#F43F5E", mascot_shape: "star", xp: 95, weekly_xp: 60, streak_days: 3, streak_on_ice: true, current_step_id: "" },
  { id: "demo-3", username: "jonas", display_name: "Jonas", mascot_color: "#F59E0B", mascot_accessory: "glasses", mascot_shape: "hexagon", mascot_effect: "flame", xp: 260, weekly_xp: 120, streak_days: 6, streak_on_ice: false, current_step_id: "" },
  { id: "demo-4", username: "sofia", display_name: "Sofia", mascot_color: "#38BDF8", mascot_accessory: "frost_scarf", mascot_shape: "capsule", mascot_effect: "frost", xp: 40, weekly_xp: 40, streak_days: 2, streak_on_ice: false, current_step_id: "" },
];

const state = {
  data: null,
  view: "map", // "map" | "mission" | "drill"
  districtIdx: 0,
  beatIdx: 0,
  lesson: null,
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
  reviewedCards: Number(prefGet("reviewed_cards")) || 0,
  // Inline End-of-Unit Recall Sprint state (per district id)
  unitSprint: Object.create(null),
  combo: 0,
  theme: prefGet("theme") === "light" ? "light" : "dark",
  mascotColor: prefGet("mascot_color") || "#4F46E5",
  mascotAccessory: prefGet("mascot_accessory") || "none",
  mascotShape: prefGet("mascot_shape") || "cube",
  mascotEffect: prefGet("mascot_effect") || "none",
  achievements: loadAchievements(),
  timer: { mode: "focus", total: 1500, left: 1500, running: false, interval: null, popoverOpen: false, cycle: 0 },
  sbClient: null,
  sbUser: null,
  sbProfile: null,
  passwordRecovery: false,
  authNotice: null,
  friends: [],
  demoSquadOn: prefGet("demo_squad") === "1",
  modalOpen: false,
  inFlight: false,
  ratingCooldown: 0,
  course: null,
  courses: [],
  progress: null,
  pendingLinks: null,
  leaderboard: { timeframe: "week", scope: "course", entries: null, loading: false },
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
  { id: "ppo_boss", title: "PPO Master", desc: "Complete Unit 6 (PPO Deep Dive)", icon: "bolt", xp: 75 },
  { id: "full_mastery", title: "Full Mastery", desc: "Complete every step in the course", icon: "check", xp: 100 },
  { id: "streak_3", title: "Warming Up", desc: "Reach a 3-day streak", icon: "flame", xp: 25 },
  { id: "streak_7", title: "Week Warrior", desc: "Reach a 7-day streak", icon: "flame", xp: 50 },
  { id: "ice_saver", title: "Saved on Ice", desc: "Let a Streak Freeze protect your streak", icon: "snow", xp: 30 },
  { id: "booster_pro", title: "Booster Pro", desc: "Activate a 2× XP Boost", icon: "bolt", xp: 30 },
  { id: "social_butterfly", title: "Social Butterfly", desc: "Connect with a friend", icon: "users", xp: 25 },
  { id: "classical_scholar", title: "Classical Scholar", desc: "Complete the Classical RL unit", icon: "book", xp: 50 },
  { id: "beyond_ppo", title: "Beyond PPO", desc: "Complete the Deep RL Evolution unit", icon: "target", xp: 60 },
  { id: "monopoly_scaler", title: "Monopoly Scaler", desc: "Complete the Scaling Monopoly unit", icon: "crown", xp: 75 },
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

// Rank Rewards: Levels Unlock Kubo Customizations (Gems can unlock shop cosmetics early)
function levelRewards() {
  const g = state.data && state.data.gamification;
  const served = g?.level_rewards?.filter((r) => Object.hasOwn(ACCESSORY_NAMES, r.accessory));
  return served?.length >= DEFAULT_LEVEL_REWARDS.length ? served : DEFAULT_LEVEL_REWARDS;
}

function currentXp() {
  return (state.data && state.data.gamification.xp) || 0;
}

function ownedCosmetics() {
  const owned = state.data?.gamification?.unlocked_cosmetics;
  return new Set(Array.isArray(owned) ? owned : []);
}

function rewardFor(kind, id) {
  return levelRewards().find((r) => (kind === "accessory" ? r.accessory === id : (r[kind] || []).includes(id))) || null;
}

function isAccessoryUnlocked(acc) {
  if (!Object.hasOwn(ACCESSORY_NAMES, acc)) return false;
  if (acc === "none") return true;
  if (ownedCosmetics().has(acc)) return true;
  const r = rewardFor("accessory", acc);
  return Boolean(r && currentXp() >= r.threshold);
}

function isShapeUnlocked(shapeId) {
  if (!MASCOT_SHAPES.some((x) => x.id === shapeId)) return false;
  if (ownedCosmetics().has(shapeId) || ownedCosmetics().has(`shape_${shapeId}`)) return true;
  const r = rewardFor("shapes", shapeId);
  return !r || currentXp() >= r.threshold;
}

function shapeUnlockReward(shapeId) {
  return rewardFor("shapes", shapeId) || levelRewards()[0];
}

function equippedShape() {
  return isShapeUnlocked(state.mascotShape) ? state.mascotShape : "cube";
}

function applyUserShape(shape) {
  state.mascotShape = MASCOT_SHAPES.some((x) => x.id === shape) ? shape : "cube";
  prefSet("mascot_shape", state.mascotShape);
}

function isColorUnlocked(paletteId) {
  if (ownedCosmetics().has(paletteId) || ownedCosmetics().has(`color_${paletteId}`)) return true;
  const r = rewardFor("colors", paletteId);
  return !r || currentXp() >= r.threshold;
}

function colorUnlockLevel(paletteId) {
  const r = rewardFor("colors", paletteId);
  return r ? r.level : 1;
}

function isEffectUnlocked(effectId) {
  if (!MASCOT_EFFECTS.some((x) => x.id === effectId)) return false;
  if (effectId === "none" || ownedCosmetics().has(`effect_${effectId}`) || ownedCosmetics().has(effectId)) return true;
  const r = rewardFor("effects", effectId);
  return Boolean(r && currentXp() >= r.threshold);
}

function effectUnlockReward(effectId) {
  return rewardFor("effects", effectId);
}

function equippedEffect() {
  return isEffectUnlocked(state.mascotEffect) ? state.mascotEffect : "none";
}

function applyUserEffect(effect) {
  state.mascotEffect = MASCOT_EFFECTS.some((x) => x.id === effect) ? effect : "none";
  prefSet("mascot_effect", state.mascotEffect);
}

// Every accessory once, in rank order, with the rank that unlocks it.
function accessoryCatalog() {
  const seen = new Set();
  return levelRewards().filter((r) => !seen.has(r.accessory) && seen.add(r.accessory));
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
  keyboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/></svg>`,
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
  snow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M4.3 6.5l15.4 11M4.3 17.5l15.4-11"/><path d="m9.5 3.5 2.5 2 2.5-2M9.5 20.5l2.5-2 2.5 2M3.6 10.2l3 .6-.9 3M20.4 13.8l-3-.6.9-3M3.6 13.8l3-.6-.9-3M20.4 10.2l-3 .6.9 3"/></svg>`,
  trophy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9.5 18h5"/></svg>`,
  gem: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11L22 9l-10 11.5L2 9l4.5-5.5Z"/><path d="M2 9h20M9.5 3.5 8 9l4 11.5L16 9l-1.5-5.5"/></svg>`,
  link: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>`,
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
  if (acc === "frost_scarf") {
    return {
      back: "",
      front: `<g class="kubo-scarf">
          <path d="M11.5 42.6c12.4 5.4 28.6 5.4 41 0v5.8c-12.4 5.4-28.6 5.4-41 0Z" fill="#38BDF8" stroke="#0369A1" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M18 46.2v3.4M24 47.6v3.4M30 48.2v3.4M36 48.2v3.4M42 47.6v3.4M48 46.2v3.4" stroke="#E0F2FE" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>
          <path d="M40.5 48.6 43.4 58h5.4l-2.6-10.4Z" fill="#0EA5E9" stroke="#0369A1" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M44.6 58v1.6M47.4 58v1.6" stroke="#0369A1" stroke-width="1.1" stroke-linecap="round"/>
        </g>`,
      head: false,
    };
  }
  if (acc === "astronaut") {
    return {
      back: `<rect x="14.5" y="49" width="35" height="6.4" rx="3.2" fill="#CBD5E1" stroke="#64748B" stroke-width="1.2"/>`,
      front: `<g class="kubo-helmet">
          <circle cx="32" cy="29.5" r="27.5" fill="#BAE6FD" fill-opacity="0.16" stroke="#E2E8F0" stroke-width="2.6"/>
          <circle cx="32" cy="29.5" r="27.5" stroke="#64748B" stroke-width="0.8" opacity="0.55"/>
          <path d="M13.6 19.6C17.4 12 24 7.8 31.5 7.2" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" fill="none" opacity="0.8"/>
          <path d="M51.4 37.6c-1 2.8-2.6 5.2-4.6 7.2" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.55"/>
          <circle cx="50.5" cy="12.5" r="2.1" fill="#F43F5E"/>
        </g>`,
      head: false,
    };
  }
  if (acc === "chef_hat") {
    return {
      back: "",
      front: `<rect x="19.5" y="9.6" width="25" height="5.6" rx="1.6" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1.2"/>
        <path d="M21 10.4c-5.6-.4-7.2-7.8-1.8-9.6 1.4-4.4 7.6-5 9.6-1.4 2.2-3.8 6.8-3.8 9 0 2.6-3.2 8.4-2 9 2.6 4.6 2.6 2.6 8.8-1.8 8.4Z" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M27 5.8v4.2M32 4.6v5.4M37 5.8v4.2" stroke="#CBD5E1" stroke-width="1.2" stroke-linecap="round"/>`,
      head: true,
    };
  }
  if (acc === "detective") {
    return {
      back: "",
      front: `<path d="M16 14.6C16 3.2 48 3.2 48 14.6Z" fill="#92400E" stroke="#78350F" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M20.5 9.6h23M27 6v8.4M37 6v8.4" stroke="#F59E0B" stroke-width="1" opacity="0.65"/>
        <path d="M9.5 15.6c4.4-2.8 10.4-2.4 14.6-.4M54.5 15.6c-4.4-2.8-10.4-2.4-14.6-.4" stroke="#78350F" stroke-width="3.2" stroke-linecap="round" fill="none"/>
        <path d="M19.4 14 17 22.6M44.6 14 47 22.6" stroke="#92400E" stroke-width="3.2" stroke-linecap="round"/>
        <circle cx="32" cy="3.8" r="1.9" fill="#78350F"/>`,
      head: true,
    };
  }
  if (acc === "halo") {
    return {
      back: "",
      front: `<g class="kubo-halo">
          <ellipse cx="32" cy="1.6" rx="13.5" ry="3.8" stroke="#F59E0B" stroke-width="3" fill="none"/>
          <ellipse cx="32" cy="1.6" rx="13.5" ry="3.8" stroke="#FEF3C7" stroke-width="1" fill="none"/>
        </g>`,
      head: true,
    };
  }
  if (acc === "flame_crown") {
    const flame = (x, y, fill) => `<path d="M${x} ${y}c-2.4-2.6-1.6-5.6.6-7.6.2 2.2 1.9 3.1 1.7 5.3-.2 1.5-1.2 2.3-2.3 2.3Z" fill="${fill}"/>`;
    return {
      back: "",
      front: `<path d="M19 14.2 20.8 5.6 26 9.6 29.4 2.6 32.6 8.4 35.8 2.6 39 9.6 43.2 5.6 45 14.2Z" fill="#F97316" stroke="#C2410C" stroke-width="1.4" stroke-linejoin="round"/>
        ${flame(20.2, 5.4, "#FDE047")}${flame(29, 2.6, "#FBBF24")}${flame(35.4, 2.6, "#FBBF24")}${flame(42.6, 5.4, "#FDE047")}
        <rect x="19" y="11.8" width="26" height="3" rx="1.5" fill="#C2410C"/>
        <circle cx="32" cy="10.6" r="1.6" fill="#FDE047"/>`,
      head: true,
    };
  }
  return { back: "", front: "", head: false };
}

// Auras: decorative layers whose motion is transform/opacity only (paused under reduced motion in CSS).
function effectLayers(effect) {
  if (effect === "sparkle") {
    const star = (cls, x, y, r) => `<path class="fx-twinkle ${cls}" d="M${x} ${y - r}l${r * 0.28} ${r * 0.72} ${r * 0.72} ${r * 0.28}-${r * 0.72} ${r * 0.28}-${r * 0.28} ${r * 0.72}-${r * 0.28}-${r * 0.72}-${r * 0.72}-${r * 0.28} ${r * 0.72}-${r * 0.28}Z" fill="#FDE047"/>`;
    return { back: "", front: `<g class="kubo-fx fx-sparkle">${star("t1", 4, 10, 3.6)}${star("t2", 60, 8, 3)}${star("t3", 61, 40, 2.6)}${star("t4", 3, 42, 3)}</g>` };
  }
  if (effect === "frost") {
    const flake = (cls, x, y, r) => `<g class="fx-flake ${cls}" transform="translate(${x} ${y})"><path d="M0 -${r}V${r}M-${r * 0.87} -${r / 2} ${r * 0.87} ${r / 2}M-${r * 0.87} ${r / 2} ${r * 0.87} -${r / 2}" stroke="#7DD3FC" stroke-width="1.3" stroke-linecap="round"/></g>`;
    return {
      back: `<ellipse class="fx-frost-glow" cx="32" cy="31" rx="30" ry="27" fill="#7DD3FC" opacity="0.14"/>`,
      front: `<g class="kubo-fx fx-frost">${flake("f1", 5, 16, 3.4)}${flake("f2", 59, 12, 2.8)}${flake("f3", 60, 42, 3.2)}${flake("f4", 4, 46, 2.6)}</g>`,
    };
  }
  if (effect === "flame") {
    const ember = (cls, x, y, s) => `<path class="fx-ember ${cls}" d="M${x} ${y}c-${s} -${s * 1.2}-${s * 0.7}-${s * 2.6} 0-${s * 3.4} ${s * 0.7} ${s * 0.8} ${s} ${s * 2.2} 0 ${s * 3.4}Z" fill="#FB923C"/>`;
    // Bold tongues behind the body keep the aura legible at 26-36px avatar sizes.
    const tongue = (cls, x, y, w, h, fill) => `<path class="fx-tongue ${cls}" d="M${x} ${y}c-${w * 0.6} 0-${w * 0.7}-${h * 0.5} 0-${h}c${w * 0.7} ${h * 0.5} ${w * 0.6} ${h} 0 ${h}Z" fill="${fill}"/>`;
    return {
      back: `<g class="kubo-fx fx-flame-back">
          <ellipse class="fx-flame-glow" cx="32" cy="46" rx="29" ry="14" fill="#F97316" opacity="0.32"/>
          ${tongue("k1", 9, 54, 9, 26, "#F97316")}${tongue("k2", 53, 54, 9, 26, "#F97316")}
          ${tongue("k3", 14, 52, 6, 17, "#FBBF24")}${tongue("k4", 49, 52, 6, 17, "#FBBF24")}
        </g>`,
      front: `<g class="kubo-fx fx-flame">${ember("e1", 6, 50, 3)}${ember("e2", 58, 48, 2.8)}${ember("e3", 10, 32, 2.4)}${ember("e4", 55, 28, 2.4)}</g>`,
    };
  }
  if (effect === "orbit") {
    return {
      back: `<g transform="translate(32 42) rotate(-14) scale(1 0.34)"><g class="fx-orbit-spin">
          <circle r="29" stroke="#A5B4FC" stroke-width="3.2" stroke-dasharray="5 7" fill="none"/>
          <circle cx="29" cy="0" r="7" fill="#818CF8"/>
        </g></g>`,
      front: `<path class="kubo-fx" d="M3.6 48.4c4 6 18.6 8.6 33.4 5.6 12.2-2.4 21.4-7.6 23.6-13.6" stroke="#A5B4FC" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0.85"/>`,
    };
  }
  if (effect === "rainbow") {
    const colors = ["#F43F5E", "#F59E0B", "#FDE047", "#22C55E", "#38BDF8", "#8B5CF6"];
    const arcs = colors.map((c, i) => `<circle r="29.5" stroke="${c}" stroke-width="3.4" stroke-dasharray="30.9 154.4" stroke-dashoffset="${(-30.9 * i).toFixed(1)}" fill="none"/>`).join("");
    return { back: `<g transform="translate(32 31)"><g class="fx-rainbow-spin" opacity="0.7">${arcs}</g></g>`, front: "" };
  }
  return { back: "", front: "" };
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
  star: {
    body: (fill, dy) => `<path d="${[[32, 8], [40.5, 20.3], [54.8, 24.6], [45.8, 36.5], [46.1, 51.4], [32, 46.5], [17.9, 51.4], [18.2, 36.5], [9.2, 24.6], [23.5, 20.3]]
      .map(([x, y], i) => `${i ? "L" : "M"}${x} ${(y + dy).toFixed(1)}`).join(" ")}Z" fill="${fill}" stroke="${fill}" stroke-width="6" stroke-linejoin="round"/>`,
    hi: "M28.6 15.2c2-2.6 4.8-2.6 6.8 0",
    face: 2, head: -3,
  },
  shield: {
    body: (fill, dy) => `<path d="M32 ${8 + dy} 52.5 ${14 + dy}V${28 + dy}C52.5 ${40 + dy} 44 ${48 + dy} 32 ${52 + dy}C20 ${48 + dy} 11.5 ${40 + dy} 11.5 ${28 + dy}V${14 + dy}Z" fill="${fill}" stroke="${fill}" stroke-width="4" stroke-linejoin="round"/>`,
    hi: "M20 16.4 32 12.6l12 3.8",
    face: 0, head: -2,
  },
  capsule: {
    body: (fill, dy) => `<rect x="13.5" y="${6 + dy}" width="37" height="46" rx="18.5" fill="${fill}"/>`,
    hi: "M22.5 12.6c4.4-3 14.6-3 19 0",
    face: 0, head: -4,
  },
};

function mascotHtml(mood = "idle", size = 56, customColor = null, speaking = false, idAttr = "", accessory = null, shape = null, effect = null) {
  const pal = customColor ? paletteForColor(customColor) : null;
  const colorVars = pal ? `style="--kb:${pal.body}; --ks:${pal.shade}; --kh:${pal.hi};"` : "";
  const acc = accessory !== null ? accessory : (customColor ? "none" : equippedAccessory());
  const layers = accessoryLayers(Object.hasOwn(ACCESSORY_NAMES, acc) ? acc : "none");
  const shapeId = shape !== null ? shape : (customColor ? "cube" : equippedShape());
  const geo = SHAPE_GEOMETRY[shapeId] || SHAPE_GEOMETRY.cube;
  const effectRaw = effect !== null ? effect : (customColor ? "none" : equippedEffect());
  const effectId = MASCOT_EFFECTS.some((x) => x.id === effectRaw) ? effectRaw : "none";
  const fx = effectLayers(effectId);

  const crown = mood === "proud" && !layers.head
    ? `<path d="M21 14 24 6l8 5 8-5 3 8H21Z" fill="#F59E0B" stroke="#B45309" stroke-width="1.6" stroke-linejoin="round"/>`
    : "";

  const restMouth = (mood === "happy" || mood === "proud")
    ? `<path class="kubo-mouth-smile" d="M26 37.5c2 3.2 10 3.2 12 0" stroke="#18181B" stroke-width="2.6" stroke-linecap="round" fill="none"/>`
    : mood === "oops"
      ? `<path class="kubo-mouth-smile" d="M27.5 39.6q2.2-1.6 4.5 0t4.5 0" stroke="#18181B" stroke-width="2.3" stroke-linecap="round" fill="none"/>`
      : mood === "thinking"
        ? `<path class="kubo-mouth-smile" d="M28.5 38.2c1.5 1.8 5.5 1.8 7 0" stroke="#18181B" stroke-width="2.4" stroke-linecap="round" fill="none"/>`
        : `<path class="kubo-mouth-smile" d="M27.5 38c1.6 2.2 7.4 2.2 9 0" stroke="#18181B" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;

  const talkMouth = `<ellipse class="kubo-mouth-talk" cx="32" cy="39" rx="4.2" ry="3.0" fill="#18181B"/>`;

  const warm = mood === "happy" || mood === "proud";
  const eyeY = warm ? 30.6 : 30.2;
  const brows = mood === "oops" ? "M19 24.4q4-1.6 8-.6 M37 20.6q4.6-3.6 9 .2"
    : mood === "thinking" ? "M18 24q4-3 9-2 M37 23q5-4 9-2"
    : "M19 24q4-2 8-1 M37 23q4-1 8 1";
  const eyes = [23.5, 40.5];
  const eyesEl = `<g class="kubo-eyes">
    <g class="kubo-eyes-open">
      ${eyes.map((x) => `<ellipse cx="${x}" cy="${eyeY}" rx="5.2" ry="${warm ? 4.2 : 5.2}" fill="#fff"/>`).join("")}
      <g class="kubo-pupils">${eyes.map((x) => `<circle cx="${x}" cy="${eyeY}" r="2.35" fill="#18181B"/>
        <circle cx="${x + 0.8}" cy="${eyeY - 1}" r=".8" fill="#fff"/>`).join("")}</g>
    </g>
    <path class="kubo-lids" d="M19 31q4.5 3 9 0 M36 31q4.5 3 9 0" stroke="#18181B" stroke-width="2.2" stroke-linecap="round"/>
  </g>`;
  const cheeks = `<g class="kubo-cheeks" fill="var(--mascot-cheek)" opacity="${warm ? 0.9 : 0.55}">
    <ellipse cx="18" cy="36.5" rx="${warm ? 3.2 : 2.6}" ry="1.7"/>
    <ellipse cx="46" cy="36.5" rx="${warm ? 3.2 : 2.6}" ry="1.7"/>
  </g>`;

  return `
    <span ${idAttr ? `id="${idAttr}"` : ""} class="kubo-wrap mood-${mood} acc-${acc} shape-${shapeId} fx-${effectId} ${speaking ? "speaking" : ""}" ${colorVars} aria-hidden="true">
      <svg class="kubo-svg" viewBox="0 0 64 60" width="${size}" height="${Math.round(size * 0.94)}" fill="none">
        <g class="kubo-body-group">
          <ellipse class="kubo-shadow" cx="32" cy="56" rx="18" ry="3.5" fill="currentColor" opacity="0.12"/>
          <g class="kubo-actor"><g class="kubo-breath">
          ${fx.back}
          ${layers.back}
          ${geo.body("var(--kubo-shade)", 3)}
          ${geo.body("var(--kubo-body)", 0)}
          <path d="${geo.hi}" stroke="var(--kubo-hi)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/>
          <g class="kubo-face-group" transform="translate(0 ${geo.face})">
            ${cheeks}
            <path class="kubo-brows" d="${brows}" stroke="#18181B" stroke-width="1.55" stroke-linecap="round"/>
            ${eyesEl}
            <g class="kubo-mouth">${restMouth}${talkMouth}</g>
          </g>
          <g transform="translate(0 ${layers.head ? geo.head : geo.face})">${layers.front}</g>
          ${crown ? `<g transform="translate(0 ${geo.head})">${crown}</g>` : ""}
          ${fx.front}
          </g></g>
        </g>
      </svg>
    </span>`;
}

// Loud, Crisp, Always-Unlocked Web Audio Engine
let audioCtx = null;
let audioMaster = null;

window.Delight.setSoundEnabled(() => Boolean(state.data?.gamification.sound_enabled));

function primeAudio() {
  window.Delight.primeAudio();
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
  const delight = window.Delight;
  if (kind === "tap") delight.triggerHaptic("tap");
  if (kind === "correct" || kind === "code_pass") delight.triggerHaptic("correct");
  const missed = kind === "miss" || kind === "wrong";
  if (missed) delight.triggerHaptic("wrong");
  if (state.data && !state.data.gamification.sound_enabled) return;
  if (comboBoost > 0 && (kind === "correct" || kind === "code_pass")) delight.playComboChime(comboBoost);
  const name = sfxNameFor(kind, comboBoost);
  if (!name) return;
  const fallback = () => playWav(name).catch(() => playSynth(kind, comboBoost));
  if (missed) delight.playSoftNudge().then((played) => {
    if (!played && state.data?.gamification.sound_enabled) fallback();
  });
  else fallback();
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
  return window.Delight.prefersReducedMotion();
}

function spawnSparkles(anchorEl, count = 14, spread = 1) {
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
    const dx = Math.cos(angle) * dist * spread;
    const dy = (Math.sin(angle) * dist - 18) * spread;
    const anim = el.animate([
      { transform: "translate(-50%, -50%) scale(0.4) rotate(0deg)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${120 + i * 25}deg)`, opacity: 1, offset: 0.65 },
      { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 22}px)) scale(0.2) rotate(${240 + i * 25}deg)`, opacity: 0 },
    ], { duration: 540 + Math.random() * 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" });
    anim.onfinish = () => el.remove();
  }
}

function spawnConfetti(originEl, count = 28) {
  const layer = document.getElementById("fx-layer");
  if (!layer || !originEl || prefersReducedMotion() || !originEl.animate) return;
  const { left, top, width, height } = originEl.getBoundingClientRect();
  const easing = window.Delight.springCurve("bouncy");
  const colors = ["#6366F1", "#22C55E", "#F59E0B", "#38BDF8", "#F472B6"];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = `fx-confetti shape-${i % 3}`;
    piece.style.left = `${left + width / 2}px`;
    piece.style.top = `${top + height / 2}px`;
    piece.style.backgroundColor = colors[i % colors.length];
    const angle = (i / count) * Math.PI * 2;
    const dx = Math.cos(angle) * (90 + Math.random() * 120);
    const dy = Math.sin(angle) * 65;
    layer.append(piece);
    const animation = piece.animate([
      { transform: "translate(0, 0) scale(.45)", opacity: 1 },
      { transform: `translate(${dx * .7}px, ${dy - 90}px) rotate(180deg) scale(1)`, opacity: 1, offset: .45 },
      { transform: `translate(${dx}px, ${dy + 125}px) rotate(420deg)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 300, easing });
    animation.onfinish = animation.oncancel = () => piece.remove();
  }
}

function recordLessonCheck(correct) {
  const lesson = state.lesson;
  lesson.correctChecks = correct ? lesson.correctChecks + 1 : 0;
  lesson.bestCombo = Math.max(lesson.bestCombo, lesson.correctChecks);
}

function actKubo(el, motion, mood) {
  if (!el) return;
  if (!el.classList.contains(`mood-${mood}`)) {
    const size = Number(el.querySelector(".kubo-svg").getAttribute("width"));
    const template = document.createElement("template");
    template.innerHTML = mascotHtml(mood, size);
    const replacement = template.content.firstElementChild;
    el.replaceWith(replacement);
    el = replacement;
  }
  el.classList.remove("kubo-jump", "kubo-shake");
  if (prefersReducedMotion()) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.classList.add(motion);
    if (motion === "kubo-jump") setTimeout(() => el.isConnected && window.Delight.sparkleRing?.(el), 90);
  }));
}

function kuboJump(el) {
  actKubo(el, "kubo-jump", el?.classList.contains("mood-proud") ? "proud" : "happy");
}

function kuboShake(el) {
  actKubo(el, "kubo-shake", "oops");
}

function animateLessonCheck(correct, target, advanceCombo = true, sparkles = 14) {
  if (!target) return;
  if (advanceCombo) recordLessonCheck(correct);
  const motionClass = correct ? "check-pop" : "nudge-shake";
  target.classList.remove("check-pop", "nudge-shake");
  if (!prefersReducedMotion()) requestAnimationFrame(() => target.classList.add(motionClass));
  const kubo = target.closest(".lesson-beat")?.querySelector(".kubo-wrap");
  if (correct) {
    kuboJump(kubo);
    spawnSparkles(target, sparkles);
  } else kuboShake(kubo);
}

function countLessonXp(element, xp) {
  if (xp <= 0) {
    element.classList.add("xp-settle");
    return;
  }
  let start;
  const tick = (now) => {
    if (!element.isConnected) return;
    start ??= now;
    const t = Math.min((now - start) / 800, 1);
    element.textContent = `+${numberFormat.format(Math.round(xp * (1 - (1 - t) ** 3)))} XP`;
    if (t < 1) requestAnimationFrame(tick);
    else element.classList.add("xp-settle");
  };
  element.textContent = "+0 XP";
  requestAnimationFrame(tick);
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
  if (state.view === "mission") {
    claimAchievementXp(def);
    return;
  }
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
    if (!cloudCourse()) syncProgressToSupabase();
    return;
  }
  const course = state.course;
  try {
    const res = await api("/api/achievement/claim", { achievement_id: def.id });
    if (state.course !== course || !res?.state) return;
    if (!cloudCourse() && localLessonWrites === 0) state.data = res.state;
    if (state.data && !state.passwordRecovery && state.view !== "courses") {
      renderTopbar();
      if (state.view === "map") renderMap();
    }
  } catch (err) {
    toast(err.message || "Achievement XP could not be saved.");
  }
  if (!cloudCourse()) syncProgressToSupabase();
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
  const unitDone = (id) => {
    const unit = state.data.districts.find((d) => d.id === id);
    return Boolean(unit && unit.steps.every((s) => isStepDone(s.id)));
  };
  if (unitDone("M4")) unlockAchievement("ppo_boss");
  if (unitDone("M6")) unlockAchievement("classical_scholar");
  if (unitDone("M7")) unlockAchievement("beyond_ppo");
  if (unitDone("M8")) unlockAchievement("monopoly_scaler");
  const streak = Number(state.data.gamification.streak_days) || 0;
  if (streak >= 3) unlockAchievement("streak_3");
  if (streak >= 7) unlockAchievement("streak_7");
  if (total && done * 2 >= total) unlockAchievement("halfway_hero");
  if (total && done === total) unlockAchievement("full_mastery");
}

function countCardReview() {
  state.reviewedCards += 1;
  prefSet("reviewed_cards", String(state.reviewedCards));
  if (state.reviewedCards >= 10) unlockAchievement("card_shark");
}

// Economy: gems, 2× XP boosters, streak freezes, daily goal (mirrors dopamine.award_xp exactly)
function dayGap(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "")) return 0;
  return Math.round((new Date(to + "T12:00:00") - new Date(from + "T12:00:00")) / 86400000);
}

function weekStart(today = day()) {
  const weekday = (new Date(today + "T12:00:00").getDay() + 6) % 7;
  return day(-weekday, today);
}

function defaultWallet() {
  return {
    gems: 50, weekly_xp: 0, weekly_xp_reset_date: "", streak_freezes: 1, streak_frozen_dates: [],
    last_active_date: "", xp_boost_until: "", xp_boost_mult: 1, xp_boost_tokens: 1,
    daily_xp: 0, daily_xp_date: "", daily_goal: 50, daily_goal_claimed_date: "",
    unlocked_cosmetics: [], unit_rewards: [],
  };
}

function normalizeWallet(raw) {
  const w = defaultWallet();
  const src = raw && typeof raw === "object" ? raw : {};
  const int = (value, lo, hi, fallback) => (Number.isInteger(value) ? Math.min(hi, Math.max(lo, value)) : fallback);
  const date = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "");
  const list = (value, ok) => (Array.isArray(value) ? [...new Set(value.filter(ok))] : []);
  w.gems = int(src.gems, 0, 1e9, w.gems);
  w.weekly_xp = int(src.weekly_xp, 0, 1e9, 0);
  w.weekly_xp_reset_date = date(src.weekly_xp_reset_date);
  w.streak_freezes = int(src.streak_freezes, 0, MAX_STREAK_FREEZES, w.streak_freezes);
  w.streak_frozen_dates = list(src.streak_frozen_dates, (d) => Boolean(date(d))).slice(-30);
  w.last_active_date = date(src.last_active_date);
  w.xp_boost_until = typeof src.xp_boost_until === "string" && Number.isFinite(Date.parse(src.xp_boost_until)) ? src.xp_boost_until : "";
  w.xp_boost_mult = int(src.xp_boost_mult, 1, 3, 1);
  w.xp_boost_tokens = int(src.xp_boost_tokens, 0, MAX_BOOST_TOKENS, w.xp_boost_tokens);
  w.daily_xp = int(src.daily_xp, 0, 1e9, 0);
  w.daily_xp_date = date(src.daily_xp_date);
  w.daily_goal = DAILY_GOALS.includes(src.daily_goal) ? src.daily_goal : 50;
  // daily_goal_reward_date is the legacy name of the same field.
  w.daily_goal_claimed_date = date(src.daily_goal_claimed_date) || date(src.daily_goal_reward_date);
  w.unlocked_cosmetics = list(src.unlocked_cosmetics, (id) => typeof id === "string" && Object.hasOwn(SHOP_ITEMS, id));
  w.unit_rewards = list(src.unit_rewards, (id) => typeof id === "string");
  return w;
}

// Profile columns are the account-wide source of truth; course meta keeps the rest.
function walletFromProfile(prof) {
  if (!prof || typeof prof.gems !== "number") return {};
  return {
    gems: prof.gems, weekly_xp: prof.weekly_xp,
    weekly_xp_reset_date: typeof prof.weekly_xp_reset_at === "string" ? weekStart(prof.weekly_xp_reset_at.slice(0, 10)) : "",
    streak_freezes: prof.streak_freezes, streak_frozen_dates: prof.streak_frozen_dates,
    last_active_date: prof.last_active_date, xp_boost_until: prof.xp_boost_until || "",
    xp_boost_mult: prof.xp_boost_mult, xp_boost_tokens: prof.xp_boost_tokens,
    daily_xp: prof.daily_xp, daily_xp_date: prof.daily_xp_date, daily_goal: prof.daily_goal,
    unlocked_cosmetics: prof.unlocked_cosmetics,
  };
}

function boostRemaining(g = state.data?.gamification, now = Date.now()) {
  const until = Date.parse(g?.xp_boost_until || "");
  return Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

function boostMultiplier(g = state.data?.gamification, now = Date.now()) {
  if (!boostRemaining(g, now)) return 1;
  const mult = Number(g.xp_boost_mult);
  return Number.isInteger(mult) && mult > 1 ? Math.min(3, mult) : 2;
}

// Same-day keeps the streak, the next day extends it, and each missed day spends one freeze
// (mirrors dopamine.award_xp). Too few freezes for the gap resets the streak.
function applyDailyActivity(w, progress, today = day()) {
  const result = { streak_saved_on_ice: false, freeze_earned: false };
  if (w.last_active_date === today) return result;
  const gap = dayGap(w.last_active_date, today);
  const missed = gap - 1;
  if (gap === 1) progress.streak_days += 1;
  else if (missed >= 1 && missed <= w.streak_freezes) {
    w.streak_freezes -= missed;
    const iced = Array.from({ length: missed }, (_, i) => day(i + 1, w.last_active_date));
    w.streak_frozen_dates = [...new Set([...w.streak_frozen_dates, ...iced])].slice(-30);
    progress.streak_days += 1;
    result.streak_saved_on_ice = true;
  } else progress.streak_days = 1;
  w.last_active_date = today;
  if (STREAK_MILESTONES.includes(progress.streak_days) && w.streak_freezes < MAX_STREAK_FREEZES) {
    w.streak_freezes += 1;
    result.freeze_earned = true;
  }
  return result;
}

// The daily goal pays +25 gems and one boost token once per day, whether XP reaches it
// or a lowered goal drops below XP already earned today (dopamine._claim_daily_goal).
function claimWalletDailyGoal(w, today = day()) {
  if (w.daily_xp_date !== today || w.daily_xp < w.daily_goal || w.daily_goal_claimed_date === today) return false;
  w.gems += 25;
  w.xp_boost_tokens = Math.min(MAX_BOOST_TOKENS, w.xp_boost_tokens + 1);
  w.daily_goal_claimed_date = today;
  return true;
}

// A combo of 3+ correct answers adds +5 before the boost multiplier, like dopamine.award_xp.
function earnWalletXp(w, points, today = day(), now = Date.now(), combo = 0) {
  const monday = weekStart(today);
  if (w.weekly_xp_reset_date !== monday) { w.weekly_xp = 0; w.weekly_xp_reset_date = monday; }
  if (w.daily_xp_date !== today) { w.daily_xp = 0; w.daily_xp_date = today; }
  const mult = boostMultiplier(w, now);
  const bonus = combo >= 3 ? 5 : 0;
  const gained = (points + bonus) * mult;
  w.weekly_xp += gained;
  w.daily_xp += gained;
  w.gems += 5;
  const daily_goal_reached = claimWalletDailyGoal(w, today);
  return { gained, mult, bonus, daily_goal_reached };
}

function activateWalletBoost(w, now = Date.now(), minutes = BOOST_MINUTES, mult = 2) {
  if (boostRemaining(w, now)) throw new Error("An XP booster is already active");
  if (w.xp_boost_tokens < 1) throw new Error("No XP booster tokens available");
  w.xp_boost_until = new Date(now + minutes * 60000).toISOString();
  w.xp_boost_mult = mult;
  w.xp_boost_tokens -= 1;
  return w;
}

function cosmeticRankUnlocked(itemId, xp) {
  const effect = itemId.startsWith("effect_") ? itemId.slice(7) : null;
  const reward = DEFAULT_LEVEL_REWARDS.find((r) => (effect ? (r.effects || []).includes(effect) : r.accessory === itemId));
  return Boolean(reward && xp >= reward.threshold);
}

function buyWalletItem(w, itemId, xp = 0) {
  const item = Object.hasOwn(SHOP_ITEMS, itemId) ? SHOP_ITEMS[itemId] : null;
  if (!item) throw new Error("Unknown shop item");
  if (w.gems < item.cost) throw new Error("Insufficient gems");
  if (itemId === "streak_freeze") {
    if (w.streak_freezes >= MAX_STREAK_FREEZES) throw new Error("Streak freeze stock is full");
    w.streak_freezes += 1;
  } else if (itemId === "xp_boost_15m") {
    if (w.xp_boost_tokens >= MAX_BOOST_TOKENS) throw new Error("XP booster stock is full");
    w.xp_boost_tokens += 1;
  } else {
    if (w.unlocked_cosmetics.includes(itemId) || cosmeticRankUnlocked(itemId, xp)) throw new Error("Cosmetic is already unlocked");
    w.unlocked_cosmetics = [...w.unlocked_cosmetics, itemId];
  }
  w.gems -= item.cost;
  return w;
}

function setWalletGoal(w, goal, today = day()) {
  if (!DAILY_GOALS.includes(goal)) throw new Error("Daily goal must be 30, 50, 100, or 150 XP");
  w.daily_goal = goal;
  return claimWalletDailyGoal(w, today);
}

// A streak survives while the freezes in stock can still cover every missed day.
function streakAlive(w, today = day()) {
  if (!w.last_active_date) return false;
  return dayGap(w.last_active_date, today) <= w.streak_freezes + 1;
}

// What the UI reads: stale daily/weekly counters read as zero, a streak the freezes can no
// longer cover reads as zero, and a freeze covering yesterday (or about to) shows as ice.
function walletView(meta, today = day(), streakDays) {
  const w = normalizeWallet(meta);
  const alive = streakAlive(w, today);
  const view = {
    ...w,
    weekly_xp: w.weekly_xp_reset_date === weekStart(today) ? w.weekly_xp : 0,
    daily_xp: w.daily_xp_date === today ? w.daily_xp : 0,
    streak_on_ice: w.streak_frozen_dates.includes(day(-1, today)) || (alive && dayGap(w.last_active_date, today) >= 2),
    shop_items: SHOP_ITEMS,
  };
  if (Number.isInteger(streakDays)) {
    view.last_streak_days = streakDays;
    view.streak_days = alive ? streakDays : 0;
  }
  return view;
}

function rankLevel(xp) {
  return Math.max(1, DEFAULT_LEVEL_REWARDS.filter((r) => xp >= r.threshold).length);
}

function rankName(level) {
  return `Lv.${level} ${RANK_NAMES[level - 1] || RANK_NAMES[0]}`;
}

// Rebuilds the visible week: the last active day and the run of active days before it (frozen
// days inside the run read as ice), every frozen date as ice, and every other past day as missed.
// The run is history, so it shows even before today's freeze fires or after the streak broke.
function streakWeek(g, today = day()) {
  const frozen = new Set(Array.isArray(g?.streak_frozen_dates) ? g.streak_frozen_dates : []);
  const active = new Set();
  let cursor = /^\d{4}-\d{2}-\d{2}$/.test(g?.last_active_date || "") && g.last_active_date <= today ? g.last_active_date : "";
  let left = cursor ? Math.max(1, Number(g.last_streak_days ?? g.streak_days) || 0) : 0;
  for (let guard = 0; cursor && left > 0 && guard < 400; guard++) {
    if (!frozen.has(cursor)) { active.add(cursor); left--; }
    cursor = day(-1, cursor);
  }
  const monday = weekStart(today);
  return ["M", "T", "W", "T", "F", "S", "S"].map((label, i) => {
    const date = day(i, monday);
    const status = active.has(date) ? "done" : frozen.has(date) ? "iced" : date === today ? "today" : date > today ? "upcoming" : "missed";
    return { date, label, status, isToday: date === today };
  });
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
    applyUserEffect(prof.mascot_effect || "none");
    state.achievements = Array.isArray(prof.achievements) ? [...prof.achievements] : [];
    prefSet("achievements", JSON.stringify(state.achievements));
  }
  if (!/^[0-9a-f-]{36}$/i.test(state.sbUser?.id || "")) return;
  const { data: edges } = await state.sbClient
    .from("friendships")
    .select("user_id, friend_id")
    .or(`user_id.eq.${state.sbUser.id},friend_id.eq.${state.sbUser.id}`);
  const friendIds = Array.from(new Set((edges || []).map((e) => (e.user_id === state.sbUser.id ? e.friend_id : e.user_id))));
  if (friendIds.length) {
    const { data: fProfs } = await state.sbClient
      .from("profiles")
      .select("*")
      .in("id", friendIds);
    const yesterday = day(-1);
    state.friends = (fProfs || []).map((f) => ({
      id: f.id, username: f.username, display_name: f.display_name, mascot_color: f.mascot_color,
      mascot_accessory: f.mascot_accessory, mascot_shape: f.mascot_shape, mascot_effect: f.mascot_effect || "none",
      xp: f.xp || 0, streak_days: f.streak_days || 0, current_step_id: f.current_step_id,
      weekly_xp: typeof f.weekly_xp_reset_at === "string" && weekStart(f.weekly_xp_reset_at.slice(0, 10)) === weekStart() ? f.weekly_xp || 0 : 0,
      streak_on_ice: Array.isArray(f.streak_frozen_dates) && f.streak_frozen_dates.includes(yesterday),
    }));
  } else {
    state.friends = [];
  }
}

async function syncProgressToSupabase() {
  if (!state.sbClient || !state.sbUser || !state.data) return;
  const g = state.data.gamification;
  const next = findNextLesson()?.lesson.step_ids.find((id) => !isStepDone(id)) ?? null;
  const completedSteps = g.completed_events.filter((e) => e.startsWith("step-")).map((e) => e.slice(5));
  const base = {
    mascot_color: state.mascotColor,
    mascot_accessory: state.mascotAccessory,
    mascot_shape: state.mascotShape,
    xp: g.xp,
    streak_days: g.streak_days,
    current_step_id: next,
    completed_steps: completedSteps,
    achievements: state.achievements,
  };
  const extended = typeof g.gems === "number" ? { ...base, ...profileWalletPayload(g) } : base;
  try {
    const res = await state.sbClient.from("profiles").update(extended).eq("id", state.sbUser.id);
    // A database without the economy columns still keeps XP and looks in sync.
    if (res?.error && extended !== base) await state.sbClient.from("profiles").update(base).eq("id", state.sbUser.id);
  } catch (_) {}
}

function profileWalletPayload(g) {
  const w = normalizeWallet(g);
  return {
    mascot_effect: state.mascotEffect,
    gems: w.gems,
    weekly_xp: w.weekly_xp,
    ...(w.weekly_xp_reset_date ? { weekly_xp_reset_at: w.weekly_xp_reset_date + "T00:00:00Z" } : {}),
    streak_freezes: w.streak_freezes,
    streak_frozen_dates: w.streak_frozen_dates,
    last_active_date: w.last_active_date,
    xp_boost_until: w.xp_boost_until || null,
    xp_boost_mult: w.xp_boost_mult,
    xp_boost_tokens: w.xp_boost_tokens,
    daily_xp: w.daily_xp,
    daily_xp_date: w.daily_xp_date,
    daily_goal: w.daily_goal,
    unlocked_cosmetics: w.unlocked_cosmetics,
  };
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

const MATH_SYMBOLS = new Map(Object.entries({
  gamma: "γ", varepsilon: "ε", epsilon: "ε", lambda: "λ", pi: "π",
  theta: "θ", delta: "δ", phi: "φ", Phi: "Φ", alpha: "α", mu: "μ",
  sigma: "σ", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠",
  approx: "≈", times: "×", cdot: "·", to: "→", rightarrow: "→", infty: "∞",
  sum: "∑", mid: "|", sim: "~", left: "", right: "",
}));

function appendFallbackMath(parent, expression) {
  const text = expression
    .replace(/\\(?:text|mathrm|mathbb|mathcal)\{([^{}]*)\}/g, "$1")
    .replace(/\\([a-zA-Z]+)/g, (_, command) => MATH_SYMBOLS.get(command) ?? command)
    .replace(/[ \t]+/g, " ")
    .replace(/\\[,;! ]/g, " ");
  let end = 0;
  for (const match of text.matchAll(/([_^])(?:\{([^{}]+)\}|([\p{L}\p{N}]))/gu)) {
    parent.append(text.slice(end, match.index).replace(/[{}]/g, ""));
    const script = document.createElement(match[1] === "_" ? "sub" : "sup");
    script.textContent = match[2] ?? match[3];
    parent.append(script);
    end = match.index + match[0].length;
  }
  parent.append(text.slice(end).replace(/[{}]/g, ""));
}

function fallbackMathInElement(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const pending = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest("script, noscript, style, textarea, pre, code, select, option, .math-fallback")) {
      pending.push(node);
    }
  }
  const delimiters = /(?<!\\)\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\((.+?)\\\)|(?<![\\$])\$(?!\$)((?:\\.|[^$\n])+?)\$(?!\$)/g;
  for (const node of pending) {
    let end = 0;
    const fragment = document.createDocumentFragment();
    for (const match of node.data.matchAll(delimiters)) {
      fragment.append(node.data.slice(end, match.index));
      const math = document.createElement("span");
      math.className = "math-fallback";
      if (match[1] || match[2]) math.classList.add("math-fallback-display");
      appendFallbackMath(math, match[1] ?? match[2] ?? match[3] ?? match[4]);
      fragment.append(math);
      end = match.index + match[0].length;
    }
    if (end) {
      fragment.append(node.data.slice(end));
      node.replaceWith(fragment);
    }
  }
}

function renderMath(el) {
  if (!el) return;
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
  } else fallbackMathInElement(el);
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
  if (!cloudCourse()) {
    const send = () => request(path, body, { signal: AbortSignal.timeout(path === "/api/run_lab" ? 120000 : 25000) });
    if (!body || path === "/api/run_lab") return send();
    const run = localProgressQueue.then(send);
    localProgressQueue = run.catch(() => {});
    return run;
  }
  if (path === "/api/sound") {
    prefSet("sound", body.enabled ? "on" : "off");
    return { sound_enabled: body.enabled };
  }
  return updateCloudProgress(path, body);
}

function isStepDone(stepId) {
  return state.data.gamification.completed_events.includes(`step-${stepId}`);
}

const LESSON_KIND_LABELS = { concept: "Concept", interactive: "Interactive", code: "Code", review: "Review" };

// The original course predates explicit lessons. These boundaries keep its related exercises together.
const LEGACY_RL_LESSON_STARTS = [
  ["m0_bet", "m0_s3", "m0_s4b", "m0_s7"],
  ["m1_bet", "m1_s1e", "m1_s5"],
  ["m2_bet", "m2_s1c", "m2_s2", "m2_s6"],
  ["m3_bet", "m3_s2", "m3_s5"],
  ["m4_bet", "m4_s4", "m4_s5", "m4_s7", "m4_s10"],
  ["m5_bet", "m5_s2b", "m5_s3"],
];

const districtLessons = new WeakMap();
const lessonBeats = new WeakMap();

function lessonsForDistrict(district) {
  if (districtLessons.has(district)) return districtLessons.get(district);
  const ids = new Set(district.steps.map((step) => step.id));
  const used = new Set();
  const lessons = [];
  for (const lesson of Array.isArray(district.lessons) ? district.lessons : []) {
    if (typeof lesson?.title !== "string" || typeof lesson.id !== "string") continue;
    const stepIds = Array.isArray(lesson?.step_ids)
      ? lesson.step_ids.filter((id) => ids.has(id) && !used.has(id) && used.add(id))
      : [];
    if (stepIds.length) lessons.push({ ...lesson, step_ids: stepIds });
  }

  const remaining = district.steps.filter((step) => !used.has(step.id));
  const starts = !lessons.length && LEGACY_RL_LESSON_STARTS.find((group) =>
    group[0] === remaining[0]?.id && group.every((id) => ids.has(id)));
  const groups = [];
  for (const step of remaining) {
    if (!groups.length || !starts || starts.includes(step.id)) groups.push([]);
    groups.at(-1).push(step);
  }
  return lessons.concat(groups.map((steps) => {
    const titleStep = steps.find((step) => step.kind !== "bet") || steps[0];
    const kind = steps.some((step) => step.kind === "code") ? "code"
      : steps.some((step) => LAB_KINDS.has(step.kind)) ? "interactive"
      : steps.some((step) => ["story_concept", "bet"].includes(step.kind)) ? "concept" : "review";
    const minutes = { bet: 1, story_concept: 2, viz: 3, numeric: 2, code: 5, live_lab: 3, debrief: 2 };
    return {
      id: steps[0].id, title: titleStep.title, kind,
      est_minutes: steps.reduce((sum, step) => sum + (minutes[step.kind] || 1), 0),
      step_ids: steps.map((step) => step.id),
    };
  }));
}

function flattenLessonBeats(district, lesson) {
  if (lessonBeats.has(lesson)) return lessonBeats.get(lesson);
  const steps = new Map(district.steps.map((step, index) => [step.id, { step, index }]));
  return lesson.step_ids.flatMap((stepId) => {
    const entry = steps.get(stepId);
    if (!entry) return [];
    const { step, index } = entry;
    const authored = ["story_concept", "viz"].includes(step.kind) && Array.isArray(step.beats)
      ? step.beats.flatMap((beat) => {
        const kind = beat?.kind ?? (beat?.check ? "beat_check" : beat?.callout ? "beat_callout" : beat?.md ? "beat_md" : null);
        return ["beat_md", "beat_callout", "beat_check"].includes(kind) ? [{ ...beat, kind }] : [];
      }) : [];
    const beats = step.kind === "viz" ? [...authored, { kind: "viz", followsIntro: authored.length > 0 }]
      : authored.length ? authored : [{ kind: step.kind }];
    return beats.map((beat, beatIndex) => ({
      ...beat, step, stepId, stepIndex: index, beatIndex, isLastOfStep: beatIndex === beats.length - 1,
    }));
  });
}

function lessonDone(lesson) {
  return lesson.step_ids.every(isStepDone);
}

function findNextLesson() {
  const units = state.data.districts;
  for (const [di, district] of units.entries()) {
    const lessons = lessonsForDistrict(district);
    const li = lessons.findIndex((lesson) => !lessonDone(lesson));
    if (li >= 0) return { di, li, lesson: lessons[li] };
  }
  return null;
}

function openLesson(di, li, stepId = null) {
  if (state.inFlight) return;
  const district = state.data.districts[di];
  const lesson = lessonsForDistrict(district)[li];
  const beats = flattenLessonBeats(district, lesson);
  if (!beats.length) return;
  let start = stepId ? beats.findIndex((beat) => beat.stepId === stepId)
    : beats.findIndex((beat) => !isStepDone(beat.stepId) && beat.beatIndex >= Number(prefGet(beatCheckpointKey(beat)) || 0));
  if (start < 0) start = 0;
  primeAudio();
  window.Delight.withViewTransition(() => {
    state.districtIdx = di;
    state.beatIdx = start;
    state.lesson = {
      lesson, beats, checks: new Map(), correctChecks: 0, bestCombo: 0,
      gained: 0, startingCards: state.data.srs.unlocked_count, complete: false,
    };
    if (lessonDone(lesson) && !stepId) {
      for (const id of lesson.step_ids) {
        delete state.stepFeedback[id];
        delete state.selectedMcq[id];
      }
    }
    state.view = "mission";
    render();
  }, "enter-lesson");
}

function beatCheckpointKey(beat) {
  return "beat_" + draftKey(beat.step).slice("draft_".length);
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
    spawnXpFloat(xpGainLabel(xp), anchorEl);
  } else {
    if (soundKind) playSound(soundKind, state.combo);
    spawnSparkles(anchorEl, 10);
  }
  checkProgressAchievements();
  syncProgressToSupabase();
}

function xpGainLabel(xp) {
  const boosted = xp?.boosted || (xp?.gained > 0 && boostMultiplier() > 1);
  const mult = xp?.mult > 1 ? xp.mult : boostMultiplier();
  return `+${numberFormat.format(xp?.gained || 0)} XP${boosted ? ` (${mult}× Boost)` : ""}`;
}

// Side effects every XP award can carry: streak rescues, daily goal bonuses, and free booster tokens.
function noteXpRewards(xp) {
  if (!xp) return;
  if (xp.streak_saved_on_ice) {
    toast("Streak saved on ice! A Streak Freeze protected your streak while you were away.");
    window.Delight.playFrostChime?.();
    unlockAchievement("ice_saver");
  }
  if (xp.daily_goal_reached) toast("Daily goal reached! +25 Gems and a free 2× XP Boost.");
  if (xp.unit_token) toast("Unit complete! You earned a free 2× XP Boost.");
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
          <span id="pomo-mode" class="pomo-mode">${esc(mode.title)}</span>
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
let lastPresentedStreak;

function showCoursePath(kind = "tab") {
  if (state.inFlight || state.view === "map") return;
  playSound("tap");
  window.Delight.withViewTransition(() => {
    state.view = "map";
    render();
  }, kind);
}

function renderTopbar() {
  const bar = document.getElementById("topbar");
  const g = state.data.gamification;
  const streakIncreased = lastPresentedStreak?.course === state.course
    && lastPresentedStreak?.user === state.sbUser?.id
    && g.streak_days > lastPresentedStreak?.days;
  lastPresentedStreak = { course: state.course, user: state.sbUser?.id, days: g.streak_days };
  const themeIcon = state.theme === "dark" ? ICONS.sun : ICONS.moon;
  const themeLabel = state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const soundButton = `<button id="btn-sound" class="icon-ghost" aria-label="${g.sound_enabled ? "Mute sound effects" : "Turn on sound effects"}" aria-pressed="${g.sound_enabled}">${g.sound_enabled ? ICONS.volOn : ICONS.volOff}</button>`;

  if (state.view === "mission") {
    const { beats } = state.lesson;
    const ratio = (state.beatIdx + 1) / beats.length;
    const milestones = beats.slice(1).map((_, i) => {
      const at = (i + 1) / beats.length;
      return `<span class="progress-milestone ${at < ratio ? "passed" : ""}" style="left:${(at * 100).toFixed(2)}%"></span>`;
    }).join("");
    renderPreserving(bar, `
      <div class="lesson-topbar-inner">
        <div class="lesson-topbar-left">
          <button id="btn-exit-lesson" class="icon-ghost" aria-label="Back to course">${ICONS.close}</button>
        </div>
        <div class="progress-track lesson-progress" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="${beats.length}" aria-valuenow="${state.beatIdx + 1}">
          <div class="progress-fill" style="--progress: ${ratio.toFixed(4)}"></div>
          ${milestones}
        </div>
        <div class="lesson-topbar-right">
          ${state.lesson.correctChecks >= 2 ? `<span class="lesson-combo" role="status">${state.lesson.correctChecks} in a row!</span>` : ""}
          ${boostPillHtml("compact")}
          <span class="lesson-stat ${g.streak_on_ice ? "iced" : ""}" title="Day streak"><span class="lesson-stat-icon warn ${streakIncreased ? "streak-lit" : ""}">${g.streak_on_ice ? ICONS.snow : ICONS.flame}</span><span class="tabular">${esc(g.streak_days)}</span><span class="sr-only"> day streak</span></span>
          <span class="lesson-stat" title="Total XP" data-xp-total><span class="lesson-stat-icon accent">${ICONS.bolt}</span><span class="tabular">${numberFormat.format(g.xp)}</span><span class="sr-only"> XP</span></span>
          ${timerWidgetHtml()}
          ${soundButton}
        </div>
      </div>`, ".progress-fill");
    document.getElementById("btn-exit-lesson").onclick = leaveLesson;
    document.getElementById("btn-sound").onclick = toggleSound;
    bindTimerControls();
    syncBoostTicker();
    return;
  }

  const accountLabel = state.sbProfile ? `@${state.sbProfile.username}` : "Settings";

  renderPreserving(bar, `
    <div class="topbar-inner">
      <div class="topbar-left">
        <button id="btn-brand" class="wordmark" aria-label="Delightful Learn, Course Home">${mascotHtml("idle", 28)}<span>Delightful Learn</span></button>
        <nav class="nav-tabs" aria-label="Sections">
          ${state.sbUser ? `<button id="btn-courses" class="nav-tab courses-tab">${ICONS.book}<span>Courses</span></button>` : ""}
          <button id="tab-map" class="nav-tab ${state.view === "map" ? "active" : ""}" ${state.view === "map" ? 'aria-current="page"' : ""}>${ICONS.book}<span>Course</span></button>
          <button id="tab-drill" class="nav-tab ${state.view === "drill" ? "active" : ""}" ${state.view === "drill" ? 'aria-current="page"' : ""}>${ICONS.cards}<span>Anki Cards</span><span class="tab-count" aria-label="${numberFormat.format(state.data.srs.due_count)} due">${numberFormat.format(state.data.srs.due_count)}</span></button>
        </nav>
      </div>
      <div class="topbar-right">
        ${boostPillHtml()}
        ${streakButtonHtml("btn-streak-top", "topbar-streak")}
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
  document.getElementById("btn-brand").onclick = () => showCoursePath();
  document.getElementById("tab-map").onclick = () => showCoursePath();
  document.getElementById("tab-drill").onclick = () => { playSound("tap"); startDrillSession(); };
  document.getElementById("btn-account").onclick = (event) => { playSound("tap"); openSettingsModal("account", event.currentTarget); };
  document.getElementById("btn-theme").onclick = toggleTheme;
  document.getElementById("btn-sound").onclick = toggleSound;
  bindStreakButtons(bar);
  bindTimerControls();
  syncBoostTicker();
}

function streakButtonHtml(id, extraClass = "") {
  const g = state.data.gamification;
  const iced = Boolean(g.streak_on_ice);
  const days = Number(g.streak_days) || 0;
  return `<button type="button" id="${id}" class="streak-btn ${extraClass} ${iced ? "iced" : ""}" data-open-streak aria-haspopup="dialog"
      aria-label="${numberFormat.format(days)}-day streak${iced ? ", protected on ice" : ""}. Open streak details">
    <span class="streak-btn-icon" aria-hidden="true">${iced ? ICONS.snow : ICONS.flame}</span><span class="tabular">${numberFormat.format(days)}</span></button>`;
}

function bindStreakButtons(root) {
  root.querySelectorAll("[data-open-streak]").forEach((button) => {
    button.onclick = () => { playSound("tap"); openStreakModal(button); };
  });
}

// 2× XP Boost countdown: one interval for every visible pill, torn down when the boost ends.
let boostTicker = null;

function boostPillHtml(extraClass = "") {
  const left = boostRemaining();
  if (!left) return "";
  const mult = boostMultiplier();
  return `<span class="boost-pill ${extraClass}" role="timer" data-boost-mult="${mult}" aria-label="${boostSpokenLabel(mult, left)}">
    <span class="boost-pill-icon" aria-hidden="true">${ICONS.bolt}</span><span class="boost-pill-label">${mult}× XP</span>
    <span class="tabular" data-boost-countdown aria-hidden="true">${formatTime(left)}</span></span>`;
}

// Spoken form of the countdown. role="timer" is aria-live="off", so refreshing the label each
// tick is announced only when assistive tech reads the pill, never as a stream of updates.
function boostSpokenLabel(mult, left) {
  const minutes = Math.floor(left / 60), seconds = left % 60;
  const unit = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [minutes ? unit(minutes, "minute") : "", seconds || !minutes ? unit(seconds, "second") : ""].filter(Boolean);
  return `${mult}x XP boost active, ${parts.join(" ")} remaining`;
}

function stopBoostTicker() {
  clearInterval(boostTicker);
  boostTicker = null;
}

function syncBoostTicker() {
  const active = boostRemaining() > 0;
  document.body?.classList?.toggle("xp-boosted", active);
  if (!active) return stopBoostTicker();
  if (!boostTicker) boostTicker = setInterval(tickBoost, 1000);
}

function tickBoost() {
  const left = boostRemaining();
  document.querySelectorAll("[data-boost-countdown]").forEach((el) => { el.textContent = formatTime(left); });
  document.querySelectorAll("[data-boost-mult]").forEach((el) => {
    el.setAttribute?.("aria-label", boostSpokenLabel(Number(el.dataset?.boostMult) || 2, left));
  });
  if (left > 0) return;
  stopBoostTicker();
  document.body?.classList?.remove("xp-boosted");
  if (!state.data || state.view === "courses" || (state.sbClient && !state.sbUser)) return;
  toast("Your 2× XP Boost has ended. Nice sprint!");
  renderTopbar();
  if (state.view === "map") renderMap();
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

// Wallet actions go through api(): FastAPI in Local Studio, the synced course wallet in the cloud.
async function walletAction(path, body = {}) {
  const res = await api(path, body);
  if (!cloudCourse() && res?.gamification && state.data) {
    state.data = { ...state.data, gamification: { ...state.data.gamification, ...res.gamification } };
  }
  syncProgressToSupabase();
  refreshAfterLookChange();
  syncBoostTicker();
  return res;
}

async function activateBoost() {
  await walletAction("/api/booster/activate");
  playSound("combo");
  toast(`2× XP Boost is on for ${BOOST_MINUTES} minutes. Every win counts double!`);
  unlockAchievement("booster_pro");
}

async function buyShopItem(itemId) {
  const item = SHOP_ITEMS[itemId];
  await walletAction("/api/shop/buy", { item_id: itemId });
  playSound("correct");
  toast(shopToast(itemId));
}

// Consumables stack in stock; cosmetics unlock for good.
function shopToast(itemId) {
  const item = SHOP_ITEMS[itemId];
  if (itemId === "streak_freeze") return `Added Streak Freeze (-${item.cost} Gems)`;
  if (itemId === "xp_boost_15m") return `Added 2x XP Boost (-${item.cost} Gems)`;
  return `Unlocked ${item.label} (-${item.cost} Gems)`;
}

async function setDailyGoal(goal) {
  const res = await walletAction("/api/daily-goal", { daily_goal: goal });
  playSound("tap");
  if (res?.daily_goal_reached) toast("Daily goal reached! +25 Gems and a free 2× XP Boost.");
}

function gemsHtml(extraClass = "") {
  const gems = Number(state.data?.gamification?.gems) || 0;
  return `<span class="gem-count ${extraClass}"><span class="gem-icon" aria-hidden="true">${ICONS.gem}</span><span class="tabular">${numberFormat.format(gems)}</span><span class="sr-only"> Gems</span></span>`;
}

function shopButtonHtml(itemId, attrs = "") {
  const item = SHOP_ITEMS[itemId];
  const afford = (Number(state.data?.gamification?.gems) || 0) >= item.cost;
  return `<button type="button" class="gem-buy" data-buy="${itemId}" ${afford ? "" : 'aria-disabled="true"'} ${attrs}>
    ${ICONS.gem}<span class="tabular">${item.cost}</span><span class="sr-only"> Gems to unlock ${esc(item.label)}</span></button>`;
}

function bindShopButtons(root, after) {
  root.querySelectorAll("[data-buy]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const item = SHOP_ITEMS[button.dataset.buy];
      if (!item) return;
      if ((Number(state.data?.gamification?.gems) || 0) < item.cost) {
        toast(`You need ${item.cost} Gems for ${item.label}. Earn 5 Gems per new win.`);
        return;
      }
      guarded(button, async () => { await buyShopItem(button.dataset.buy); after?.(); });
    };
  });
}

function goalPickerHtml(idPrefix = "goal") {
  const goal = Number(state.data?.gamification?.daily_goal) || 50;
  return `<div class="goal-picker" role="group" aria-label="Daily XP goal">
    ${DAILY_GOALS.map((x) => `<button type="button" class="goal-chip" id="${idPrefix}-${x}" data-goal="${x}" aria-pressed="${goal === x}"><span class="tabular">${x}</span> XP</button>`).join("")}
  </div>`;
}

function bindGoalPicker(root, after) {
  root.querySelectorAll("[data-goal]").forEach((button) => {
    button.onclick = () => {
      const goal = Number(button.dataset.goal);
      if (goal === Number(state.data?.gamification?.daily_goal)) return;
      guarded(button, async () => { await setDailyGoal(goal); after?.(); });
    };
  });
}

function lookTileHtml({ attr, id, name, unlocked, pressed, lockNote, level, buyId, art }) {
  const buyable = !unlocked && buyId && Object.hasOwn(SHOP_ITEMS, buyId);
  return `<div class="look-cell">
    <button type="button" class="look-tile ${unlocked ? "" : "locked"}" ${attr}="${esc(id)}" aria-pressed="${pressed}" ${unlocked ? "" : "disabled"}
        aria-label="${esc(name)}${unlocked ? "" : `, unlocks at ${lockNote}`}">
      ${art}
      <span class="look-tile-name">${esc(name)}</span>
      <span class="look-tile-lvl">${unlocked ? `Lv.${level}` : `${ICONS.lock} ${lockNote}`}</span>
    </button>
    ${buyable ? shopButtonHtml(buyId) : ""}
  </div>`;
}

function wardrobePanelHtml() {
  const lockNote = (r) => (r ? `Lv.${numberFormat.format(r.level)}, ${numberFormat.format(r.threshold)} XP` : "Lv.1");
  const shapes = MASCOT_SHAPES.map((sh) => {
    const reward = shapeUnlockReward(sh.id);
    return lookTileHtml({
      attr: "data-shape", id: sh.id, name: sh.name, unlocked: isShapeUnlocked(sh.id), pressed: equippedShape() === sh.id,
      lockNote: lockNote(reward), level: reward.level, art: mascotHtml("idle", 36, null, false, "", "none", sh.id, "none"),
    });
  }).join("");
  const swatches = MASCOT_PALETTES.map((p) => {
    const unlocked = isColorUnlocked(p.id);
    const active = state.mascotColor.toLowerCase() === p.body.toLowerCase();
    return `<button type="button" class="color-swatch ${unlocked ? "" : "locked"}" data-color="${p.body}" aria-pressed="${active}" ${unlocked ? "" : "disabled"}
        aria-label="${p.name}${unlocked ? "" : `, unlocks at Level ${colorUnlockLevel(p.id)}`}" title="${p.name}"
        style="background:${p.body}; box-shadow:0 3px 0 ${p.shade};">${unlocked ? "" : ICONS.lock}</button>`;
  }).join("");
  const accessories = accessoryCatalog().map((r) => lookTileHtml({
    attr: "data-acc", id: r.accessory, name: ACCESSORY_NAMES[r.accessory], unlocked: isAccessoryUnlocked(r.accessory),
    pressed: equippedAccessory() === r.accessory, lockNote: lockNote(r), level: r.level, buyId: r.accessory,
    art: mascotHtml("idle", 36, null, false, "", r.accessory, null, "none"),
  })).join("");
  const effects = MASCOT_EFFECTS.map((fx) => {
    const reward = effectUnlockReward(fx.id);
    return lookTileHtml({
      attr: "data-effect", id: fx.id, name: fx.name, unlocked: isEffectUnlocked(fx.id), pressed: equippedEffect() === fx.id,
      lockNote: lockNote(reward), level: reward?.level || 1, buyId: `effect_${fx.id}`,
      art: mascotHtml("idle", 36, null, false, "", "none", null, fx.id),
    });
  }).join("");
  return `<section class="modal-section"><h3 class="modal-label">Shape</h3><div class="look-grid shapes">${shapes}</div></section>
    <section class="modal-section"><h3 class="modal-label">Color</h3><div class="color-swatches">${swatches}</div></section>
    <section class="modal-section"><h3 class="modal-label">Accessories</h3><div class="look-grid">${accessories}</div></section>
    <section class="modal-section"><h3 class="modal-label">Auras</h3><div class="look-grid">${effects}</div></section>`;
}

function boostsPanelHtml() {
  const g = state.data?.gamification || {};
  const tokens = Number(g.xp_boost_tokens) || 0;
  const freezes = Number(g.streak_freezes) || 0;
  const left = boostRemaining(g);
  const boostCopy = left
    ? `<p class="shop-copy">Your boost is running. Every new win earns ${boostMultiplier(g)}× XP.</p>${boostPillHtml("large")}`
    : `<p class="shop-copy">Start a ${BOOST_MINUTES}-minute sprint where every new win earns double XP.</p>
       <button type="button" id="shop-activate-boost" class="btn-tactile go pill" ${tokens ? "" : 'aria-disabled="true"'}>${ICONS.bolt} Activate 2× Boost <span class="tabular">(${tokens})</span></button>`;
  return `<div class="shop-grid">
    <article class="shop-card boost">
      <div class="shop-card-head"><span class="shop-card-icon boost" aria-hidden="true">${ICONS.bolt}</span>
        <div><h3>2× XP Boost</h3><p class="shop-meta tabular">${numberFormat.format(tokens)} / ${MAX_BOOST_TOKENS} ready</p></div></div>
      ${boostCopy}
      <div class="shop-row"><span>Extra booster</span>${shopButtonHtml("xp_boost_15m")}</div>
    </article>
    <article class="shop-card ice">
      <div class="shop-card-head"><span class="shop-card-icon ice" aria-hidden="true">${ICONS.snow}</span>
        <div><h3>Streak Freeze</h3><p class="shop-meta tabular">${numberFormat.format(freezes)} / ${MAX_STREAK_FREEZES} in stock</p></div></div>
      <p class="shop-copy">Automatically protects your streak if you miss a day.</p>
      <div class="shop-row"><span>Get one more</span>${shopButtonHtml("streak_freeze")}</div>
    </article>
    <article class="shop-card goal">
      <div class="shop-card-head"><span class="shop-card-icon goal" aria-hidden="true">${ICONS.target}</span>
        <div><h3>Daily goal</h3><p class="shop-meta tabular">Today: ${numberFormat.format(Number(g.daily_xp) || 0)} / ${numberFormat.format(Number(g.daily_goal) || 50)} XP</p></div></div>
      <p class="shop-copy">Hit it for +25 Gems and a free 2× XP Boost.</p>
      ${goalPickerHtml("shop-goal")}
    </article>
  </div>`;
}

function ranksPanelHtml() {
  const xp = currentXp();
  return `<ol class="rank-list">${levelRewards().map((r) => `
    <li class="rank-row ${xp >= r.threshold ? "unlocked" : ""}">
      <span class="rank-row-lvl">Lv.${r.level}</span>
      <span class="rank-row-label"><strong>${esc(RANK_NAMES[r.level - 1] || "")}</strong><span>${esc(r.label)}</span></span>
      <span class="rank-row-xp tabular">${xp >= r.threshold ? ICONS.check : `${numberFormat.format(r.threshold)} XP`}</span>
    </li>`).join("")}</ol>`;
}

const STUDIO_TABS = [
  { id: "wardrobe", label: "Wardrobe" },
  { id: "boosts", label: "Boosts & Ice" },
  { id: "ranks", label: "Ranks (1–20)" },
];

// Kubo Studio & Shop: wardrobe, boosters and streak freezes, and the 20-rank ladder.
function openRewardsModal(trigger, initialTab = "wardrobe") {
  const xp = currentXp();
  const n = nextUnlock();
  const level = state.data?.gamification.level || rankName(1);
  let tab = STUDIO_TABS.some((t) => t.id === initialTab) ? initialTab : "wardrobe";
  const dialog = showDialog("Kubo Studio & Shop", `
    <div class="rewards-hero">
      <div id="rewards-preview" class="rewards-preview">${mascotHtml("happy", 84)}</div>
      <div class="rewards-hero-copy">
        <div class="rewards-rank">${esc(level)}</div>
        <div class="rewards-xp tabular">${numberFormat.format(xp)} XP</div>
        <p class="rewards-next">${n ? `Next: ${esc(n.label)} at ${numberFormat.format(n.threshold)} XP` : "Every reward is unlocked."}</p>
      </div>
      <div class="rewards-wallet" id="studio-gems">${gemsHtml("large")}</div>
    </div>
    <div class="settings-tabs studio-tabs" role="tablist" aria-label="Kubo Studio sections">
      ${STUDIO_TABS.map((t) => `<button type="button" role="tab" id="ktab-${t.id}" class="settings-tab" aria-selected="${t.id === tab}" aria-controls="kpanel" tabindex="${t.id === tab ? 0 : -1}">${t.label}</button>`).join("")}
    </div>
    <section id="kpanel" class="studio-panel" role="tabpanel" aria-labelledby="ktab-${tab}"></section>`, trigger, "wide studio-dialog");
  const panel = dialog.querySelector("#kpanel");

  const paint = () => {
    panel.setAttribute("aria-labelledby", `ktab-${tab}`);
    panel.innerHTML = tab === "wardrobe" ? wardrobePanelHtml() : tab === "boosts" ? boostsPanelHtml() : ranksPanelHtml();
    dialog.querySelector("#studio-gems").innerHTML = gemsHtml("large");
    bindPanel();
  };
  const patchLook = () => {
    dialog.querySelector("#rewards-preview").innerHTML = mascotHtml("happy", 84);
    panel.querySelectorAll("[data-shape]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.shape === equippedShape())));
    panel.querySelectorAll("[data-acc]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.acc === equippedAccessory())));
    panel.querySelectorAll("[data-color]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.color === state.mascotColor)));
    panel.querySelectorAll("[data-effect]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.effect === equippedEffect())));
    refreshAfterLookChange();
    unlockAchievement("style_icon");
    syncProgressToSupabase();
  };
  const bindPanel = () => {
    panel.querySelectorAll("[data-shape]").forEach((b) => { b.onclick = () => { playSound("tap"); applyUserShape(b.dataset.shape); patchLook(); }; });
    panel.querySelectorAll("[data-acc]").forEach((b) => { b.onclick = () => { playSound("tap"); applyUserAccessory(b.dataset.acc); patchLook(); }; });
    panel.querySelectorAll("[data-color]").forEach((b) => { b.onclick = () => { playSound("tap"); applyUserMascotColor(b.dataset.color); patchLook(); }; });
    panel.querySelectorAll("[data-effect]").forEach((b) => { b.onclick = () => { playSound("tap"); applyUserEffect(b.dataset.effect); patchLook(); }; });
    bindShopButtons(panel, paint);
    bindGoalPicker(panel, paint);
    const activate = panel.querySelector("#shop-activate-boost");
    if (activate) activate.onclick = () => {
      if (!(Number(state.data?.gamification?.xp_boost_tokens) > 0)) return toast("No boosters left. Hit your daily goal or buy one for 35 Gems.");
      guarded(activate, async () => { await activateBoost(); paint(); });
    };
  };
  const tabs = [...dialog.querySelectorAll(".studio-tabs .settings-tab")];
  const select = (id, focus = false) => {
    tab = id;
    tabs.forEach((b) => {
      const on = b.id === `ktab-${id}`;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    paint();
  };
  tabs.forEach((b, i) => {
    b.onclick = () => select(b.id.slice(5));
    b.onkeydown = (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length].id.slice(5), true);
    };
  });
  paint();
  return dialog;
}

// Streak & Ice: flame or frost hero, this week's strip, and the freeze stock.
function openStreakModal(trigger) {
  const dialog = showDialog("Streak", `<div id="streak-body"></div>`, trigger, "streak-dialog");
  const body = dialog.querySelector("#streak-body");
  const paint = () => {
    const g = state.data.gamification;
    const days = Number(g.streak_days) || 0;
    const iced = Boolean(g.streak_on_ice);
    const freezes = Number(g.streak_freezes) || 0;
    const week = streakWeek(g);
    const glyph = { done: ICONS.flame, iced: ICONS.snow, today: "", upcoming: "", missed: "" };
    const statusText = { done: "streak day", iced: "protected by a Streak Freeze", today: "today, not yet practiced", upcoming: "upcoming", missed: "missed" };
    body.innerHTML = `
      <div class="streak-hero ${iced ? "iced" : ""}">
        <span class="streak-hero-icon" aria-hidden="true">${iced ? ICONS.snow : ICONS.flame}</span>
        <div><div class="streak-hero-days tabular">${numberFormat.format(days)} day${days === 1 ? "" : "s"}</div>
          <p class="streak-hero-copy">${iced ? "Your streak is on ice. A Streak Freeze covered yesterday, so keep going today." : days ? "Practice every day to keep the flame alive." : "Finish a lesson step today to light your first flame."}</p></div>
      </div>
      <ol class="streak-week" aria-label="This week">
        ${week.map((d) => `<li class="streak-day ${d.status} ${d.isToday ? "is-today" : ""}">
          <span class="streak-day-label" aria-hidden="true">${d.label}</span>
          <span class="streak-day-dot" aria-hidden="true">${glyph[d.status]}</span>
          <span class="sr-only">${new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })}, ${statusText[d.status]}</span>
        </li>`).join("")}
      </ol>
      <div class="ice-stock">
        <span class="shop-card-icon ice" aria-hidden="true">${ICONS.snow}</span>
        <div class="ice-stock-copy"><strong class="tabular">${freezes} / ${MAX_STREAK_FREEZES} Streak Freezes</strong>
          <span>Automatically protects your streak if you miss a day.</span></div>
      </div>
      <div class="streak-actions">
        ${freezes >= MAX_STREAK_FREEZES
          ? '<p class="shop-copy">Your freeze stock is full.</p>'
          : `<button type="button" id="streak-buy-freeze" class="btn-tactile secondary pill">${ICONS.snow} Get Freeze (40 Gems)</button>`}
        ${gemsHtml()}
      </div>
      <p class="shop-copy">Earn a free freeze at 3, 7, 14 and 30-day streaks.</p>`;
    const buy = body.querySelector("#streak-buy-freeze");
    if (buy) buy.onclick = () => {
      if ((Number(state.data.gamification.gems) || 0) < SHOP_ITEMS.streak_freeze.cost) return toast("You need 40 Gems for a Streak Freeze. Earn 5 Gems per new win.");
      guarded(buy, async () => { await buyShopItem("streak_freeze"); paint(); });
    };
  };
  paint();
  return dialog;
}

// Share links: clean URLs from this page, without any auth or other parameters.
function shareLinkUrl({ invite = "", friend = "" } = {}) {
  const params = new URLSearchParams();
  if (invite) params.set("invite", invite);
  if (friend) params.set("friend", friend);
  const query = params.toString();
  return window.location.origin + window.location.pathname + (query ? "?" + query : "");
}

function myUsername() {
  return state.sbUser && /^[a-z0-9_]{2,24}$/.test(state.sbProfile?.username || "") ? state.sbProfile.username : "";
}

function myCourseCode() {
  const code = String(state.course?.invite_code || "").toUpperCase();
  return INVITE_CODE_RE.test(code) ? code : "";
}

async function copyText(text, button) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (_) {}
  if (!copied) {
    toast(`Copy this link: ${text}`);
    return false;
  }
  if (button?.isConnected) {
    const label = button.querySelector(".copy-label");
    const original = button.dataset.label || label?.textContent || "";
    button.dataset.label = original;
    if (label) label.textContent = "Copied!";
    button.classList.add("copied");
    clearTimeout(button.copyTimer);
    button.copyTimer = setTimeout(() => {
      if (label) label.textContent = original;
      button.classList.remove("copied");
    }, 1800);
  }
  const live = document.getElementById("copy-live");
  if (live) live.textContent = "Link copied to clipboard.";
  playSound("tap");
  return true;
}

function shareBarHtml({ course = true, invite: inviteFor = null } = {}) {
  const friend = myUsername();
  const override = String(inviteFor || "").toUpperCase();
  const invite = inviteFor !== null ? (INVITE_CODE_RE.test(override) ? override : "") : course ? myCourseCode() : "";
  if (!friend && !invite) {
    return `<p class="share-empty">${state.sbUser ? "Invite links appear here once your course shares its code." : "Sign in to share invite links with friends."}</p>`;
  }
  const button = (kind, label, url, primary = false) => `<button type="button" class="share-btn ${primary ? "primary" : ""}" data-copy-link="${kind}" data-url="${esc(url)}">${ICONS.link}<span class="copy-label">${label}</span></button>`;
  return `<div class="share-bar" role="group" aria-label="Share invite links">
    ${invite && friend ? button("combo", "Copy Course + Friend Link", shareLinkUrl({ invite, friend }), true) : ""}
    ${friend ? button("friend", "Copy Friend Link", shareLinkUrl({ friend }), !invite) : ""}
    ${invite ? button("course", "Copy Course Link", shareLinkUrl({ invite })) : ""}
    <span id="copy-live" class="sr-only" aria-live="polite"></span>
  </div>`;
}

function bindShareBar(root) {
  root.querySelectorAll("[data-copy-link]").forEach((button) => {
    button.onclick = () => copyText(button.dataset.url, button);
  });
}

function friendLinkError(err, username) {
  const msg = String(err?.message || "");
  if (err?.code === "P0002" || /not found/i.test(msg)) return `We couldn't find @${username}.`;
  if (/yourself/i.test(msg)) return "That's your own friend link.";
  if (err?.code === "22023" || /invalid username/i.test(msg)) return "That friend link isn't valid.";
  return "That friend link couldn't be accepted. Try again in a moment.";
}

// profiles SELECT is limited to yourself, friends and course mates, so a new teammate is found
// through the find_user_by_username RPC. Older backends without it fall back to a profiles query.
async function findUserByUsername(username) {
  try {
    return (await rpc("find_user_by_username", { p_username: username })) || null;
  } catch (err) {
    const missing = err?.code === "PGRST202" || err?.code === "42883" || /could not find the function/i.test(String(err?.message || ""));
    if (!missing) throw err;
  }
  const { data, error } = await state.sbClient.from("profiles").select("id, username, display_name").eq("username", username).maybeSingle();
  if (error) throw error;
  return data || null;
}

// One code path for the Leaderboard form, Settings, and friend links: the RPC makes the friendship mutual.
async function addFriendByUsername(raw) {
  const username = String(raw || "").trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{2,24}$/.test(username)) return { ok: false, message: "Enter a valid username." };
  if (!state.sbClient || !state.sbUser) return { ok: false, message: "Sign in to add friends." };
  if (username === state.sbProfile?.username) return { ok: false, message: "That's your own friend link." };
  let res;
  try {
    if (!(await findUserByUsername(username))) return { ok: false, message: `We couldn't find @${username}.` };
    res = await rpc("accept_friend_invite", { p_username: username });
  } catch (err) {
    return { ok: false, message: friendLinkError(err, username) };
  }
  await loadCloudProfileAndFriends();
  state.leaderboard.entries = null;
  unlockAchievement("social_butterfly");
  return {
    ok: true, already: Boolean(res?.already_friends),
    message: res?.already_friends ? `You and @${username} are already friends.` : `You and @${username} are now friends!`,
  };
}

// Leaderboard: weekly or all-time XP, across the course or just friends.
function leaderboardMe() {
  const g = state.data.gamification;
  const next = findNextLesson();
  return {
    // Local Studio has no handle: the row reads "You" once, with "Local Studio" as its meta line.
    id: state.sbUser?.id || "me", username: myUsername(),
    display_name: state.sbProfile?.display_name || "You",
    mascot_color: state.mascotColor, mascot_accessory: equippedAccessory(), mascot_shape: equippedShape(), mascot_effect: equippedEffect(),
    xp: g.xp || 0, weekly_xp: Number(g.weekly_xp) || 0, streak_days: Number(g.streak_days) || 0,
    streak_on_ice: Boolean(g.streak_on_ice), current_step_id: next?.lesson.step_ids.find((id) => !isStepDone(id)) || "", is_me: true,
  };
}

function demoLeaderboard() {
  const units = state.data.districts;
  return DEMO_SQUAD.map((profile, index) => ({
    ...profile, current_step_id: units[index % units.length]?.steps[0]?.id || "", is_friend: true, demo: true,
  }));
}

// The RPC ranks on the server, so it needs the timeframe: "weekly" or "all_time".
async function fetchLeaderboard(scope, timeframe = state.leaderboard?.timeframe) {
  if (cloudCourse() && state.sbClient && state.sbUser) {
    const p_timeframe = timeframe === "all" || timeframe === "all_time" ? "all_time" : "weekly";
    const rows = await rpc("get_course_leaderboard", { p_course_id: state.course.id, p_scope: scope, p_timeframe });
    const mine = leaderboardMe();
    // The local wallet is newer than the last profile sync, so the learner's own row uses it.
    return (Array.isArray(rows) ? rows : []).map((row) => (row.is_me ? { ...row, ...mine, display_name: row.display_name || mine.display_name, username: row.username || mine.username } : row));
  }
  const friends = state.sbUser && state.friends.length ? state.friends.map((f) => ({ ...f, is_friend: true })) : demoLeaderboard();
  return [...friends, leaderboardMe()];
}

function sortLeaderboard(entries, timeframe) {
  const key = timeframe === "week" ? "weekly_xp" : "xp";
  return [...entries].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)
    || (Number(b.xp) || 0) - (Number(a.xp) || 0) || String(a.username).localeCompare(String(b.username)));
}

function leaderboardRowHtml(entry, rank, timeframe) {
  const medal = rank <= 3 ? ["gold", "silver", "bronze"][rank - 1] : "";
  const xp = timeframe === "week" ? entry.weekly_xp : entry.xp;
  const days = Number(entry.streak_days) || 0;
  const name = entry.display_name || entry.username || (entry.is_me ? "You" : "Learner");
  const handle = entry.username ? "@" + entry.username : entry.is_me ? "Local Studio" : "";
  return `<li class="lb-row ${entry.is_me ? "is-me" : ""}">
    <span class="lb-rank ${medal}"><span class="sr-only">Rank ${rank}</span><span class="${rank <= 3 ? "lb-medal" : "tabular"}" aria-hidden="true">${rank}</span></span>
    ${mascotHtml("idle", 32, entry.mascot_color || "#4F46E5", false, "", entry.mascot_accessory || "none", entry.mascot_shape || "cube", entry.mascot_effect || "none")}
    <span class="lb-info">
      <span class="lb-name">${esc(name)}${entry.is_me && name !== "You" ? ' <span class="you-pill">You</span>' : ""}</span>
      <span class="lb-meta">${[handle, stepNameById(entry.current_step_id)].filter(Boolean).map(esc).join(", ")}</span>
    </span>
    <span class="lb-streak ${entry.streak_on_ice ? "iced" : ""}" title="${days}-day streak${entry.streak_on_ice ? ", on ice" : ""}">
      <span aria-hidden="true">${entry.streak_on_ice ? ICONS.snow : ICONS.flame}</span><span class="tabular">${days}d</span><span class="sr-only"> streak${entry.streak_on_ice ? " on ice" : ""}</span></span>
    <span class="lb-xp tabular">${numberFormat.format(Number(xp) || 0)}<span class="lb-xp-unit"> XP</span></span>
  </li>`;
}

function myLeaderboardRank(entries = null, timeframe = "week") {
  const list = sortLeaderboard(entries || [...activeSquadList(), leaderboardMe()], timeframe);
  return Math.max(1, list.findIndex((entry) => entry.is_me || entry.isMe) + 1);
}

function openLeaderboardModal(trigger) {
  const lb = state.leaderboard;
  const dialog = showDialog("Leaderboard", `
    <div class="lb-controls">
      <div class="segmented" role="group" aria-label="Timeframe">
        <button type="button" data-lb-time="week" aria-pressed="${lb.timeframe === "week"}">This Week</button>
        <button type="button" data-lb-time="all" aria-pressed="${lb.timeframe === "all"}">All Time</button>
      </div>
      <div class="segmented" role="group" aria-label="Scope">
        <button type="button" data-lb-scope="course" aria-pressed="${lb.scope === "course"}">Course</button>
        <button type="button" data-lb-scope="friends" aria-pressed="${lb.scope === "friends"}">Friends</button>
      </div>
    </div>
    <div id="lb-body" class="lb-body" aria-live="polite"></div>
    <section class="lb-share">
      <h3 class="modal-label">Invite your squad</h3>
      ${shareBarHtml()}
      ${state.sbUser ? `<form id="lb-add-friend" class="form-row add-friend">
        <label class="sr-only" for="lb-add-input">Friend username</label>
        <input id="lb-add-input" class="text-field" placeholder="Add @username" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button type="submit" class="btn-tactile go">Add</button>
      </form>
      <div class="modal-msg" role="status"></div>` : ""}
    </section>`, trigger, "wide leaderboard-dialog");
  const body = dialog.querySelector("#lb-body");
  let request = 0;
  const paint = async () => {
    const ticket = ++request;
    dialog.querySelectorAll("[data-lb-time]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lbTime === lb.timeframe)));
    dialog.querySelectorAll("[data-lb-scope]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lbScope === lb.scope)));
    body.setAttribute("aria-busy", "true");
    let entries;
    try {
      entries = await fetchLeaderboard(lb.scope, lb.timeframe);
    } catch (err) {
      if (ticket !== request) return;
      body.removeAttribute("aria-busy");
      body.innerHTML = `<p class="lb-empty">The leaderboard couldn't load. ${esc(err?.message || "Try again in a moment.")}</p>`;
      return;
    }
    if (ticket !== request || !dialog.isConnected) return;
    const scoped = lb.scope === "friends" ? entries.filter((e) => e.is_me || e.is_friend) : entries;
    lb.entries = scoped;
    const sorted = sortLeaderboard(scoped, lb.timeframe);
    body.removeAttribute("aria-busy");
    const demo = scoped.some((e) => e.demo);
    body.innerHTML = `${demo ? '<p class="lb-note">Demo teammates shown. Add friends to see real rivals here.</p>' : ""}
      ${sorted.length > 1 || demo ? "" : `<p class="lb-empty">${lb.scope === "friends" ? "No friends yet. Share your friend link to start a rivalry." : "You're the first one here. Share the course link to invite classmates."}</p>`}
      <ol class="lb-list">${sorted.map((entry, i) => leaderboardRowHtml(entry, i + 1, lb.timeframe)).join("")}</ol>`;
  };
  dialog.querySelectorAll("[data-lb-time]").forEach((b) => { b.onclick = () => { playSound("tap"); lb.timeframe = b.dataset.lbTime; paint(); }; });
  dialog.querySelectorAll("[data-lb-scope]").forEach((b) => { b.onclick = () => { playSound("tap"); lb.scope = b.dataset.lbScope; paint(); }; });
  bindShareBar(dialog);
  const form = dialog.querySelector("#lb-add-friend");
  if (form) form.onsubmit = (event) => {
    event.preventDefault();
    guarded(form.querySelector("button"), async () => {
      const res = await addFriendByUsername(form.querySelector("input").value);
      const say = panelMessage(dialog.querySelector(".lb-share"));
      say(res.message, !res.ok);
      if (!res.ok) return;
      form.querySelector("input").value = "";
      playSound("correct");
      if (state.view === "map") renderMap();
      paint();
    });
  };
  paint();
  return dialog;
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
    ${mascotHtml("idle", 26, f.mascot_color, false, "", f.mascot_accessory || "none", f.mascot_shape || "cube", f.mascot_effect || "none")}
    <div class="squad-info">
      <div class="squad-name">${esc(f.display_name)} <span class="squad-handle">@${esc(f.username)}</span></div>
      <div class="squad-meta">${numberFormat.format(f.xp)} XP, ${esc(f.streak_days)}-day streak${f.streak_on_ice ? ", on ice" : ""}</div>
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
    <div class="settings-block share-block">
      <h3 class="modal-label">Share your links</h3>
      ${shareBarHtml()}
    </div>
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
      const res = await addFriendByUsername(form.querySelector("input").value);
      if (!res.ok) return say(res.message, true);
      playSound("correct");
      if (state.view === "map") renderMap();
      renderFriendsPanel(panel);
      panelMessage(panel)(res.message);
    });
  };
  bindShareBar(panel);
  panel.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => guarded(button, async () => {
      const me = state.sbUser.id, them = button.dataset.remove;
      if (![me, them].every((id) => /^[0-9a-f-]{36}$/i.test(id || ""))) throw new Error("Invalid teammate ID.");
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

function buildBrowserAnkiDeck(title, cards) {
  const field = (value) => {
    const math = String(value ?? "").replace(
      /(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)\$/g,
      (_, display, inline) => {
        const tex = (display ?? inline).replace(/\s+/g, " ").replace(/</g, "&lt;");
        return display !== undefined ? `\\[${tex}\\]` : `\\(${tex}\\)`;
      },
    );
    const html = cardHtml(math).replace(/\r\n?|\n/g, "<br>").replace(/\t/g, "&#9;");
    return '"' + html.replace(/"/g, '""') + '"';
  };
  const headerTitle = String(title).replace(/[\r\n\t]+/g, " ").trim();
  const lines = ["#separator:tab", "#html:true", "#notetype:Basic",
    `#deck:Delightful Learn - ${headerTitle}`, "#tags column:3"];
  for (const card of cards) {
    const tags = ["delightful-learn", card.module, ...(Array.isArray(card.tags) ? card.tags : [])]
      .filter(Boolean).map((tag) => String(tag).replace(/[^\p{L}\p{N}_:-]+/gu, "-")).join(" ");
    lines.push([field(card.front), field(card.back), tags].join("\t"));
  }
  return lines.join("\n") + "\n";
}

function browserAnkiCards(onlyUnlocked) {
  if (cloudCourse()) {
    return state.course.content.cards.filter((card) => !onlyUnlocked || state.progress.srs_state[card.card_id]?.unlocked);
  }
  const srs = state.data?.srs || {};
  if (Array.isArray(srs.all_cards) && srs.all_cards.length) {
    return srs.all_cards.filter((card) => !onlyUnlocked || card.unlocked);
  }
  const seen = new Map();
  for (const card of [...(srs.due_cards || []), ...Object.values(srs.unit_packs || {}).flat()]) {
    if (card?.card_id && !seen.has(card.card_id)) seen.set(card.card_id, card);
  }
  return [...seen.values()];
}

function downloadBrowserAnkiDeck(onlyUnlocked) {
  const meta = state.course?.content.meta || state.data.course_meta || {};
  const title = state.course?.title || meta.title || "Reinforcement Learning & PPO";
  const slug = (state.course?.slug || meta.slug || (cloudCourse() ? title : "slopoly-rl-ppo"))
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";
  const cards = browserAnkiCards(onlyUnlocked);
  if (!cards.length) return false;
  const blob = new Blob([buildBrowserAnkiDeck(title, cards)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}-anki.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function canUseAnkiCompanion() {
  return !cloudCourse() || (state.course.slug || state.course.content.meta?.slug) === "slopoly-rl-ppo";
}

function renderAnkiPanel(panel) {
  const { unlocked_count, due_count, total_cards } = state.data.srs;
  panel.innerHTML = `
    <section class="anki-settings-section">
      <h3>Built-in Spaced Repetition</h3>
      <p class="settings-copy">${cloudCourse() ? "Synced to your account" : "Saved locally"}. ${unlocked_count} unlocked, ${due_count} due.</p>
      <button type="button" id="anki-open-cards" class="btn-tactile secondary pill">Open Anki Cards</button>
    </section>
    <section class="anki-settings-section">
      <h3>Export to Anki app</h3>
      <p class="settings-copy">Download your cards as a text file, then import it in Anki.</p>
      <label class="anki-export-option"><input type="checkbox" id="anki-export-all"> Include locked cards too</label>
      <div class="form-row wrap anki-export-actions">
        <button type="button" id="anki-export-text" class="btn-tactile go pill" ${unlocked_count ? "" : "disabled"}>Download .txt</button>
        <span id="anki-package-link"></span>
      </div>
      <p class="settings-copy" id="anki-export-status" role="status"></p>
    </section>
    <details class="settings-details">
      <summary>AnkiWeb live sync (optional)</summary>
      <div id="anki-live-panel"></div>
    </details>`;
  panel.querySelector("#anki-open-cards").onclick = () => { closeModal(); startDrillSession(); };
  const all = panel.querySelector("#anki-export-all");
  const button = panel.querySelector("#anki-export-text");
  const pkg = panel.querySelector("#anki-package-link");
  all.onchange = () => {
    button.disabled = all.checked ? !total_cards : !unlocked_count;
    const link = pkg.querySelector("a");
    if (link) link.href = ankiBase() + "/api/anki/download" + (all.checked ? "?all_cards=true" : "");
  };
  button.onclick = () => {
    const downloaded = downloadBrowserAnkiDeck(!all.checked);
    panel.querySelector("#anki-export-status").textContent = downloaded ? "Download started." : "No cards to export yet.";
  };
  renderAnkiLivePanel(panel.querySelector("#anki-live-panel"), pkg, all);
}

async function readAnkiCompanionStatus() {
  try {
    return await request(ankiBase() + "/api/anki/status", null, { signal: AbortSignal.timeout(2500) });
  } catch (_) {
    return null;
  }
}

function adoptAnkiStatus(status) {
  const connected = Boolean(status?.connected);
  state.data.anki_connected = connected;
  if (state.view !== "drill") return;
  const root = document.getElementById("app-root");
  const old = root.querySelector(".anki-setup, .anki-auto-status");
  if (old && document.activeElement !== old && old.classList.contains("anki-auto-status") !== connected) {
    old.outerHTML = ankiStatusHtml();
    bindDrillChrome(root);
  }
}

async function renderAnkiLivePanel(panel, packageSlot, all) {
  const supported = canUseAnkiCompanion();
  const course = state.course;
  if (supported) panel.innerHTML = `<p class="settings-copy" role="status">Checking local sync availability…</p>`;
  const status = supported ? await readAnkiCompanionStatus() : null;
  if (!panel.isConnected || state.course !== course) return;
  adoptAnkiStatus(status);
  packageSlot.innerHTML = status ? `<a class="settings-link" href="${esc(ankiBase())}/api/anki/download${all.checked ? "?all_cards=true" : ""}" download>Download .apkg</a>` : "";
  if (!status) {
    panel.innerHTML = supported ? `
      <p class="settings-copy">For automatic two-way AnkiWeb sync, start the optional companion and check the connection.</p>
      <pre class="settings-code"><code>uv run rl-studio</code></pre>
      <button type="button" id="anki-check" class="btn-tactile secondary">Check connection</button>`
      : `<p class="settings-copy">The local companion syncs the built-in RL course with AnkiWeb. Use the text export above for this course.</p>`;
    const check = panel.querySelector("#anki-check");
    if (check) check.onclick = () => renderAnkiLivePanel(panel, packageSlot, all);
    return;
  }
  if (status.connected) {
    const via = status.backend === "headless" ? "AnkiWeb" : "AnkiConnect";
    panel.innerHTML = `
      <p class="status-badge ok"><span class="status-dot online"></span>Connected via ${via}</p>
      <p class="settings-copy">Unlocked cards sync to Anki automatically as you study.</p>
      <div class="form-row wrap">
        <button type="button" id="anki-sync" class="btn-tactile go">Sync now</button>
        ${status.backend === "headless" ? `<button type="button" id="anki-logout" class="btn-tactile secondary">Sign out of AnkiWeb</button>` : ""}
      </div>
      <div class="modal-msg" role="status"></div>
`;
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
      await renderAnkiLivePanel(panel, packageSlot, all);
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
`;
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
        await renderAnkiLivePanel(panel, packageSlot, all);
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

function progressBarHtml(value, max, label) {
  return `<div class="progress-track" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${value}" aria-valuemax="${max}">
    <div class="progress-fill" style="--progress: ${max ? value / max : 0}"></div>
  </div>`;
}

function achievementProgress(id) {
  const districts = state.data.districts;
  const lessons = districts.flatMap(lessonsForDistrict);
  const done = lessons.filter(lessonDone).length;
  const steps = districts.flatMap((unit) => unit.steps);
  const finished = (kind) => Number(steps.some((step) => kind(step.kind) && isStepDone(step.id)));
  switch (id) {
    case "first_step": return [finished(() => true), 1, "step"];
    case "combo_3": return [state.combo, 3, "answers"];
    case "combo_5": return [state.combo, 5, "answers"];
    case "code_cracker": return [finished((kind) => kind === "code"), 1, "exercise"];
    case "lab_explorer": return [finished((kind) => LAB_KINDS.has(kind)), 1, "lab"];
    case "card_shark": return [state.reviewedCards, 10, "cards"];
    case "sprint_done": return [0, 1, "focus session"];
    case "style_icon": return [0, 1, "customization"];
    case "district_clear": return [0, 1, "unit"];
    case "halfway_hero": return [stepCounts().done, Math.ceil(steps.length / 2), "steps"];
    case "ppo_boss": {
      const unit = districts.find((district) => district.id === "M4");
      return unit ? [unit.steps.filter((step) => isStepDone(step.id)).length, unit.steps.length, "steps"] : null;
    }
    case "full_mastery": return [done, lessons.length, "lessons"];
    case "streak_3": return [Math.min(3, Number(state.data.gamification.streak_days) || 0), 3, "days"];
    case "streak_7": return [Math.min(7, Number(state.data.gamification.streak_days) || 0), 7, "days"];
    case "ice_saver": return [0, 1, "rescue"];
    case "booster_pro": return [0, 1, "boost"];
    case "social_butterfly": return [Math.min(1, state.friends.length), 1, "friend"];
    case "classical_scholar":
    case "beyond_ppo":
    case "monopoly_scaler": {
      const unit = districts.find((district) => district.id === { classical_scholar: "M6", beyond_ppo: "M7", monopoly_scaler: "M8" }[id]);
      return unit ? [unit.steps.filter((step) => isStepDone(step.id)).length, unit.steps.length, "steps"] : null;
    }
  }
}

function achievementRowsHtml(filter = "all", preview = false) {
  const unlocked = (a) => state.achievements.includes(a.id);
  const earned = ACHIEVEMENT_DEFS.filter(unlocked);
  const locked = ACHIEVEMENT_DEFS.filter((a) => !unlocked(a));
  const badges = filter === "unlocked" ? earned : filter === "locked" ? locked : [...earned, ...locked];
  const shown = preview ? badges.slice(0, 4) : badges;
  const tag = preview ? "button" : "article";
  return shown.map((a) => {
    const progress = !preview && !unlocked(a) ? achievementProgress(a.id) : null;
    let progressHtml = !preview && unlocked(a) ? '<span class="ach-earned">Earned</span>' : "";
    if (progress) {
      const [value, goal, unit] = progress;
      progressHtml = `<span class="ach-progress tabular">${value} / ${goal} ${unit}</span>
        <span class="ach-meter" style="--progress: ${goal ? Math.min(value / goal, 1) : 0}" aria-hidden="true"><span class="ach-meter-fill"></span></span>`;
    }
    return `
    <${tag} ${preview ? 'type="button" aria-haspopup="dialog"' : ""} class="ach-row ${unlocked(a) ? "unlocked" : ""}">
      <span class="ach-badge" aria-hidden="true">${ICONS[a.icon] || ICONS.star}
        ${preview ? "" : `<span class="medal-status">${unlocked(a) ? ICONS.check : ICONS.lock}</span>`}
      </span>
      <span class="ach-info">
        <span class="ach-name">${esc(a.title)}</span>
        <span class="ach-desc">${esc(a.desc)}</span>
        ${progressHtml}
      </span>
      <span class="ach-xp tabular">+${a.xp} XP</span>
      ${preview ? "" : `<span class="sr-only">${unlocked(a) ? "Unlocked" : "Locked"}</span>`}
    </${tag}>`;
  }).join("") || '<p class="ach-empty">No badges match this filter yet.</p>';
}

function openAchievementsModal(trigger) {
  const unlocked = ACHIEVEMENT_DEFS.filter((a) => state.achievements.includes(a.id));
  const max = ACHIEVEMENT_DEFS.length;
  const xp = unlocked.reduce((total, a) => total + a.xp, 0);
  const filters = [["All", max], ["Unlocked", unlocked.length], ["Locked", max - unlocked.length]];
  const maxXp = ACHIEVEMENT_DEFS.reduce((total, a) => total + a.xp, 0);
  const dialog = showDialog("Achievements", `
    <div class="ach-summary">
      <span class="trophy-kubo" aria-hidden="true">${mascotHtml("proud", 62, null, false, "", "crown")}</span>
      <div class="ach-summary-copy">
        <strong>${unlocked.length} of ${max} badges earned</strong>
        <span>${numberFormat.format(xp)} / ${numberFormat.format(maxXp)} badge XP</span>
        ${progressBarHtml(xp, maxXp, "Badge XP earned")}
      </div>
    </div>
    <div class="settings-tabs achievement-filters" role="group" aria-label="Filter achievements">
      ${filters.map(([label, count], i) => `<button type="button" class="settings-tab" data-ach-filter="${label.toLowerCase()}" aria-pressed="${i === 0}">${label} <span class="tabular">${count}</span></button>`).join("")}
    </div>
    <div class="ach-grid-wrap" tabindex="0" role="region" aria-label="Badge collection">
      <div class="ach-grid" aria-live="polite">${achievementRowsHtml()}</div>
    </div>`, trigger, "wide trophy-dialog");
  const buttons = [...dialog.querySelectorAll("[data-ach-filter]")];
  const grid = dialog.querySelector(".ach-grid");
  buttons.forEach((button) => {
    button.onclick = () => {
      buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      grid.innerHTML = achievementRowsHtml(button.dataset.achFilter);
      grid.parentElement.scrollTop = 0;
    };
  });
}

function jumpPopoversHtml() {
  const units = state.data.districts.map((d, di) => {
    const lessons = lessonsForDistrict(d);
    const done = lessons.filter(lessonDone).length;
    return `<li><button type="button" class="jump-item" data-jump-unit="${di}">
      <span class="jump-dot" style="background:${bannerColor(d.color)}"></span>
      <span class="jump-title">${esc(d.chapter)}</span>
      <span class="jump-meta tabular">${done}/${lessons.length}</span>
    </button></li>`;
  }).join("");
  const labs = state.data.districts.map((d, di) => {
    const lessons = lessonsForDistrict(d);
    const items = d.steps.filter((s) => LAB_KINDS.has(s.kind));
    if (!items.length) return "";
    return `<li class="jump-group"><span class="jump-group-name">Unit ${di + 1}: ${esc(d.chapter)}</span><ul>
      ${items.map((s) => `<li><button type="button" class="jump-item" data-di="${di}" data-li="${lessons.findIndex((lesson) => lesson.step_ids.includes(s.id))}" data-step-id="${esc(s.id)}">
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
  const next = findNextLesson();
  const allLessons = state.data.districts.flatMap(lessonsForDistrict);
  const totalLessons = allLessons.length;
  const doneLessons = allLessons.filter(lessonDone).length;
  const totalLabs = state.data.districts.reduce((acc, d) => acc + d.steps.filter((s) => LAB_KINDS.has(s.kind)).length, 0);
  const squad = activeSquadList();
  const meta = state.data.course_meta || {};
  const title = state.course?.title || meta.title || "Reinforcement Learning & PPO";
  const description = state.course?.description || meta.description || "Master Reinforcement Learning from first principles to PPO. Bite-sized interactive lessons, hands-on visualizers, Python labs, and built-in flashcards.";
  const offsets = [0, 34, 0, -30, 0, 32, 0, -28, 0, 26];

  const pathHtml = state.data.districts.map((d, di) => {
    const lessons = lessonsForDistrict(d);
    const unitDone = lessons.filter(lessonDone).length;
    const bg = bannerColor(d.color);
    const nodes = lessons.map((s, li) => {
      const completed = s.step_ids.filter(isStepDone).length;
      const done = completed === s.step_ids.length;
      const isCurrent = di === next?.di && li === next?.li;
      const cls = isCurrent ? "current" : (done ? "done" : "upcoming");
      const hereFriends = squad.filter((f) => s.step_ids.includes(f.current_step_id));
      const friendPinsHtml = hereFriends.length
        ? `<div class="friend-pins">${hereFriends.map((f) =>
            `<span class="friend-pin" title="${esc(f.display_name)}, ${numberFormat.format(f.xp)} XP">${mascotHtml("idle", 18, f.mascot_color, false, "", f.mascot_accessory || "none", f.mascot_shape || "cube")}<span>${esc(f.display_name)}</span></span>`
          ).join("")}</div>`
        : "";

      return `
        <div class="path-node-row ${isCurrent ? "is-current" : ""}">
          <div class="node-slot" style="--offset:${offsets[li % offsets.length]}px;">
            <div class="node-wrap">
              ${li < lessons.length - 1 ? `<svg class="node-connector" width="120" height="114" viewBox="0 0 120 114" aria-hidden="true">
                <path d="M 60 0 C 60 74 ${60 + offsets[(li + 1) % offsets.length] - offsets[li % offsets.length]} 40 ${60 + offsets[(li + 1) % offsets.length] - offsets[li % offsets.length]} 114"/>
              </svg>` : ""}
              ${isCurrent ? `
                <svg class="node-active-ring" viewBox="0 0 128 106" fill="none" aria-hidden="true">
                  <ellipse cx="64" cy="56" rx="56" ry="42" stroke="var(--accent-border)" stroke-width="3"/>
                  <ellipse cx="64" cy="56" rx="48" ry="35" stroke="var(--accent-solid)" stroke-width="2" stroke-dasharray="6 5" opacity="0.55"/>
                </svg>
                <span class="node-kubo-side" aria-hidden="true"><span>${mascotHtml("happy", 42)}</span></span>
                <div class="node-start-pill"><span class="start-bubble">${g.xp > 0 ? "Next" : "Start"}</span></div>` : ""}
              <button class="node-puck ${cls}" tabindex="-1" aria-hidden="true" data-di="${di}" data-li="${li}">
                <span class="node-puck-base"></span>
                <span class="node-puck-face">${stepPuckGlyph(s.kind, done, isCurrent)}</span>
              </button>
            </div>
          </div>
          <div class="node-label-col">
            <button class="node-label ${cls === "upcoming" ? "muted" : ""}" ${isCurrent ? 'aria-current="step"' : ""} data-di="${di}" data-li="${li}">
              <span class="node-label-title">${mdToHtml(s.title, true)}</span>
              <span class="node-label-kind">${esc(LESSON_KIND_LABELS[s.kind] || "Lesson")}${Number(s.est_minutes) > 0 ? ` (${esc(s.est_minutes)} min)` : ""}${completed > 0 && !done ? `, ${completed} of ${s.step_ids.length} steps` : ""}</span>
            </button>
            ${friendPinsHtml}
          </div>
        </div>`;
    }).join("");

    return `
      <section class="district-section" id="unit-${di}" aria-labelledby="unit-title-${di}">
        <div class="unit-banner" style="--unit-bg:${bg}; --unit-lip:${bannerLipColor(bg)}; --unit-art:${colorHex(d.color)};">
          <div class="unit-banner-text">
            <div class="unit-kicker">Unit ${di + 1}</div>
            <h2 class="unit-title" id="unit-title-${di}">${esc(d.chapter)}</h2>
          </div>
          ${window.Illustrations.unitMotifSvg(d.id)}
          <span class="unit-progress-pill" aria-label="${unitDone} of ${lessons.length} lessons done">${unitDone} / ${lessons.length}</span>
        </div>
        <div class="nodes-track">${nodes}</div>
      </section>`;
  }).join("");

  const me = leaderboardMe();
  const board = sortLeaderboard([...squad, me], "week");
  const myRank = Math.max(1, board.findIndex((m) => m.is_me) + 1);
  const podium = board.slice(0, 3);
  if (!podium.some((m) => m.is_me)) podium.push(me);
  const squadHtml = squad.length
    ? `<ol class="rail-board">${podium.map((m) => {
        const rank = board.indexOf(m) + 1;
        return `<li class="squad-row ${m.is_me ? "is-me" : ""}">
          <span class="lb-rank small ${rank <= 3 ? ["gold", "silver", "bronze"][rank - 1] : ""}"><span class="sr-only">Rank ${rank}</span><span aria-hidden="true">${rank}</span></span>
          ${mascotHtml("idle", 26, m.mascot_color, false, "", m.mascot_accessory || "none", m.mascot_shape || "cube", m.mascot_effect || "none")}
          <div class="squad-info">
            <div class="squad-name">${esc(m.is_me ? "You" : m.display_name)}</div>
            <div class="squad-meta">${esc(stepNameById(m.current_step_id))}</div>
          </div>
          <span class="squad-xp">${numberFormat.format(Number(m.weekly_xp) || 0)} XP</span>
        </li>`;
      }).join("")}</ol>`
    : `<p class="squad-empty">Add a friend to race them on the weekly XP board.</p>
       <button id="btn-open-squad" class="btn-tactile secondary full small" data-open-squad>${ICONS.trophy} Open leaderboard</button>`;
  const dailyGoal = Number(g.daily_goal) || 50;
  const dailyXp = Number(g.daily_xp) || 0;
  const tokens = Number(g.xp_boost_tokens) || 0;
  const boostHtml = boostRemaining(g)
    ? boostPillHtml("wide")
    : tokens > 0
      ? `<button type="button" id="btn-boost-ready" class="boost-ready">${ICONS.bolt}<span>2× Boost ready <span class="tabular">(${tokens})</span></span></button>`
      : "";

  const pops = jumpPopoversHtml();
  renderPreserving(root, `
    <div class="path-layout">
      <aside class="path-sidebar" aria-label="Course overview">
        <div class="path-quick-actions" aria-label="Squad and achievements">
          <button type="button" class="stat-pill" id="quick-achievements" aria-haspopup="dialog">${ICONS.star} Achievements <span class="tabular">${state.achievements.length} / ${ACHIEVEMENT_DEFS.length}</span></button>
          <button type="button" class="stat-pill" id="quick-squad" data-open-squad aria-haspopup="dialog">${ICONS.trophy} Leaderboard <span class="tabular">#${myRank}</span></button>
        </div>
        <div class="sidebar-panel">
          <section class="sidebar-section">
            <h1 class="course-title">${esc(title)}</h1>
            <p class="overview-tagline">${esc(description)}</p>
            <div class="stat-pills">
              <span class="stat-pill"><span class="tabular">${totalLessons}</span> Lessons</span>
              <div class="jump-anchor">
                <button type="button" class="stat-pill" id="pill-units" aria-haspopup="dialog" aria-expanded="false" aria-controls="jump-units">${ICONS.book}<span class="tabular">${state.data.districts.length}</span> Units${ICONS.chevronDown}</button>
                ${pops.units}
              </div>
              ${totalLabs ? `<div class="jump-anchor">
                <button type="button" class="stat-pill" id="pill-labs" aria-haspopup="dialog" aria-expanded="false" aria-controls="jump-labs">${ICONS.sliders}<span class="tabular">${totalLabs}</span> Labs${ICONS.chevronDown}</button>
                ${pops.labs}
              </div>` : ""}
              <button type="button" class="stat-pill" id="pill-cards">${ICONS.cards}<span class="tabular">${numberFormat.format(state.data.srs.total_cards)}</span> Cards</button>
            </div>
          </section>

          <section class="sidebar-section">
            <div class="next-card-kicker">Up next</div>
            <p class="next-card-title">${next ? mdToHtml(next.lesson.title, true) : "Course complete"}</p>
            <button id="btn-sidebar-start" class="btn-tactile go full pill ${sheen ? "sheen-once" : ""}">${next ? (g.xp > 0 ? "Continue" : "Start") : "Replay first lesson"}</button>
          </section>

          <section class="sidebar-section">
            <div class="rank-stats-row three">
              <button type="button" class="rank-stat-box stat-btn ${g.streak_on_ice ? "iced" : ""}" id="btn-streak" data-open-streak aria-haspopup="dialog">
                <span class="rank-stat-icon warn">${g.streak_on_ice ? ICONS.snow : ICONS.flame}</span>
                <span><span class="rank-stat-val">${esc(Number(g.streak_days) || 0)}d</span><span class="rank-stat-lbl">${g.streak_on_ice ? "On ice" : "Streak"}</span></span>
              </button>
              <button type="button" class="rank-stat-box stat-btn" id="btn-gems" aria-haspopup="dialog">
                <span class="rank-stat-icon gem">${ICONS.gem}</span>
                <span><span class="rank-stat-val">${numberFormat.format(Number(g.gems) || 0)}</span><span class="rank-stat-lbl">Gems</span></span>
              </button>
              <div class="rank-stat-box">
                <span class="rank-stat-icon accent">${ICONS.bolt}</span>
                <div><div class="rank-stat-val">${numberFormat.format(g.xp)}</div><div class="rank-stat-lbl">Total XP</div></div>
              </div>
            </div>
            <div class="daily-goal">
              <div class="daily-goal-head">
                <span class="daily-goal-label">Today: <span class="tabular">${numberFormat.format(dailyXp)} / ${numberFormat.format(dailyGoal)} XP</span></span>
                ${dailyXp >= dailyGoal ? `<span class="daily-goal-done">${ICONS.check} Goal met</span>` : ""}
              </div>
              ${progressBarHtml(Math.min(dailyXp, dailyGoal), dailyGoal, "Daily XP goal")}
              ${goalPickerHtml("side-goal")}
              ${boostHtml}
            </div>
            <div class="rank-header">
              <span class="rank-name">${esc(g.level)}</span>
              <span class="rank-xp">${g.xp >= g.next_threshold && !nextUnlock() ? `${numberFormat.format(g.xp)} XP (Max rank)` : `${numberFormat.format(g.xp)} / ${numberFormat.format(g.next_threshold)} XP`}</span>
            </div>
            <div class="xp-bar-track"><div class="xp-bar-fill" style="--progress: ${(g.pct / 100).toFixed(4)}"></div></div>
            <div class="rank-meta">
              <span class="tabular">${doneLessons} of ${totalLessons} lessons</span>
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
            <h2>Leaderboard <span class="rail-count tabular">#${myRank}</span></h2>
            <button id="btn-manage-squad" class="rail-link" data-open-squad aria-haspopup="dialog">View all</button>
          </div>
          <div class="squad-list">${squadHtml}</div>
        </div>

        <div class="ach-card">
          <div class="rail-head">
            <h2>Achievements <span class="rail-count tabular">${state.achievements.length}/${ACHIEVEMENT_DEFS.length}</span></h2>
            <button id="btn-ach-all" class="rail-link" aria-haspopup="dialog">View all →</button>
          </div>
          <div class="ach-list">${achievementRowsHtml("all", true)}</div>
        </div>
      </aside>
    </div>`, ".sidebar-panel .xp-bar-fill");

  renderMath(root);
  root.querySelectorAll("[data-di]").forEach((el) => {
    el.onclick = () => openLesson(Number(el.dataset.di), Number(el.dataset.li), el.dataset.stepId);
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
  document.getElementById("btn-sidebar-start").onclick = () => openLesson(next?.di ?? 0, next?.li ?? 0);
  document.getElementById("btn-rank-reward").onclick = (event) => { playSound("tap"); openRewardsModal(event.currentTarget); };
  root.querySelectorAll("#btn-squad, [data-open-squad]").forEach((button) => {
    button.onclick = () => { playSound("tap"); openLeaderboardModal(button); };
  });
  bindStreakButtons(root);
  document.getElementById("btn-gems").onclick = (event) => { playSound("tap"); openRewardsModal(event.currentTarget, "boosts"); };
  bindGoalPicker(root, () => renderMap());
  const boostReady = document.getElementById("btn-boost-ready");
  if (boostReady) boostReady.onclick = () => guarded(boostReady, async () => { await activateBoost(); renderMap(); });
  syncBoostTicker();
  root.querySelectorAll("#btn-ach-all, #quick-achievements, .ach-list button").forEach((button) => {
    button.onclick = () => openAchievementsModal(button);
  });
}

// Theme-Aware Interactive Visualizers
function vizIdSelector(id) {
  return "#" + id + ', [data-viz-id="' + id + '"]';
}

function setRangeFill(el) {
  const pct = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
  el.style.setProperty("--fill", `${pct.toFixed(1)}%`);
}

function mountAgentLoop(container) {
  const phases = ["Observe sₜ", "Pick <span>action aₜ</span>", "World reacts", "Get <span>reward rₜ</span>", "Learn &amp; repeat"];
  const scenarios = {
    "Board Game": [
      "The agent sees its position, cash, and the properties it can buy.",
      "The policy chooses to buy the property where the player landed.",
      "The board registers the new owner and deducts the price from the player's cash.",
      "The environment reports the new ownership and a reward under the game's scoring rule.",
      "The agent uses the outcome to improve how it chooses between buying and saving.",
    ],
    "Robot Grid": [
      "The robot sees its grid position, a wall, and the goal.",
      "The policy chooses to move one square east.",
      "The grid checks the move and updates the robot's position.",
      "The robot receives its new position and a reward for reaching the goal.",
      "The agent uses that experience to favor moves that help it reach future goals.",
    ],
  };
  container.innerHTML = `<div class="viz-stage discovery-viz agent-loop">
    <div class="viz-actions" role="group" aria-label="Scenario">
      ${Object.keys(scenarios).map((name) => `<button type="button" class="btn-ghost pill" data-scenario="${name}">${name}</button>`).join("")}
    </div>
    <svg class="loop-diagram" viewBox="0 0 520 200" role="img" aria-label="The agent sends an action to the environment, which returns the next state and reward.">
      <path class="loop-arc" data-action d="M143 81 C200 23 320 23 377 81"/>
      <path class="loop-arc" data-outcome d="M377 119 C320 177 200 177 143 119"/>
      <path class="loop-arrow" data-action-head d="m367 78 10 3-3-10"/>
      <path class="loop-arrow" data-outcome-head d="m153 122-10-3 3 10"/>
      <text x="260" y="24">Action aₜ</text>
      <text x="260" y="181">Next state sₜ₊₁ &amp; reward rₜ</text>
      <rect class="loop-node" data-agent x="8" y="43" width="135" height="114" rx="14"/>
      <rect class="loop-node" data-world x="377" y="43" width="135" height="114" rx="14"/>
      <text x="75.5" y="67">Agent</text>
      <text x="444.5" y="67">Environment</text>
      <foreignObject x="14" y="69" width="123" height="80"><div class="loop-actor-art" data-loop-actor aria-hidden="true"></div></foreignObject>
      <foreignObject x="382" y="73" width="125" height="74"><div class="loop-world-art" data-board-art>${window.Illustrations.boardTrackSvg()}</div><div class="loop-world-art" data-robot-art hidden>${window.Illustrations.robotGridSvg()}</div></foreignObject>
    </svg>
    <ol class="loop-phases">${phases.map((phase, i) => `<li><button type="button" class="loop-phase-btn" aria-pressed="false">${i + 1}. ${phase}</button></li>`).join("")}</ol>
    <p class="viz-insight" role="status" aria-live="polite"></p>
    <div class="viz-actions">
      <button type="button" class="btn-tactile go pill" data-next>Next step</button>
      <button type="button" class="btn-ghost pill" data-play aria-pressed="false">Auto-play</button>
      <button type="button" class="btn-ghost pill" data-reset>Reset</button>
    </div>
  </div>`;
  const find = (selector) => selector.startsWith("#")
    ? container.querySelector(vizIdSelector(selector.slice(1))) : container.querySelector(selector);
  const scenarioButtons = [...container.querySelectorAll("[data-scenario]")];
  const phaseButtons = [...container.querySelectorAll(".loop-phase-btn")];
  const insight = find(".viz-insight");
  const play = find("[data-play]");
  let scenario = "Board Game", phase = 0, timer = null, movement = null, nod = null, standing = null;
  const hop = (piece, height) => piece?.animate?.([
    { transform: "translateY(0) scale(1)" },
    { transform: "translateY(2px) scale(1.12, .86)", offset: .14 },
    { transform: `translateY(-${height}px) scale(.94, 1.08)`, offset: .5 },
    { transform: "translateY(0) scale(1.1, .9)", offset: .82 },
    { transform: "translateY(0) scale(1)" },
  ], { duration: 440, easing: "cubic-bezier(.33, 0, .25, 1)" });
  function draw() {
    scenarioButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.scenario === scenario)));
    phaseButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === phase)));
    const board = find("[data-board-art]");
    const robot = find("[data-robot-art]");
    const actor = find("[data-loop-actor]");
    board.hidden = scenario !== "Board Game";
    robot.hidden = !board.hidden;
    board.style.setProperty("--pawn-x", `${phase < 2 ? 22 : 86}px`);
    robot.style.setProperty("--robot-x", `${phase < 2 ? 63 : 87}px`);
    const spot = `${scenario}:${phase < 2 ? 0 : 1}`;
    const moving = standing !== null && standing !== spot && !prefersReducedMotion();
    if (moving) hop((board.hidden ? robot : board).querySelector(".pawn-hop"), board.hidden ? 9 : 16);
    if (phase === 2 && !board.hidden && !prefersReducedMotion()) board.querySelector(".board-die")?.animate?.([
      { transform: "translateY(0) rotate(0deg)" },
      { transform: "translateY(-10px) rotate(200deg) scale(1.08)", offset: .45 },
      { transform: "translateY(0) rotate(352deg) scale(.96, 1.04)", offset: .8 },
      { transform: "translateY(0) rotate(360deg)" },
    ], { duration: 560, easing: "cubic-bezier(.33, 0, .25, 1)" });
    standing = spot;
    const mood = phase === 3 ? "happy" : "idle";
    if (actor.dataset.mood !== mood) {
      actor.innerHTML = mascotHtml(mood, 72);
      actor.dataset.mood = mood;
      if (mood === "happy") kuboJump(actor.firstElementChild);
    }
    insight.textContent = scenarios[scenario][phase];
    find("[data-agent]").classList.toggle("is-active", [0, 1, 4].includes(phase));
    find("[data-world]").classList.toggle("is-active", [2, 3].includes(phase));
    const action = find("[data-action]"), outcome = find("[data-outcome]");
    action.classList.toggle("is-active", phase === 1);
    outcome.classList.toggle("is-active", phase === 3);
    find("[data-action-head]").classList.toggle("is-active", phase === 1);
    find("[data-outcome-head]").classList.toggle("is-active", phase === 3);
    // The arc lights up instantly via .is-active; one short transform pop on the arrow head
    // marks the direction, and the pawn, die or Kubo above carries the meaning.
    movement?.cancel();
    nod?.cancel();
    if ((phase !== 1 && phase !== 3) || prefersReducedMotion()) return;
    movement = find(phase === 1 ? "[data-action-head]" : "[data-outcome-head]").animate?.([
      { transform: "scale(1)" },
      { transform: "scale(1.5)", offset: .35 },
      { transform: "scale(1)" },
    ], { duration: 240, easing: "cubic-bezier(.23, 1, .32, 1)" });
    if (phase === 1) nod = actor.firstElementChild?.animate?.([
      { transform: "translateY(0) rotate(0deg)" },
      { transform: "translateY(-4px) rotate(-4deg)", offset: .4 },
      { transform: "translateY(0) rotate(0deg)" },
    ], { duration: 260, easing: "cubic-bezier(.23, 1, .32, 1)" });
  }
  const next = () => { phase = (phase + 1) % phases.length; draw(); };
  const pause = () => {
    clearInterval(timer);
    timer = null;
    insight.setAttribute("aria-live", "polite");
    play.textContent = "Auto-play";
    play.setAttribute("aria-pressed", "false");
  };
  const reset = () => { pause(); phase = 0; draw(); };
  phaseButtons.forEach((button, i) => {
    button.onclick = () => { pause(); phase = i; draw(); };
  });
  find("[data-next]").onclick = () => { pause(); next(); };
  find("[data-reset]").onclick = reset;
  play.onclick = () => {
    if (timer !== null) return pause();
    insight.setAttribute("aria-live", "off");
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    next();
    timer = setInterval(() => {
      const beat = container.closest(".lesson-beat");
      if (!container.isConnected || play.disabled || (beat && !beat.hasAttribute("aria-current"))) pause();
      else if (!document.hidden) next();
    }, 1500);
  };
  scenarioButtons.forEach((button) => {
    button.onclick = () => { scenario = button.dataset.scenario; reset(); };
  });
  draw();
}

// Settle bump on the running total. One call per manual pull, or once at the end of an autoplay batch.
function bumpBanditTotal(total, track = (animation) => animation) {
  if (prefersReducedMotion() || !total.animate) return;
  total.getAnimations?.().forEach((bump) => bump.cancel());
  track(total.animate([
    { transform: "translateY(0) scale(1)" },
    { transform: "translateY(-3px) scale(1.2)", offset: .35 },
    { transform: "translateY(0) scale(1)" },
  ], { duration: 320, easing: "cubic-bezier(.23, 1, .32, 1)" }));
}

// `light` is the autoplay variant: a single quick coin, no puff, no bump (the batch bumps once at the end).
function animateBanditReward(stage, choice, total, reward, { track = (animation) => animation, light = false } = {}) {
  if (prefersReducedMotion() || (light && !reward)) return;
  const frame = stage.getBoundingClientRect();
  const from = choice.querySelector(".restaurant-art").getBoundingClientRect();
  const to = total.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - from.top;
  const flights = light ? 1 : reward ? 3 : 1;
  for (let i = light ? 1 : 0; i < (light ? 2 : flights); i++) {
    const particle = document.createElement("span");
    particle.className = reward ? "bandit-coin" : "bandit-puff";
    particle.setAttribute("aria-hidden", "true");
    particle.style.left = `${from.left + from.width / 2 - frame.left}px`;
    particle.style.top = `${from.top - frame.top}px`;
    if (reward) particle.innerHTML = window.Illustrations.rewardCoinSvg();
    stage.append(particle);
    const animation = particle.animate(Array.from({ length: 15 }, (_, n) => {
      const t = n / 14;
      const arc = t * (1 - t);
      return reward
        ? { transform: `translate3d(${dx * t + (i - 1) * 105 * arc}px, ${dy * t - (220 + i * 38) * arc}px, 0) rotate(${(i - 1) * 100 * t}deg) scale(${1 - .6 * t})`, opacity: Math.min(1, (1 - t) * 7) }
        : { transform: `translateY(${-25 * t}px) scale(${.4 + 1.4 * t})`, opacity: .55 * (1 - t) };
    }), { duration: light ? 420 : reward ? 640 : 380, delay: light ? 0 : i * 55 });
    track(animation);
    animation.oncancel = () => particle.remove();
    animation.onfinish = () => {
      particle.remove();
      if (!light && reward && i === 2) bumpBanditTotal(total, track);
    };
  }
}

function bindDinerDrag(token, choices, pull, track = (animation) => animation) {
  let drag = null;
  let suppressClick = false;
  let returning = null;
  const choiceAt = (event) => document.elementFromPoint(event.clientX, event.clientY)?.closest(".bandit-arm");
  token.onpointerdown = (event) => {
    if (drag || event.button !== 0) return;
    // Grabbing the token mid-return hands it straight to the pointer: no tug-of-war with the spring.
    returning?.cancel();
    returning = null;
    token.setPointerCapture(event.pointerId);
    token.classList.remove("is-beckoning");
    const box = token.getBoundingClientRect?.();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, at: [0, 0],
      home: box ? [box.left + box.width / 2, box.top + box.height / 2] : null };
    suppressClick = false;
  };
  // Offset from the token's home to the centre of a storefront's illustration.
  const centreOf = (choice) => {
    const box = (choice?.querySelector?.(".restaurant-art") ?? choice)?.getBoundingClientRect?.();
    return box && drag?.home ? [box.left + box.width / 2 - drag.home[0], box.top + box.height / 2 - drag.home[1]] : null;
  };
  token.onpointermove = (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    token.classList.add("is-dragging");
    const target = choiceAt(event);
    const magnet = centreOf(target);
    // Over a storefront the token is pulled a quarter of the way toward it, so the drop feels magnetic.
    drag.at = magnet ? [dx + (magnet[0] - dx) * .25, dy + (magnet[1] - dy) * .25] : [dx, dy];
    token.style.transform = `translate3d(${drag.at[0]}px, ${drag.at[1]}px, 0) scale(1.1) rotate(${Math.max(-8, Math.min(8, dx / 12))}deg)`;
    choices.forEach((choice) => choice.classList.toggle("drop-hover", choice === target));
  };
  const finish = (event) => {
    if (drag?.id !== event.pointerId) return;
    const target = drag.moved && event.type === "pointerup" ? choices.indexOf(choiceAt(event)) : -1;
    const snap = target !== -1 ? centreOf(choices[target]) : null;
    const [atX, atY] = drag.at;
    suppressClick = drag.moved;
    drag = null;
    token.classList.remove("is-dragging");
    token.style.removeProperty("transform");
    if (snap && token.animate && !prefersReducedMotion()) {
      const animation = track(token.animate([
        { transform: `translate3d(${atX}px, ${atY}px, 0) scale(1.1)` },
        { transform: `translate3d(${snap[0]}px, ${snap[1]}px, 0) scale(.88)`, offset: .3 },
        { transform: `translate3d(${snap[0]}px, ${snap[1]}px, 0) scale(.94)`, offset: .42 },
        { transform: "translate3d(0, 0, 0) scale(1)" },
      ], { duration: 640, easing: "cubic-bezier(.23, 1, .32, 1)" }));
      returning = animation;
      const done = () => { if (returning === animation) returning = null; };
      animation.addEventListener("finish", done);
      animation.addEventListener("cancel", done);
    }
    choices.forEach((choice) => choice.classList.remove("drop-hover"));
    if (target !== -1) pull(target);
  };
  token.onpointerup = token.onpointercancel = token.onlostpointercapture = finish;
  token.onclick = (event) => {
    if (!suppressClick || event.detail === 0) choices[0].focus();
    suppressClick = false;
  };
}

function mountExploreExploit(container) {
  const arms = [
    { name: "Neighborhood Café", shortName: "Café", chance: .45, storefront: "cafe" },
    { name: "New Bistro", shortName: "Bistro", chance: .78, storefront: "bistro" },
    { name: "Corner Diner", shortName: "Diner", chance: .30, storefront: "diner" },
  ];
  const bestArm = arms.reduce((best, arm, i) => arm.chance > arms[best].chance ? i : best, 0);
  container.innerHTML = `<div class="viz-stage discovery-viz bandit-playground">
    <p>Each restaurant serves a great meal (+1) with its own hidden probability. Which would you keep visiting?</p>
    <div class="bandit-stage">
    <div class="diner-home">
      <button type="button" class="diner-token is-beckoning" aria-label="Diner token" aria-describedby="diner-hint">${mascotHtml("idle", 46)}</button>
      <span id="diner-hint">Drag onto a restaurant, or tap any storefront</span>
    </div>
    <div class="bandit-choices">
      ${arms.map((arm, i) => `<button type="button" class="bandit-arm" data-arm="${i}">
        ${window.Illustrations.restaurantSvg(arm.storefront)}
        <strong><span class="bandit-name">${arm.name}</span><span class="bandit-short-name" aria-hidden="true">${arm.shortName}</span></strong><span data-sample>No visits yet</span>
        <span class="viz-meter" aria-hidden="true"><span></span><i class="viz-target" style="--at:${arm.chance}"></i></span>
        <span class="bandit-reward" data-reward aria-hidden="true"></span>
      </button>`).join("")}
    </div>
    </div>
    <dl class="viz-stats bandit-stats">
      <div><dt>Pulls</dt><dd data-pulls>0</dd></div>
      <div><dt>Total reward</dt><dd data-total>0</dd></div>
      <div><dt>Estimated best</dt><dd><span data-best>Pending</span><span class="viz-stat-sub" data-best-hint>Keep sampling</span></dd></div>
      <div><dt>True best</dt><dd data-true>Hidden</dd></div>
      <div><dt>Optimal picks</dt><dd data-optimal>0%</dd></div>
    </dl>
    <div class="range-group">
      <label for="bandit-epsilon"><span>Exploration rate ε</span><output id="bandit-epsilon-value" for="bandit-epsilon">15%</output></label>
      <input id="bandit-epsilon" class="slider-range" type="range" min="0" max="100" step="1" value="15">
      <div class="bandit-range-labels"><span>0% Greedy</span><span>100% Random</span></div>
    </div>
    <p class="viz-insight" role="status"></p>
    <div class="viz-actions">
      <button type="button" class="btn-tactile go pill" data-auto aria-pressed="false">Auto-pull 10×</button>
      <button type="button" class="btn-ghost pill" data-reveal aria-pressed="false">Reveal true averages</button>
      <button type="button" class="btn-ghost pill" data-reset>Reset</button>
    </div>
  </div>`;
  const find = (selector) => selector.startsWith("#")
    ? container.querySelector(vizIdSelector(selector.slice(1))) : container.querySelector(selector);
  const choices = [...container.querySelectorAll("[data-arm]")];
  const slider = find("input");
  const reveal = find("[data-reveal]");
  const auto = find("[data-auto]");
  const stage = find(".bandit-playground");
  const total = find("[data-total]");
  let counts, totals, last = null, shown = false, batchTimer = null, batchWins = 0;
  // Every transient animation on this stage (coins, recoil, token return), so Reset can stop them all.
  const motion = new Set();
  const track = (animation) => {
    if (!animation) return animation;
    motion.add(animation);
    const forget = () => motion.delete(animation);
    animation.addEventListener?.("finish", forget);
    animation.addEventListener?.("cancel", forget);
    return animation;
  };
  const average = (i) => counts[i] ? totals[i] / counts[i] : 0;
  const leaders = () => {
    const highest = Math.max(...counts.map((count, i) => count ? average(i) : -1));
    return counts.flatMap((count, i) => count && average(i) === highest ? [i] : []);
  };
  function draw() {
    const pulls = counts.reduce((total, count) => total + count);
    const best = leaders();
    choices.forEach((choice, i) => {
      choice.querySelector("[data-sample]").textContent = [
        counts[i] ? `${counts[i]} visit${counts[i] === 1 ? "" : "s"}, ${Math.round(average(i) * 100)}% great meals` : "No visits yet",
        shown ? `${Math.round(arms[i].chance * 100)}% true chance` : "",
      ].filter(Boolean).join(". ");
      choice.classList.toggle("shows-target", shown);
      choice.querySelector(".viz-meter > span").style.setProperty("--amount", average(i));
    });
    setRangeFill(slider);
    find("#bandit-epsilon-value").textContent = slider.value + "%";
    find("[data-pulls]").textContent = pulls;
    find("[data-total]").textContent = totals.reduce((total, reward) => total + reward);
    const leader = best.length === 1 ? arms[best[0]] : null;
    const bestValue = find("[data-best]");
    bestValue.textContent = leader?.shortName ?? (best.length ? "Tie" : "Pending");
    bestValue.title = leader?.name ?? "";
    find("[data-best-hint]").hidden = Boolean(leader);
    const optimal = pulls ? counts[bestArm] / pulls : 0;
    find("[data-optimal]").textContent = `${Math.round(optimal * 100)}%`;
    find("[data-optimal]").classList.toggle("is-winning", optimal >= .6);
    const trueValue = find("[data-true]");
    trueValue.textContent = shown ? arms[bestArm].shortName : "Hidden";
    trueValue.title = shown ? arms[bestArm].name : "";
    reveal.setAttribute("aria-pressed", String(shown));
    reveal.textContent = shown ? "Hide true averages" : "Reveal true averages";
    const lesson = Number(slider.value) === 0
      ? "A lucky first meal can make a greedy policy stick with a mediocre restaurant and leave better choices untested."
      : "Try 10–20% exploration. Occasional visits to alternatives can uncover a better restaurant while most visits go to the current favorite.";
    find(".viz-insight").textContent = (last ? `${last.name} just earned +${last.reward}. ` : "") + lesson;
  }
  function pull(i, batch = false) {
    find(".diner-token")?.classList.toggle("is-beckoning", false);
    const arm = arms[i];
    const reward = Number(Math.random() < arm.chance);
    counts[i]++;
    totals[i] += reward;
    last = { name: arm.name, reward };
    choices.forEach((choice, index) => choice.classList.toggle("has-latest-reward", index === i));
    const pop = choices[i].querySelector("[data-reward]");
    pop.textContent = `+${reward}`;
    // Autoplay batches feedback: a light tick and coin on every third win instead of ten stacked chimes.
    const accent = !batch || (reward && ++batchWins % 3 === 1);
    if (reward && accent) window.Delight.playComboChime(1);
    pop.classList.toggle("is-winning", reward === 1);
    choices[i].getAnimations?.().forEach((animation) => animation.cancel());
    if (!prefersReducedMotion()) track(choices[i].animate?.(
      [{ transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 160, easing: "ease-out" }));
    pop.getAnimations?.().forEach((animation) => animation.cancel());
    if (!prefersReducedMotion()) track(pop.animate?.([
      { transform: "translateY(5px) scale(.8)", opacity: 0 },
      { transform: "translateY(-6px) scale(1.12)", opacity: 1, offset: .3 },
      { transform: "translateY(-18px) scale(1)", opacity: 0 },
    ], { duration: batch ? 360 : 600, easing: "ease-out" }));
    draw();
    if (!batch) animateBanditReward(stage, choices[i], total, reward, { track });
    else if (reward && accent) animateBanditReward(stage, choices[i], total, reward, { track, light: true });
  }
  function stopAuto() {
    clearTimeout(batchTimer);
    batchTimer = null;
    auto.setAttribute("aria-pressed", "false");
    auto.textContent = "Auto-pull 10×";
  }
  function reset() {
    stopAuto();
    [...motion].forEach((animation) => animation.cancel());
    motion.clear();
    stage?.querySelectorAll?.(".bandit-coin, .bandit-puff").forEach((node) => node.remove());
    counts = arms.map(() => 0);
    totals = arms.map(() => 0);
    choices.forEach((choice) => {
      choice.classList.toggle("has-latest-reward", false);
      choice.querySelector("[data-reward]").getAnimations?.().forEach((animation) => animation.cancel());
    });
    last = null;
    shown = false;
    slider.value = "15";
    draw();
  }
  auto.onclick = () => {
    if (batchTimer !== null) return stopAuto();
    auto.setAttribute("aria-pressed", "true");
    auto.textContent = "Stop";
    let remaining = 10;
    batchWins = 0;
    const step = () => {
      const beat = container.closest(".lesson-beat");
      if (!container.isConnected || (beat && !beat.hasAttribute("aria-current"))) return stopAuto();
      const best = leaders();
      const explore = !best.length || Math.random() * 100 < Number(slider.value);
      const options = explore ? arms.map((_, i) => i) : best;
      pull(options[Math.floor(Math.random() * options.length)], true);
      if (--remaining === 0) {
        // One clean settle for the whole batch.
        bumpBanditTotal(total, track);
        if (batchWins) window.Delight.playComboChime(2);
        return stopAuto();
      }
      batchTimer = setTimeout(step, prefersReducedMotion() ? 0 : 115);
    };
    step();
  };
  choices.forEach((choice, i) => { choice.onclick = () => pull(i); });
  bindDinerDrag(find(".diner-token"), choices, pull, track);
  slider.oninput = draw;
  reveal.onclick = () => { shown = !shown; draw(); };
  find("[data-reset]").onclick = reset;
  reset();
}

function mountRlLandscape(container) {
  // These are qualitative teaching ratings for typical implementations, not benchmark measurements.
  const algorithms = {
    DQN: { group: "Model-free", category: "Value-based, off‑policy", ratings: [3, 4, 3, 3], library: "CleanRL",
      use: "Learn values for a small, discrete set of choices and reuse experience with replay.", skip: "The agent needs to choose continuous actions." },
    REINFORCE: { group: "Model-free", category: "Policy-based, on‑policy", ratings: [2, 1, 4, 5], library: "Gymnasium",
      use: "Study policy gradients with a small environment and short episodes.", skip: "You need sample efficiency or more stable updates on long episodes." },
    PPO: { group: "Model-free", category: "Actor-critic, on‑policy", ratings: [5, 3, 5, 3], library: "Stable-Baselines3",
      use: "You can collect fresh rollouts and want stable updates. For board games, mask illegal moves before sampling.", skip: "New environment interactions are expensive and you need extensive replay." },
    SAC: { group: "Model-free", category: "Actor-critic, off‑policy", ratings: [4, 5, 2, 2], library: "Stable-Baselines3",
      use: "Continuous controls and costly interactions make replay useful.", skip: "You need a straightforward method for a discrete set of legal moves." },
    AlphaZero: { group: "Model-based", category: "Planning with MCTS", ratings: [3, 3, 5, 1], library: "Gymnasium",
      use: "An exact simulator lets search compare legal moves several turns ahead.", skip: "You have no reliable simulator or little compute for search and self-play." },
  };
  const presets = [
    ["Board game (legal-action mask)", ["PPO"]],
    ["Continuous robot arm", ["SAC", "PPO"]],
    ["Chess / Go (exact simulator)", ["AlphaZero"]],
    ["Simple discrete arcade", ["DQN", "PPO"]],
  ];
  const strengths = ["Stability", "Sample efficiency", "Action masking", "Simplicity"];
  container.innerHTML = `<div class="viz-stage discovery-viz">
    <div class="viz-actions algorithm-presets" role="group" aria-label="Task scenario">
      ${presets.map(([name], i) => `<button type="button" class="btn-ghost pill" data-preset="${i}">${name}</button>`).join("")}
    </div>
    ${["Model-free", "Model-based"].map((group) => `<section class="algorithm-group">
      <h3>${group}</h3>
      <div class="algorithm-choices algorithm-grid">
        ${Object.entries(algorithms).filter(([, a]) => a.group === group).map(([name, a]) => `<button type="button" class="algorithm-card" data-algorithm="${name}">
          <strong>${name}</strong><span>${a.category}</span><small data-fit hidden>Scenario fit</small>
        </button>`).join("")}
      </div>
    </section>`).join("")}
    <section class="algorithm-detail" aria-label="Selected algorithm profile">
      <h3 data-algorithm-title></h3>
      <p class="algorithm-scale">Illustrative strengths on a 1–5 scale. Actual performance depends on the task and implementation.</p>
      <div class="algorithm-strengths">${strengths.map((label) => `<div class="algorithm-strength"><span>${label}</span>
        <span class="strength-pips" aria-hidden="true">${Array.from({ length: 5 }, () => '<span class="strength-pip"></span>').join("")}</span><span class="tabular" data-rating></span>
      </div>`).join("")}</div>
      <div class="algorithm-advice" aria-live="polite"></div>
    </section>
  </div>`;
  const buttons = [...container.querySelectorAll("[data-algorithm]")];
  const scenarios = [...container.querySelectorAll("[data-preset]")];
  const title = container.querySelector("[data-algorithm-title]");
  const advice = container.querySelector(".algorithm-advice");
  const bars = [...container.querySelectorAll(".algorithm-strength")];
  let selected = "PPO", scenario = 0, previous;
  function draw() {
    const a = algorithms[selected];
    const matches = presets[scenario][1];
    const changed = previous !== selected;
    previous = selected;
    title.textContent = selected;
    scenarios.forEach((button, i) => button.setAttribute("aria-pressed", String(scenario === i)));
    buttons.forEach((button) => {
      const name = button.dataset.algorithm;
      button.setAttribute("aria-pressed", String(name === selected));
      button.querySelector("[data-fit]").hidden = !matches.includes(name);
      button.classList.toggle("fits-scenario", matches.includes(name));
    });
    bars.forEach((bar, i) => {
      const rating = a.ratings[i];
      bar.querySelectorAll(".strength-pip").forEach((pip, index) => {
        pip.dataset.on = String(index < rating);
        pip.dataset.tier = rating <= 2 ? "low" : rating === 3 ? "mid" : "high";
        if (changed && index < rating && !prefersReducedMotion()) {
          pip.getAnimations?.().forEach((animation) => animation.cancel());
          pip.animate?.([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }],
            { duration: 180, delay: index * 30, fill: "backwards", easing: "ease-out" });
        }
      });
      bar.querySelector("[data-rating]").textContent = `${a.ratings[i]}/5`;
    });
    advice.innerHTML = `<div><h4>When to use it</h4><p>${a.use}</p></div>
      <div><h4>When to skip it</h4><p>${a.skip}</p></div>
      <p class="algorithm-library">${a.library === "Gymnasium" ? "Environment API" : "Implementation library"} <strong>${a.library}</strong></p>`;
    if (changed && !prefersReducedMotion()) {
      const detail = advice.closest(".algorithm-detail");
      detail.getAnimations?.().forEach((animation) => animation.cancel());
      detail.animate?.([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 180, easing: "cubic-bezier(0.22, 0.9, 0.32, 1)" });
    }
  }
  scenarios.forEach((button, i) => { button.onclick = () => { scenario = i; selected = presets[i][1][0]; draw(); }; });
  buttons.forEach((button) => { button.onclick = () => { selected = button.dataset.algorithm; draw(); }; });
  draw();
}

// Chart draws keep the same element order. Reuse those nodes so changes to SVG
// geometry can transition and the chart remains mounted during direct manipulation.
function updateVizChart(svg, markup) {
  const next = document.createElementNS(svg.namespaceURI, "svg");
  next.innerHTML = markup;
  function update(parent, source) {
    [...source.children].forEach((child, index) => {
      const node = parent.children[index];
      if (!node) {
        parent.append(child);
        return;
      }
      for (const { name, value } of child.attributes) {
        if (node.getAttribute(name) !== value) node.setAttribute(name, value);
      }
      if (child.childElementCount) update(node, child);
      else if (node.textContent !== child.textContent) node.textContent = child.textContent;
    });
  }
  update(svg, next);
}

function bindVizInputs(container, draw) {
  container.querySelectorAll("input").forEach((input) => {
    if (input.type === "range") {
      input.oninput = () => {
        container.classList.add("viz-dragging");
        draw();
      };
      input.onchange = input.onblur = () => container.classList.remove("viz-dragging");
    } else {
      input.onchange = draw;
    }
  });
}

function setVizInsight(container, message) {
  const insight = container.querySelector(".viz-insight");
  if (insight.textContent !== message) insight.textContent = message;
}

function mountDpIteration(container) {
  const TERMINAL = { 2: 1.0, 5: -1.0 }; // (0,2) Goal +1.0, (1,2) Trap -1.0
  const DIRS = [[-1, 0, "↑", "Up"], [0, 1, "→", "Right"], [1, 0, "↓", "Down"], [0, -1, "←", "Left"]];
  const GAMMA = 0.9;
  const STEP_R = -0.04;
  const INIT_PI = [2, 2, 0, 1, 1, 0, 1, 1, 3]; // Non-cyclic initial policy (1,1) walks into Trap

  let mode = "pi"; // "pi" | "vi"
  let V = Array(9).fill(0);
  let pi = [...INIT_PI];
  let changedV = Array(9).fill(false);
  let changedPi = Array(9).fill(false);
  let selected = 4; // Start focused on (1, 1) next to Trap
  let sweeps = 0;
  let flips = 0;
  let lastDelta = 0;

  const stepNext = (idx, a) => {
    const r = Math.floor(idx / 3), c = idx % 3;
    const nr = Math.max(0, Math.min(2, r + DIRS[a][0]));
    const nc = Math.max(0, Math.min(2, c + DIRS[a][1]));
    const nIdx = nr * 3 + nc;
    const reward = Object.hasOwn(TERMINAL, nIdx) ? TERMINAL[nIdx] : STEP_R;
    const nextV = Object.hasOwn(TERMINAL, nIdx) ? 0 : V[nIdx];
    return { nIdx, reward, q: reward + GAMMA * nextV };
  };

  container.innerHTML = `
    <div class="viz-stage">
      <div class="viz-pills-row">
        <div class="viz-actions viz-seg" role="group" aria-label="Dynamic Programming mode">
          <button type="button" class="btn-ghost pill" data-dp-mode="pi" aria-pressed="true">Policy Iteration</button>
          <button type="button" class="btn-ghost pill" data-dp-mode="vi" aria-pressed="false">Value Iteration</button>
        </div>
        <span class="viz-pill" data-dp-stats>Sweeps: 0 · Δmax: 0.000</span>
      </div>
      <div class="viz-actions">
        <button type="button" class="btn-tactile secondary" data-dp-eval>Sweep V (1 Eval Step)</button>
        <button type="button" class="btn-tactile secondary" data-dp-improve>Improve π (Greedy)</button>
        <button type="button" class="btn-tactile go" data-dp-vi hidden>Optimality Step (max)</button>
        <button type="button" class="btn-ghost pill" data-dp-reset>Reset</button>
      </div>
      <div class="dp-grid" role="grid" aria-label="3 by 3 gridworld"></div>
      <div class="viz-pill" data-dp-readout style="justify-self:center; max-width:100%; white-space:normal; text-align:center;"></div>
      <p class="viz-insight" role="status"></p>
    </div>`;

  const gridEl = container.querySelector(".dp-grid");
  const statsEl = container.querySelector("[data-dp-stats]");
  const readoutEl = container.querySelector("[data-dp-readout]");
  const evalBtn = container.querySelector("[data-dp-eval]");
  const impBtn = container.querySelector("[data-dp-improve]");
  const viBtn = container.querySelector("[data-dp-vi]");

  const render = () => {
    container.querySelectorAll("[data-dp-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dpMode === mode)));
    evalBtn.hidden = mode !== "pi";
    impBtn.hidden = mode !== "pi";
    viBtn.hidden = mode !== "vi";
    statsEl.textContent = `Sweeps: ${sweeps}${mode === "pi" ? ` · Flips: ${flips}` : ""} · Δmax: ${lastDelta.toFixed(3)}`;

    gridEl.innerHTML = V.map((v, idx) => {
      const r = Math.floor(idx / 3), c = idx % 3;
      const isGoal = idx === 2, isTrap = idx === 5;
      const cls = ["dp-tile", isGoal ? "is-goal" : isTrap ? "is-trap" : "", idx === selected ? "is-selected" : "", (changedV[idx] || changedPi[idx]) ? "is-changed" : ""].filter(Boolean).join(" ");
      const arrow = isGoal ? "Goal +1" : isTrap ? "Trap −1" : DIRS[pi[idx]][2];
      const valText = (isGoal || isTrap) ? "Terminal" : v.toFixed(2);
      return `<button type="button" class="${cls}" data-dp-tile="${idx}" aria-label="Row ${r} column ${c}">
        <span class="dp-tile-coord">(${r},${c})</span>
        <span class="dp-tile-arrow">${arrow}</span>
        <span class="dp-tile-val">${valText}</span>
      </button>`;
    }).join("");

    gridEl.querySelectorAll("[data-dp-tile]").forEach((btn) => {
      btn.onclick = () => { selected = Number(btn.dataset.dpTile); changedV.fill(false); changedPi.fill(false); render(); };
    });

    if (Object.hasOwn(TERMINAL, selected)) {
      readoutEl.textContent = selected === 2 ? "Goal (0,2): entering gives +1.00 and ends the episode." : "Trap (1,2): entering gives −1.00 and ends the episode.";
    } else {
      const sr = Math.floor(selected / 3), sc = selected % 3;
      const opts = DIRS.map((d, a) => `${d[2]} ${stepNext(selected, a).q.toFixed(2)}`).join("  |  ");
      readoutEl.textContent = `(${sr},${sc}) lookahead r + γV(s'):  ${opts}`;
    }

    if (sweeps === 0 && flips === 0) {
      setVizInsight(container, mode === "pi" ? "Notice (1,1) points straight into Trap −1. Click Sweep V (1 Eval Step) to evaluate the arrows, then Improve π to flip them." : "In Value Iteration, each Optimality Step takes max over all 4 actions at once without waiting for full evaluation.");
    } else if (lastDelta < 1e-4 && !changedPi.some(Boolean) && sweeps > 0) {
      setVizInsight(container, mode === "vi" ? "Value Iteration converged: both V(s) and the greedy arrows settled." : "Policy evaluation step reached Δmax < 0.001; click Improve π to verify no arrows flip.");
    } else if (mode === "pi" && changedPi.some(Boolean)) {
      setVizInsight(container, "Arrows flipped toward higher neighbor values. Run Sweep V (1 Eval Step) again to propagate the improved path.");
    } else {
      setVizInsight(container, sweeps === 0 ? "Arrows changed while V is still zero. Run Sweep V (1 Eval Step) to evaluate the updated policy." : `Updated values (Δmax = ${lastDelta.toFixed(3)}). Click any tile to inspect its four action lookaheads.`);
    }
  };

  evalBtn.onclick = () => {
    const nextV = [...V];
    let dmax = 0;
    changedV = Array(9).fill(false);
    changedPi = Array(9).fill(false);
    for (let i = 0; i < 9; i++) {
      if (Object.hasOwn(TERMINAL, i)) continue;
      nextV[i] = stepNext(i, pi[i]).q;
      const diff = Math.abs(nextV[i] - V[i]);
      if (diff > 1e-4) changedV[i] = true;
      if (diff > dmax) dmax = diff;
    }
    V = nextV; sweeps++; lastDelta = dmax; render();
  };

  impBtn.onclick = () => {
    const nextPi = [...pi];
    changedV = Array(9).fill(false);
    changedPi = Array(9).fill(false);
    let flipped = false;
    for (let i = 0; i < 9; i++) {
      if (Object.hasOwn(TERMINAL, i)) continue;
      let bestA = pi[i], bestQ = stepNext(i, pi[i]).q;
      for (let a = 0; a < 4; a++) {
        const q = stepNext(i, a).q;
        if (q > bestQ + 1e-6) { bestQ = q; bestA = a; }
      }
      if (bestA !== pi[i]) { nextPi[i] = bestA; changedPi[i] = true; flipped = true; }
    }
    pi = nextPi; if (flipped) flips++; render();
  };

  viBtn.onclick = () => {
    const nextV = [...V], nextPi = [...pi];
    let dmax = 0;
    changedV = Array(9).fill(false);
    changedPi = Array(9).fill(false);
    for (let i = 0; i < 9; i++) {
      if (Object.hasOwn(TERMINAL, i)) continue;
      let bestA = 0, bestQ = -Infinity;
      for (let a = 0; a < 4; a++) {
        const q = stepNext(i, a).q;
        if (q > bestQ + 1e-9) { bestQ = q; bestA = a; }
      }
      nextV[i] = bestQ;
      const diff = Math.abs(bestQ - V[i]);
      if (diff > 1e-4) changedV[i] = true;
      if (bestA !== pi[i]) changedPi[i] = true;
      if (diff > dmax) dmax = diff;
      nextPi[i] = bestA;
    }
    V = nextV; pi = nextPi; sweeps++; lastDelta = dmax; render();
  };

  container.querySelectorAll("[data-dp-mode]").forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.dpMode;
      V = Array(9).fill(0); pi = [...INIT_PI]; sweeps = 0; flips = 0; lastDelta = 0;
      changedV.fill(false); changedPi.fill(false); render();
    };
  });
  container.querySelector("[data-dp-reset]").onclick = () => {
    V = Array(9).fill(0); pi = [...INIT_PI]; sweeps = 0; flips = 0; lastDelta = 0;
    changedV.fill(false); changedPi.fill(false); render();
  };
  render();
}

function mountSarsaVsQ(container) {
  const H = 4, W = 10, START = 30, GOAL = 39;
  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const isCliff = (r, c) => r === 3 && c >= 1 && c <= 8;
  const stepGrid = (idx, a) => {
    const r = Math.floor(idx / W), c = idx % W;
    const nr = Math.max(0, Math.min(H - 1, r + DIRS[a][0]));
    const nc = Math.max(0, Math.min(W - 1, c + DIRS[a][1]));
    if (isCliff(nr, nc)) return { next: START, rew: -100, done: false, fell: true };
    const nIdx = nr * W + nc;
    return { next: nIdx, rew: -1, done: nIdx === GOAL, fell: false };
  };
  const cache = new Map();
  const solveForEps = (eps) => {
    const key = Math.round(eps * 100);
    if (cache.has(key)) return cache.get(key);
    const Qs = Array.from({ length: 40 }, () => [0, 0, 0, 0]);
    const Qq = Array.from({ length: 40 }, () => [0, 0, 0, 0]);
    for (let it = 0; it < 260; it++) {
      for (let s = 0; s < 40; s++) {
        const r = Math.floor(s / W), c = s % W;
        if (s === GOAL || isCliff(r, c)) continue;
        for (let a = 0; a < 4; a++) {
          const tr = stepGrid(s, a);
          if (tr.done) { Qs[s][a] = tr.rew; Qq[s][a] = tr.rew; continue; }
          let best = 0;
          for (let k = 1; k < 4; k++) if (Qs[tr.next][k] > Qs[tr.next][best]) best = k;
          let expS = 0;
          for (let k = 0; k < 4; k++) expS += ((k === best ? 1 - eps : 0) + eps / 4) * Qs[tr.next][k];
          Qs[s][a] = tr.rew + expS;
          Qq[s][a] = tr.rew + Math.max(...Qq[tr.next]);
        }
      }
    }
    const greedyPath = (Q) => {
      let cur = START;
      const seen = new Set([cur]), path = [cur];
      for (let t = 0; t < 24; t++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (Q[cur][k] > Q[cur][best]) best = k;
        const tr = stepGrid(cur, best);
        path.push(tr.next);
        if (tr.done || seen.has(tr.next)) break;
        seen.add(tr.next);
        cur = tr.next;
      }
      return path;
    };
    const evalPolicy = (Q, evalEps) => {
      let V = Array(40).fill(0), F = Array(40).fill(0);
      for (let it = 0; it < 120; it++) {
        const nV = [...V], nF = [...F];
        for (let s = 0; s < 40; s++) {
          const r = Math.floor(s / W), c = s % W;
          if (s === GOAL || isCliff(r, c)) continue;
          let best = 0;
          for (let k = 1; k < 4; k++) if (Q[s][k] > Q[s][best]) best = k;
          let vs = 0, fs = 0;
          for (let a = 0; a < 4; a++) {
            const p = (a === best ? 1 - evalEps : 0) + evalEps / 4;
            const tr = stepGrid(s, a);
            vs += p * (tr.rew + (tr.done ? 0 : V[tr.next]));
            fs += p * (tr.fell ? 1 : (tr.done ? 0 : F[tr.next]));
          }
          nV[s] = vs; nF[s] = fs;
        }
        V = nV; F = nF;
      }
      return { avgReturn: V[START], fallProb: Math.min(1, F[START]) };
    };
    const out = {
      pathS: greedyPath(Qs), pathQ: greedyPath(Qq),
      evalTrainS: evalPolicy(Qs, eps), evalTrainQ: evalPolicy(Qq, eps),
      evalTestS: evalPolicy(Qs, 0), evalTestQ: evalPolicy(Qq, 0),
    };
    cache.set(key, out);
    return out;
  };

  let mode = "both"; // "sarsa" | "q" | "both"
  let freezeEval = false;
  container.innerHTML = `
    <div class="viz-stage">
      <div class="viz-pills-row">
        <div class="viz-actions viz-seg" role="group" aria-label="Control algorithm">
          <button type="button" class="btn-ghost pill" data-cliff-mode="sarsa" aria-pressed="false">Expected SARSA</button>
          <button type="button" class="btn-ghost pill" data-cliff-mode="q" aria-pressed="false">Q-Learning</button>
          <button type="button" class="btn-ghost pill" data-cliff-mode="both" aria-pressed="true">Compare Both</button>
        </div>
        <span class="viz-pill" data-cliff-pills></span>
      </div>
      <div class="viz-controls">
        ${rangeHtml("cliff-eps", "Training exploration ε", 0, 0.3, 0.02, 0.1, 2)}
        <label class="simplex-toggle"><input type="checkbox" data-cliff-freeze/> Freeze Q &amp; Test Greedy (ε_test = 0)</label>
      </div>
      <svg id="svg-cliff" viewBox="0 0 420 184" width="100%" role="img" aria-label="4 by 10 Cliff Walking grid"></svg>
      <div class="viz-legend">
        <span class="viz-legend-item"><svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="var(--go)" stroke-width="3"/></svg>Expected SARSA (on-policy)</span>
        <span class="viz-legend-item"><svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="var(--danger)" stroke-width="3"/></svg>Q-Learning (off-policy)</span>
      </div>
      <p class="viz-insight" role="status"></p>
    </div>`;

  const pillsEl = container.querySelector("[data-cliff-pills]");
  const freezeChk = container.querySelector("[data-cliff-freeze]");
  const svgEl = container.querySelector(vizIdSelector("svg-cliff"));

  const draw = () => {
    container.querySelectorAll("[data-cliff-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cliffMode === mode)));
    const eps = readRange(container, "cliff-eps", 2);
    const sol = solveForEps(eps);
    const evS = freezeEval ? sol.evalTestS : sol.evalTrainS;
    const evQ = freezeEval ? sol.evalTestQ : sol.evalTrainQ;

    const cellW = 38, cellH = 38, ox = 20, oy = 14;
    let markup = "";
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const idx = r * W + c;
        const x = ox + c * cellW, y = oy + r * cellH;
        const cliff = isCliff(r, c);
        const fill = cliff ? "var(--danger-tint)" : idx === GOAL ? "var(--go-tint)" : idx === START ? "var(--accent-tint)" : "var(--surface)";
        markup += `<rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="5" fill="${fill}" stroke="var(--line)"/>`;
        if (idx === START) markup += `<text x="${x + 18}" y="${y + 23}" font-size="13" font-weight="800" fill="var(--accent)" text-anchor="middle">S</text>`;
        else if (idx === GOAL) markup += `<text x="${x + 18}" y="${y + 23}" font-size="13" font-weight="800" fill="var(--go)" text-anchor="middle">G</text>`;
        else if (cliff && c === 4) markup += `<text x="${x + 36}" y="${y + 22}" font-size="11" font-weight="700" fill="var(--danger)" text-anchor="middle">Cliff (−100)</text>`;
      }
    }

    const poly = (path, dy, color, dashed = false) => {
      const pts = path.map((idx) => {
        const r = Math.floor(idx / W), c = idx % W;
        return `${(ox + c * cellW + 18).toFixed(1)},${(oy + r * cellH + 18 + dy).toFixed(1)}`;
      }).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${dashed ? 2.2 : 3.4}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dashed ? "5 4" : "none"}" opacity="${dashed ? ".65" : "1"}"/>`;
    };
    if (mode === "both" || mode === "q") markup += poly(sol.pathQ, mode === "both" ? 3 : 0, "var(--danger)", false);
    else markup += poly(sol.pathQ, 3, "var(--danger)", true);
    if (mode === "both" || mode === "sarsa") markup += poly(sol.pathS, mode === "both" ? -3 : 0, "var(--go)", false);
    else markup += poly(sol.pathS, -3, "var(--go)", true);

    const activeFall = mode === "sarsa" ? evS.fallProb : evQ.fallProb;
    markup += `<text x="${ox + 4.5 * cellW}" y="${oy + 4 * cellH + 10}" font-size="11" font-weight="700" fill="var(--danger)" text-anchor="middle" visibility="${activeFall > 0.005 ? "visible" : "hidden"}">Episode fall risk: ${(activeFall * 100).toFixed(0)}%</text>`;

    updateVizChart(svgEl, markup);
    if (mode === "both") {
      pillsEl.textContent = `SARSA ret: ${evS.avgReturn.toFixed(1)} | Q ret: ${evQ.avgReturn.toFixed(1)}`;
    } else if (mode === "sarsa") {
      pillsEl.textContent = `Avg return: ${evS.avgReturn.toFixed(1)} · Fall risk: ${(evS.fallProb * 100).toFixed(0)}%`;
    } else {
      pillsEl.textContent = `Avg return: ${evQ.avgReturn.toFixed(1)} · Fall risk: ${(evQ.fallProb * 100).toFixed(0)}%`;
    }

    const sTop = Math.min(...sol.pathS.map((idx) => Math.floor(idx / W)));
    setVizInsight(container, eps === 0
      ? (freezeEval ? "Trained at ε = 0.00 and tested greedily (ε_test = 0.00): both paths coincide along the cliff edge (−11.0)." : "At ε = 0.00 there are zero exploration slips, so both converged Expected SARSA and Q-Learning walk right along the cliff edge.")
      : freezeEval
        ? `Frozen at ε_train = ${eps.toFixed(2)} and tested greedily (ε_test = 0.00): Q-Learning takes the shorter edge (${evQ.avgReturn.toFixed(1)}) while Expected SARSA keeps its safe row-${sTop} detour (${evS.avgReturn.toFixed(1)}).`
        : `At ε = ${eps.toFixed(2)}, converged Expected SARSA detours up to row ${sTop} (return ${evS.avgReturn.toFixed(1)}), while Q-Learning still targets the cliff edge and risks falling (return ${evQ.avgReturn.toFixed(1)}).`);
  };

  freezeChk.onchange = () => { freezeEval = freezeChk.checked; draw(); };
  container.querySelectorAll("[data-cliff-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.cliffMode; draw(); }; });
  bindVizInputs(container, draw);
  draw();
}

function mountSelfPlayPool(container) {
  const A = [[0, -0.45, 0.45], [0.45, 0, -0.45], [-0.45, 0.45, 0]];
  const ANCHORS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const NAMES = ["Greedy", "Trap-Hunter", "Cautious"];
  const V = [[190, 42], [68, 224], [312, 224]];
  const toXY = (p) => [p[0] * V[0][0] + p[1] * V[1][0] + p[2] * V[2][0], p[0] * V[0][1] + p[1] * V[1][1] + p[2] * V[2][1]];
  const matVec = (M, v) => M.map((row) => row.reduce((s, val, j) => s + val * v[j], 0));
  const dot = (a, b) => a.reduce((s, val, i) => s + val * b[i], 0);

  let poolOn = false, anchorOn = false;
  let x = [0.58, 0.28, 0.14];
  let pool = [[...x]];
  let trail = [[...x]];
  let updates = 0;

  container.innerHTML = `
    <div class="viz-stage">
      <div class="viz-pills-row">
        <div class="simplex-toggles">
          <label class="simplex-toggle"><input type="checkbox" data-sp-pool/> Checkpoint Pool (FSP)</label>
          <label class="simplex-toggle"><input type="checkbox" data-sp-anchor/> PFSP Anchor Bots</label>
        </div>
        <span class="viz-pill" data-sp-pills></span>
      </div>
      <div class="viz-actions">
        <button type="button" class="btn-tactile go" data-sp-step>Train +10 Updates</button>
        <button type="button" class="btn-ghost pill" data-sp-reset>Reset</button>
        <span class="viz-pill" data-sp-upd>Updates: 0</span>
      </div>
      <svg id="svg-simplex" viewBox="0 0 380 264" width="100%" role="img" aria-label="Illustrative Rock Paper Scissors strategy simplex"></svg>
      <p class="viz-insight" role="status"></p>
    </div>`;

  const poolChk = container.querySelector("[data-sp-pool]");
  const anchorChk = container.querySelector("[data-sp-anchor]");
  const pillsEl = container.querySelector("[data-sp-pills]");
  const updEl = container.querySelector("[data-sp-upd]");
  const svgEl = container.querySelector(vizIdSelector("svg-simplex"));

  const pickOpp = (cur) => {
    const opps = [], weights = [];
    if (poolOn) {
      pool.forEach((p) => { opps.push(p); weights.push(1 / pool.length); });
    } else {
      opps.push(cur); weights.push(1);
    }
    const baseOpp = [0, 1, 2].map((k) => opps.reduce((s, o, idx) => s + weights[idx] * o[k], 0));
    if (!anchorOn) return { opp: baseOpp, anchorWeights: [0, 0, 0] };
    const aw = ANCHORS.map((a) => {
      const wp = 0.5 + dot(cur, matVec(A, a));
      return (1 - wp) ** 2 + 0.05;
    });
    const awSum = aw.reduce((s, v) => s + v, 0);
    const normAw = aw.map((v) => v / awSum);
    const ancOpp = [0, 1, 2].map((k) => ANCHORS.reduce((s, a, idx) => s + normAw[idx] * a[k], 0));
    return { opp: [0, 1, 2].map((k) => 0.5 * baseOpp[k] + 0.5 * ancOpp[k]), anchorWeights: normAw };
  };

  const stepUpdates = (n) => {
    const lr = 0.30;
    for (let i = 0; i < n; i++) {
      const { opp } = pickOpp(x);
      const grad = matVec(A, opp);
      const raw = x.map((v, k) => v * Math.exp(lr * grad[k]));
      const z = raw.reduce((s, v) => s + v, 0);
      x = raw.map((v) => v / z);
      pool.push([...x]);
      trail.push([...x]);
      if (trail.length > 45) trail.shift();
      updates++;
    }
  };

  const draw = () => {
    const { opp, anchorWeights } = pickOpp(x);
    const vs = [0, 1, 2].map((j) => 0.5 + dot(x, matVec(A, ANCHORS[j])));
    const worst = Math.min(...vs);
    const grad = matVec(A, opp);
    const nextRaw = x.map((v, k) => v * Math.exp(0.30 * grad[k]));
    const nextZ = nextRaw.reduce((s, v) => s + v, 0);
    const nextX = nextRaw.map((v) => v / nextZ);
    const [cx, cy] = toXY(x);
    const [nx, ny] = toXY(nextX);

    pillsEl.textContent = `Self-play win: 50% · Worst matchup: ${(worst * 100).toFixed(0)}%`;
    updEl.textContent = `Updates: ${updates}`;

    const trailPts = trail.map((p) => toXY(p).map((v) => v.toFixed(1)).join(",")).join(" ");
    const recentPool = pool.slice(-18);
    const poolDots = Array.from({ length: 18 }, (_, i) => {
      const p = recentPool[i];
      if (!poolOn || !p) return `<circle cx="190" cy="160" r="3.2" fill="var(--ink-3)" opacity="0" visibility="hidden"/>`;
      const [px, py] = toXY(p);
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.2" fill="var(--ink-3)" opacity=".38" visibility="visible"/>`;
    }).join("");
    const anchorRings = ANCHORS.map((_, j) => {
      const [vx, vy] = V[j];
      const ring = `<circle cx="${vx}" cy="${vy}" r="${(10 + anchorWeights[j] * 14).toFixed(1)}" fill="none" stroke="var(--warn)" stroke-width="2" opacity=".7" visibility="${anchorOn ? "visible" : "hidden"}"/>`;
      const ly = j === 0 ? vy - 18 : vy + 22;
      const anchor = j === 0 ? "middle" : j === 1 ? "start" : "end";
      const lx = j === 0 ? vx : j === 1 ? vx - 28 : vx + 28;
      return `${ring}<circle cx="${vx}" cy="${vy}" r="7" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="2"/>
        <text x="${lx}" y="${ly}" font-size="12" font-weight="700" fill="var(--ink)" text-anchor="${anchor}">${NAMES[j]} (${(vs[j] * 100).toFixed(0)}%)</text>`;
    }).join("");

    updateVizChart(svgEl, `
      <polygon points="${V.map((p) => p.join(",")).join(" ")}" fill="var(--accent-tint)" stroke="var(--line-strong)" stroke-width="1.8"/>
      <circle cx="190" cy="${((42 + 224 + 224) / 3).toFixed(1)}" r="4" fill="var(--go)" opacity=".55"/>
      ${poolDots}
      <polyline points="${trailPts}" fill="none" stroke="var(--accent)" stroke-width="2.2" opacity=".75"/>
      <line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--accent-solid)" stroke-width="2.4"/>
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="var(--accent-solid)" stroke="var(--surface)" stroke-width="2"/>
      ${anchorRings}`);

    const worstPct = (worst * 100).toFixed(0);
    setVizInsight(container, (!poolOn && !anchorOn)
      ? `Illustrative fixed RPS payoff (±0.45): Latest-only self-play orbits the triangle (worst matchup ${worstPct}%) while self-play win rate stays 50%.`
      : (poolOn && !anchorOn)
        ? `Checkpoint Pool (FSP) averages past snapshots (worst matchup ${worstPct}%). Early pools clustered near one corner still overshoot slowly without diverse anchors.`
        : `PFSP-weighted anchors${poolOn ? " + checkpoint pool" : ""} pull toward the balanced center (green dot), stabilizing worst matchup at ${worstPct}%.`);
  };

  poolChk.onchange = () => { poolOn = poolChk.checked; draw(); };
  anchorChk.onchange = () => { anchorOn = anchorChk.checked; draw(); };
  container.querySelector("[data-sp-step]").onclick = () => { stepUpdates(10); draw(); };
  container.querySelector("[data-sp-reset]").onclick = () => {
    x = [0.58, 0.28, 0.14]; pool = [[...x]]; trail = [[...x]]; updates = 0; draw();
  };
  draw();
}

function mountViz(vizType, container) {
  const mounts = {
    agent_loop: mountAgentLoop,
    explore_exploit: mountExploreExploit,
    rl_landscape: mountRlLandscape,
    bellman_backup: mountBellmanBackup,
    policy_baseline: mountPolicyBaseline,
    reward_shaping: mountRewardShaping,
    dp_iteration: mountDpIteration,
    sarsa_vs_q: mountSarsaVsQ,
    self_play_pool: mountSelfPlayPool,
  };
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
        <p class="viz-insight" role="status"></p>
      </div>`;
    const draw = () => {
      const sg = container.querySelector(vizIdSelector("s-gamma")), sw = container.querySelector(vizIdSelector("s-win"));
      setRangeFill(sg); setRangeFill(sw);
      const g = Number(sg.value), w = Number(sw.value);
      container.querySelector(vizIdSelector("v-gamma")).textContent = g.toFixed(3);
      container.querySelector(vizIdSelector("v-win")).textContent = w;
      const hor = (1 / Math.max(1 - g, 1e-4)).toFixed(0);
      const g0 = Math.pow(g, w);
      container.querySelector(vizIdSelector("t-hor")).textContent = `Horizon ≈ ${hor} steps`;
      container.querySelector(vizIdSelector("t-g0")).textContent = `G₀ = ${g0.toFixed(3)}`;

      const pts1 = [];
      for (let k = 0; k <= 95; k += 2) pts1.push(`${(32 + (k / 95) * 292).toFixed(1)},${(156 - Math.pow(g, k) * 132).toFixed(1)}`);
      const wx = 32 + (w / 95) * 292, wy = 156 - g0 * 132;
      updateVizChart(container.querySelector(vizIdSelector("svg-decay")), `
        <line x1="32" y1="24" x2="324" y2="24" stroke="var(--line)"/>
        <line x1="32" y1="90" x2="324" y2="90" stroke="var(--line)"/>
        <line x1="32" y1="156" x2="324" y2="156" stroke="var(--line-strong)"/>
        <polygon points="32,156 ${pts1.join(" ")} 324,156" fill="var(--accent-tint)"/>
        <polyline points="${pts1.join(" ")}" fill="none" stroke="var(--accent-solid)" stroke-width="2.6"/>
        <line transform="translate(${wx} 0)" x1="0" y1="24" x2="0" y2="156" stroke="var(--go)" stroke-dasharray="4 3" stroke-width="1.6"/>
        <circle cx="${wx}" cy="${wy}" r="5.5" fill="var(--go)" stroke="var(--surface)" stroke-width="2"/>
        <text x="178" y="182" font-size="13" fill="var(--ink-2)" text-anchor="middle">Future steps k (0 → 95)</text>`);

      const pts2 = [];
      for (let t = 0; t <= w; t++) pts2.push(`${(32 + (t / Math.max(w, 1)) * 292).toFixed(1)},${(156 - Math.pow(g, w - t) * 132).toFixed(1)}`);
      updateVizChart(container.querySelector(vizIdSelector("svg-ret")), `
        <line x1="32" y1="24" x2="324" y2="24" stroke="var(--line)"/>
        <line x1="32" y1="90" x2="324" y2="90" stroke="var(--line)"/>
        <line x1="32" y1="156" x2="324" y2="156" stroke="var(--line-strong)"/>
        <polygon points="32,156 ${pts2.join(" ")} 324,156" fill="var(--go-tint)"/>
        <polyline points="${pts2.join(" ")}" fill="none" stroke="var(--go)" stroke-width="2.6"/>
        <circle cx="32" cy="${(156 - g0 * 132).toFixed(1)}" r="5.5" fill="var(--accent-solid)" stroke="var(--surface)" stroke-width="2"/>
        <text x="178" y="182" font-size="13" fill="var(--ink-2)" text-anchor="middle">Decision step t (0 → ${w})</text>`);
      setVizInsight(container, `A win ${w} steps away contributes ${g0.toFixed(3)} to the return now. ${g0 < .1 ? "Raise γ to give distant rewards more weight." : "Lower γ to give distant rewards less weight."}`);
    };
    bindVizInputs(container, draw);
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
              <label for="m-log-${i}"><span>${n}</span><span id="m-val-${i}" class="range-val">${initL[i].toFixed(1)}</span></label>
              <label class="mask-legality"><input type="checkbox" id="m-leg-${i}" aria-label="${n} legal" ${initM[i] ? "checked" : ""}/> Legal</label>
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
        <p class="viz-insight" role="status"></p>
      </div>`;
    const sm = (a) => { const m = Math.max(...a), e = a.map((v) => Math.exp(v - m)), s = e.reduce((x, y) => x + y, 0); return e.map((v) => v / s); };
    const ent = (ps) => -ps.reduce((a, p) => (p > 1e-12 ? a + p * Math.log(p) : a), 0);
    const draw = () => {
      const logits = names.map((_, i) => { const el = container.querySelector(vizIdSelector(`m-log-${i}`)); setRangeFill(el); return Number(el.value); });
      const legal = names.map((_, i) => container.querySelector(vizIdSelector(`m-leg-${i}`)).checked);
      logits.forEach((v, i) => (container.querySelector(vizIdSelector(`m-val-${i}`)).textContent = v.toFixed(1)));
      if (!legal.some(Boolean)) { legal[0] = true; container.querySelector(vizIdSelector("m-leg-0")).checked = true; }
      const rawP = sm(logits);
      const mP = sm(logits.map((v, i) => (legal[i] ? v : -1e9))).map((p, i) => (legal[i] ? p : 0));
      const hRaw = ent(rawP), hMask = ent(mP), k = legal.filter(Boolean).length, hMax = Math.log(Math.max(k, 1));
      container.querySelector(vizIdSelector("t-ent")).textContent = `H = ${hMask.toFixed(3)} nats`;

      let bars = `<line x1="20" y1="154" x2="326" y2="154" stroke="var(--line-strong)"/>`;
      names.forEach((n, i) => {
        const bx = 34 + i * 74, h1 = rawP[i] * 120, h2 = mP[i] * 120;
        bars += `<rect x="${bx}" y="${154 - h1}" width="22" height="${h1}" rx="4" fill="var(--line)"/>`;
        bars += `<rect x="${bx + 24}" y="${154 - h2}" width="22" height="${h2}" rx="4" fill="${legal[i] ? "var(--go)" : "var(--danger)"}"/>`;
        bars += `<text x="${bx + 35}" y="${147 - h2}" font-size="12.5" font-weight="700" fill="var(--ink)" text-anchor="middle">${mP[i].toFixed(2)}</text>`;
        bars += `<text x="${bx + 23}" y="178" font-size="12.5" font-weight="700" fill="${legal[i] ? "var(--ink)" : "var(--danger)"}" text-anchor="middle">${n}</text>`;
      });
      updateVizChart(container.querySelector(vizIdSelector("svg-mask-p")), bars);

      const maxH = Math.max(hRaw, hMax, 1.45);
      const items = [["Unmasked", hRaw, "var(--line-strong)"], ["Masked", hMask, "var(--accent-solid)"], [`Max ln(${k})`, hMax, "var(--go)"]];
      let hb = `<line x1="20" y1="154" x2="326" y2="154" stroke="var(--line-strong)"/>`;
      items.forEach(([lbl, val, col], i) => {
        const bx = 40 + i * 96, bh = (val / maxH) * 116;
        hb += `<rect x="${bx}" y="${154 - bh}" width="56" height="${bh}" rx="6" fill="${col}"/>`;
        hb += `<text x="${bx + 28}" y="${146 - bh}" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="middle">${val.toFixed(3)}</text>`;
        hb += `<text x="${bx + 28}" y="178" font-size="12.5" font-weight="700" fill="var(--ink-2)" text-anchor="middle">${lbl}</text>`;
      });
      updateVizChart(container.querySelector(vizIdSelector("svg-mask-h")), hb);
      setVizInsight(container, `${names.length - k} of ${names.length} actions are masked. ${k === 1 ? "The only legal action gets all the probability." : "The legal actions share all the probability."}`);
    };
    bindVizInputs(container, draw);
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
        <p class="viz-insight" role="status"></p>
      </div>`;
    const draw = () => {
      const sg = container.querySelector(vizIdSelector("sg-g")), sl = container.querySelector(vizIdSelector("sg-l")), sr = container.querySelector(vizIdSelector("sg-r"));
      setRangeFill(sg); setRangeFill(sl); setRangeFill(sr);
      const g = Number(sg.value), l = Number(sl.value), rIdx = Number(sr.value);
      container.querySelector(vizIdSelector("g-g")).textContent = g.toFixed(2);
      container.querySelector(vizIdSelector("g-l")).textContent = l.toFixed(2);
      container.querySelector(vizIdSelector("g-r")).textContent = rIdx;
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
      {
        wS += `<line visibility="${rIdx < 7 ? "visible" : "hidden"}" transform="translate(${wallX} 0)" x1="0" y1="16" x2="0" y2="158" stroke="var(--danger)" stroke-width="2" stroke-dasharray="4 3"/>`;
        cS += `<line visibility="${rIdx < 7 ? "visible" : "hidden"}" transform="translate(${wallX} 0)" x1="0" y1="16" x2="0" y2="158" stroke="var(--danger)" stroke-width="2" stroke-dasharray="4 3"/>`;
      }
      updateVizChart(container.querySelector(vizIdSelector("svg-gae-w")), wS);
      updateVizChart(container.querySelector(vizIdSelector("svg-gae-c")), cS);
      container.querySelector(vizIdSelector("t-gae-sum")).textContent = `A₀ = ${sum >= 0 ? "+" : ""}${sum.toFixed(3)}`;
      setVizInsight(container, `${rIdx === 7 ? "No reset blocks the residuals shown." : "Residuals after step " + rIdx + " belong to the next episode."} The remaining weighted residuals sum to ${fmtSigned(sum)}.`);
    };
    bindVizInputs(container, draw);
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
          <span class="viz-legend-item"><svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="var(--ink-3)" stroke-width="1.8" stroke-dasharray="4 3"/></svg>Unclipped r × A</span>
          <span class="viz-legend-item"><svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill="var(--go)"/></svg>Current r(θ)</span>
        </div>
        <p class="viz-insight" role="status"></p>
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
      const b = container.querySelector(vizIdSelector(`${badgeId}`));
      b.className = "viz-pill" + (flat ? " clipped" : "");
      b.textContent = `L = ${yM.toFixed(2)} (${flat ? "grad = 0" : "active"})`;

      const lblOffset = eps <= 0.12 ? 14 : 0;
      updateVizChart(container.querySelector(vizIdSelector(`${svgId}`)), `
        <rect x="${xL}" y="18" width="${xR - xL}" height="148" fill="var(--accent-tint)"/>
        <line x1="28" y1="166" x2="312" y2="166" stroke="var(--line-strong)"/>
        <line x1="${x1}" y1="18" x2="${x1}" y2="166" stroke="var(--line-strong)" stroke-dasharray="3 3"/>
        <polyline points="${pRaw.join(" ")}" fill="none" stroke="var(--ink-3)" stroke-width="1.8" stroke-dasharray="4 4"/>
        <polyline points="${pSur.join(" ")}" fill="none" stroke="${A > 0 ? "var(--accent-solid)" : "var(--danger)"}" stroke-width="2.8"/>
        <circle cx="${toX(rMark)}" cy="${toY(yM)}" r="6" fill="var(--go)" stroke="var(--surface)" stroke-width="2.2"/>
        <text x="${xL - lblOffset}" y="190" font-size="14" font-weight="700" fill="var(--ink-2)" text-anchor="middle">1−ε</text>
        <text x="${x1}" y="190" font-size="14" font-weight="700" fill="var(--ink)" text-anchor="middle">1.0</text>
        <text x="${xR + lblOffset}" y="190" font-size="14" font-weight="700" fill="var(--ink-2)" text-anchor="middle">1+ε</text>`);
    };
    const draw = () => {
      const se = container.querySelector(vizIdSelector("sp-eps")), sr = container.querySelector(vizIdSelector("sp-r"));
      setRangeFill(se); setRangeFill(sr);
      const eps = Number(se.value), r = Number(sr.value);
      container.querySelector(vizIdSelector("p-eps")).textContent = eps.toFixed(2);
      container.querySelector(vizIdSelector("p-r")).textContent = r.toFixed(2);
      drawOne("svg-ppo-pos", "b-pos", +1, eps, r);
      drawOne("svg-ppo-neg", "b-neg", -1, eps, r);
      setVizInsight(container, `At ratio ${r.toFixed(2)}, clipping ${r > 1 + eps ? "caps the gain for the positive advantage" : r < 1 - eps ? "caps the gain for the negative advantage" : "leaves both objectives active"}.`);
    };
    bindVizInputs(container, draw);
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
  const el = container.querySelector(vizIdSelector(`${id}`));
  setRangeFill(el);
  const v = Number(el.value);
  container.querySelector(vizIdSelector(`${id}-val`)).textContent = v.toFixed(digits);
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
        <button type="button" id="bb-sweep" class="btn-tactile go pill">Bellman sweep</button>
        <button type="button" id="bb-td" class="btn-ghost pill">Sample TD step</button>
        <button type="button" id="bb-reset" class="btn-ghost pill">Reset to 0</button>
      </div>
      <div class="viz-grid">
        <div class="viz-cell">
          <div class="viz-cell-header"><span class="viz-cell-name">The board</span><span id="bb-pill1" class="viz-pill">p* = 0.53</span></div>
          <div class="bellman-board" role="group" aria-label="Three board squares with learned values">
            ${[["go", "Go"], ["safe", "Safe Street"], ["hotel", "Hotel Trap"]].map(([tile, name]) => `<button type="button" class="bellman-tile" data-bellman-tile="${tile}">
              ${window.Illustrations.bellmanTileSvg(tile)}
              <strong>${name}</strong><span class="bellman-value" data-value></span>
              <span class="bellman-track" aria-hidden="true"><span></span><i></i></span>
              <small data-tile-action></small>
            </button>`).join("")}
          </div>
          <p class="bellman-path">Go → Safe Street<br>Safe Street → Win (1−p) or Hotel Trap (p)</p>
        </div>
        <div class="viz-cell">
          <div class="viz-cell-header"><span class="viz-cell-name">Targets for Safe Street</span><span id="bb-pill2" class="viz-pill">sweeps: 0</span></div>
          <svg id="bb-targets" viewBox="0 0 340 192" width="100%" role="img" aria-label="Number line of TD and Bellman targets"></svg>
          <p class="bellman-readout tabular" data-bellman-readout></p>
        </div>
      </div>
      <div class="viz-legend">
        <span class="viz-legend-item"><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="var(--ink-3)"/></svg>One-sample TD targets (size = probability)</span>
        <span class="viz-legend-item"><svg width="12" height="12"><path d="M6 1 11 6 6 11 1 6Z" fill="var(--accent-solid)"/></svg>Bellman target</span>
        <span class="viz-legend-item"><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="var(--go)"/></svg>V(Safe)</span>
      </div>
      <p class="viz-insight" role="status"></p>
    </div>`;

  const rng = mulberry32(20261126);
  let V = { go: 0, safe: 0, hotel: 0 };
  let sweeps = 0;
  let token = "go";
  let lastTarget = null;
  let lastAction = "sweep";
  let penalty = -1;
  const tiles = [...container.querySelectorAll("[data-bellman-tile]")];

  const draw = () => {
    const gamma = readRange(container, "bb-gamma", 2);
    const p = readRange(container, "bb-p", 2);
    readRange(container, "bb-alpha", 2);
    const exact = { hotel: penalty, safe: 1 - p + gamma * p * penalty };
    exact.go = gamma * exact.safe;
    const tipping = 1 / (1 - gamma * penalty);
    container.querySelector(vizIdSelector("bb-pill1")).textContent = `p* = ${tipping.toFixed(2)}`;
    container.querySelector(vizIdSelector("bb-pill2")).textContent = lastAction === "td" && lastTarget !== null
      ? `last TD target: ${fmtSigned(lastTarget)}`
      : `sweeps: ${sweeps}`;

    tiles.forEach((tile) => {
      const key = tile.dataset.bellmanTile;
      const value = V[key];
      const track = tile.querySelector(".bellman-track");
      tile.querySelector("[data-value]").textContent = fmtSigned(value);
      tile.querySelector("[data-tile-action]").textContent = {
        go: "Back up Go", safe: "Back up V(Safe)", hotel: penalty === -1 ? "Penalty −1" : "Penalty −0.5",
      }[key];
      tile.classList.toggle("has-token", token === key);
      track.style.setProperty("--amount", Math.abs(value) / 2);
      track.style.setProperty("--at", (exact[key] + 1) / 2);
      track.classList.toggle("is-negative", value < 0);
    });

    const toX = (v) => 24 + ((Math.max(-1.2, Math.min(1.2, v)) + 1.2) / 2.4) * 292;
    const hotelTarget = gamma * V.hotel;
    const bellman = p * gamma * V.hotel + (1 - p);
    setVizInsight(container, lastAction === "td" && lastTarget !== null
      ? `The sampled outcome gave a TD target of ${fmtSigned(lastTarget)}. The Bellman target averages both outcomes at ${fmtSigned(bellman)}.`
      : lastAction === "tile"
        ? `${{ go: "Go backed up", safe: "Safe Street backed up", hotel: "Hotel penalty changed" }[token]}. The Bellman target for Safe Street is ${fmtSigned(bellman)}.`
        : `A sweep averages the two outcomes. With the current estimates, the Bellman target for Safe Street is ${fmtSigned(bellman)}.`);
    // Plain-text twin of the chart, so nobody has to read the numbers off the SVG.
    container.querySelector("[data-bellman-readout]").textContent =
      `V(Safe Street) = ${V.safe.toFixed(2)}, Bellman target = ${bellman.toFixed(2)}, Tipping risk p* = ${tipping.toFixed(2)}`;
    updateVizChart(container.querySelector(vizIdSelector("bb-targets")), `
      <text x="24" y="28" font-size="16" font-weight="700" fill="var(--accent)">Bellman target ${fmtSigned(bellman)}</text>
      <text x="24" y="52" font-size="16" font-weight="700" fill="var(--go-ink)">V(Safe) ${fmtSigned(V.safe)}</text>
      <line x1="24" y1="112" x2="316" y2="112" stroke="var(--line-strong)" stroke-width="1.5"/>
      ${[-1, 0, 1].map((t) => `<line x1="${toX(t)}" y1="106" x2="${toX(t)}" y2="118" stroke="var(--line-strong)"/>
        <text x="${toX(t)}" y="140" font-size="15" font-weight="600" fill="var(--ink-2)" text-anchor="middle">${t === 0 ? "0" : fmtSigned(t).replace(".00", "")}</text>`).join("")}
      <line visibility="${lastTarget !== null ? "visible" : "hidden"}" x1="${toX(lastTarget ?? 0)}" y1="76" x2="${toX(lastTarget ?? 0)}" y2="148" stroke="var(--warn)" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${toX(hotelTarget)}" cy="112" r="${3 + 7 * p}" fill="var(--ink-3)" opacity="0.8"/>
      <circle cx="${toX(1)}" cy="112" r="${3 + 7 * (1 - p)}" fill="var(--ink-3)" opacity="0.8"/>
      <path d="M0 -9 9 0 0 9 -9 0Z" transform="translate(${toX(bellman)} 112)" fill="var(--accent-solid)" stroke="var(--surface)" stroke-width="1.5"/>
      <circle cx="${toX(V.safe)}" cy="112" r="5.5" fill="var(--go)" stroke="var(--surface)" stroke-width="2"/>
      <text x="170" y="178" font-size="15" fill="var(--ink-2)" text-anchor="middle">Value scale (−1.2 to +1.2)</text>`);
  };

  const backUp = (old) => {
    const gamma = Number(container.querySelector(vizIdSelector("bb-gamma")).value);
    const p = Number(container.querySelector(vizIdSelector("bb-p")).value);
    return { hotel: penalty, safe: p * gamma * old.hotel + 1 - p, go: gamma * old.safe };
  };
  container.querySelector(vizIdSelector("bb-sweep")).onclick = () => {
    V = backUp(V);
    sweeps++;
    lastAction = "sweep";
    draw();
  };
  tiles.forEach((tile) => {
    const key = tile.dataset.bellmanTile;
    tile.onclick = () => {
      if (key === "hotel") penalty = penalty === -1 ? -.5 : -1;
      V[key] = backUp(V)[key];
      token = key;
      lastAction = "tile";
      lastTarget = null;
      draw();
      if (prefersReducedMotion()) return;
      tile.querySelectorAll(".bellman-ripple").forEach((ripple) => ripple.remove());
      const ripple = document.createElement("span");
      ripple.className = "bellman-ripple";
      ripple.setAttribute("aria-hidden", "true");
      // The delayed outer ring (::after) finishes last, so it owns the cleanup.
      ripple.addEventListener("animationend", (event) => { if (event.pseudoElement === "::after") ripple.remove(); });
      setTimeout(() => ripple.remove(), 1000);
      tile.append(ripple);
      const value = tile.querySelector("[data-value]");
      value.getAnimations?.().forEach((animation) => animation.cancel());
      value.animate?.([{ transform: "scale(1.16)" }, { transform: "scale(1)" }],
        { duration: 320, easing: getComputedStyle(tile).getPropertyValue("--spring-snappy").trim() || "ease-out" });
    };
  });
  container.querySelector(vizIdSelector("bb-td")).onclick = () => {
    const gamma = Number(container.querySelector(vizIdSelector("bb-gamma")).value);
    const p = Number(container.querySelector(vizIdSelector("bb-p")).value);
    const alpha = Number(container.querySelector(vizIdSelector("bb-alpha")).value);
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
      target = penalty;
      token = "go";
    }
    V[sq] += alpha * (target - V[sq]);
    lastTarget = target;
    lastAction = "td";
    draw();
  };
  container.querySelector(vizIdSelector("bb-reset")).onclick = () => {
    V = { go: 0, safe: 0, hotel: 0 };
    penalty = -1;
    sweeps = 0;
    token = "go";
    lastTarget = null;
    lastAction = "sweep";
    draw();
  };
  bindVizInputs(container, draw);
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
        <button type="button" id="pb-resample" class="btn-ghost pill">Resample 20 games</button>
        <button type="button" id="pb-snap" class="btn-tactile go pill">Snap b to E[R]</button>
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
      <p class="viz-insight" role="status"></p>
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
    setVizInsight(container, `The expected gradient stays at ${Eg.toFixed(2)} as you change the baseline. The spread is smallest at b = ${bStar.toFixed(2)}.`);

    const games = draws.map(({ ua, u1, u2 }) => {
      const buy = ua < pi;
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2);
      const R = (buy ? MU_BUY : MU_PASS) + sig * z;
      return { buy, g: buy ? (1 - pi) * (R - b) : -pi * (R - b) };
    });
    const wrong = games.filter((x) => Math.sign(x.g) === -Math.sign(Eg) && x.g !== 0).length;
    const mean = games.reduce((acc, x) => acc + x.g, 0) / N;
    container.querySelector(vizIdSelector("pb-pill1")).textContent = `wrong way: ${wrong} / ${N}`;
    container.querySelector(vizIdSelector("pb-pill2")).textContent = `std = ${stdAt(b).toFixed(2)}`;

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
        <path visibility="${Math.abs(l) > 4 ? "visible" : "hidden"}" d="M${end} ${y} ${end - dir * 5} ${y - 3} ${end - dir * 5} ${y + 3}Z" fill="${color}"/>
        <path visibility="${isWrong ? "visible" : "hidden"}" d="M${end + dir * 6 - 2.5} ${y - 2.5}l5 5m0 -5l-5 5" stroke="var(--ink-3)" stroke-width="1.4" stroke-linecap="round"/>
      </g>`;
    });
    const mEnd = ZERO + len(mean), mDir = Math.sign(len(mean)) || 1;
    arrows += `
      <line x1="${ZERO}" y1="160" x2="${mEnd - mDir * 4}" y2="160" stroke="var(--accent-solid)" stroke-width="5" stroke-linecap="round"/>
      <path visibility="${Math.abs(len(mean)) > 6 ? "visible" : "hidden"}" d="M${mEnd + mDir * 2} 160 ${mEnd - mDir * 7} 154 ${mEnd - mDir * 7} 166Z" fill="var(--accent-solid)"/>
      <line x1="${ZERO + len(Eg)}" y1="151" x2="${ZERO + len(Eg)}" y2="169" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="3 2"/>
      <text x="170" y="186" font-size="12.5" fill="var(--ink-2)" text-anchor="middle">mean ${fmtSigned(mean)}, E[g] ${fmtSigned(Eg)} (dashed)</text>`;
    updateVizChart(container.querySelector(vizIdSelector("pb-arrows")), arrows);

    const toX = (base) => 30 + (base / 4) * 290;
    const samples = Array.from({ length: 81 }, (_, i) => (i / 80) * 4);
    const maxStd = Math.max(0.5, ...samples.map(stdAt), Eg);
    const toY = (v) => 158 - (v / maxStd) * 126;
    const pts = samples.map((base) => `${toX(base).toFixed(1)},${toY(stdAt(base)).toFixed(1)}`);
    const sameLine = Math.abs(toX(ER) - toX(bStar)) < 22;
    updateVizChart(container.querySelector(vizIdSelector("pb-curve")), `
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
      <text x="175" y="186" font-size="13" fill="var(--ink-2)" text-anchor="middle">Baseline b</text>`);
  };

  container.querySelector(vizIdSelector("pb-resample")).onclick = () => { seed++; resample(); draw(); };
  container.querySelector(vizIdSelector("pb-snap")).onclick = () => {
    const pi = Number(container.querySelector(vizIdSelector("pb-pi")).value);
    container.querySelector(vizIdSelector("pb-b")).value = (Math.round((pi * MU_BUY + (1 - pi) * MU_PASS) * 10) / 10).toFixed(1);
    draw();
  };
  bindVizInputs(container, draw);
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
  let preferred;
  container.innerHTML = `
    <div class="viz-stage">
      <div class="viz-actions viz-seg" role="group" aria-label="Reward design">
        ${MODES.map(([id, label]) => `<button type="button" class="btn-ghost pill" data-rs-mode="${id}" aria-pressed="${id === mode}">${label}</button>`).join("")}
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
      <p class="viz-insight" role="status"></p>
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
    container.querySelector(vizIdSelector("rs-c-group")).hidden = mode !== "naive";
    container.querySelector(vizIdSelector("rs-k-group")).hidden = mode !== "potential";
    container.querySelectorAll("[data-rs-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rsMode === mode)));

    const steps = { A: rewardsFor(PLANS.A, c, k, gamma), B: rewardsFor(PLANS.B, c, k, gamma) };
    const G = { A: discounted(steps.A, gamma), B: discounted(steps.B, gamma) };
    const sparseG = { A: discounted(steps.A, gamma, false), B: discounted(steps.B, gamma, false) };
    container.querySelector(vizIdSelector("rs-ga")).textContent = `Plan A G₀ = ${G.A.toFixed(2)}`;
    container.querySelector(vizIdSelector("rs-gb")).textContent = `Plan B G₀ = ${G.B.toFixed(2)}`;
    const winner = Math.abs(G.B - G.A) < 1e-9 ? "tie" : G.B > G.A ? "B" : "A";
    const explanation = winner === "tie" ? "Both plans earn the same discounted return at these settings."
      : mode === "potential" ? "Potential shaping shifts both returns by the same amount, so the plan that wins still leads."
      : winner === "B" ? "The cash bonus makes hoarding score higher even though that plan loses the game."
      : "The plan that wins also earns the higher discounted return.";
    setVizInsight(container, explanation);
    const pill = container.querySelector(vizIdSelector("rs-prefer"));
    pill.textContent = winner === "tie" ? "Plans tie" : winner === "B" ? "Prefers: Plan B (reward hack)" : "Prefers: Plan A";
    pill.classList.toggle("danger", winner === "B");
    pill.classList.toggle("go", winner === "A");
    if (preferred && winner !== preferred) {
      pill.classList.remove("check-pop");
      void pill.offsetWidth;
      pill.classList.add("check-pop");
    }
    preferred = winner;

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
          const hh = h(v);
          if (v > 0) { up -= hh; bars += `<rect x="${x}" y="${up}" width="22" height="${hh}" rx="3" fill="${color}"/>`; }
          else { bars += `<rect x="${x}" y="${down}" width="22" height="${hh}" rx="3" fill="${color}"/>`; down += hh; }
        });
        const tip = mode === "potential" && key === "A" && t === 4
          ? `The ${fmtSigned(r.extra)} here is the potential being paid back when the game ends. That's the telescoping in action.` : "";
        svg += `<g><title>${tip}</title><rect x="${x - 4}" y="${base - CLAMP - 4}" width="30" height="${2 * CLAMP + 8}" fill="transparent"/>${bars}</g>`;
        svg += `<text x="${x + 11}" y="${numY}" font-size="11" fill="var(--ink-2)" text-anchor="middle">${plan.cash[t]} / ${plan.nw[t]}</text>`;
        if (t === 4) {
          const fy = r.sparse > 0 ? up - 4 : base - 6;
          const fx = x + 26;
          svg += `<path d="M${fx} ${fy}v-14l9 3.5-9 3.5" stroke="${r.sparse > 0 ? "var(--go)" : "var(--danger)"}" stroke-width="1.8" stroke-linejoin="round" fill="${r.sparse > 0 ? "var(--go)" : "var(--danger)"}"/>`;
        }
      });
    });
    [0, 1, 2, 3, 4].forEach((t) => { svg += `<text x="${59 + t * 56}" y="178" font-size="12" fill="var(--ink-2)" text-anchor="middle">t=${t}</text>`; });
    updateVizChart(container.querySelector(vizIdSelector("rs-steps")), svg);

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
    updateVizChart(container.querySelector(vizIdSelector("rs-compare")), `
      ${bar("A", 30, "var(--go)")}
      ${bar("B", 84, "var(--warn)")}
      <line x1="${zero}" y1="18" x2="${zero}" y2="128" stroke="var(--line-strong)" stroke-dasharray="3 3"/>
      <line x1="30" y1="128" x2="320" y2="128" stroke="var(--line-strong)" stroke-width="1.5"/>
      ${[-2, -1, 0, 1, 2, 3, 4].map((v) => `<line x1="${toX(v)}" y1="124" x2="${toX(v)}" y2="132" stroke="var(--line-strong)"/>
        <text x="${toX(v)}" y="146" font-size="13" fill="var(--ink-2)" text-anchor="middle">${v < 0 ? "−" + Math.abs(v) : v}</text>`).join("")}
      <text x="175" y="176" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="middle">${modeLine}</text>`);
  };

  container.querySelectorAll("[data-rs-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.rsMode; draw(); }; });
  bindVizInputs(container, draw);
  draw();
}

// Live PyTorch Backend Labs
function chartColor(token) {
  return /^(?:#[0-9a-f]{6}|var\(--[a-z-]+\))$/i.test(token) ? token : "var(--accent-solid)";
}

let sparklineSequence = 0;
function sparklineHtml(seriesList, title, axisCaption = "Training progress") {
  const all = seriesList.flatMap((series) => series.data);
  const min = Math.min(...all, 0), max = Math.max(...all, .01);
  const toY = (value) => 110 - (value - min) / (max - min) * 86;
  const series = seriesList.filter(({ data }) => data.length).map(({ data, color, ...rest }) => ({
    ...rest, color: chartColor(color),
    points: data.map((value, i) => `${(data.length === 1 ? 246 : 18 + i / (data.length - 1) * 228).toFixed(1)},${toY(value).toFixed(1)}`).join(" "),
    end: data.at(-1), y: toY(data.at(-1)),
  }));
  const badges = [...series].sort((a, b) => a.y - b.y);
  badges.forEach((item, i) => {
    item.badgeY = Math.min(110 - (badges.length - i - 1) * 18,
      Math.max(item.y, (badges[i - 1]?.badgeY ?? 6) + 18));
  });
  const lines = series.map(({ points, color, dash, end, y, badgeY }) => {
    const maskId = `sparkline-mask-${++sparklineSequence}`;
    const dashAttr = /^[0-9 ]+$/.test(dash || "") ? `stroke-dasharray="${dash}"` : "";
    return `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="135">
        <polyline class="sparkline-draw" points="${points}" pathLength="1" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/>
      </mask>
      <polyline points="${points}" mask="url(#${maskId})" fill="none" stroke="${color}" stroke-width="2.3" ${dashAttr}/>
      <circle cx="246" cy="${y}" r="2.8" fill="${color}"/>
      <path d="M246 ${y} L254 ${badgeY}" fill="none" stroke="${color}"/>
      <rect x="254" y="${badgeY - 8}" width="45" height="16" rx="5" fill="var(--surface)" stroke="${color}"/>
      <text class="sparkline-value" x="276.5" y="${badgeY + 3.5}" text-anchor="middle" fill="var(--ink)">${end.toFixed(2)}</text>`;
  }).join("");
  const legend = series.map(({ label, color, dash }) => `<span class="viz-legend-item">
    <svg width="16" height="6" aria-hidden="true"><line x1="0" y1="3" x2="16" y2="3" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="5 3"' : ""}/></svg>${esc(label)}</span>`).join("");
  return `<div class="viz-cell"><div class="viz-cell-header"><span class="viz-cell-name">${esc(title)}</span></div>
    <svg class="sparkline" viewBox="0 0 300 134" width="100%" role="img" aria-label="${esc(title)}">
      <line x1="18" y1="110" x2="246" y2="110" stroke="var(--line-strong)"/>
      <line x1="18" y1="67" x2="246" y2="67" stroke="var(--line-strong)" stroke-dasharray="3 4" opacity=".6"/>
      ${lines}
      <text x="18" y="16" font-size="11.5" fill="var(--ink-2)">${max.toFixed(2)}</text>
      <text x="18" y="127" font-size="11.5" fill="var(--ink-2)">${min.toFixed(2)}</text>
      <text x="132" y="127" text-anchor="middle" font-size="11.5" fill="var(--ink-2)">${esc(axisCaption)}</text>
    </svg><div class="viz-legend">${legend}</div></div>`;
}

function labVerdict(data) {
  const fixed = (value) => Number.isFinite(value) ? value.toFixed(3) : "Unavailable";
  const percent = (value) => Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : "Unavailable";
  const final = (series) => series?.at(-1);
  let headline, stats, takeaway, winner;
  let tone = "info";
  switch (data.lab_type) {
    case "gridworld": {
      const td = final(data.err_td), mc = final(data.err_mc);
      const result = td < mc ? "TD(0) ended with less error" : mc < td ? "Monte Carlo ended with less error" : "Both methods ended with the same error";
      stats = [["TD(0) final RMSE", fixed(td)], ["Monte Carlo final RMSE", fixed(mc)]];
      headline = Number.isFinite(td) && Number.isFinite(mc) ? result : "Final error comparison";
      winner = td < mc ? 0 : mc < td ? 1 : undefined;
      tone = winner === undefined ? "info" : "success";
      takeaway = "Lower RMSE means the estimate is closer to the true value.";
      break;
    }
    case "probes_4_5":
      headline = "How close did the probes get to +1?";
      stats = [["Probe 4 final reward", fixed(final(data.probe4))], ["Probe 5 final reward", fixed(final(data.probe5))]];
      takeaway = "Compare the two final rewards to the +1 optimum, then check whether Probe 5 favors a different action in each state.";
      break;
    case "ppo_epoch_drift": {
      const peak = (epochs) => Math.max(...epochs.map((epoch) => epoch.max_r));
      const clipped = peak(data.runs.clipped), unclipped = peak(data.runs.unclipped);
      stats = [["Clipped peak ratio", fixed(clipped)], ["Unclipped peak ratio", fixed(unclipped)]];
      headline = clipped < unclipped ? "Clipping reduced the peak ratio" : "Clipping did not reduce the peak ratio";
      winner = clipped < unclipped ? 0 : undefined;
      tone = winner === undefined ? "info" : "success";
      takeaway = clipped < unclipped
        ? "Clipping kept the largest increase in action probability smaller across these epochs."
        : "In this run the clipped policy reached a peak ratio at least as high as the unclipped policy.";
      break;
    }
    case "ppo_bug_lab": {
      tone = "warn";
      headline = "What the PPO bug changes";
      stats = [["Healthy final return", fixed(final(data.healthy.mean_return))], ["Bugged final return", fixed(final(data.broken.mean_return))]];
      const explanations = {
        bug_same_logp: "Comparing the policy to itself keeps the probability ratio at one and hides how much the policy changed.",
        bug_no_mask_recompute: "Dropping the legal-action mask changes the action probabilities used for the update.",
        bug_flipped_entropy: "Reversing the entropy bonus encourages the policy to narrow its choices.",
        bug_zero_trunc_bootstrap: "Treating a time limit like a terminal state drops the value of rewards the agent could still earn.",
      };
      takeaway = explanations[data.bug] || "Compare the healthy and bugged runs to see how the change affects training.";
      break;
    }
    case "rent_race": {
      const matches = Object.entries(data.evals).filter(([name]) => name.endsWith(" vs Random"));
      matches.sort(([, a], [, b]) => b.mean - a.mean);
      if (!matches.length) return "";
      const [[name, best], runnerUp] = matches;
      const displayName = (match) => match.split(" vs ")[0].replaceAll("_", " ");
      stats = [[displayName(name) + " vs Random", percent(best.mean)]];
      if (runnerUp) stats.push([displayName(runnerUp[0]) + " vs Random", percent(runnerUp[1].mean)]);
      const tied = runnerUp?.[1].mean === best.mean;
      headline = tied ? "Strategies tied against Random" : `${displayName(name)} led against Random`;
      winner = tied ? undefined : 0;
      tone = tied ? "info" : "success";
      takeaway = tied ? "The two strategies tied against the same random opponent."
        : "The leading strategy won the largest share of held-out games against the random opponent.";
      break;
    }
    default:
      return "";
  }
  const icon = { success: "checkCircle", warn: "alert", info: "info" }[tone];
  return `<section class="lab-verdict tone-${tone}" aria-label="${esc(headline)}">
    <strong class="verdict-headline"><span aria-hidden="true">${sizedIcon(icon, 20)}</span>${esc(headline)}</strong>
    <dl class="viz-stats">${stats.map(([label, value], i) => `<div><dt>${esc(label)}</dt><dd${i === winner ? ' class="is-winning"' : ""}>${esc(value)}</dd></div>`).join("")}</dl>
    <p>${esc(takeaway)}</p>
  </section>`;
}

function renderLabResult(data, outEl) {
  if (data.lab_type === "gridworld") {
    const arrows = ["↑", "→", "↓", "←"];
    const heatTone = (v) => v >= .7 ? "pos-2" : v >= .25 ? "pos-1" : v >= -.1 ? "zero" : v >= -.6 ? "neg-1" : "neg-2";
    const grids = ["10", "50", "400"].map((ep) => {
      const snap = data.snapshots[ep];
      const cells = snap.V.map((v, i) => {
        const lbl = i === 15 ? "GOAL" : (i === 5 || i === 11 ? "TRAP" : arrows[snap.arrows[i]]);
        return `<div class="gw-tile" style="background:${bg(v)}; color:${fg};"><span>${lbl}</span><small>${v.toFixed(2)}</small></div>`;
      }).join("");
      return `<div class="viz-cell"><div class="viz-cell-header"><span class="viz-cell-name">Episode ${ep}</span></div><div class="gw-grid">${cells}</div></div>`;
    }).join("");
    outEl.innerHTML = `<div class="gw-row">${grids}</div><div class="lab-chart-followup">${sparklineHtml([
      { label: "Monte Carlo RMSE", data: data.err_mc, color: "var(--warn)" },
      { label: "TD(0) RMSE", data: data.err_td, color: "var(--accent-solid)" },
    ], "Random walk RMSE: MC vs. TD(0)")}</div>`;
  }
  if (data.lab_type === "probes_4_5") {
    outEl.innerHTML = `<div class="viz-grid">
      ${sparklineHtml([{ label: "Probe 4", data: data.probe4, color: "var(--accent-solid)" }, { label: "Probe 5", data: data.probe5, color: "var(--go)" }], "REINFORCE + baseline (optimal = +1.0)")}
      <div class="viz-cell"><div class="viz-cell-header"><span class="viz-cell-name">Probe 5 policy by state</span></div>
        <p class="lab-probe-policy"><code>obs = -1</code> → <strong>P(a₀) = ${esc(data.p_neg[0])}</strong>, P(a₁) = ${esc(data.p_neg[1])}</p>
        <p class="lab-probe-policy"><code>obs = +1</code> → P(a₀) = ${esc(data.p_pos[0])}, <strong>P(a₁) = ${esc(data.p_pos[1])}</strong></p>
      </div></div>`;
  }
  if (data.lab_type === "ppo_epoch_drift") {
    const block = (title, epochs, col) => {
      const mx = Math.max(...epochs.flatMap((e) => e.counts), 1);
      const cols = epochs.map((ep, idx) => {
        const bars = ep.counts.map((c, bi) => { const h = (c / mx) * 68; return `<rect x="${4 + bi * 9}" y="${76 - h}" width="7" height="${h}" rx="2" fill="${chartColor(col)}"/>`; }).join("");
        return `<div class="viz-cell"><div class="viz-cell-header"><span class="viz-cell-name">Epoch ${idx + 1}</span><span class="viz-pill ${ep.clipfrac > 0.25 ? "clipped" : ""}">clip ${esc(ep.clipfrac)}</span></div><svg viewBox="0 0 152 82" width="100%">${bars}<line x1="76" y1="0" x2="76" y2="78" stroke="var(--ink)" stroke-dasharray="3 2"/></svg></div>`;
      }).join("");
      return `<p class="lab-epoch-heading">${esc(title)}</p><div class="lab-epoch-grid">${cols}</div>`;
    };
    outEl.innerHTML = block("Unclipped policy gradient (ratios drift off-policy)", data.runs.unclipped, "var(--danger)") +
                      block(`PPO clipped (ε = ${data.eps}, anchored near r = 1)`, data.runs.clipped, "var(--accent-solid)");
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
      <div class="viz-cell lab-chart-followup">
        <div class="viz-cell-header"><span class="viz-cell-name">Held-out tournament (160 games, swapped seats)</span></div>
        <table class="eval-table">
          <thead><tr><th>Matchup</th><th>Win rate (95% CI)</th><th>Seat 0</th><th>Seat 1</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
  outEl.insertAdjacentHTML("afterbegin", labVerdict(data));
}

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
    rev.onclick = () => {
      if (state.inFlight) return;
      primeAudio();
      playSound("tap");
      sp.revealed = true;
      const host = document.getElementById("unit-sprint-host");
      if (host) { host.innerHTML = renderUnitSprintHtml(districtId); renderMath(host); bindUnitSprint(districtId); }
    };
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
      if (q >= 4) { playSound("correct"); recordLessonXp(res.xp); }
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

function leaveLesson() {
  if (state.inFlight) return;
  playSound("tap");
  window.Delight.withViewTransition(() => {
    state.view = "map";
    state.lesson = null;
    render();
    document.getElementById(`unit-${state.districtIdx}`)?.scrollIntoView({ behavior: "instant", block: "start" });
  }, "leave-lesson");
}

function applyLessonProgress(path, body, step) {
  if (cloudCourse()) return updateCloudProgress(path, body);

  // FastAPI remains authoritative. Project the result until the queued responses arrive.
  const result = path === "/api/quiz" ? quizFeedback(step, body) : {};
  const points = path === "/api/quiz" ? ({ mcq: 20, numeric: 25, poe: 15 })[step.kind]
    : step.kind === "debrief" ? 30 : 10;
  const gained = result.correct === false || isStepDone(step.id) ? 0 : points * boostMultiplier();
  if (gained) {
    const g = state.data.gamification;
    state.data = { ...state.data, gamification: {
      ...g, xp: g.xp + gained, completed_events: [...g.completed_events, "step-" + step.id],
    } };
  }

  const user = userScope();
  const lesson = state.lesson;
  localLessonWrites++;
  api(path, body).then((res) => {
    if (localLessonWrites !== 1 || cloudCourse() || userScope() !== user || !res.state) return;
    state.data = res.state;
    if (state.view === "mission") {
      renderTopbar();
      const tile = document.querySelector(".lesson-complete .lesson-review-tile");
      if (tile && state.lesson === lesson) tile.innerHTML = lessonReviewSummaryHtml();
    } else if (state.view === "map") { renderTopbar(); renderMap(); }
    syncProgressToSupabase();
  }).catch(() => {
    if (!cloudCourse() && userScope() === user) toast("Progress could not be saved. Try this step again after reconnecting.");
  }).finally(() => { localLessonWrites--; });
  return { ...result, xp: { gained, boosted: gained > 0 && boostMultiplier() > 1, mult: boostMultiplier() }, state: state.data };
}

function activeLessonBeat() {
  return state.lesson.beats[state.beatIdx];
}

function recordLessonXp(xp) {
  state.lesson.gained += xp?.gained || 0;
  if (xp?.gained > 0 && (xp.boosted || boostMultiplier() > 1)) state.lesson.boosted = true;
  noteXpRewards(xp);
  checkProgressAchievements();
}

function pulseLessonFooter() {
  const primary = document.getElementById("btn-primary-footer");
  primary.classList.remove("sheen-once");
  void primary.offsetWidth;
  primary.classList.add("sheen-once");
}

function renderMissionFooter({ focus = false } = {}) {
  const host = document.getElementById("lesson-footer-host");
  if (state.lesson.complete) { host.replaceChildren(); return; }
  const beat = activeLessonBeat();
  const s = beat.step;
  const fb = state.stepFeedback[s.id];
  const hasQuiz = ["mcq", "numeric", "poe"].includes(beat.kind);
  const needsCheck = hasQuiz && !fb?.correct;
  const needsBet = beat.kind === "bet" && !isStepDone(s.id);
  const betOptions = document.getElementById("bet-options");
  const checkedBet = () => betOptions?.querySelector('input[type="radio"]:checked');
  const disabled = (needsCheck && s.kind === "mcq" && state.selectedMcq[s.id] === undefined)
    || (needsBet && !checkedBet())
    || (beat.kind === "beat_check" && microCheckOptions(beat.check).length > 0 && !state.lesson.checks.has(state.beatIdx));
  const isLast = state.beatIdx === state.lesson.beats.length - 1;
  const label = needsCheck ? "Check" : isLast ? "Finish lesson" : "Continue";
  const variant = (beat.kind === "code" && !fb?.passed)
    || (beat.kind === "live_lab" && !state.labCache[s.id]) ? "secondary" : "go";

  if (!host.firstElementChild) {
    host.innerHTML = `<div class="lesson-footer-bar"><div class="footer-actions">
      <button type="button" id="btn-prev" class="btn-ghost flush">← Back to course</button>
      <button type="button" id="btn-primary-footer"></button>
    </div></div>`;
    document.getElementById("btn-prev").onclick = leaveLesson;
  }
  const primary = document.getElementById("btn-primary-footer");
  primary.className = "btn-tactile pill sheen-once " + variant;
  primary.textContent = label;
  primary.disabled = disabled;
  if (needsBet) betOptions.onchange = () => { primary.disabled = !checkedBet(); };
  if (focus && !disabled) primary.focus({ preventScroll: true });

  primary.onclick = (event) => {
    if (primary.disabled || state.inFlight || event.detail > 1 || activeLessonBeat() !== beat) return;
    if (needsCheck) {
      const body = { step_id: s.id };
      const answer = {};
      if (s.kind === "mcq") body.choice = answer.choice = state.selectedMcq[s.id];
      if (s.kind === "numeric") {
        answer.val = document.getElementById("num-ans").value.trim().replace(",", ".");
        body.answer = Number(answer.val);
        if (!answer.val || !Number.isFinite(body.answer)) {
          document.getElementById("num-ans").focus();
          return;
        }
      }
      if (s.kind === "poe") body.prediction = answer.pred = document.getElementById("poe-input").value;
      const res = applyLessonProgress("/api/quiz", body, s);
      state.stepFeedback[s.id] = { ...answer, correct: res.correct, explanation: res.explanation, reveal_md: res.reveal_md };
      state.combo = res.correct ? state.combo + 1 : 0;
      playSound(res.correct ? "correct" : "miss", state.combo);
      recordLessonXp(res.xp);
      if (s.kind === "mcq") updateMcqTileStates(s);
      if (res.correct && s.kind === "poe") document.getElementById("poe-input").disabled = true;
      if (res.correct && s.kind === "numeric") document.getElementById("num-ans").readOnly = true;
      patchQuizFeedback(s);
      if (["mcq", "numeric"].includes(s.kind)) {
        const target = s.kind === "mcq" && res.correct
          ? document.querySelector("#active-beat .choice-tile.correct")
          : document.querySelector("#active-beat .beat-feedback");
        animateLessonCheck(res.correct, target);
      } else {
        recordLessonCheck(res.correct);
        const kubo = document.querySelector("#active-beat .kubo-wrap");
        if (res.correct) kuboJump(kubo);
        else kuboShake(kubo);
      }
      renderTopbar();
      renderMissionFooter({ focus: document.activeElement === primary });
      if (res.correct) pulseLessonFooter();
      document.getElementById("active-beat").querySelector(".beat-feedback")
        ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
      return;
    }

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
      const ack = document.getElementById("bet-ack");
      ack.innerHTML = mdToHtml(s.ack || "Interesting guess. Let's find out.", true);
      ack.hidden = false;
      renderMath(ack);
    }

    if (beat.isLastOfStep && ["bet", "story_concept", "viz", "live_lab", "debrief"].includes(s.kind) && !isStepDone(s.id)) {
      const res = applyLessonProgress("/api/complete_step", { step_id: s.id }, s);
      prefRemove(beatCheckpointKey(beat));
      recordLessonXp(res.xp);
      if (LAB_KINDS.has(s.kind)) unlockAchievement("lab_explorer");
    } else if (!beat.isLastOfStep && !isStepDone(s.id)) {
      prefSet(beatCheckpointKey(beat), beat.beatIndex + 1);
    }
    if (!isLast) playSound("continue");
    advanceLesson(isLast);
  };
}

function updateMcqTileStates(s) {
  const fb = state.stepFeedback[s.id];
  const picked = state.selectedMcq[s.id];
  document.querySelectorAll("#active-beat .choice-tile").forEach((tile) => {
    const i = Number(tile.dataset.opt);
    tile.classList.remove("selected", "correct", "wrong");
    tile.setAttribute("aria-pressed", String(picked === i));
    tile.disabled = Boolean(fb?.correct);
    if (fb && fb.choice === i) tile.classList.add(fb.correct ? "correct" : "wrong");
    else if (picked === i) tile.classList.add("selected");
  });
}

function quizFeedbackHtml(s) {
  const fb = state.stepFeedback[s.id];
  if (!fb) return "";
  const label = s.kind === "poe" && fb.correct ? "Takeaway" : fb.correct ? "Correct" : "Try again";
  const detail = fb.reveal_md || fb.explanation || "";
  return `<strong>${label}</strong>${detail ? `<div>${mdToHtml(detail)}</div>` : ""}`;
}

function patchQuizFeedback(step) {
  const feedback = document.querySelector("#active-beat .beat-feedback");
  const fb = state.stepFeedback[step.id];
  feedback.innerHTML = quizFeedbackHtml(step);
  feedback.hidden = !fb;
  feedback.classList.toggle("ok", Boolean(fb?.correct));
  feedback.classList.toggle("err", Boolean(fb && !fb.correct));
  renderMath(feedback);
}

function calloutHtml(c) {
  const labels = { bridge: "ML / NLP Bridge", warning: "Watch Out", misconception: "Common Myth", obsidian: "Obsidian Notes" };
  return `<div class="note-surface ${esc(c.kind)}">
    <div class="note-surface-head">
      <span class="note-badge">${Object.hasOwn(labels, c.kind) ? labels[c.kind] : "Note"}</span>
      <span class="note-surface-title">${esc(c.title)}</span>
    </div>
    <div class="prose">${mdToHtml(c.body || c.md)}</div>
  </div>`;
}

function microCheckOptions(check) {
  const options = check?.options ?? check?.choices;
  return Array.isArray(options) ? options : [];
}

function microCheckHtml(check, idx) {
  const options = microCheckOptions(check);
  return `<div class="micro-check" role="group" aria-labelledby="micro-prompt-${idx}">
    <div class="kubo-speech-row micro-prompt-row">
      <span class="micro-kubo">${mascotHtml("thinking", 42)}</span>
      <div id="micro-prompt-${idx}" class="kubo-speech-bubble">${mdToHtml(check.question || check.prompt, true)}</div>
    </div>
    <div class="micro-options">${options.map((opt, i) => `<button type="button" class="choice-tile"
      data-check-option="${i}" aria-pressed="false" ${i < 3 ? `aria-keyshortcuts="${i + 1}"` : ""}>
      <span class="choice-key" aria-hidden="true">${i + 1}</span>
      <span class="micro-option-text">${mdToHtml(opt, true)}</span></button>`).join("")}</div>
    <div class="micro-feedback-row" hidden><div class="beat-feedback" role="status"></div></div>
  </div>`;
}

function bindMicroCheck(node, beat, idx) {
  const options = [...node.querySelectorAll("[data-check-option]")];
  const promptRow = node.querySelector(".micro-prompt-row");
  const kubo = node.querySelector(".micro-kubo");
  const feedbackRow = node.querySelector(".micro-feedback-row");
  const feedback = feedbackRow.querySelector(".beat-feedback");
  const answer = beat.check.correct_index ?? beat.check.correctIndex ?? beat.check.correct;
  const rightOption = typeof answer === "string" && !/^\d+$/.test(answer)
    ? options.findIndex((item) => item.querySelector(".micro-option-text").textContent.trim() === answer)
    : Number(answer);
  options.forEach((option, i) => {
    option.onclick = () => {
      if (state.beatIdx !== idx || state.lesson.complete || state.lesson.checks.get(idx) === rightOption) return;
      const correct = i === rightOption;
      state.lesson.checks.set(idx, i);
      recordLessonCheck(correct);
      primeAudio();
      playSound(correct ? "correct" : "miss", state.lesson.correctChecks);
      options.forEach((item) => {
        item.disabled = correct;
        item.classList.toggle("correct", item === option && correct);
        item.classList.toggle("wrong", item === option && !correct);
        item.setAttribute("aria-pressed", String(item === option));
      });
      feedback.classList.toggle("ok", correct);
      feedback.classList.toggle("err", !correct);
      feedback.innerHTML = mdToHtml(beat.check.feedback?.[i] || (correct ? "That's right." : "Try another answer, or keep going."), true);
      feedbackRow.hidden = false;
      if (correct) {
        promptRow.prepend(kubo);
        kubo.innerHTML = mascotHtml("happy", 42);
        kuboJump(kubo.firstElementChild);
        option.classList.add("check-pop");
        spawnSparkles(option, 14);
      } else {
        feedbackRow.prepend(kubo);
        kubo.innerHTML = mascotHtml("oops", 42);
        kuboShake(kubo.firstElementChild);
      }
      renderMath(feedback);
      renderTopbar();
      const primary = document.getElementById("btn-primary-footer");
      const wasDisabled = primary.disabled;
      primary.disabled = false;
      if (correct || wasDisabled) pulseLessonFooter();
    };
  });
}

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (state.view !== "mission" || singleKeyShortcutBlocked(event)) return;
  const optionIndex = ["1", "2", "3"].indexOf(event.key);
  if (optionIndex < 0) return;
  const option = document.querySelector(`#active-beat .micro-options [data-check-option="${optionIndex}"]:enabled`);
  if (option) {
    event.preventDefault();
    option.click();
  }
});

function priorBeatHtml(beat) {
  const s = beat.step;
  if (beat.kind === "bet") {
    const saved = readBet(s.id);
    return `<p>${mdToHtml(s.prompt, true)}</p>${saved ? `<p><strong>${esc(saved.choice)}</strong>${saved.reason ? `, ${esc(saved.reason)}` : ""}</p>
      <p class="bet-ack">${mdToHtml(s.ack || "Interesting guess. Let's find out.", true)}</p>` : ""}`;
  }
  const question = s.question || s.prompt || s.prompt_md;
  const feedback = quizFeedbackHtml(s);
  return `${question ? `<div class="prose">${mdToHtml(question)}</div>` : ""}
    ${feedback ? `<div class="beat-feedback">${feedback}</div>` : ""}`;
}

function checkAnswerKey(beat) {
  return beatCheckpointKey(beat) + "_check_" + beat.beatIndex;
}

function priorCheckHtml(beat) {
  const saved = (prefGet(checkAnswerKey(beat)) || "").match(/^(\d+):([01])$/);
  return checkSummaryHtml(beat.check, saved ? Number(saved[1]) : undefined, saved?.[2] === "1");
}

function checkSummaryHtml(check, picked, correct) {
  const answer = microCheckOptions(check)[picked];
  return `<div class="check-summary ${correct ? "is-correct" : ""}">
    <span class="check-summary-icon" aria-hidden="true">${correct ? ICONS.check : ICONS.book}</span>
    <div><strong>${mdToHtml(check?.question || check?.prompt, true)}</strong>
      <div>${answer === undefined ? "Previously visited" : `Your answer: ${mdToHtml(answer, true)}`}</div>
    </div>
  </div>`;
}

function bindKuboGaze(beat) {
  const selector = ".choice-tile, .bandit-arm, .algorithm-card";
  if (!beat.querySelector(selector)) return;
  if (!beat.querySelector(".kubo-wrap")) {
    beat.insertAdjacentHTML("afterbegin", `<span class="beat-kubo">${mascotHtml("thinking", 44)}</span>`);
  }

  let hovered = null;
  let focused = null;
  const pointAt = () => {
    const pupils = beat.querySelector(".kubo-pupils");
    if (!pupils) return;
    const control = hovered || focused;
    if (!control || prefersReducedMotion() || beat.id !== "active-beat") {
      pupils.style.removeProperty("transform");
      return;
    }
    const target = control.getBoundingClientRect();
    const face = pupils.getBoundingClientRect();
    const dx = (target.left + target.width / 2 - face.left - face.width / 2) / 30;
    const dy = (target.top + target.height / 2 - face.top - face.height / 2) / 30;
    const scale = 1 / Math.max(1, Math.hypot(dx / 2.5, dy / 1.8));
    pupils.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  };

  beat.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    hovered = event.target.closest(selector);
    pointAt();
  });
  beat.addEventListener("pointerout", (event) => {
    if (event.pointerType === "touch") return;
    hovered = beat.contains(event.relatedTarget) ? event.relatedTarget.closest(selector) : null;
    pointAt();
  });
  beat.addEventListener("focusin", (event) => {
    focused = event.target.closest(selector);
    pointAt();
  });
  beat.addEventListener("focusout", (event) => {
    focused = beat.contains(event.relatedTarget) ? event.relatedTarget.closest(selector) : null;
    pointAt();
  });
}

function mountBeat(thread, beat, i, active) {
  const node = document.createElement("article");
  node.className = active ? "lesson-beat beat-enter" : "lesson-beat";
  node.tabIndex = -1;
  if (active) {
    node.id = "active-beat";
    node.setAttribute("aria-current", "step");
  }
  const { step: s, kind } = beat;
  const hasHeading = !beat.followsIntro && (i > 0 || s.title !== state.lesson.lesson.title)
    && (!kind.startsWith("beat_") || beat.beatIndex === 0);
  const heading = hasHeading ? `<h2 id="lesson-beat-title-${i}">${mdToHtml(s.title, true)}</h2>` : "";
  if (hasHeading) node.setAttribute("aria-labelledby", "lesson-beat-title-" + i);
  const interactive = ["bet", "mcq", "numeric", "poe", "code", "live_lab", "debrief"].includes(kind);
  const beatBody = {
    beat_md: () => `<div class="prose">${mdToHtml(beat.md)}</div>`,
    beat_callout: () => calloutHtml(beat.callout || {}),
    beat_check: () => active ? microCheckHtml(beat.check || {}, i)
      : priorCheckHtml(beat),
  };
  // One editorial scene per unit per lesson thread: the bet and the first concept of a unit share
  // art, so a later step never repeats the scene the reader just saw.
  let scene = beat.beatIndex === 0 ? window.Illustrations.lessonSceneSvg(s.id, kind) : "";
  const sceneUnit = /data-art-unit="(M\d)"/.exec(scene)?.[1];
  if (sceneUnit && thread.querySelector(`.lesson-scene[data-art-unit="${sceneUnit}"]`)) scene = "";
  node.innerHTML = heading + scene + (Object.hasOwn(beatBody, kind) ? beatBody[kind]()
    : !active && interactive ? priorBeatHtml(beat) : missionBeatHtml(s, beat.followsIntro));
  if (kind.startsWith("beat_") && beat.isLastOfStep && s.sources) {
    node.insertAdjacentHTML("beforeend", sourcesHtml(s.sources));
  }
  thread.append(node);
  if (kind === "viz") {
    mountViz(s.viz_type, node.querySelector("#viz-mount"));
    if (!active) namespaceBeatIds(node, i);
  } else if (active && kind === "beat_check") bindMicroCheck(node, { ...beat, check: beat.check || {} }, i);
  else if (active && !kind.startsWith("beat_")) bindMissionBeat(node, s);
  if (active) bindKuboGaze(node);
  renderMath(node);
  return node;
}

function showLessonBeat(node, block = "start") {
  const root = document.getElementById("app-root");
  const beat = node.getBoundingClientRect();
  const inset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
  const offset = block === "center" ? Math.max(inset, (root.clientHeight - beat.height) / 2) : inset;
  node.focus({ preventScroll: true });
  root.scrollTo({
    top: root.scrollTop + beat.top - root.getBoundingClientRect().top - offset,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

function namespaceBeatIds(node, index) {
  const ids = new Map();
  node.querySelectorAll("[id]").forEach((element) => {
    if (element.parentElement?.closest("svg") || element.id.startsWith("lesson-beat-title-")) return;
    if (element.closest(".viz-stage")) element.dataset.vizId = element.id;
    ids.set(element.id, `beat-${index}-${element.id}`);
    element.id = ids.get(element.id);
  });
  const refAttrs = ["for", "aria-describedby", "aria-controls", "aria-labelledby"];
  node.querySelectorAll(refAttrs.map((attr) => `[${attr}]`).join(",")).forEach((reference) => {
    for (const attr of refAttrs) {
      const id = reference.getAttribute(attr);
      if (ids.has(id)) reference.setAttribute(attr, ids.get(id));
    }
  });
}

function lessonCardsEarned() {
  return Math.max(0, state.data.srs.unlocked_count - state.lesson.startingCards);
}

function lessonReviewSummaryHtml() {
  const cards = lessonCardsEarned();
  const count = cards || state.lesson.lesson.step_ids.length;
  return `<dt>${cards ? "Cards unlocked" : "Steps"}</dt><dd>${numberFormat.format(count)}</dd>`;
}

function celebrateLesson(card, xp) {
  const xpDisplay = card.querySelector(".lesson-xp");
  const reducedMotion = prefersReducedMotion();
  if (xp > 0 && !reducedMotion) xpDisplay.textContent = "+0 XP";
  window.Delight.playCompleteFanfare();
  window.Delight.triggerHaptic("complete");
  const celebrate = () => {
    kuboJump(card.querySelector(".kubo-wrap"));
    if (xp <= 0 || reducedMotion) return;
    card.classList.add("is-celebrating");
    window.Delight.flyXp(xpDisplay, document.querySelector("#topbar .lesson-stat[data-xp-total]"), { golden: Boolean(state.lesson?.boosted) });
    spawnConfetti(card, 32);
    setTimeout(() => {
      if (xpDisplay.isConnected) countLessonXp(xpDisplay, xp);
    }, 120);
  };
  const rect = card.getBoundingClientRect();
  const viewport = document.getElementById("app-root").getBoundingClientRect();
  if ((rect.top < viewport.bottom && rect.bottom > viewport.top) || typeof IntersectionObserver === "undefined") {
    celebrate();
    return;
  }
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && card.isConnected) celebrate();
    if (entry.isIntersecting || !card.isConnected) observer.disconnect();
  });
  observer.observe(card);
}

function advanceLesson(isLast) {
  const current = document.getElementById("active-beat");
  const beat = activeLessonBeat();
  current.removeAttribute("aria-current");
  current.removeAttribute("id");
  current.querySelector(".kubo-pupils")?.style.removeProperty("transform");
  disposeEditor();
  namespaceBeatIds(current, state.beatIdx);
  current.querySelectorAll("button, input, textarea, select").forEach((control) => {
    if (!control.closest(".viz-stage")) control.disabled = true;
  });
  const check = current.querySelector(".micro-check");
  if (beat.kind === "beat_check" && check) {
    const picked = state.lesson.checks.get(state.beatIdx);
    const correct = Boolean(check.querySelector(".correct"));
    if (picked !== undefined) prefSet(checkAnswerKey(beat), picked + ":" + Number(correct));
    check.outerHTML = checkSummaryHtml(beat.check, picked, correct);
    renderMath(current.querySelector(".check-summary"));
  }
  if (beat.kind === "code") current.querySelector(".code-frame").hidden = true;

  const thread = current.parentElement;
  if (isLast) {
    state.lesson.complete = true;
    const next = findNextLesson();
    const end = document.createElement("article");
    end.className = "lesson-beat lesson-complete beat-enter";
    end.tabIndex = -1;
    end.setAttribute("aria-labelledby", "lesson-complete-title");
    end.innerHTML = `<div class="completion-kubo">${mascotHtml("proud", 72)}</div>
      <h2 id="lesson-complete-title">Lesson complete</h2>
      <dl class="lesson-summary">
        ${state.lesson.gained > 0
          ? `<div class="lesson-summary-tile"><dt>XP earned</dt><dd><span class="sr-only">${numberFormat.format(state.lesson.gained)} XP</span><span class="lesson-xp" aria-hidden="true">+${numberFormat.format(state.lesson.gained)} XP</span>${state.lesson.boosted ? '<span class="boost-tag">2× Boost</span>' : ""}</dd></div>`
          : `<div class="lesson-summary-tile lesson-replay-tile"><dt>Status</dt><dd><span class="lesson-replay">Reviewed</span><span class="replay-badge">${ICONS.checkCircle}XP already earned</span></dd></div>`}
        <div class="lesson-summary-tile"><dt>Best combo</dt><dd>${numberFormat.format(state.lesson.bestCombo)}</dd></div>
        <div class="lesson-summary-tile lesson-review-tile">${lessonReviewSummaryHtml()}</div>
      </dl>
      <div class="form-row wrap">
        ${next ? `<button id="next-lesson" class="btn-tactile go pill">${next.lesson.id === state.lesson.lesson.id && next.di === state.districtIdx ? "Resume lesson" : "Next lesson"}</button>` : ""}
        <button id="course-from-lesson" class="btn-tactile secondary pill">Back to course</button>
      </div>`;
    thread.append(end);
    if (next) end.querySelector("#next-lesson").onclick = () => openLesson(next.di, next.li);
    end.querySelector("#course-from-lesson").onclick = leaveLesson;
    renderTopbar();
    renderMissionFooter();
    showLessonBeat(end, "center");
    celebrateLesson(end, state.lesson.gained);
    return;
  }
  state.beatIdx++;
  const node = mountBeat(thread, activeLessonBeat(), state.beatIdx, true);
  renderTopbar();
  renderMissionFooter();
  showLessonBeat(node);
}

function renderMission() {
  disposeEditor();
  document.body.classList.add("mode-mission");
  const root = document.getElementById("app-root");
  const { lesson, beats } = state.lesson;
  root.innerHTML = `<section class="lesson-stage lesson-thread" aria-labelledby="lesson-title"><h1 id="lesson-title">${mdToHtml(lesson.title, true)}</h1></section>`;
  const thread = root.firstElementChild;
  renderMath(thread.firstElementChild);
  for (let i = 0; i < state.beatIdx; i++) mountBeat(thread, beats[i], i, false);
  const node = mountBeat(thread, activeLessonBeat(), state.beatIdx, true);
  renderMissionFooter();
  root.scrollTop = 0;
  if (state.beatIdx) showLessonBeat(node);
  else {
    thread.firstElementChild.tabIndex = -1;
    thread.firstElementChild.focus({ preventScroll: true });
  }
}

function missionBeatHtml(s, followsIntro = false) {
  const d = state.data.districts[state.districtIdx];
  const fb = state.stepFeedback[s.id];
  const cueMood = s.kind === "debrief" ? "proud" : (["code", "mcq", "poe", "numeric"].includes(s.kind) ? "thinking" : "idle");

  const prompts = {
    mcq: "Choose the answer you can explain.",
    numeric: "Work through the numbers before checking.",
    poe: "Write down what you expect to happen.",
  };
  const story = followsIntro ? "" : s.story || (Object.hasOwn(prompts, s.kind) ? prompts[s.kind] : "");
  let body = "";
  if (story) {
    body += `
      <div class="kubo-speech-row">
        ${mascotHtml(cueMood, 50)}
        <div class="kubo-speech-bubble">${mdToHtml(story, true)}</div>
      </div>`;
  }
  if (!followsIntro && s.body_md) body += `<div class="prose">${mdToHtml(s.body_md)}</div>`;
  if (!followsIntro && s.callouts) body += s.callouts.map(calloutHtml).join("");

  if (s.kind === "bet") body += betHtml(s) + `<div id="bet-ack" class="bet-ack" role="status" ${isStepDone(s.id) ? "" : "hidden"}>${isStepDone(s.id) ? mdToHtml(s.ack || "Interesting guess. Let's find out.", true) : ""}</div>`;

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
        <option value="bug_flipped_entropy">Scenario 3: Flipped entropy sign (+c₂ × H)</option>
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

  if (["mcq", "numeric", "poe"].includes(s.kind)) {
    body += `<div class="beat-feedback ${fb?.correct ? "ok" : "err"}" role="status" ${fb ? "" : "hidden"}>${quizFeedbackHtml(s)}</div>`;
  }
  return body + sourcesHtml(s.sources);
}

function bindMissionBeat(root, s) {
  const d = state.data.districts[state.districtIdx];
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
        if (state.stepFeedback[s.id]?.correct) return;
        primeAudio();
        playSound("tap");
        state.selectedMcq[s.id] = Number(btn.dataset.opt);
        if (state.stepFeedback[s.id] && !state.stepFeedback[s.id].correct) delete state.stepFeedback[s.id];
        updateMcqTileStates(s);
        patchQuizFeedback(s);
        document.getElementById("btn-primary-footer").disabled = false;
      };
    });
  }

  if (s.kind === "mcq") updateMcqTileStates(s);
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
  const begin = () => {
    state.view = "drill";
    state.drillCards = [...(state.data.srs.due_cards || [])];
    state.drillIdx = 0;
    state.drillRevealed = false;
    state.drillSessionXp = 0;
    state.drillGoodCount = 0;
    state.drillCombo = 0;
    state.drillMood = "thinking";
    render();
  };
  if (state.view === "drill") begin();
  else window.Delight.withViewTransition(begin, "tab");
  if (cloudCourse() && canUseAnkiCompanion()) {
    const course = state.course, user = userScope();
    readAnkiCompanionStatus().then((status) => {
      if (state.course === course && userScope() === user) adoptAnkiStatus(status);
    });
  }
}

function drillShortcutsOn() {
  return prefGet("anki_shortcuts") !== "off";
}

function drillRevealButtonHtml() {
  return drillShortcutsOn()
    ? `<button id="d-reveal" class="btn-tactile accent full pill" aria-keyshortcuts="Space">Show answer <kbd class="keycap" aria-hidden="true">Space</kbd></button>`
    : `<button id="d-reveal" class="btn-tactile accent full pill">Show answer</button>`;
}

function drillShortcutsToggleHtml() {
  const on = drillShortcutsOn();
  return `<button type="button" id="btn-anki-shortcuts" class="btn-ghost small shortcuts-toggle" aria-pressed="${on}" title="Space reveals, 1 to 4 rate">${ICONS.keyboard}<span>Shortcuts</span></button>`;
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
    ? `<span class="status-badge ok anki-auto-status"><span class="status-dot online"></span>Auto-synced with Anki</span>`
    : `<button type="button" id="btn-anki-setup" class="btn-ghost small anki-setup">Export to Anki</button>`;
}

function bindDrillChrome(root) {
  const setup = root.querySelector("#btn-anki-setup");
  if (setup) setup.onclick = () => { playSound("tap"); openSettingsModal("anki", setup); };
  const shortcuts = root.querySelector("#btn-anki-shortcuts");
  if (shortcuts) shortcuts.onclick = () => {
    const on = !drillShortcutsOn();
    prefSet("anki_shortcuts", on ? "on" : "off");
    shortcuts.setAttribute("aria-pressed", String(on));
    const rev = root.querySelector("#d-reveal");
    if (rev) {
      rev.toggleAttribute("aria-keyshortcuts", on);
      if (on) rev.setAttribute("aria-keyshortcuts", "Space");
      rev.querySelector(".keycap")?.toggleAttribute("hidden", !on);
      if (on && !rev.querySelector(".keycap")) rev.insertAdjacentHTML("beforeend", ` <kbd class="keycap" aria-hidden="true">Space</kbd>`);
    }
    playSound("tap");
  };
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
  if (!cards.length && state.data.srs.unlocked_count === 0) {
    root.innerHTML = `<section class="drill-stage">
      <h1 class="drill-title">Anki Cards</h1>
      <div class="flashcard drill-done">
        ${mascotHtml("happy", 68)}
        <h2>Your first cards are waiting</h2>
        <p>Finish your first lesson to unlock spaced-repetition cards.</p>
        <button id="drill-first-lesson" class="btn-tactile go pill">Start Lesson 1</button>
      </div>
    </section>`;
    root.querySelector("#drill-first-lesson").onclick = () => openLesson(0, 0);
    return;
  }

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
    document.getElementById("d-home").onclick = () => showCoursePath();
    document.getElementById("d-again").onclick = () => { playSound("tap"); startDrillSession(); };
    return;
  }

  const c = cards[state.drillIdx];

  renderPreserving(root, `
    <div class="drill-stage">
      <div class="drill-head"><h1 class="drill-title">Anki Cards</h1><div class="drill-head-actions">${drillShortcutsToggleHtml()}${ankiStatusHtml()}</div></div>
      <div class="drill-hud">
        <div class="drill-hud-left">
          ${mascotHtml(state.drillMood, 44)}
          ${progressBarHtml(state.drillIdx, cards.length, "Cards reviewed")}
        </div>
        <div class="drill-hud-stats">
          <span class="drill-stat-pill" title="Correct answers in a row this session"><span class="rank-stat-icon go">${ICONS.target}</span> ${state.drillCombo} in a row</span>
          <span class="drill-stat-pill"><span class="rank-stat-icon accent">${ICONS.bolt}</span> +${state.drillSessionXp} XP</span>
        </div>
      </div>

      <div class="drill-deck"><div class="flashcard drill-card${cards.length - state.drillIdx > 1 ? " has-stack" : ""}">
        <div class="flashcard-top">
          <span class="card-counter">Card ${state.drillIdx + 1} of ${cards.length}</span>
          ${state.data.srs.due_count === 0 ? `<span class="practice-pill">Practice review (0 due)</span>` : ""}
        </div>
        <div class="flashcard-front">${cardHtml(c.front)}</div>
        <div id="d-answer-slot" class="flashcard-answer-slot">${state.drillRevealed ? `<div class="flashcard-back">${cardHtml(c.back)}</div>` : ""}</div>
        <div id="d-actions" class="flashcard-actions">${state.drillRevealed ? ratingButtonsHtml(c, false) : drillRevealButtonHtml()}</div>
      </div></div>

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
        if (gained > 0) spawnXpFloat(xpGainLabel(res.xp), b);
        noteXpRewards(res.xp);
      } else {
        state.drillCombo = 0;
        state.drillMood = "oops";
        playSound("wrong");
      }
      const deck = b.closest(".drill-deck");
      if (!prefersReducedMotion() && deck.animate) {
        const side = q >= 3 ? 1 : -1;
        await deck.animate([
          { transform: "translateX(0) rotate(0deg)", opacity: 1 },
          { transform: `translateX(${side * 64}px) translateY(-4px) rotate(${side * 3.5}deg)`, opacity: 0 },
        ], { duration: 210, easing: "cubic-bezier(.32, .72, 0, 1)", fill: "forwards" }).finished.catch(() => {});
      }
      state.drillIdx++;
      state.drillRevealed = false;
      if (state.drillIdx >= state.drillCards.length) playSound("achievement");
      renderTopbar();
      renderDrill();
      if (event.detail === 0) root.querySelector("#d-reveal, #d-home")?.focus({ preventScroll: true });
      syncProgressToSupabase();
    });
  });

  // Reveal in place: the answer fills its reserved slot and the rating row swaps into the
  // same action area, so the card never re-mounts or jumps.
  const rev = document.getElementById("d-reveal");
  if (rev) {
    rev.onclick = () => {
      if (state.inFlight) return;
      primeAudio();
      playSound("tap");
      state.drillRevealed = true;
      const slot = document.getElementById("d-answer-slot");
      const actions = document.getElementById("d-actions");
      const card = slot.closest(".drill-card");
      // A keyboard reveal lands mid deck entrance: settle the deck at once and
      // show the answer crisply instead of stacking a second spring on top.
      const keyed = rev.dataset.keyed === "true";
      if (keyed) {
        const deck = card?.closest(".drill-deck");
        deck?.getAnimations().forEach((animation) => animation.finish());
        deck?.classList.add("is-settled");
        card?.classList.remove("entering", "is-revealing");
      } else {
        card?.classList.add("is-revealing");
      }
      slot.innerHTML = `<div class="flashcard-back${keyed ? "" : " answer-enter"}">${cardHtml(c.back)}</div>`;
      actions.innerHTML = ratingButtonsHtml(c, false);
      renderMath(slot);
      bindRatings();
      slot.tabIndex = -1;
      slot.focus({ preventScroll: true });
    };
  } else {
    bindRatings();
  }
}

function overlayOpen() {
  if (document.querySelector('dialog[open], #timer-popover[data-open="true"]')) return true;
  try { return Boolean(document.querySelector(":popover-open")); } catch (_) { return false; }
}

// Single-key shortcuts must never fire with modifiers, inside fields, or while an
// overlay is open (WCAG 2.1.4). Lesson micro-checks and Anki both use this guard.
function singleKeyShortcutBlocked(e) {
  return e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey
    || state.modalOpen || state.timer.popoverOpen
    || overlayOpen()
    || e.target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=\"false\"]), .cm-editor");
}

// Anki Cards keyboard shortcuts: Space reveals, 1-4 rate
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (state.inFlight || state.view !== "drill" || !drillShortcutsOn() || singleKeyShortcutBlocked(e)) return;
  if (document.activeElement?.matches("button") && e.code === "Space") return;
  if (e.code === "Space" && !state.drillRevealed) {
    e.preventDefault();
    const rev = document.getElementById("d-reveal");
    if (rev) {
      rev.dataset.keyed = "true";
      rev.click();
    }
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
    capturePendingLinks();
    if (!STATIC_MODE) {
      state.data = await request("/api/state");
      state.combo = state.data.gamification.combo;
    }
    await initSupabase();
    if (state.sbUser && !state.passwordRecovery) await enterCloud();
    else {
      render();
      if (!state.sbClient && !STATIC_MODE) processPendingInviteLinks();
    }
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
  const user = state.sbUser?.id;
  const courses = await rpc("list_my_courses");
  if (state.sbUser?.id === user) state.courses = Array.isArray(courses) ? courses : [];
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

function renderCourseLoader(title, subtitle = "Preparing your lessons...") {
  document.body.classList.remove("mode-mission");
  document.getElementById("lesson-footer-host").replaceChildren();
  document.getElementById("app-root").innerHTML = `<section class="course-loader">
    <div class="course-loader-card" role="status">
      <div class="loader-scene" aria-hidden="true">
        ${Array.from({ length: 4 }, () => '<span class="loader-star"></span>').join("")}
        <span class="loader-kubo">${mascotHtml("happy", 76)}</span>
      </div>
      <h1>${esc(title)}</h1><p>${esc(subtitle)}</p>
      <div class="loader-track" aria-hidden="true"><span class="loader-bar"></span></div>
    </div>
  </section>`;
}

function beginCourseLoad(title) {
  const user = state.sbUser?.id;
  let shownAt = null;
  let settled;
  let element;
  const timer = setTimeout(() => {
    if (state.sbUser?.id !== user) return;
    renderCourseLoader(title);
    shownAt = performance.now();
    element = document.querySelector(".course-loader");
  }, 120);
  return {
    retitle(nextTitle) {
      const heading = element?.querySelector("h1");
      if (heading && state.sbUser?.id === user) heading.textContent = nextTitle;
      title = nextTitle;
    },
    beforePrewarm() {
      clearTimeout(timer);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
    finish() {
      clearTimeout(timer);
      if (!element?.isConnected || prefersReducedMotion()) return;
      settled ??= (async () => {
        const remaining = 240 - (performance.now() - shownAt);
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
        if (!element.isConnected || state.sbUser?.id !== user) return;
        element.classList.add("loader-leaving");
        await new Promise((resolve) => setTimeout(resolve, 160));
      })();
      return settled;
    },
  };
}

function prewarmCourse(course) {
  primeAudio();
  void loadEditorModules();
  for (const district of course.content.districts) {
    const lessons = lessonsForDistrict(district);
    districtLessons.set(district, lessons);
    for (const lesson of lessons) lessonBeats.set(lesson, flattenLessonBeats(district, lesson));
  }
  // Lab snapshots come in the same course payload and are already ready for synchronous display.
}

async function openCourse(course, pendingLoader = null) {
  if (!course) throw new Error("Course is unavailable. Reload your course list and try again.");
  validateCourse(course.content);
  const user = state.sbUser.id;
  const loader = pendingLoader || beginCourseLoad(course.title);
  if (pendingLoader) loader.retitle(course.title);
  let data;
  try {
    await Promise.all([progressQueue, localProgressQueue]);
    if (state.sbUser?.id !== user) return;
    const progress = await state.sbClient.from("course_progress").select("*")
      .eq("course_id", course.id).eq("user_id", user).maybeSingle();
    if (progress.error) throw progress.error;
    data = progress.data;
    await loader.beforePrewarm();
    if (state.sbUser?.id === user) prewarmCourse(course);
  } catch (error) {
    if (!pendingLoader && state.sbUser?.id === user) {
      await loader.finish();
      if (state.sbUser?.id === user) render();
    }
    throw error;
  } finally {
    await loader.finish();
  }
  if (state.sbUser?.id !== user) return;
  clearInterval(state.timer.interval);
  state.timer.running = false;
  state.timer.left = state.timer.total;
  state.course = course;
  state.progressVersion = data?.updated_at ?? null;
  savedCloudProgress = null;
  progressSaveError = false;
  state.progress = {
    xp: data?.xp ?? 0,
    streak_days: data?.streak_days ?? 0,
    combo: data?.combo ?? 0,
    completed_events: data?.completed_events ?? [],
    srs_state: Object.assign(Object.create(null), data?.srs_state),
    meta: courseWallet(data, state.sbProfile),
  };
  if (state.sbProfile && typeof state.sbProfile.gems === "number"
      && (state.sbProfile.last_active_date || "") >= state.progress.meta.last_active_date
      && Number.isInteger(state.sbProfile.streak_days)) {
    state.progress.streak_days = state.sbProfile.streak_days;
  }
  state.combo = state.progress.combo;
  resetCourseView();
  state.data = cloudState(state.progress);
  prefSet("active_course_" + user, course.id);
  closeModal();
  render();
  syncProgressToSupabase();
  probeRunner();
}

// Merges course meta with the account-wide profile wallet. Older progress derives its last active day.
function courseWallet(row, profile) {
  const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
  const wallet = normalizeWallet({ ...meta, ...walletFromProfile(profile) });
  wallet.daily_goal_claimed_date = normalizeWallet(meta).daily_goal_claimed_date;
  wallet.unit_rewards = normalizeWallet(meta).unit_rewards;
  if (!wallet.last_active_date) {
    const studied = (row?.completed_events || []).filter((e) => /^study-\d{4}-\d{2}-\d{2}$/.test(e)).map((e) => e.slice(6)).sort();
    wallet.last_active_date = studied.at(-1) || "";
  }
  return wallet;
}

function resetCourseView() {
  state.view = "map";
  state.lesson = null;
  for (const key of ["selectedMcq", "hintState", "stepFeedback", "labCache", "unitSprint"]) {
    state[key] = Object.create(null);
  }
  state.drillCards = [];
}

async function openLocalStudio() {
  await Promise.all([progressQueue, localProgressQueue]);
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
      ...walletView(progress.meta, today, progress.streak_days),
      level_rewards: DEFAULT_LEVEL_REWARDS,
      level: rankName(rank.level),
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
    anki_connected: canUseAnkiCompanion() && Boolean(state.data?.anki_connected),
  };
}

// The UI applies mutations immediately. The queues only serialize persistence.
let progressQueue = Promise.resolve();
let localProgressQueue = Promise.resolve();
let localLessonWrites = 0;
let savedCloudProgress = null;
let progressSaveError = false;

function updateCloudProgress(path, body) {
  const result = applyLocalProgressMutation(path, body);
  queueCloudProgress();
  return result;
}

function queueCloudProgress() {
  const course = state.course;
  const user = state.sbUser.id;
  progressQueue = progressQueue.then(() => flushCloudProgress(course, user)).catch((err) => {
    if (state.course === course && state.sbUser?.id === user && !progressSaveError) {
      progressSaveError = true;
      toast(err.message || "Progress could not be synced. Your progress is still available in this tab.");
    }
  });
}

window.addEventListener("online", () => {
  if (state.course && state.sbUser && progressSaveError) queueCloudProgress();
});

function quizFeedback(step, body) {
  if (step.kind === "mcq") {
    return { correct: body.choice === step.correct_index, explanation: step.explanations?.[body.choice] };
  }
  if (step.kind === "numeric") {
    const tol = step.tol ?? 0.01;
    const correct = Math.abs(body.answer - step.expected) <= tol;
    return { correct, explanation: correct ? step.explanation : `Check your calculation. The tolerance is ±${tol}.` };
  }
  if ((body.prediction || "").trim().length < 8) {
    return { correct: false, explanation: "Write a brief prediction before revealing the outcome." };
  }
  return { correct: true, reveal_md: step.reveal_md };
}

function applyLocalProgressMutation(path, body) {
  const course = state.course;
  const progress = structuredClone(state.progress);
  progress.srs_state = Object.assign(Object.create(null), progress.srs_state);
  const today = day();
  const wallet = progress.meta = normalizeWallet(progress.meta);
  const award = (event, points) => {
    const activity = applyDailyActivity(wallet, progress, today);
    if (progress.completed_events.includes(event)) return { gained: 0, ...activity };
    progress.completed_events.push(event);
    const oldRank = rankLevel(progress.xp);
    const earned = earnWalletXp(wallet, points, today, Date.now(), progress.combo);
    progress.xp += earned.gained;
    const level = rankLevel(progress.xp);
    return {
      gained: earned.gained, xp: progress.xp, level: rankName(level), leveled_up: level > oldRank,
      mult: earned.mult, boosted: earned.mult > 1, daily_goal_reached: earned.daily_goal_reached, ...activity,
    };
  };
  const unlock = (unit) => {
    for (const card of course.content.cards.filter((c) => c.module === unit)) {
      progress.srs_state[card.card_id] = { ...progress.srs_state[card.card_id], unlocked: true };
    }
  };

  let result = {};
  if (path === "/api/booster/activate") {
    activateWalletBoost(wallet);
  } else if (path === "/api/shop/buy") {
    buyWalletItem(wallet, body?.item_id, progress.xp);
  } else if (path === "/api/daily-goal") {
    result.daily_goal_reached = setWalletGoal(wallet, body?.daily_goal, today);
  } else if (path === "/api/srs/rate") {
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
    let points = ({ bet: 10, story_concept: 10, viz: 15, live_lab: 20, debrief: 30 })[step.kind] ?? 10;
    if (path === "/api/quiz") {
      result = quizFeedback(step, body);
      if (step.kind === "poe" && !result.correct) return { ...result, state: state.data };
      points = ({ mcq: 20, numeric: 25, poe: 15 })[step.kind];
    } else if (path === "/api/run_code") {
      points = step.xp ?? 35;
      result = { passed: body.passed };
    }
    if (step.kind !== "bet") unlock(district.id);
    if (result.correct === false || result.passed === false) {
      progress.combo = 0;
    } else {
      if (result.correct || result.passed) progress.combo++;
      result.xp = award("step-" + step.id, points);
      const unitDone = district.steps.every((s) => progress.completed_events.includes("step-" + s.id));
      if (unitDone && result.xp.gained > 0 && !wallet.unit_rewards.includes(district.id)) {
        wallet.unit_rewards = [...wallet.unit_rewards, district.id];
        if (wallet.xp_boost_tokens < MAX_BOOST_TOKENS) {
          wallet.xp_boost_tokens += 1;
          result.xp.unit_token = true;
        }
      }
    }
  }
  state.progress = progress;
  state.data = cloudState(progress);
  return { ...result, state: state.data };
}

async function flushCloudProgress(course = state.course, user = state.sbUser?.id) {
  if (!course || state.course !== course || state.sbUser?.id !== user) return;
  const progress = state.progress;
  if (progress === savedCloudProgress) return;
  const table = state.sbClient.from("course_progress");
  const save = state.progressVersion
    ? table.update(progress).eq("course_id", course.id).eq("user_id", user).eq("updated_at", state.progressVersion)
    : table.upsert({ course_id: course.id, user_id: user, ...progress }, { onConflict: "course_id,user_id", ignoreDuplicates: true });
  const { data, error } = await save.select("updated_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Progress changed in another session. Reopen this course to load your latest progress.");
  if (state.course !== course || state.sbUser?.id !== user) return;
  state.progressVersion = data.updated_at;
  savedCloudProgress = progress;
  progressSaveError = false;
  await syncProgressToSupabase();
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

// ==================== Auth: sign in, sign up, reset, check email, recovery ====================
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

// Smart invite links: ?invite=CODE, ?friend=USERNAME, or both. They wait in localStorage across
// sign-up, sign-in and email confirmation, and are accepted once a session exists.
const PENDING_LINK_MAX_AGE = 14 * 86400000;

function cleanInviteCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return INVITE_CODE_RE.test(code) ? code : "";
}

function cleanFriendName(value) {
  const name = String(value || "").trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{2,24}$/.test(name) ? name : "";
}

function parsePendingLinkParams(search = window.location.search) {
  const query = new URLSearchParams(search);
  const invite = cleanInviteCode(query.get("invite") ?? query.get("course"));
  const friend = cleanFriendName(query.get("friend") ?? query.get("add_friend"));
  return invite || friend ? { invite, friend } : null;
}

function readPendingLinks(now = Date.now()) {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(PENDING_LINKS_KEY) || "null"); } catch (_) {}
  const source = stored && typeof stored === "object" ? stored : state.pendingLinks;
  if (!source) return null;
  const invite = cleanInviteCode(source.invite);
  const friend = cleanFriendName(source.friend);
  if ((!invite && !friend) || !(now - Number(source.savedAt || 0) < PENDING_LINK_MAX_AGE)) {
    clearPendingLinks();
    return null;
  }
  return { invite, friend, savedAt: Number(source.savedAt) };
}

function savePendingLinks(links) {
  const entry = { invite: links.invite || "", friend: links.friend || "", savedAt: Date.now() };
  state.pendingLinks = entry;
  try {
    localStorage.setItem(PENDING_LINKS_KEY, JSON.stringify(entry));
    return true;
  } catch (_) {
    return false;
  }
}

function clearPendingLinks() {
  state.pendingLinks = null;
  try { localStorage.removeItem(PENDING_LINKS_KEY); } catch (_) {}
}

// Runs at boot, before auth. Only the invite parameters leave the address bar; auth callbacks stay.
function capturePendingLinks() {
  const links = parsePendingLinkParams();
  const query = new URLSearchParams(window.location.search);
  const aliases = ["invite", "course", "friend", "add_friend"];
  if (!aliases.some((key) => query.has(key))) return readPendingLinks();
  if (links) {
    const prior = readPendingLinks();
    savePendingLinks({ invite: links.invite || prior?.invite || "", friend: links.friend || prior?.friend || "" });
  }
  aliases.forEach((key) => query.delete(key));
  const rest = query.toString();
  history.replaceState(null, "", window.location.origin + window.location.pathname + (rest ? "?" + rest : "") + window.location.hash);
  return readPendingLinks();
}

// Email links carry the invite too when the redirect allow-list accepts query strings (a "**" entry).
function authEmailRedirectUrl() {
  const base = authRedirectUrl();
  const pending = readPendingLinks();
  const wildcard = CONFIG.redirectAllowsQuery === true || /\.github\.io$/i.test(window.location.hostname || "");
  if (!pending || !wildcard) return base;
  const params = new URLSearchParams();
  if (pending.invite) params.set("invite", pending.invite);
  if (pending.friend) params.set("friend", pending.friend);
  return base + "?" + params.toString();
}

function inviteBannerText(links) {
  if (!links) return "";
  if (links.invite && links.friend) return `@${links.friend} invited you to join course ${links.invite} and connect as friends. Sign in or create a free account to accept.`;
  if (links.invite) return `You have an invite to course ${links.invite}. Sign in or create a free account to join automatically.`;
  return `@${links.friend} sent you a friend link. Sign in or create a free account to connect.`;
}

function inviteBannerHtml() {
  const text = inviteBannerText(readPendingLinks());
  return text ? `<div class="invite-banner" role="note">${mascotHtml("happy", 40)}<p>${esc(text)}</p></div>` : "";
}

let pendingLinksRun = null;

// Accepts stored links once per session. The entry is cleared before any network call, so a failure never loops.
function processPendingInviteLinks(options = {}) {
  pendingLinksRun ??= acceptPendingLinks(options).finally(() => { pendingLinksRun = null; });
  return pendingLinksRun;
}

async function acceptPendingLinks({ openJoined = true } = {}) {
  const links = readPendingLinks();
  const outcome = { courseId: null, friend: null };
  if (!links) return outcome;
  if (!state.sbClient) {
    clearPendingLinks();
    toast("Invite links need an online account, so this one was skipped in Local Studio.");
    return outcome;
  }
  if (!state.sbUser || state.passwordRecovery) return outcome;
  clearPendingLinks();
  if (links.friend) {
    const res = await addFriendByUsername(links.friend).catch(() => ({ ok: false, message: friendLinkError(null, links.friend) }));
    toast(res.message);
    if (res.ok) {
      outcome.friend = links.friend;
      playSound("correct");
    }
  }
  if (links.invite) {
    try {
      const joined = await rpc("join_course_by_code", { p_code: links.invite });
      await listCourses();
      const course = state.courses.find((c) => c.id === joined?.id);
      if (course) {
        outcome.courseId = course.id;
        prefSet("active_course_" + state.sbUser.id, course.id);
        if (openJoined && state.course?.id !== course.id) await openCourse(course);
        toast(`Joined ${course.title}!`);
      }
    } catch (err) {
      toast(err?.code === "22023" || /invalid invite/i.test(err?.message || "")
        ? `Invite code ${links.invite} isn't valid anymore. Ask for a fresh link.`
        : "That course invite couldn't be accepted. Try again in a moment.");
    }
  }
  if (state.view === "map" && state.data) renderMap();
  return outcome;
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
  const banner = !ctx.modal && ["sign-in", "sign-up"].includes(mode) ? inviteBannerHtml() : "";
  const hero = `${banner}<div class="auth-hero">
      ${ctx.modal ? badge : `<div class="auth-kubo">${mascotHtml(view.mood, 68)}${badge}</div>`}
      <${heading} class="auth-title" tabindex="-1">${esc(view.title)}</${heading}>
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
  await processPendingInviteLinks();
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
    options: { emailRedirectTo: authEmailRedirectUrl(), data: { username, display_name: username } },
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
      ? await state.sbClient.auth.resend({ type: "signup", email, options: { emailRedirectTo: authEmailRedirectUrl() } })
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
    const { error } = await state.sbClient.auth.resend({ type: "signup", email, options: { emailRedirectTo: authEmailRedirectUrl() } });
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
    mode: recovering ? "update-password" : mode || notice?.mode || (readPendingLinks() ? "sign-up" : "sign-in"),
    notice,
    after: enterCloud,
    focus: recovering || Boolean(notice) || matchMedia("(pointer: fine)").matches,
  });
}

async function enterCloud() {
  state.view = "courses";
  const user = state.sbUser.id;
  const loader = beginCourseLoad("Delightful Learn");
  try {
    await listCourses();
    if (state.sbUser?.id !== user) return;
    if (readPendingLinks()) await processPendingInviteLinks({ openJoined: false });
    if (state.sbUser?.id !== user) return;
    const saved = prefGet("active_course_" + user);
    const course = state.courses.find((c) => c.id === saved) || (STATIC_MODE ? state.courses[0] : null);
    if (course) return await openCourse(course, loader);
    if (!STATIC_MODE && state.data) {
      state.view = "map";
      syncProgressToSupabase();
    }
  } catch (err) {
    toast(err.message);
  } finally {
    await loader.finish();
  }
  if (state.sbUser?.id === user) render();
  if (state.sbUser?.id === user && state.view === "courses") {
    loadCourseHubProgress(user).catch((err) => toast(err.message));
  }
}

let courseHubProgress = new Map();

function showCourses() {
  if (state.inFlight) return;
  if (!state.sbUser) return;
  const user = state.sbUser.id;
  window.Delight.withViewTransition(() => {
    if (state.sbUser?.id !== user) return;
    state.view = "courses";
    render();
    listCourses().then(() => {
      if (state.view !== "courses" || state.sbUser?.id !== user) return;
      renderCourses();
      return loadCourseHubProgress(user);
    }).catch((err) => toast(err.message));
  }, "hub");
}

async function loadCourseHubProgress(user) {
  const { data, error } = await state.sbClient.from("course_progress")
    .select("course_id, completed_events").eq("user_id", user);
  if (error) throw error;
  if (state.sbUser?.id !== user || state.view !== "courses") return;
  courseHubProgress = new Map((data || []).map((row) => [row.course_id, new Set(row.completed_events)]));
  document.querySelectorAll("[data-course-progress]").forEach((slot) => {
    slot.innerHTML = courseHubProgressHtml(state.courses[Number(slot.dataset.courseProgress)]);
  });
}

function courseHubProgressHtml(course) {
  const lessons = (course.content?.districts || []).flatMap(lessonsForDistrict);
  if (!lessons.length) return "";
  const events = state.course?.id === course.id
    ? new Set(state.data?.gamification?.completed_events) : courseHubProgress.get(course.id);
  const done = lessons.filter((lesson) => lesson.step_ids.every((id) => events?.has(`step-${id}`))).length;
  return `<span class="tabular">${done} / ${lessons.length} lessons</span>${progressBarHtml(done, lessons.length, "Lessons completed")}`;
}

function renderCourses() {
  document.body.classList.remove("mode-mission");
  document.getElementById("lesson-footer-host").replaceChildren();
  const bar = document.getElementById("topbar");
  const canReturn = Boolean(state.course || !STATIC_MODE || state.data);
  bar.innerHTML = `<div class="topbar-inner courses-topbar">
    <button type="button" id="btn-brand" class="wordmark" aria-label="Delightful Learn, Course Home" ${canReturn ? "" : "disabled"}>${mascotHtml("idle", 28)}<span>Delightful Learn</span></button>
    <button id="btn-theme" class="icon-ghost" aria-label="Toggle color theme">${state.theme === "dark" ? ICONS.sun : ICONS.moon}</button>
    ${state.sbProfile ? `<button type="button" id="hub-account" class="avatar-btn">${mascotHtml("idle", 22)}<span>@${esc(state.sbProfile.username)}</span></button>` : ""}
    <button id="hub-signout" class="btn-ghost">Sign out</button>
  </div>`;
  bar.querySelector("#btn-theme").onclick = toggleTheme;
  const account = bar.querySelector("#hub-account");
  if (account) account.onclick = () => openSettingsModal("account", account);
  bar.querySelector("#hub-signout").onclick = (e) => guarded(e.currentTarget, signOut);
  const root = document.getElementById("app-root");
  root.innerHTML = `<section class="courses-hub">
    ${canReturn ? '<button type="button" id="btn-courses-back" class="btn-ghost flush">← Back to course</button>' : ""}
    <div class="courses-heading"><h1>Your courses</h1><button id="create-course" class="btn-tactile secondary" type="button" aria-disabled="true">${ICONS.lock} Create Course <span class="soon-pill">Coming soon</span></button></div>
    ${!STATIC_MODE ? '<button id="open-local" class="btn-ghost">Open Local Studio</button>' : ""}
    <ul class="course-list">
      ${state.courses.map((course, index) => `<li class="course-row">
        <div class="course-row-main"><span class="course-icon" style="--course-accent:${bannerColor(course.content?.districts?.[0]?.color)}" aria-hidden="true">${ICONS.book}</span>
          <div><h2>${esc(course.title)}</h2><p>${esc(course.description)}</p>
            <div class="course-progress" data-course-progress="${index}">${courseHubProgressHtml(course)}</div>
          </div>
        </div>
        <div class="form-row"><button class="btn-tactile go pill" data-course="${index}">${state.course?.id === course.id ? "Continue" : "Open"}</button>
          <button class="btn-tactile secondary small pill" id="course-settings-${index}" data-settings="${index}" aria-label="Settings for ${esc(course.title)}">Settings</button></div>
      </li>`).join("")}
    </ul>
    ${state.courses.length ? "" : "<p>Enter an invite code to join your first course.</p>"}
    <div class="course-join">
    <form id="join-course" class="join-course" aria-describedby="invite-help">
      <label>Invite code<input name="code" class="text-field invite-input" pattern="[A-HJ-NP-Za-hj-np-z2-9]{6,8}" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="e.g. K7M9P2" required></label>
      <button type="submit" class="btn-tactile secondary pill">Join Course</button>
    </form>
    <p id="invite-help" class="invite-help">${mascotHtml("idle", 34)}<span>Have a teammate's invite code? Join their course anytime.</span></p>
    </div>
  </section>`;
  root.querySelector("#create-course").onclick = () => toast("Custom course authoring is coming soon!");
  const backToCourse = () => {
    if (!state.data) return;
    showCoursePath("hub");
  };
  bar.querySelector("#btn-brand").onclick = backToCourse;
  const back = root.querySelector("#btn-courses-back");
  if (back) back.onclick = backToCourse;
  const local = root.querySelector("#open-local");
  if (local) local.onclick = () => guarded(local, openLocalStudio);
  root.querySelectorAll("[data-course]").forEach((button) => {
    button.onclick = () => guarded(button, () => openCourse(state.courses[Number(button.dataset.course)]));
  });
  root.querySelectorAll("[data-settings]").forEach((button) => {
    button.onclick = () => courseSettings(state.courses[Number(button.dataset.settings)], button);
  });
  const form = root.querySelector("#join-course");
  form.elements.code.oninput = (e) => {
    const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    e.target.value = code;
    const button = form.querySelector("button");
    button.classList.toggle("go", code.length >= 6);
    button.classList.toggle("secondary", code.length < 6);
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    guarded(form.querySelector("button"), async () => {
      const joined = await rpc("join_course_by_code", { p_code: form.elements.code.value });
      await listCourses();
      await openCourse(state.courses.find((c) => c.id === joined.id));
    });
  };
}

function courseSettings(course, trigger) {
  showDialog(course.title, `<div class="form-stack">
    ${course.role === "owner" && course.invite_code ? `<label>Invite code<input id="course-invite" class="text-field invite-input" readonly value="${esc(course.invite_code)}"></label>
      <div class="form-row"><button id="copy-invite" class="btn-tactile secondary">Copy Code</button>
      <button id="rotate-invite" class="btn-ghost">Rotate Invite Code</button></div>` : ""}
    ${state.sbUser ? `<div class="settings-block share-block"><h3 class="modal-label">Share links</h3>${shareBarHtml({ invite: course.invite_code || "" })}</div>` : ""}
    <button id="leave-course" class="btn-ghost">Leave Course</button>
    <div id="leave-confirm" class="form-stack" hidden><p>Leave this course? You’ll need an invite to rejoin.</p>
      <div class="form-row"><button id="confirm-leave" class="btn-tactile secondary">Leave Course</button>
      <button id="cancel-leave" class="btn-ghost">Cancel</button></div></div>
  </div>`, trigger);
  bindShareBar(document.getElementById("modal-host"));
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
    document.querySelector("#btn-courses-back, #join-course input")?.focus();
    await listCourses();
  });
}

async function signOut() {
  await Promise.all([progressQueue, localProgressQueue]);
  const { error } = await state.sbClient.auth.signOut();
  if (error) throw error;
  await clearSession();
}

async function clearSession() {
  clearInterval(state.timer.interval);
  stopBoostTicker();
  state.timer.running = false;
  state.timer.left = state.timer.total;
  stopAuthTimer();
  setRecoveryFlag(false);
  state.sbUser = null;
  state.sbProfile = null;
  state.friends = [];
  state.courses = [];
  courseHubProgress.clear();
  state.course = null;
  state.progress = null;
  state.data = null;
  state.achievements = [];
  state.reviewedCards = 0;
  state.mascotColor = "#4F46E5";
  state.mascotAccessory = "none";
  state.mascotShape = "cube";
  state.mascotEffect = "none";
  state.leaderboard.entries = null;
  clearUserStorage();
  resetCourseView();
  closeModal();
  if (STATIC_MODE) renderAuth();
  else await openLocalStudio();
}

const RUN_LABEL = `${ICONS.play} Run &amp; Verify (${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘Enter" : "Ctrl+Enter"})`;
const NUMPY_CHALLENGES = new Set(["m0_returns", "m3_gae", "m8_set_encoder"]);
const RUNNER_URL = /^https?:\/\//i.test(CONFIG.localRunnerUrl || "")
  ? CONFIG.localRunnerUrl.replace(/\/+$/, "")
  : "http://127.0.0.1:8787";

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
  const passed = checks.filter((check) => check.passed).length;
  const firstFailure = checks.findIndex((check) => !check.passed);
  const all = firstFailure < 0;
  const summary = all ? `All ${checks.length} ${checks.length === 1 ? "check" : "checks"} passed!` : `${passed} of ${checks.length} checks passed`;
  return `<div class="code-summary-bar ${all ? "all-passed" : "has-fail"}">
    <strong>${summary}</strong>
    ${progressBarHtml(passed, checks.length, "Passing checks")}
  </div><ul class="checks-list" aria-label="Verification results">${checks.map((check, index) => `
    <li${index === firstFailure ? ' class="first-failure"' : ""}><span class="check-icon ${check.passed ? "pass" : "fail"}" aria-hidden="true">${check.passed ? sizedIcon("check", 16, 2.8) : sizedIcon("close", 16, 2.4)}</span>
      <div><strong>${esc(check.name)}</strong><span class="sr-only">${check.passed ? " passed" : " failed"}</span>
      ${check.detail ? `<p>${esc(check.detail)}</p>` : ""}
      ${index === firstFailure && line ? `<button type="button" class="btn-ghost pill code-line-jump" data-code-line="${line}">Go to line <kbd>${line}</kbd></button>` : ""}</div></li>`).join("")}</ul>
    ${res.stdout ? `<details><summary>Program output</summary><pre class="terminal-log">${esc(res.stdout)}</pre></details>` : ""}
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
    frame.src = ASSET_BASE + "/python-runner.html";
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
  const progress = updateCloudProgress("/api/run_code", { step_id: step.id, passed: result.passed });
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

function loadEditorModules() {
  editorModules ??= import(ASSET_BASE + "/vendor/codemirror.bundle.mjs").catch(() => {
    editorModules = null;
    return null;
  });
  return editorModules;
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
    probeRunner().then(() => { if (shell.isConnected && currentStepId() === step.id && !state.inFlight) patchRunnerCard(step); });
  }
  run.onclick = () => guarded(run, async () => {
    const expectedStepId = step.id;
    primeAudio();
    run.textContent = "Running…";
    try {
      const res = await verifyCode(step, cm ? cm.state.doc.toString() : ed.value);
      if (!shell.isConnected || currentStepId() !== expectedStepId) return;
      const alreadyPassed = state.stepFeedback[step.id]?.passed === true;
      state.stepFeedback[step.id] = res;
      state.data = res.state;
      if (res.passed) {
        state.combo++;
        playSound("code_pass", state.combo);
        recordLessonXp(res.xp);
        unlockAchievement("code_cracker");
      } else {
        state.combo = 0;
        playSound("miss");
      }
      logs.innerHTML = codeResultsHtml(res);
      animateLessonCheck(res.passed, logs.querySelector(".code-summary-bar"), !alreadyPassed || !res.passed, 10);
      renderTopbar();
      renderMissionFooter();
      if (res.passed && !alreadyPassed) pulseLessonFooter();
    } catch (err) {
      if (!shell.isConnected || currentStepId() !== expectedStepId) return;
      logs.innerHTML = codeResultsHtml({ passed: false, checks: [{ name: "Run could not finish", passed: false, detail: err.message }] });
    } finally {
      run.innerHTML = RUN_LABEL;
      if (logs.isConnected) logs.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "instant" : "smooth" });
    }
  }).finally(() => { if (cloudCourse() && shell.isConnected && !state.inFlight) patchRunnerCard(step); });

  loadEditorModules().then((modules) => {
    if (!modules || !shell.isConnected || currentStepId() !== step.id || edited || document.activeElement === ed) return;
    const { basicSetup, python, oneDark, EditorView, keymap, indentMore, indentLess, Compartment } = modules;
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
      renderMissionFooter();
    } catch (err) {
      if (out.isConnected && currentStepId() === expectedStepId) status.textContent = err.message;
    } finally {
      run.innerHTML = `${ICONS.play} Run PyTorch Simulation`;
    }
  });
}

async function registerServiceWorker() {
  if (!STATIC_MODE && window.location.protocol !== "https:") return;
  try {
    await navigator.serviceWorker?.register(ASSET_BASE + (STATIC_MODE ? "/sw.js" : "/sw.js?studio"));
  } catch (_) {
    // The app still works when the browser or hosting environment disables workers.
  }
}

void registerServiceWorker();
init();
