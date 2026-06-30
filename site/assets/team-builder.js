// Team Builder — build a team of up to 6 Pokémon and see live coverage
// calculated against the Odyssey type chart (see types.js for TYPE_CHART,
// TYPE_LIST, defensiveMatchups, offensiveMatchups). State is persisted in
// localStorage (v2 format includes selected moves and held item) and can be
// shared via a ?team=slug1,slug2,… URL parameter.

const SPRITE_URL = (slug) => `https://play.pokemonshowdown.com/sprites/gen5/${slug}.png`;
const TEAM_SIZE = 6;
const STORAGE_KEY_V1 = "podx_team_v1";
const STORAGE_KEY_V2 = "podx_team_v2";
const VIEW_KEY = "podx_tb_view_mode";

// --- DOM refs --------------------------------------------------------------

const teamEl        = document.getElementById("tb-team");
const metaEl        = document.getElementById("tb-meta");
const countEl       = document.getElementById("tb-count");
const clearBtn      = document.getElementById("tb-clear");
const shareBtn      = document.getElementById("tb-share");
const shareStatusEl = document.getElementById("tb-share-status");

const tableWrap     = document.getElementById("tb-table-wrap");
const tableBody     = document.getElementById("tb-table-body");
const tableEmpty    = document.getElementById("tb-table-empty");
const viewToggle    = document.getElementById("tb-view-toggle");

const defMatrixEl   = document.getElementById("tb-def-matrix");
const defSummaryEl  = document.getElementById("tb-def-summary");
const offCoverageEl = document.getElementById("tb-off-coverage");
const gapsEl        = document.getElementById("tb-strengths-gaps");
const typeDistEl    = document.getElementById("tb-type-dist");

// Pokémon picker
const pickerEl      = document.getElementById("tb-picker");
const pickerSearch  = document.getElementById("tb-picker-search");
const pickerChips   = document.getElementById("tb-picker-chips");
const pickerList    = document.getElementById("tb-picker-list");
const pickerEmpty   = document.getElementById("tb-picker-empty");
const pickerClose   = document.getElementById("tb-picker-close");

// Move picker
const movePickerEl     = document.getElementById("tb-move-picker");
const movePickerTitle  = document.getElementById("tb-move-picker-title");
const movePickerSearch = document.getElementById("tb-move-picker-search");
const movePickerList   = document.getElementById("tb-move-picker-list");
const movePickerEmpty  = document.getElementById("tb-move-picker-empty");
const movePickerClose  = document.getElementById("tb-move-picker-close");

// Item picker
const itemPickerEl     = document.getElementById("tb-item-picker");
const itemPickerTitle  = document.getElementById("tb-item-picker-title");
const itemPickerSearch = document.getElementById("tb-item-picker-search");
const itemPickerList   = document.getElementById("tb-item-picker-list");
const itemPickerEmpty  = document.getElementById("tb-item-picker-empty");
const itemPickerClose  = document.getElementById("tb-item-picker-close");

// --- State ----------------------------------------------------------------

/** @type {Array<object|null>} */
let team = new Array(TEAM_SIZE).fill(null);
/** @type {Array<Array<string|null>>} — 4 move slugs per slot, null = empty */
let teamMoves = emptyMoves();
/** @type {Array<string|null>} — held item slug per slot, null = none */
let teamItems = new Array(TEAM_SIZE).fill(null);

/** @type {Array<object>} */
let POKEDEX = [];
/** @type {Map<string, object>} */
let POKEDEX_BY_SLUG = new Map();
/** @type {Array<object>} */
let MOVES = [];
/** @type {Map<string, object>} */
let MOVES_BY_SLUG = new Map();
/** @type {Array<object>} */
let ITEMS = [];
/** @type {Map<string, object>} */
let ITEMS_BY_SLUG = new Map();
/** @type {Array<object>} — holdable items only, pre-filtered */
let HOLDABLE_ITEMS = [];

// Pokémon picker state
let pickerSlotIdx = -1;
let pickerTypeFilter = new Set();

// Move picker state
let movePickerSlotIdx = -1;
let movePickerMoveSlot = -1;

// Item picker state
let itemPickerSlotIdx = -1;

// Table-view state
let sortKey = "slot";
let sortDir = "asc";
let viewMode = (localStorage.getItem(VIEW_KEY) === "table") ? "table" : "slots";

// --- Item filter ----------------------------------------------------------

const NON_HOLDABLE_SLUGS = new Set([
  // Poké Balls
  "poke-ball", "great-ball", "ultra-ball", "timer-ball",
  // Fishing rods & field tools
  "good-rod", "old-rod", "super-rod", "ev-editor", "tent",
  // Repels
  "repel", "super-repel", "max-repel",
  // Data artifact
  "items", "power-item-shop-varley",
  // Evolution stones
  "fire-stone", "water-stone", "leaf-stone", "moon-stone", "dawn-stone",
  "dusk-stone", "thunderstone", "shiny-stone", "sun-stone", "link-stone",
  "black-augurite",
  // Medicines
  "antidote", "paralyz-heal", "ether", "elixir", "max-elixir", "theriaca",
  // Vitamins / EV items
  "hp-up", "calcium", "carbos", "iron", "zinc", "protein",
  // PP items (consumed from bag)
  "pp-up", "pp-max",
  // Custom game consumables
  "medica", "medica-ii", "medica-iii", "medica-iv", "medica-v",
  "nectar", "nectar-ii",
  // Treasure / sell items
  "big-pearl", "pearl", "nugget", "emerald", "sapphire", "topaz",
  "stardust", "star-piece", "relic-gold", "relic-silver",
  // Gather / mining materials
  "dolomite", "perlite",
  // Flowers (gather resources)
  "black-flower", "blue-flower", "purple-flower", "red-flower", "yellow-flower",
  // Shards
  "blue-shard", "green-shard", "red-shard", "yellow-shard",
]);

function isHoldable(item) {
  if (item.name.includes("(Key Item)")) return false;
  if (item.name.startsWith("TM")) return false;
  if (NON_HOLDABLE_SLUGS.has(item.slug)) return false;
  return true;
}

// --- Helpers --------------------------------------------------------------

function spriteFor(p) {
  if (!p) return null;
  if (p.variant_sprite && p.variant_sprite.normal) return p.variant_sprite.normal;
  return p.sprite_slug ? SPRITE_URL(p.sprite_slug) : null;
}

function typeBadge(t, sm = true) {
  return `<span class="type ${sm ? "sm" : ""} ${typeClass(t)}">${escapeHTML(t)}</span>`;
}

function abilityName(a) {
  return typeof a === "string" ? a : (a && a.name) || "";
}

function abilityLink(a) {
  const name = abilityName(a);
  if (!name) return "";
  const slug = (typeof a === "object" && a) ? a.slug : null;
  return slug
    ? `<a href="ability.html?slug=${encodeURIComponent(slug)}">${escapeHTML(name)}</a>`
    : escapeHTML(name);
}

function multLabel(m) {
  if (m === 0)    return "0×";
  if (m === 0.25) return "¼×";
  if (m === 0.5)  return "½×";
  if (m === 1)    return "1×";
  if (m === 1.5)  return "1½×";
  if (m === 2)    return "2×";
  if (m === 3)    return "3×";
  if (m === 4)    return "4×";
  return `${m}×`;
}

function multClass(m) {
  if (m === 0)    return "x0";
  if (m === 0.25) return "x025";
  if (m === 0.5)  return "x05";
  if (m === 1.5)  return "x15";
  if (m === 2)    return "x2";
  if (m === 3)    return "x3";
  if (m === 4)    return "x4";
  return "x1";
}

function bucketOf(m) {
  if (m === 0)   return "immune";
  if (m < 1)     return "resist";
  if (m > 1)     return "weak";
  return "neutral";
}

/** Format just the first source of an item for compact display. */
function formatFirstSource(sources) {
  if (!sources || !sources.length) return "";
  const s = sources[0];
  if (s.kind === "location") {
    const loc = s.location || s.habitat || "";
    const note = s.note ? ` (${s.note})` : "";
    return loc ? loc + note : "";
  }
  if (s.kind === "shop") return s.shop || "";
  if (s.kind === "gather") {
    const method = s.method ? ` · ${s.method}` : "";
    return s.stratum ? s.stratum + method : "Gather";
  }
  if (s.kind === "pickup") return "Pickup";
  return "";
}

/** Condense an item's sources array into a short readable string. */
function formatSources(sources) {
  if (!sources || !sources.length) return "";
  const parts = sources.slice(0, 3).map(s => {
    if (s.kind === "location") {
      const loc = s.location || s.habitat || "";
      const note = s.note ? ` (${s.note})` : "";
      return loc ? escapeHTML(loc + note) : null;
    }
    if (s.kind === "shop") return s.shop ? escapeHTML(s.shop) : null;
    if (s.kind === "gather") {
      const method = s.method ? ` · ${s.method}` : "";
      return s.stratum ? escapeHTML(s.stratum + method) : "Gather";
    }
    if (s.kind === "pickup") {
      const pct = s.percent ? ` ${Math.round(s.percent * 100)}%` : "";
      return `Pickup${pct}`;
    }
    return null;
  }).filter(Boolean);
  const extra = sources.length > 3 ? ` +${sources.length - 3} more` : "";
  return parts.join(" · ") + extra;
}

// --- Persistence ----------------------------------------------------------

function emptyMoves() {
  return new Array(TEAM_SIZE).fill(null).map(() => [null, null, null, null]);
}

function loadTeamData() {
  const params = new URLSearchParams(location.search);
  const urlTeam = params.get("team");
  if (urlTeam) {
    const t = new Array(TEAM_SIZE).fill(null);
    const m = emptyMoves();
    const it = new Array(TEAM_SIZE).fill(null);
    urlTeam.split(",").map(s => s.trim()).filter(Boolean).forEach((slot, i) => {
      if (i >= TEAM_SIZE) return;
      const colonIdx = slot.indexOf(":");
      if (colonIdx === -1) {
        // Backward-compatible: slug only
        const p = POKEDEX_BY_SLUG.get(slot);
        if (p) t[i] = p;
        return;
      }
      // New format: slug:move0.move1.move2.move3:itemIdx
      const [pokemonSlug, movePart, itemPart] = slot.split(":");
      const p = POKEDEX_BY_SLUG.get(pokemonSlug);
      if (!p) return;
      t[i] = p;
      if (movePart) {
        const learnset = getLearnset(p);
        m[i] = movePart.split(".").slice(0, 4).map(idx => {
          if (idx === "_" || idx === "") return null;
          const n = parseInt(idx, 10);
          return (!isNaN(n) && n >= 0 && n < learnset.length) ? learnset[n].slug : null;
        });
      }
      if (itemPart && itemPart !== "_") {
        const n = parseInt(itemPart, 10);
        if (!isNaN(n) && n >= 0 && n < HOLDABLE_ITEMS.length) it[i] = HOLDABLE_ITEMS[n].slug;
      }
    });
    return { team: t, teamMoves: m, teamItems: it };
  }

  // Try v2 format (includes moves + item)
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        const t = new Array(TEAM_SIZE).fill(null);
        const m = emptyMoves();
        const it = new Array(TEAM_SIZE).fill(null);
        data.forEach((entry, i) => {
          if (i >= TEAM_SIZE || !entry) return;
          const p = POKEDEX_BY_SLUG.get(entry.slug);
          if (!p) return;
          t[i] = p;
          if (Array.isArray(entry.moves)) {
            m[i] = entry.moves.slice(0, 4).map(s => (s && MOVES_BY_SLUG.has(s)) ? s : null);
          }
          if (entry.item && ITEMS_BY_SLUG.has(entry.item)) {
            it[i] = entry.item;
          }
        });
        return { team: t, teamMoves: m, teamItems: it };
      }
    }
  } catch { /* corrupted storage */ }

  // Fall back to v1 (no moves or items)
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (raw) {
      const slugs = JSON.parse(raw);
      if (Array.isArray(slugs)) {
        const t = new Array(TEAM_SIZE).fill(null);
        slugs.forEach((s, i) => {
          if (i >= TEAM_SIZE || !s) return;
          const p = POKEDEX_BY_SLUG.get(s);
          if (p) t[i] = p;
        });
        return { team: t, teamMoves: emptyMoves(), teamItems: new Array(TEAM_SIZE).fill(null) };
      }
    }
  } catch { /* corrupted storage */ }

  return { team: new Array(TEAM_SIZE).fill(null), teamMoves: emptyMoves(), teamItems: new Array(TEAM_SIZE).fill(null) };
}

function saveTeam() {
  const data = team.map((p, i) => p ? { slug: p.slug, moves: teamMoves[i], item: teamItems[i] } : null);
  while (data.length && !data[data.length - 1]) data.pop();
  try { localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(data)); } catch { /* quota / private mode */ }
}

// --- Rendering: team slots ------------------------------------------------

function moveSlotHtml(teamSlotIdx, moveSlotIdx) {
  const slug = teamMoves[teamSlotIdx][moveSlotIdx];
  const m = slug ? MOVES_BY_SLUG.get(slug) : null;
  if (m) {
    return `<button class="tb-move-slot tb-move-slot-filled type sm ${typeClass(m.type)}" type="button"
              data-team-slot="${teamSlotIdx}" data-move-slot="${moveSlotIdx}"
              title="${escapeHTML(m.name)} (${escapeHTML(m.type)} · ${escapeHTML(m.category)})">${escapeHTML(m.name)}</button>`;
  }
  return `<button class="tb-move-slot tb-move-slot-empty" type="button"
            data-team-slot="${teamSlotIdx}" data-move-slot="${moveSlotIdx}"
            aria-label="Add move ${moveSlotIdx + 1}">+ Move</button>`;
}

function itemSlotHtml(teamSlotIdx) {
  const slug = teamItems[teamSlotIdx];
  const item = slug ? ITEMS_BY_SLUG.get(slug) : null;
  if (item) {
    const src = formatFirstSource(item.sources);
    return `<button class="tb-item-slot tb-item-slot-filled" type="button"
              data-item-slot="${teamSlotIdx}"
              title="${escapeHTML(item.name)}">
      <span class="tb-item-slot-name">⊙ ${escapeHTML(item.name)}</span>
      ${src ? `<span class="tb-item-slot-src">${escapeHTML(src)}</span>` : ""}
    </button>`;
  }
  return `<button class="tb-item-slot tb-item-slot-empty" type="button"
            data-item-slot="${teamSlotIdx}"
            aria-label="Add held item">+ Item</button>`;
}

function renderTeam() {
  const filled = team.filter(Boolean).length;
  countEl.textContent = `${filled}/${TEAM_SIZE} filled`;

  teamEl.innerHTML = team.map((p, i) => {
    if (!p) {
      return `
        <button class="tb-slot tb-slot-empty" type="button" data-slot="${i}" aria-label="Add Pokémon to slot ${i + 1}">
          <span class="tb-slot-num">Slot ${i + 1}</span>
          <span class="tb-slot-plus" aria-hidden="true">+</span>
          <span class="tb-slot-label">Add Pokémon</span>
        </button>`;
    }
    const src = spriteFor(p);
    const initial = escapeHTML((p.name || "?")[0]);
    const sprite = src
      ? `<img class="tb-slot-sprite" loading="lazy" src="${src}" alt="${escapeHTML(p.name)}"
            onerror="this.outerHTML='<div class=\\'tb-slot-placeholder\\'>${initial}</div>'">`
      : `<div class="tb-slot-placeholder">${initial}</div>`;

    const nameHtml = p.is_variant
      ? `<span class="odyssey">${escapeHTML(p.name)}</span>`
      : escapeHTML(p.name);
    const abilities = (p.abilities || []).slice(0, 2).map(abilityName).filter(Boolean);
    const abilityLine = abilities.length
      ? `<span class="tb-slot-abilities">${escapeHTML(abilities.join(" / "))}</span>`
      : "";
    const movesHtml = [0, 1, 2, 3].map(ms => moveSlotHtml(i, ms)).join("");

    return `
      <div class="tb-slot tb-slot-filled${p.is_variant ? " odyssey-bg" : ""}" data-slot="${i}">
        <button class="tb-slot-remove" type="button" data-remove="${i}" aria-label="Remove ${escapeHTML(p.name)} from slot ${i + 1}">×</button>
        <button class="tb-slot-main" type="button" data-slot="${i}" aria-label="Change Pokémon in slot ${i + 1}">
          <span class="tb-slot-num">Slot ${i + 1}${p.dex ? ` · #${escapeHTML(p.dex)}` : ""}</span>
          ${sprite}
          <span class="tb-slot-name">${nameHtml}</span>
          <span class="tb-slot-types">${(p.types || []).map(t => typeBadge(t)).join("")}</span>
          ${abilityLine}
        </button>
        <div class="tb-slot-moves">${movesHtml}</div>
        <div class="tb-slot-item-row">${itemSlotHtml(i)}</div>
      </div>`;
  }).join("");
}

// --- Rendering: team table ------------------------------------------------

const STAT_KEYS = new Set(["hp", "atk", "def", "spa", "spd", "spe", "total"]);

function rowHTML(entry) {
  const { pokemon: p, slot } = entry;
  const src = spriteFor(p);
  const initial = escapeHTML((p.name || "?")[0]);
  const sprite = src
    ? `<img class="row-sprite" loading="lazy" src="${src}" alt=""
        onerror="this.outerHTML='<div class=\\'row-sprite-placeholder\\'>${initial}</div>'">`
    : `<div class="row-sprite-placeholder">${initial}</div>`;

  const types = (p.types || []).map(t => typeBadge(t)).join(" ");
  const abilities = (p.abilities || []).map(abilityLink).filter(Boolean).join(" <span class='dim'>/</span> ")
    || `<span class="empty-msg">—</span>`;
  const stats = p.stats || {};
  const cell = (k) => `<td class="num">${stats[k] ?? "—"}</td>`;

  const rowNameHtml = p.is_variant ? `<span class="odyssey">${escapeHTML(p.name)}</span>` : escapeHTML(p.name);
  let badge = "";
  if (p.is_battle_bond) badge = `<span class="row-tag tag-bb">B.B.</span>`;
  else if (p.is_event)  badge = `<span class="row-tag tag-event">Event</span>`;

  const movesHtml = teamMoves[slot]
    .map(slug => {
      if (!slug) return null;
      const m = MOVES_BY_SLUG.get(slug);
      if (!m) return null;
      return `<span class="type sm ${typeClass(m.type)} tb-row-move-chip" title="${escapeHTML(m.name)} (${escapeHTML(m.type)})">${escapeHTML(m.name)}</span>`;
    })
    .filter(Boolean)
    .join(" ");

  const itemSlug = teamItems[slot];
  const itemObj = itemSlug ? ITEMS_BY_SLUG.get(itemSlug) : null;
  const itemHtml = itemObj
    ? `<span class="tb-row-item-chip" title="${escapeHTML(itemObj.name)}">⊙ ${escapeHTML(itemObj.name)}</span>`
    : `<span class="dim">—</span>`;

  return `<tr${p.is_variant ? ' class="odyssey-bg"' : ''}>
    <td class="row-sprite-cell"><a href="pokemon.html?slug=${encodeURIComponent(p.slug)}" tabindex="-1">${sprite}</a></td>
    <td class="num dim">${slot + 1}</td>
    <td class="num dim">${p.dex ? "#" + escapeHTML(p.dex) : "—"}</td>
    <td class="row-name"><a href="pokemon.html?slug=${encodeURIComponent(p.slug)}">${rowNameHtml}</a>${badge}</td>
    <td class="row-types">${types}</td>
    <td class="row-ab">${abilities}</td>
    <td class="tb-row-moves">${movesHtml || '<span class="dim">—</span>'}</td>
    <td class="tb-row-item">${itemHtml}</td>
    ${cell("hp")}${cell("atk")}${cell("def")}${cell("spa")}${cell("spd")}${cell("spe")}
    <td class="num bst">${stats.total ?? "—"}</td>
    <td class="row-actions"><button class="tb-row-remove" type="button" data-remove="${slot}" aria-label="Remove ${escapeHTML(p.name)} from slot ${slot + 1}">×</button></td>
  </tr>`;
}

function applyTableSort(entries) {
  const sign = sortDir === "asc" ? 1 : -1;
  if (sortKey === "slot") {
    return [...entries].sort((a, b) => sign * (a.slot - b.slot));
  }
  if (sortKey === "name") {
    return [...entries].sort((a, b) => sign * a.pokemon.name.localeCompare(b.pokemon.name));
  }
  if (sortKey === "dex") {
    return [...entries].sort((a, b) => {
      const da = a.pokemon.dex ? parseInt(a.pokemon.dex, 10) : 9999;
      const db = b.pokemon.dex ? parseInt(b.pokemon.dex, 10) : 9999;
      return sign * (da - db);
    });
  }
  if (sortKey === "types") {
    return [...entries].sort((a, b) =>
      sign * ((a.pokemon.types?.[0] || "zzz").localeCompare(b.pokemon.types?.[0] || "zzz")));
  }
  if (sortKey === "abilities") {
    return [...entries].sort((a, b) =>
      sign * ((abilityName((a.pokemon.abilities || [])[0]) || "zzz")
        .localeCompare(abilityName((b.pokemon.abilities || [])[0]) || "zzz")));
  }
  if (STAT_KEYS.has(sortKey)) {
    return [...entries].sort((a, b) => {
      const av = (a.pokemon.stats && a.pokemon.stats[sortKey]) ?? -1;
      const bv = (b.pokemon.stats && b.pokemon.stats[sortKey]) ?? -1;
      return sign * (av - bv);
    });
  }
  return entries;
}

function updateSortIndicators() {
  for (const th of document.querySelectorAll("#tb-table th[data-sort-key]")) {
    const k = th.dataset.sortKey;
    th.classList.toggle("sort-asc",  k === sortKey && sortDir === "asc");
    th.classList.toggle("sort-desc", k === sortKey && sortDir === "desc");
  }
}

function onTableHeaderClick(e) {
  const th = e.target.closest("th[data-sort-key]");
  if (!th) return;
  const key = th.dataset.sortKey;
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = STAT_KEYS.has(key) ? "desc" : "asc";
  }
  renderTable();
}

function renderTable() {
  const entries = team
    .map((p, slot) => p ? { pokemon: p, slot } : null)
    .filter(Boolean);
  if (!entries.length) {
    tableBody.innerHTML = "";
    if (viewMode === "table") tableEmpty.style.display = "block";
    updateSortIndicators();
    return;
  }
  tableEmpty.style.display = "none";
  const sorted = applyTableSort(entries);
  tableBody.innerHTML = sorted.map(rowHTML).join("");
  updateSortIndicators();
}

function setViewMode(mode) {
  viewMode = mode === "table" ? "table" : "slots";
  try { localStorage.setItem(VIEW_KEY, viewMode); } catch { /* private mode */ }
  for (const btn of viewToggle.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.view === viewMode);
  }
  teamEl.style.display    = viewMode === "slots" ? "" : "none";
  tableWrap.style.display = viewMode === "table" ? "" : "none";
  if (viewMode === "table") {
    renderTable();
  } else {
    tableEmpty.style.display = "none";
  }
}

// --- Calculations ---------------------------------------------------------

function computeDefensiveMatrix() {
  const matrix = {};
  for (const t of TYPE_LIST) matrix[t] = [];
  for (const p of team) {
    if (!p) continue;
    const mults = defensiveMatchups(p.types || [], p.abilities || []);
    for (const t of TYPE_LIST) {
      matrix[t].push({ member: p, mult: mults[t] });
    }
  }
  return matrix;
}

function getOffensiveMoveTypes(slotIdx) {
  const types = [];
  for (const slug of teamMoves[slotIdx]) {
    if (!slug) continue;
    const m = MOVES_BY_SLUG.get(slug);
    if (!m || m.category === "Status") continue;
    if (!types.includes(m.type)) types.push(m.type);
  }
  return types;
}

function computeOffensiveCoverage() {
  const out = {};
  for (const t of TYPE_LIST) out[t] = { best: -Infinity, hitters: [] };

  for (let i = 0; i < TEAM_SIZE; i++) {
    const p = team[i];
    if (!p) continue;
    const moveTypes = getOffensiveMoveTypes(i);
    if (!moveTypes.length) continue;

    const mults = offensiveMatchups(moveTypes);
    for (const def of TYPE_LIST) {
      const m = mults[def];
      if (m > out[def].best) out[def].best = m;
      if (m >= 2) {
        const viaMoves = teamMoves[i]
          .filter(slug => slug && MOVES_BY_SLUG.has(slug))
          .map(slug => MOVES_BY_SLUG.get(slug))
          .filter(mv => mv.category !== "Status" && ((TYPE_CHART[mv.type] || {})[def] ?? 1) >= 2);
        out[def].hitters.push({ member: p, viaMoves });
      }
    }
  }

  for (const t of TYPE_LIST) if (out[t].best === -Infinity) out[t].best = 1;
  return out;
}

// --- Rendering: defensive matrix & summary --------------------------------

function renderDefensiveMatrix(matrix) {
  const members = team.filter(Boolean);
  if (!members.length) {
    defMatrixEl.innerHTML = `<p class="empty-msg">Add at least one Pokémon to see defensive matchups.</p>`;
    return;
  }

  const headerCells = members.map(p => {
    const src = spriteFor(p);
    const initial = escapeHTML((p.name || "?")[0]);
    const thumb = src
      ? `<img src="${src}" alt="${escapeHTML(p.name)}" loading="lazy">`
      : `<span class="tb-mini-ph">${initial}</span>`;
    return `<th class="tb-matrix-th" title="${escapeHTML(p.name)}">
      <span class="tb-matrix-th-inner">${thumb}<span class="tb-matrix-th-name">${escapeHTML(p.name)}</span></span>
    </th>`;
  }).join("");

  const rows = TYPE_LIST.map(atk => {
    const entries = matrix[atk];
    let worst = -Infinity;
    const cells = entries.map(({ member, mult }) => {
      if (mult > worst) worst = mult;
      return `<td class="tb-matrix-cell ${multClass(mult)}" title="${escapeHTML(member.name)}: ${multLabel(mult)}">${multLabel(mult)}</td>`;
    }).join("");
    const worstClass = worst >= 4 ? "tb-worst-4" : worst >= 3 ? "tb-worst-3" : worst >= 2 ? "tb-worst-2" : worst > 1 ? "tb-worst-15" : "";
    return `<tr>
      <th class="tb-matrix-row-head">${typeBadge(atk, true)}</th>
      ${cells}
      <td class="tb-matrix-worst ${worstClass}">${multLabel(worst)}</td>
    </tr>`;
  }).join("");

  defMatrixEl.innerHTML = `
    <div class="tb-matrix-wrap">
      <table class="tb-matrix">
        <thead>
          <tr>
            <th class="tb-matrix-corner">Attacker ↓</th>
            ${headerCells}
            <th class="tb-matrix-th tb-matrix-worst-head" title="Worst case multiplier on the team">Worst</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderDefensiveSummary(matrix) {
  const members = team.filter(Boolean);
  if (!members.length) {
    defSummaryEl.innerHTML = `<p class="empty-msg">Team summary appears once you add a Pokémon.</p>`;
    return;
  }

  const rows = TYPE_LIST.map(atk => {
    const entries = matrix[atk];
    let weak = 0, resist = 0, immune = 0, neutral = 0;
    let worst = -Infinity, best = Infinity;
    for (const e of entries) {
      const b = bucketOf(e.mult);
      if (b === "weak")    weak++;
      if (b === "resist")  resist++;
      if (b === "immune")  immune++;
      if (b === "neutral") neutral++;
      if (e.mult > worst)  worst = e.mult;
      if (e.mult < best)   best = e.mult;
    }
    const risk = weak > 0 && resist + immune === 0;
    const cls  = risk ? "tb-sum-risk" : (resist + immune) >= weak ? "tb-sum-ok" : "";
    return `<tr class="${cls}">
      <td class="tb-sum-type">${typeBadge(atk, true)}</td>
      <td class="tb-sum-cell ${weak ? "tb-sum-weak" : ""}">${weak}</td>
      <td class="tb-sum-cell">${neutral}</td>
      <td class="tb-sum-cell ${resist ? "tb-sum-resist" : ""}">${resist}</td>
      <td class="tb-sum-cell ${immune ? "tb-sum-immune" : ""}">${immune}</td>
      <td class="tb-sum-cell ${multClass(worst)}">${multLabel(worst)}</td>
      <td class="tb-sum-cell ${multClass(best)}">${multLabel(best)}</td>
    </tr>`;
  }).join("");

  defSummaryEl.innerHTML = `
    <div class="tb-matrix-wrap">
      <table class="tb-summary-table">
        <thead>
          <tr>
            <th>Type</th>
            <th title="Members weak (>1×) to this type">Weak</th>
            <th title="Members neutral (1×)">Neutral</th>
            <th title="Members resistant (&lt;1×, non-zero)">Resist</th>
            <th title="Members immune (0×)">Immune</th>
            <th title="Worst multiplier anyone takes">Worst</th>
            <th title="Best multiplier anyone takes">Best</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// --- Rendering: offensive coverage ----------------------------------------

function renderOffensiveCoverage(cov) {
  const members = team.filter(Boolean);
  if (!members.length) {
    offCoverageEl.innerHTML = `<p class="empty-msg">Offensive coverage appears once you add a Pokémon.</p>`;
    return;
  }

  const rows = TYPE_LIST.map(def => {
    const { best, hitters } = cov[def];
    const hittersHtml = hitters.length
      ? hitters.map(h => {
          const via = h.viaMoves.map(m =>
            `<span class="type sm ${typeClass(m.type)}">${escapeHTML(m.name)}</span>`
          ).join("");
          const moveNames = h.viaMoves.map(m => m.name).join(", ");
          return `<span class="tb-hitter" title="${escapeHTML(h.member.name)}: ${escapeHTML(moveNames)}">
            <span class="tb-hitter-name">${escapeHTML(h.member.name)}</span>
            ${via}
          </span>`;
        }).join("")
      : `<span class="tb-hitter-empty">—</span>`;
    return `<tr>
      <td class="tb-sum-type">${typeBadge(def, true)}</td>
      <td class="tb-sum-cell ${multClass(best)}">${multLabel(best)}</td>
      <td class="tb-sum-cell tb-sum-count">${hitters.length}</td>
      <td class="tb-hitters-cell">${hittersHtml}</td>
    </tr>`;
  }).join("");

  offCoverageEl.innerHTML = `
    <div class="tb-matrix-wrap">
      <table class="tb-summary-table tb-coverage-table">
        <thead>
          <tr>
            <th>Defender</th>
            <th title="Best move effectiveness any team member can deal">Best</th>
            <th title="Team members with a super-effective move">SE hitters</th>
            <th>Covered by</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// --- Rendering: strengths & gaps ------------------------------------------

function renderStrengthsAndGaps(matrix, cov) {
  const members = team.filter(Boolean);
  if (!members.length) {
    gapsEl.innerHTML = `<p class="empty-msg">Analysis appears once you add a Pokémon.</p>`;
    return;
  }

  const shared = TYPE_LIST
    .map(atk => {
      const weak = matrix[atk].filter(e => e.mult > 1);
      return { atk, count: weak.length, members: weak.map(e => e.member), worst: weak.reduce((m, e) => Math.max(m, e.mult), 0) };
    })
    .filter(x => x.count >= 2)
    .sort((a, b) => b.count - a.count || b.worst - a.worst);

  const blind = TYPE_LIST.filter(def => cov[def].hitters.length === 0);

  const allResist = TYPE_LIST.filter(atk => {
    const entries = matrix[atk];
    return entries.length > 0 && entries.every(e => e.mult < 1);
  });

  const sharedHtml = shared.length
    ? `<ul class="tb-list tb-list-bad">${shared.map(s => `
        <li>
          ${typeBadge(s.atk, true)}
          <span class="tb-list-text">${s.count} members weak (worst ${multLabel(s.worst)})</span>
          <span class="tb-list-members">${s.members.map(m => escapeHTML(m.name)).join(", ")}</span>
        </li>`).join("")}</ul>`
    : `<p class="tb-list-ok">No shared weaknesses — every attacking type hits at most one member super-effectively.</p>`;

  const blindHtml = blind.length
    ? `<ul class="tb-list tb-list-bad">${blind.map(t => `
        <li>
          ${typeBadge(t, true)}
          <span class="tb-list-text">No team member has a move that hits this for 2×+</span>
        </li>`).join("")}</ul>`
    : `<p class="tb-list-ok">Your team has moves that hit every type for at least 2×.</p>`;

  const resistHtml = allResist.length
    ? `<ul class="tb-list tb-list-good">${allResist.map(t => `
        <li>
          ${typeBadge(t, true)}
          <span class="tb-list-text">Every team member resists this type</span>
        </li>`).join("")}</ul>`
    : `<p class="tb-list-neutral">No type is resisted by every team member.</p>`;

  gapsEl.innerHTML = `
    <h3>Shared weaknesses</h3>
    ${sharedHtml}
    <h3>Offensive blind spots</h3>
    ${blindHtml}
    <h3>Team-wide resistances</h3>
    ${resistHtml}`;
}

// --- Rendering: type distribution -----------------------------------------

function renderTypeDist() {
  const members = team.filter(Boolean);
  if (!members.length) {
    typeDistEl.innerHTML = `<p class="empty-msg">Type distribution appears once you add a Pokémon.</p>`;
    return;
  }

  const typeCount = {};
  for (const t of TYPE_LIST) typeCount[t] = 0;
  for (const p of members) {
    for (const t of (p.types || [])) {
      if (typeCount[t] !== undefined) typeCount[t]++;
    }
  }

  const bars = TYPE_LIST.map(t => {
    const n = typeCount[t];
    const pct = members.length ? Math.round((n / members.length) * 100) : 0;
    return `<div class="tb-dist-row ${n === 0 ? "tb-dist-zero" : ""}">
      <span class="tb-dist-label">${typeBadge(t, true)}</span>
      <div class="tb-dist-bar"><div class="tb-dist-fill type ${typeClass(t)}" style="width:${pct}%"></div></div>
      <span class="tb-dist-count">${n}</span>
    </div>`;
  }).join("");

  typeDistEl.innerHTML = `
    <p class="tb-caption">Count of team members with each type (both types count for dual-typed Pokémon).</p>
    <div class="tb-dist-grid">${bars}</div>`;
}

// --- Pokémon picker modal -------------------------------------------------

function openPicker(slotIdx) {
  pickerSlotIdx = slotIdx;
  pickerSearch.value = "";
  pickerTypeFilter.clear();
  for (const c of pickerChips.querySelectorAll(".type-chip.active")) c.classList.remove("active");
  renderPickerList();
  pickerEl.hidden = false;
  document.body.classList.add("tb-picker-open");
  requestAnimationFrame(() => pickerSearch.focus());
}

function closePicker() {
  pickerEl.hidden = true;
  document.body.classList.remove("tb-picker-open");
  pickerSlotIdx = -1;
}

function renderPickerChips() {
  pickerChips.innerHTML = TYPE_LIST.map(t =>
    `<span class="type-chip type ${typeClass(t)}" data-type="${t}">${t}</span>`
  ).join("");
  pickerChips.addEventListener("click", e => {
    const el = e.target.closest(".type-chip");
    if (!el) return;
    const t = el.dataset.type;
    if (pickerTypeFilter.has(t)) { pickerTypeFilter.delete(t); el.classList.remove("active"); }
    else { pickerTypeFilter.add(t); el.classList.add("active"); }
    renderPickerList();
  });
}

function renderPickerList() {
  const q = pickerSearch.value.trim().toLowerCase();
  const qDex = q.replace(/^#/, "");
  const filtered = POKEDEX.filter(p => {
    if (pickerTypeFilter.size && !(p.types || []).some(t => pickerTypeFilter.has(t))) return false;
    if (!q) return true;
    const n = (p.name || "").toLowerCase();
    const d = p.dex || "";
    return n.includes(q) || d.includes(qDex);
  });

  pickerEmpty.style.display = filtered.length ? "none" : "block";

  const capped = filtered.slice(0, 200);
  const more = filtered.length - capped.length;

  pickerList.innerHTML = capped.map(p => {
    const src = spriteFor(p);
    const initial = escapeHTML((p.name || "?")[0]);
    const sprite = src
      ? `<img class="tb-picker-sprite" loading="lazy" src="${src}" alt=""
            onerror="this.outerHTML='<span class=\\'tb-picker-ph\\'>${initial}</span>'">`
      : `<span class="tb-picker-ph">${initial}</span>`;
    const nameHtml = p.is_variant ? `<span class="odyssey">${escapeHTML(p.name)}</span>` : escapeHTML(p.name);
    let badge = "";
    if (p.is_battle_bond) badge = `<span class="row-tag tag-bb">B.B.</span>`;
    else if (p.is_event)  badge = `<span class="row-tag tag-event">Event</span>`;
    return `<button class="tb-picker-item" type="button" data-slug="${escapeHTML(p.slug)}">
      ${sprite}
      <span class="tb-picker-item-body">
        <span class="tb-picker-item-head">
          <span class="tb-picker-item-name">${nameHtml}</span>
          <span class="dim">${p.dex ? "#" + escapeHTML(p.dex) : ""}</span>
          ${badge}
        </span>
        <span class="tb-picker-item-types">${(p.types || []).map(t => typeBadge(t)).join("")}</span>
      </span>
    </button>`;
  }).join("") + (more > 0 ? `<div class="tb-picker-more hint">…and ${more} more — refine the search.</div>` : "");
}

function onPickerClick(e) {
  const btn = e.target.closest(".tb-picker-item");
  if (!btn) return;
  const slug = btn.dataset.slug;
  const p = POKEDEX_BY_SLUG.get(slug);
  if (!p || pickerSlotIdx < 0) return;
  team[pickerSlotIdx] = p;
  teamMoves[pickerSlotIdx] = [null, null, null, null];
  teamItems[pickerSlotIdx] = null;
  saveTeam();
  closePicker();
  renderAll();
}

// --- Move picker modal ----------------------------------------------------

function openMovePicker(teamSlotIdx, moveSlotIdx) {
  const p = team[teamSlotIdx];
  if (!p) return;
  movePickerSlotIdx = teamSlotIdx;
  movePickerMoveSlot = moveSlotIdx;
  movePickerTitle.textContent = `Move ${moveSlotIdx + 1} — ${p.name}`;
  movePickerSearch.value = "";
  renderMovePickerList();
  movePickerEl.hidden = false;
  document.body.classList.add("tb-picker-open");
  requestAnimationFrame(() => movePickerSearch.focus());
}

function closeMovePicker() {
  movePickerEl.hidden = true;
  document.body.classList.remove("tb-picker-open");
  movePickerSlotIdx = -1;
  movePickerMoveSlot = -1;
}

/** Return a Pokemon's learnable moves in a stable order (by level, then name).
 *  This order is the source of truth for URL move indices — encoding and
 *  decoding must both call this function to stay in sync. */
function getLearnset(p) {
  const seen = new Set();
  return (p.moves || [])
    .filter(entry => {
      if (!entry.slug || seen.has(entry.slug) || !MOVES_BY_SLUG.has(entry.slug)) return false;
      seen.add(entry.slug);
      return true;
    })
    .map(entry => {
      const lvl = parseInt(entry.level, 10);
      return { move: MOVES_BY_SLUG.get(entry.slug), level: isNaN(lvl) ? 9999 : lvl };
    })
    .sort((a, b) => a.level - b.level || a.move.name.localeCompare(b.move.name))
    .map(e => e.move);
}

function encodeTeamForUrl() {
  const parts = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    const p = team[i];
    if (!p) continue;
    const learnset = getLearnset(p);
    const moveIndices = teamMoves[i].map(slug => {
      if (!slug) return "_";
      const idx = learnset.findIndex(m => m.slug === slug);
      return idx >= 0 ? String(idx) : "_";
    });
    const itemIdx = teamItems[i] ? HOLDABLE_ITEMS.findIndex(it => it.slug === teamItems[i]) : -1;
    parts.push(`${p.slug}:${moveIndices.join(".")}:${itemIdx >= 0 ? itemIdx : "_"}`);
  }
  return parts.join(",");
}

function renderMovePickerList() {
  const p = team[movePickerSlotIdx];
  if (!p) return;

  const currentSlug = teamMoves[movePickerSlotIdx][movePickerMoveSlot];
  const learnable = getLearnset(p);

  const q = movePickerSearch.value.trim().toLowerCase();
  const filtered = q ? learnable.filter(m => m.name.toLowerCase().includes(q)) : learnable;

  movePickerEmpty.style.display = filtered.length ? "none" : "block";

  const clearHtml = currentSlug
    ? `<button class="tb-move-picker-clear" type="button" data-clear="1">× Clear this move</button>`
    : "";

  movePickerList.innerHTML = clearHtml + filtered.map(m => {
    const catAbbr = m.category === "Physical" ? "Phys" : m.category === "Special" ? "Spec" : "Status";
    const pwr = typeof m.power === "number" ? m.power : "—";
    const isSelected = m.slug === currentSlug;
    return `<button class="tb-picker-item tb-move-item${isSelected ? " tb-move-item-selected" : ""}"
              type="button" data-slug="${escapeHTML(m.slug)}">
      <span class="tb-move-item-head">
        ${typeBadge(m.type, true)}
        <span class="tb-move-cat">${escapeHTML(catAbbr)}</span>
        <span class="tb-move-name">${escapeHTML(m.name)}</span>
        <span class="tb-move-stats dim">Pwr:&nbsp;${pwr}&ensp;PP:&nbsp;${m.pp ?? "—"}</span>
      </span>
      ${m.effect ? `<span class="tb-move-desc">${escapeHTML(m.effect)}</span>` : ""}
    </button>`;
  }).join("");
}

function onMovePickerClick(e) {
  if (e.target.closest("[data-clear]")) {
    teamMoves[movePickerSlotIdx][movePickerMoveSlot] = null;
    saveTeam();
    closeMovePicker();
    renderAll();
    return;
  }
  const btn = e.target.closest(".tb-move-item");
  if (!btn) return;
  const slug = btn.dataset.slug;
  if (!slug || movePickerSlotIdx < 0) return;
  teamMoves[movePickerSlotIdx][movePickerMoveSlot] = slug;
  saveTeam();
  closeMovePicker();
  renderAll();
}

// --- Item picker modal ----------------------------------------------------

function openItemPicker(teamSlotIdx) {
  const p = team[teamSlotIdx];
  if (!p) return;
  itemPickerSlotIdx = teamSlotIdx;
  itemPickerTitle.textContent = `Held Item — ${p.name}`;
  itemPickerSearch.value = "";
  renderItemPickerList();
  itemPickerEl.hidden = false;
  document.body.classList.add("tb-picker-open");
  requestAnimationFrame(() => itemPickerSearch.focus());
}

function closeItemPicker() {
  itemPickerEl.hidden = true;
  document.body.classList.remove("tb-picker-open");
  itemPickerSlotIdx = -1;
}

function renderItemPickerList() {
  const currentSlug = teamItems[itemPickerSlotIdx];
  const q = itemPickerSearch.value.trim().toLowerCase();
  const filtered = q ? HOLDABLE_ITEMS.filter(i => i.name.toLowerCase().includes(q)) : HOLDABLE_ITEMS;

  itemPickerEmpty.style.display = filtered.length ? "none" : "block";

  const clearHtml = currentSlug
    ? `<button class="tb-move-picker-clear" type="button" data-clear="1">× Remove held item</button>`
    : "";

  itemPickerList.innerHTML = clearHtml + filtered.map(item => {
    const isSelected = item.slug === currentSlug;
    const sources = formatSources(item.sources);
    return `<button class="tb-picker-item tb-item-item${isSelected ? " tb-move-item-selected" : ""}"
              type="button" data-slug="${escapeHTML(item.slug)}">
      <span class="tb-item-item-name">${escapeHTML(item.name)}</span>
      ${sources ? `<span class="tb-item-item-src">${sources}</span>` : ""}
    </button>`;
  }).join("");
}

function onItemPickerClick(e) {
  if (e.target.closest("[data-clear]")) {
    teamItems[itemPickerSlotIdx] = null;
    saveTeam();
    closeItemPicker();
    renderAll();
    return;
  }
  const btn = e.target.closest(".tb-item-item");
  if (!btn) return;
  const slug = btn.dataset.slug;
  if (!slug || itemPickerSlotIdx < 0) return;
  teamItems[itemPickerSlotIdx] = slug;
  saveTeam();
  closeItemPicker();
  renderAll();
}

// --- Main render ----------------------------------------------------------

function renderAll() {
  renderTeam();
  renderTable();
  const matrix = computeDefensiveMatrix();
  const coverage = computeOffensiveCoverage();
  renderDefensiveMatrix(matrix);
  renderDefensiveSummary(matrix);
  renderOffensiveCoverage(coverage);
  renderStrengthsAndGaps(matrix, coverage);
  renderTypeDist();
}

// --- Event wiring ---------------------------------------------------------

teamEl.addEventListener("click", e => {
  const removeBtn = e.target.closest("[data-remove]");
  if (removeBtn) {
    const i = +removeBtn.dataset.remove;
    team[i] = null;
    teamMoves[i] = [null, null, null, null];
    teamItems[i] = null;
    saveTeam();
    renderAll();
    return;
  }
  const moveBtn = e.target.closest("[data-move-slot]");
  if (moveBtn) {
    openMovePicker(+moveBtn.dataset.teamSlot, +moveBtn.dataset.moveSlot);
    return;
  }
  const itemBtn = e.target.closest("[data-item-slot]");
  if (itemBtn) {
    openItemPicker(+itemBtn.dataset.itemSlot);
    return;
  }
  const slotBtn = e.target.closest("[data-slot]");
  if (slotBtn) {
    openPicker(+slotBtn.dataset.slot);
  }
});

tableWrap.addEventListener("click", e => {
  const removeBtn = e.target.closest("[data-remove]");
  if (!removeBtn) return;
  const i = +removeBtn.dataset.remove;
  team[i] = null;
  teamMoves[i] = [null, null, null, null];
  teamItems[i] = null;
  saveTeam();
  renderAll();
});

document.querySelector("#tb-table thead").addEventListener("click", onTableHeaderClick);

viewToggle.addEventListener("click", e => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  setViewMode(btn.dataset.view);
});

clearBtn.addEventListener("click", () => {
  if (!team.some(Boolean)) return;
  team = new Array(TEAM_SIZE).fill(null);
  teamMoves = emptyMoves();
  teamItems = new Array(TEAM_SIZE).fill(null);
  saveTeam();
  renderAll();
});

shareBtn.addEventListener("click", async () => {
  const encoded = encodeTeamForUrl();
  if (!encoded) {
    shareStatusEl.textContent = "Add at least one Pokémon first.";
    return;
  }
  const url = `${location.origin}${location.pathname}?team=${encodeURIComponent(encoded)}`;
  try {
    await navigator.clipboard.writeText(url);
    shareStatusEl.textContent = "Link copied to clipboard.";
  } catch {
    shareStatusEl.textContent = url;
  }
  setTimeout(() => { if (shareStatusEl.textContent && shareStatusEl.textContent.startsWith("Link")) shareStatusEl.textContent = ""; }, 2400);
});

// Pokémon picker events
pickerSearch.addEventListener("input", renderPickerList);
pickerList.addEventListener("click", onPickerClick);
pickerClose.addEventListener("click", closePicker);
pickerEl.addEventListener("click", e => { if (e.target === pickerEl) closePicker(); });

// Move picker events
movePickerSearch.addEventListener("input", renderMovePickerList);
movePickerList.addEventListener("click", onMovePickerClick);
movePickerClose.addEventListener("click", closeMovePicker);
movePickerEl.addEventListener("click", e => { if (e.target === movePickerEl) closeMovePicker(); });

// Item picker events
itemPickerSearch.addEventListener("input", renderItemPickerList);
itemPickerList.addEventListener("click", onItemPickerClick);
itemPickerClose.addEventListener("click", closeItemPicker);
itemPickerEl.addEventListener("click", e => { if (e.target === itemPickerEl) closeItemPicker(); });

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!itemPickerEl.hidden) closeItemPicker();
    else if (!movePickerEl.hidden) closeMovePicker();
    else if (!pickerEl.hidden) closePicker();
  }
});

// --- Bootstrap ------------------------------------------------------------

async function main() {
  try {
    const [pokedex, movesData, itemsData, meta] = await Promise.all([
      fetch("data/pokedex.json").then(r => r.json()),
      fetch("data/moves.json").then(r => r.json()),
      fetch("data/items.json").then(r => r.json()),
      fetch("data/meta.json").then(r => r.json()).catch(() => null),
    ]);

    POKEDEX = pokedex;
    POKEDEX_BY_SLUG = new Map(POKEDEX.map(p => [p.slug, p]));

    MOVES = movesData.moves || movesData;
    MOVES_BY_SLUG = new Map(MOVES.map(m => [m.slug, m]));

    ITEMS = itemsData.items || itemsData;
    ITEMS_BY_SLUG = new Map(ITEMS.map(i => [i.slug, i]));
    HOLDABLE_ITEMS = ITEMS.filter(isHoldable).sort((a, b) => a.name.localeCompare(b.name));

    if (meta && meta.counts) {
      metaEl.innerHTML =
        `Build a team of up to 6 Pokémon and see live type coverage using the Odyssey type chart ` +
        `(18 types, <span class="t-aether-text">Aether</span> replaces Fairy). ` +
        `<span class="dim">${meta.counts.species} species indexed, including ${meta.counts.variants} Etrian Variants.</span>`;
    }

    const loaded = loadTeamData();
    team = loaded.team;
    teamMoves = loaded.teamMoves;
    teamItems = loaded.teamItems;

    renderPickerChips();
    renderAll();
    setViewMode(viewMode);
  } catch (e) {
    teamEl.innerHTML =
      `<p class="empty-msg">Failed to load data: ${escapeHTML(e.message)}. ` +
      `Run <code>python3 scripts/build_data.py</code>, then serve with ` +
      `<code>python3 -m http.server 8000 --directory site</code>.</p>`;
  }
}
main();
