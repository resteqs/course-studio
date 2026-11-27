(() => {
  "use strict";

  const fill = 'fill="var(--art-fill, var(--accent-tint))"';
  const paper = 'fill="var(--surface)"';
  const svg = (viewBox, art, attributes = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" aria-hidden="true" focusable="false" ${attributes} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${art}</svg>`;
  const dots = (x, y) => `<g class="art-halftone" stroke-dasharray="0 7" opacity=".34">${[2.6, 2, 1.4, .9].map((width, row) => `<path d="M${x + (row % 2) * 3.5} ${y + row * 7}h42" stroke-width="${width}"/>`).join("")}</g>`;
  // Four-point sparkle; `delay` staggers its twinkle so a cluster never pulses in unison.
  const spark = (x, y, r, delay) => `<path class="art-spark" style="--d:${delay}s" d="M${x} ${y - r}q${r * .18} ${r * .82} ${r} ${r}q-${r * .82} ${r * .18}-${r} ${r}q-${r * .18}-${r * .82}-${r}-${r}q${r * .82}-${r * .18} ${r}-${r}z"/>`;
  const die = `<rect width="34" height="34" rx="7" ${paper}/><path d="M9 9h.1m16 0h.1m-8 8h.1m-8 8h.1m16 0h.1" stroke-width="3.5"/>`;
  const pawn = `<path d="M-10 0h20l-2-4c-3-2-4-4-4-7a6 6 0 1 0-8 0c0 3-1 5-4 7z" ${paper}/>`;
  const house = `<path d="M-14 1v-16l14-10 14 10V1z" ${fill}/><path d="M-17-13 0-26l17 13M-4 1v-10h8V1"/>`;
  const hotel = `<rect x="-13" y="-24" width="26" height="25" rx="2" ${fill}/><path d="M-7-17h2m10 0h2m-14 6h2m10 0h2M-3 1v-6h6v6"/>`;
  const trophy = `<path d="M-16-28h32v10a16 16 0 0 1-32 0z" ${fill}/><path d="M-16-25h-9v6q0 8 11 8m30-14h9v6q0 8-11 8M0-2v9m-10 0h20"/>`;
  const lock = `<path d="M-14-13 0-18l14 5v11Q13 8 0 14-13 8-14-2z" ${paper}/><rect x="-5" y="-4" width="10" height="8" rx="2" ${fill}/><path d="M-3-4v-3a3 3 0 0 1 6 0v3"/>`;
  const compass = `<circle r="30" ${paper}/><circle r="23" stroke-dasharray="0 5"/><path d="M0-36v4m0 64v4m-36-36h4m64 0h4"/><g class="art-needle"><path d="m-12 14 7-21 19-9-8 21z" ${fill}/><path d="m-12 14 12-14 14-16"/></g><circle r="2.5" fill="currentColor" stroke="none"/>`;
  const ramp = `<path d="M0 0v70h176"/><path d="M66 8h60v62H66z" ${fill} stroke="none"/><path d="M66 4v66m60-66v66" stroke-dasharray="2 5"/><path d="M14 60 112 20h51" stroke-width="3"/><path d="m112 20 49-20" stroke-dasharray="3 5"/>`;
  const motifs = [
    `<path d="M24 30h38v43h109v36H24z" ${fill}/><path d="M24 73h38m-38-22h38m0 22v36m27-36v36m27-36v36m27-36v36"/><g transform="translate(115 33) rotate(-12)"><g class="art-tilt">${die}</g></g><path d="M75 57c14-37 42-43 70-40m-9-7 9 7-11 4"/>${spark(160, 16, 5, 0)}${spark(96, 30, 3.5, 1.1)}`,
    `<path d="M73 109h33V87h31V65h32V43h35v66z" ${fill}/><path d="M109 112v9h103V49m-70 25h62m-95 22h95" opacity=".5"/><g transform="translate(67 59)">${compass}</g>${spark(118, 30, 4.5, .4)}${spark(196, 30, 3.5, 1.6)}`,
    `<path d="M48 111h150"/><path d="M61 111V69h20v42m13 0V50h20v61m13 0V33h20v78m13 0V63h20v48" ${fill}/><path d="M63 53q44-43 107-30" stroke-dasharray="2 5"/><g transform="translate(172 61)">${lock}</g>${spark(196, 36, 4.5, .8)}${spark(108, 22, 3.5, 2)}`,
    `<path d="M96 102h47m-23-68v68m-56-59h112m-97 0-16 30h32zm82 0-16 30h32z" ${fill}/><path d="M63 73q16 20 32 0m50 0q16 20 32 0" ${fill}/><circle cx="120" cy="43" r="6" ${paper}/><path d="M38 44c5 49 37 64 62 67h97" stroke-dasharray="3 5"/>${spark(120, 22, 5, .2)}${spark(186, 82, 3.5, 1.4)}`,
    `<g transform="translate(29 27)">${ramp}</g><path d="M95 19h-9v87h9m60-87h9v87h-9"/><text x="81" y="120" class="art-caption">1−ε</text><text x="153" y="120" class="art-caption">1+ε</text>${spark(206, 30, 4.5, .6)}`,
    `<path d="M35 71h117l23 39H20z" ${paper}/><path d="M43 71h23l-4 13H38zm46 0h23l4 13H88zm46 0h17l8 13h-19zM29 96h29l-4 14H20zm59 0h30l5 14H88zm58 0h21l8 14h-23z" ${fill}/><path d="M43 51c8-18 28-19 40-7m-8-1 8 1-1-8m64 18c17 9 36 1 40-11m-8 2 8-2 2 8M182 85v18m22-18v18m-22-9h22"/><g transform="translate(110 61)">${trophy}</g>${spark(110, 18, 5, 0)}${spark(140, 36, 3.5, 1.2)}${spark(84, 40, 3, 2.1)}`,
    `<rect x="34" y="24" width="96" height="84" rx="8" ${paper}/><path d="M66 24v84M98 24v84M34 52h96M34 80h96"/><rect x="100" y="26" width="28" height="24" rx="4" ${fill}/><path d="M44 94h12m-4-4 4 4-4 4m18-32h14m-4-4 4 4-4 4m-14-4v-16m-4 4 4-4 4 4"/><circle cx="176" cy="70" r="24" ${fill}/><path d="M167 70h18m-5-5 5 5-5 5"/>${spark(152, 32, 4.5, .4)}${spark(196, 40, 3.5, 1.5)}`,
    `<path d="M32 104h164M46 104V46h40v58m-40-29h40m-20-29v58" ${fill}/><path d="M108 94c18-52 44-58 76-22" stroke-width="2.6"/><circle cx="136" cy="54" r="10" ${paper}/><circle cx="176" cy="64" r="16" ${fill}/><g transform="translate(176 64) scale(.75)">${lock}</g>${spark(118, 30, 5, .2)}${spark(196, 34, 3.5, 1.3)}`,
    `<polygon points="120,26 62,108 178,108" ${fill}/><circle cx="120" cy="26" r="10" ${paper}/><circle cx="62" cy="108" r="10" ${paper}/><circle cx="178" cy="108" r="10" ${paper}/><path d="M120 76c14-14 20 8 0 18-20-10-14-32 0-18z" stroke-dasharray="2 4"/><circle cx="120" cy="78" r="5" ${paper}/>${spark(154, 42, 4.5, .5)}${spark(84, 48, 3.5, 1.6)}`,
  ];

  const wheel = Array.from({ length: 50 }, (_, i) => `<path transform="rotate(${i * 7.2})" d="M0-53v${i % 7 === 0 ? 13 : 7}" ${i % 7 === 0 ? 'opacity=".25"' : ""}/>`).join("");
  const scenes = [
    `<g transform="translate(195 24) rotate(-9)"><rect width="76" height="102" rx="8" ${paper}/><path d="M0 8q0-8 8-8h60q8 0 8 8v20H0z" ${fill}/><path d="M16 15h44m-44 43h44m-44 10h32m-32 10h40"/><g transform="translate(39 52) scale(.6)">${house}</g></g><path d="M273 107q43 12 68-22m-10 2 10-2-1 10" stroke-dasharray="3 5"/><g transform="translate(301 64) rotate(18)"><g class="art-tilt">${die}</g></g>${spark(352, 50, 5, .5)}<path d="M285 41c-1-12 18-13 18-3 0 6-9 5-9 12m0 7h.1"/>`,
    `<path d="M142 108h236" stroke-dasharray="2 6"/><path d="M165 92a48 48 0 0 1 96 0m18 0a48 48 0 0 1 96 0" ${fill}/><path d="M177 92a36 36 0 0 1 72 0m42 0a36 36 0 0 1 72 0" ${paper}/><path d="m213 91-23-12m137 12 20-26" stroke-width="3"/><circle cx="213" cy="91" r="4"/><circle cx="327" cy="91" r="4"/><text x="213" y="123" class="art-caption">Beginner</text><text x="327" y="123" class="art-caption">Master</text>`,
    `<g transform="translate(260 74)"><circle r="56" ${fill}/><circle r="36" ${paper}/>${wheel}<path d="M0 0 21-24M0 0l-27-7M0 0l9 31"/><circle r="5" ${fill}/><g transform="translate(43 26)">${lock}</g></g><path d="M185 60h-40m40 12h-22m172 12h40m-40 12h22" stroke-dasharray="2 5"/>`,
    `<rect x="154" y="24" width="212" height="100" rx="8" ${fill}/><path d="M260 24v100M166 62h188m-188 39h188" stroke-dasharray="2 5" opacity=".42"/><path d="M196 70h24m-12 0v-18m0 18-17 17m17-17 17 17m60-3 18-17 11 8 20-24m-49 41h56"/><circle cx="208" cy="52" r="6" ${paper}/><text x="208" y="112" class="art-caption">Actor</text><text x="312" y="112" class="art-caption">Critic</text>`,
    `<g transform="translate(154 18) scale(1.2)">${ramp}</g><text x="233" y="121" class="art-caption">1−ε</text><text x="305" y="121" class="art-caption">1+ε</text>`,
    `<path d="M184 43h17v34a19 19 0 0 0 38 0V43h17v34a36 36 0 0 1-72 0z" ${fill}/><path d="M184 57h17m38 0h17m11 15q24-19 51-9m-51 22q24 14 50 3" stroke-dasharray="3 5"/><path d="M309 103h62l-11 13h-51zM349 102l18-53m-44 48 14-22 22 12-8 15" ${fill}/><circle cx="343" cy="90" r="5" ${paper}/><path d="m363 50 8 3"/>${spark(220, 28, 5.5, 0)}${spark(262, 36, 3.5, 1.3)}`,
    `<rect x="166" y="24" width="112" height="96" rx="8" ${paper}/><path d="M203 24v96M241 24v96M166 56h112M166 88h112"/><rect x="243" y="26" width="33" height="28" rx="4" ${fill}/><path d="M178 104h14m-4-4 4 4-4 4m20-32h14m-4-4 4 4-4 4m-14-4V50m-4 4 4-4 4 4"/><path d="M294 72h56m-10-8 10 8-10 8" stroke-dasharray="3 5"/><g transform="translate(356 44)"><rect width="48" height="56" rx="8" ${fill}/><path d="M12 20h24M12 34h16"/></g>${spark(332, 32, 4.5, .4)}`,
    `<rect x="150" y="34" width="68" height="72" rx="8" ${fill}/><path d="M184 34v72M150 70h68"/><path d="M232 70h32m-8-7 8 7-8 7"/><path d="M276 104c18-58 46-66 84-26" stroke-width="2.8"/><circle cx="310" cy="54" r="10" ${paper}/><g transform="translate(362 70) scale(.85)">${lock}</g><text x="184" y="124" class="art-caption">Table</text><text x="320" y="124" class="art-caption">Neural Net</text>`,
    `<polygon points="260,26 196,112 324,112" ${fill}/><circle cx="260" cy="26" r="12" ${paper}/><circle cx="196" cy="112" r="12" ${paper}/><circle cx="324" cy="112" r="12" ${paper}/><circle cx="260" cy="82" r="9" fill="var(--surface)"/><text x="260" y="130" class="art-caption">2P → 4P Pool</text>${spark(342, 44, 5, .3)}${spark(178, 48, 3.5, 1.4)}`,
  ];

  function unitMotifSvg(unitId) {
    if (!/^M[0-8]$/.test(unitId)) return "";
    return svg("0 0 240 136", dots(186, 17) + motifs[Number(unitId[1])], 'class="unit-motif"');
  }

  function lessonSceneSvg(stepId, kind) {
    const anchor = /^m([0-8])_(bet|s[01])$/.exec(stepId);
    if (!anchor) return "";
    const [, unit, step] = anchor;
    if (step === "bet" ? kind !== "bet" : step !== (unit === "2" ? "s0" : "s1")) return "";
    return svg("0 0 520 148", dots(87, 95) + dots(386, 36) + scenes[Number(unit)], `class="lesson-scene" data-art-unit="M${unit}"`);
  }

  const storefronts = {
    cafe: `<path d="M26 45h108v47H26z" ${paper}/><path d="M18 45l12-23h100l12 23q-6 11-13 0-6 11-13 0-6 11-13 0-6 11-13 0-6 11-13 0-6 11-13 0-6 11-13 0-6 11-13 0-6 11-13 0z" ${fill}/><path d="m38 45 8-23m18 23 4-23m22 23v-23m26 23-5-23M46 92V61h24v31m18-12h26M94 63h14v5q0 7-7 7t-7-7zm14 2h4q4 5-4 6"/><g class="art-steam"><path class="art-wisp" d="M98 59q-3-4 0-7t0-7"/><path class="art-wisp w2" d="M104 59q-3-4 0-7t0-7"/></g>`,
    bistro: `<path d="M27 92V34h106v58z" ${paper}/><path d="M22 38h116v11H22zM40 25h80v13H40z" ${fill}/><path d="M53 31h54M42 92V59h26v33m17-14h37m-33-2q1-14 14-14t15 14m-15-15v-4m-20 28h40"/><path d="M31 92v-6m96 6v-6"/>${spark(116, 56, 4, .3)}`,
    diner: `<path d="M24 92V47h103l9 13v32z" ${paper}/><path d="M19 47h103l18 14H19z" ${fill}/><path d="M31 54h90m-85 38V69h32v23m11-23h42v14H79zm20 0v14M80 46V31"/><path class="art-twinkle" d="m80 15 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" ${fill}/>`,
  };

  function restaurantSvg(name) {
    return Object.hasOwn(storefronts, name) ? svg("0 0 160 102", dots(109, 11) + storefronts[name] + '<path d="M17 92h126"/>', `class="restaurant-art" data-storefront="${name}"`) : "";
  }

  function boardTrackSvg() {
    const colors = ["go", "accent", "warn", "danger"];
    const tiles = colors.map((color, i) => `<g transform="translate(${6 + i * 32} 43)"><rect width="32" height="30" fill="var(--${color}-tint)"/><path d="M3 6h26" stroke="var(--${color})"/></g>`).join("");
    return svg("0 0 140 84", `${tiles}<g class="board-pawn"><g class="pawn-hop">${pawn}</g></g><g transform="translate(107 11) scale(.67)"><g class="board-die">${die}</g></g>`);
  }

  function robotGridSvg() {
    return svg("0 0 140 84", `<rect x="34" y="6" width="72" height="72" rx="4" ${paper}/><path d="M58 6v72M82 6v72M34 30h72M34 54h72"/><path d="M61 33h18v18H61z" ${fill}/><path d="m89 16 4 5 8-9" stroke="var(--go)"/><g class="grid-robot"><g class="pawn-hop"><rect width="14" height="12" rx="3" ${fill}/><path d="M4 5h.1m6 0h.1M7 0v-3"/></g></g>`);
  }

  function bellmanTileSvg(tile) {
    const art = { go: '<path d="M-15-11h30m-8-8 8 8-8 8"/>', safe: house, hotel };
    return Object.hasOwn(art, tile) ? svg("0 0 40 34", `<g transform="translate(20 29)">${art[tile]}</g>`) : "";
  }

  const rewardCoinSvg = () => svg("0 0 24 24", `<circle cx="12" cy="12" r="10" fill="var(--warn-tint)"/><circle cx="12" cy="12" r="6"/><path d="M12 9v6m-3-3h6"/><path d="M6.5 8.5q1.6-3 4.5-3.6" stroke="#fff" stroke-width="1.6" opacity=".75"/>`);
  window.Illustrations = Object.freeze({ unitMotifSvg, lessonSceneSvg, restaurantSvg, boardTrackSvg, robotGridSvg, bellmanTileSvg, rewardCoinSvg });
})();
