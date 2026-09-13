const ICON_ROOT = "https://wow.zamimg.com/images/wow/icons/large/";

const state = { data: null, classId: "warrior", points: {}, selectedTalent: null, faction: "all" };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function iconUrl(icon) { return `${ICON_ROOT}${String(icon).toLowerCase()}.jpg`; }
function currentClass() { return state.data.classes.find((entry) => entry.id === state.classId); }
function currentRank(talent) { return state.points[talent.id] || 0; }
function pointsInTree(tree) { return tree.talents.reduce((sum, talent) => sum + currentRank(talent), 0); }
function totalPoints() { return Object.values(state.points).reduce((sum, rank) => sum + rank, 0); }

function canAdd(tree, talent) {
  const rank = currentRank(talent);
  if (rank >= talent.maxRanks || totalPoints() >= 51) return false;
  if (pointsInTree(tree) < (talent.row - 1) * 5) return false;
  if (talent.requires) {
    const required = tree.talents.find((item) => item.id === talent.requires.talentId);
    if (!required || currentRank(required) < talent.requires.ranks) return false;
  }
  return true;
}

function buildIsValid(classEntry, points) {
  for (const tree of classEntry.trees) {
    for (const talent of tree.talents) {
      const rank = points[talent.id] || 0;
      if (!rank) continue;
      const lowerTierPoints = tree.talents.filter((item) => item.row < talent.row).reduce((sum, item) => sum + (points[item.id] || 0), 0);
      if (lowerTierPoints < (talent.row - 1) * 5) return false;
      if (talent.requires && (points[talent.requires.talentId] || 0) < talent.requires.ranks) return false;
    }
  }
  return true;
}

function pointsAreValid(classEntry, points) {
  const talents = new Map(classEntry.trees.flatMap((tree) => tree.talents).map((talent) => [talent.id, talent]));
  for (const [id, rank] of Object.entries(points)) {
    const talent = talents.get(id);
    if (!talent || !Number.isInteger(rank) || rank < 1 || rank > talent.maxRanks) return false;
  }
  return Object.values(points).reduce((sum, rank) => sum + rank, 0) <= 51 && buildIsValid(classEntry, points);
}

function changeTalent(tree, talent, delta) {
  const rank = currentRank(talent);
  if (delta > 0 && !canAdd(tree, talent)) return;
  if (delta < 0 && rank === 0) return;
  const next = { ...state.points, [talent.id]: rank + delta };
  if (next[talent.id] === 0) delete next[talent.id];
  if (delta < 0 && !buildIsValid(currentClass(), next)) return showToast("Remove dependent talents first");
  state.points = next;
  state.selectedTalent = { tree, talent };
  updateHash();
  renderTrees();
}

function drawDependencies(tree, grid) {
  for (const talent of tree.talents.filter((item) => item.requires)) {
    const source = tree.talents.find((item) => item.id === talent.requires.talentId);
    if (!source) continue;
    const startX = (source.column - .5) * (grid.clientWidth / 4);
    const startY = 20 + (source.row - 1) * 66 + 50;
    const endX = (talent.column - .5) * (grid.clientWidth / 4);
    const endY = 20 + (talent.row - 1) * 66;
    const dx = endX - startX;
    const dy = endY - startY;
    const line = document.createElement("span");
    line.className = `dependency${currentRank(source) >= talent.requires.ranks ? " is-active" : ""}`;
    line.style.left = `${startX}px`;
    line.style.top = `${startY}px`;
    line.style.height = `${Math.hypot(dx, dy)}px`;
    line.style.transform = `rotate(${-Math.atan2(dx, dy) * 180 / Math.PI}deg)`;
    grid.prepend(line);
  }
}

function renderTrees() {
  const classEntry = currentClass();
  $("#total-points").textContent = totalPoints();
  const container = $("#talent-trees");
  container.innerHTML = "";
  for (const tree of classEntry.trees) {
    const article = document.createElement("article");
    article.className = "tree";
    article.innerHTML = `<header class="tree-head"><h2>${tree.name}</h2><span class="tree-points"><strong>${pointsInTree(tree)}</strong> points</span></header><div class="tree-grid"></div>`;
    const grid = $(".tree-grid", article);
    for (const talent of tree.talents) {
      const rank = currentRank(talent);
      const available = canAdd(tree, talent);
      const button = document.createElement("button");
      button.className = `talent${rank ? " has-points" : ""}${rank === talent.maxRanks ? " is-maxed" : ""}${available ? " is-available" : ""}`;
      button.style.gridRow = talent.row;
      button.style.gridColumn = talent.column;
      button.dataset.locked = String(!available && rank === 0);
      button.setAttribute("aria-label", `${talent.name}, ${rank} de ${talent.maxRanks}`);
      button.innerHTML = `<img src="${iconUrl(talent.icon)}" alt="" loading="lazy"><span class="rank">${rank}/${talent.maxRanks}</span>`;
      button.addEventListener("click", (event) => { changeTalent(tree, talent, 1); showTalentTooltip(tree, talent, event); });
      button.addEventListener("contextmenu", (event) => { event.preventDefault(); changeTalent(tree, talent, -1); showTalentTooltip(tree, talent, event); });
      button.addEventListener("mouseenter", (event) => showTalentTooltip(tree, talent, event));
      button.addEventListener("mousemove", positionTalentTooltip);
      button.addEventListener("mouseleave", hideTalentTooltip);
      button.addEventListener("focus", () => showTalentTooltip(tree, talent, null, button));
      button.addEventListener("blur", hideTalentTooltip);
      grid.append(button);
    }
    container.append(article);
    requestAnimationFrame(() => drawDependencies(tree, grid));
  }
}

function showTalentTooltip(tree, talent, event, anchor) {
  state.selectedTalent = { tree, talent };
  const rank = currentRank(talent);
  const descriptionIndex = Math.min(rank, talent.descriptions.length - 1);
  const displayRank = rank === talent.maxRanks ? rank : rank + 1;
  const requirements = [];
  const tierPoints = (talent.row - 1) * 5;
  if (tierPoints) requirements.push({ met: pointsInTree(tree) >= tierPoints, text: `Requires ${tierPoints} points in ${tree.name}` });
  if (talent.requires) {
    const required = tree.talents.find((item) => item.id === talent.requires.talentId);
    requirements.push({ met: required && currentRank(required) >= talent.requires.ranks, text: `Requires ${talent.requires.ranks} points in ${required?.name || talent.requires.talentId}` });
  }
  const tooltip = $("#talent-tooltip");
  tooltip.innerHTML = `<div class="tooltip-head"><strong>${talent.name}</strong><span class="tooltip-rank">Rank ${displayRank}/${talent.maxRanks}</span></div>${requirements.map((item) => `<p class="tooltip-requirement${item.met ? " is-met" : ""}">${item.text}</p>`).join("")}<p class="tooltip-description">${talent.descriptions[descriptionIndex]}</p><p class="tooltip-hint">Click to learn · Right-click to unlearn</p>`;
  tooltip.classList.add("is-visible");
  tooltip.setAttribute("aria-hidden", "false");
  if (event) positionTalentTooltip(event);
  else if (anchor) {
    const rect = anchor.getBoundingClientRect();
    positionTalentTooltip({ clientX: rect.right, clientY: rect.top });
  }
}

function positionTalentTooltip(event) {
  const tooltip = $("#talent-tooltip");
  if (!tooltip.classList.contains("is-visible") || matchMedia("(max-width: 720px)").matches) return;
  const gap = 16;
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const left = event.clientX + gap + width > innerWidth ? event.clientX - width - gap : event.clientX + gap;
  const top = Math.max(10, Math.min(event.clientY + gap, innerHeight - height - 10));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTalentTooltip() {
  const tooltip = $("#talent-tooltip");
  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
}

function renderClassPicker() {
  const picker = $("#class-picker");
  picker.innerHTML = state.data.classes.map((entry) => `<button class="class-chip${entry.id === state.classId ? " is-active" : ""}" style="--class-color:${entry.color}" data-class="${entry.id}" role="option" aria-selected="${entry.id === state.classId}"><img class="class-icon" src="${iconUrl(entry.icon)}" alt=""><span>${entry.name}</span></button>`).join("");
  $$(".class-chip", picker).forEach((button) => button.addEventListener("click", () => {
    state.classId = button.dataset.class;
    state.points = {};
    state.selectedTalent = null;
    renderClassPicker();
    renderTrees();
    updateHash();
  }));
}

function updateHash() {
  const encoded = Object.entries(state.points).map(([id, rank]) => `${id}:${rank}`).join(",");
  history.replaceState(null, "", `#talents/${state.classId}${encoded ? `/${encoded}` : ""}`);
}

function loadHash() {
  const match = location.hash.match(/^#talents\/([^/]+)(?:\/(.+))?$/);
  if (!match || !state.data.classes.some((entry) => entry.id === match[1])) return;
  state.classId = match[1];
  state.points = {};
  if (match[2]) {
    for (const pair of match[2].split(",")) {
      const [id, rank] = pair.split(":");
      if (id && Number.isInteger(Number(rank))) state.points[id] = Number(rank);
    }
  }
  if (!pointsAreValid(currentClass(), state.points)) state.points = {};
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function renderRaces(races) {
  const filtered = state.faction === "all" ? races : races.filter((race) => race.faction === state.faction);
  $("#race-grid").innerHTML = filtered.map((race) => `<article class="race-card"><header class="card-top"><h2>${race.name}</h2><span class="faction">${race.faction}</span></header><div class="class-list">${race.classes.map((id) => { const entry = state.data.classes.find((item) => item.id === id); return `<span class="class-pill" style="--class-color:${entry.color}">${entry.name}</span>`; }).join("")}</div><ul class="racial-list">${race.racials.map((racial) => `<li><strong>${racial.name}</strong><span class="type">${racial.type}</span><p>${racial.description}</p></li>`).join("")}</ul></article>`).join("");
}

function renderAbilities(abilityData) {
  $("#ability-grid").innerHTML = state.data.classes.map((entry) => {
    const classAbilities = abilityData.find((item) => item.classId === entry.id)?.abilities || [];
    return `<article class="ability-card" style="--class-color:${entry.color}"><header class="card-top"><h2>${entry.name}</h2><span class="count">${classAbilities.length} recorded</span></header>${classAbilities.length ? `<ul class="racial-list">${classAbilities.map((ability) => `<li><strong>${ability.name}</strong><span class="type">${ability.status || "Draft"}</span><p>${ability.description}</p></li>`).join("")}</ul>` : "<p>No new abilities recorded</p>"}</article>`;
  }).join("");
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  try {
    void Promise.resolve(context.registerTool({
      name: "configure_talent_build",
      title: "Configure talent build",
      description: "Select a class and apply a complete Warcraft talent allocation to the visible calculator.",
      inputSchema: {
        type: "object",
        properties: {
          classId: { type: "string", enum: state.data.classes.map((entry) => entry.id) },
          points: { type: "object", additionalProperties: { type: "integer", minimum: 1, maximum: 5 } }
        },
        required: ["classId", "points"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const classEntry = state.data.classes.find((entry) => entry.id === input?.classId);
        if (!classEntry || !input.points || !pointsAreValid(classEntry, input.points)) throw new Error("Invalid talent build");
        state.classId = classEntry.id;
        state.points = { ...input.points };
        state.selectedTalent = null;
        renderClassPicker();
        renderTrees();
        updateHash();
        return { classId: state.classId, totalPoints: totalPoints(), url: location.href };
      }
    }));
  } catch { /* WebMCP is optional and feature-detected. */ }
}

function setupNavigation() {
  $$(".nav-tab").forEach((button) => button.addEventListener("click", () => {
    $$(".nav-tab").forEach((item) => item.classList.toggle("is-active", item === button));
    $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === `${button.dataset.view}-view`));
    if (button.dataset.view !== "talents") history.replaceState(null, "", `#${button.dataset.view}`);
    else updateHash();
  }));
}

async function init() {
  try {
    const [talentsResponse, racesResponse, abilitiesResponse] = await Promise.all([fetch("./data/talents.json"), fetch("./data/races.json"), fetch("./data/abilities.json")]);
    if (!talentsResponse.ok || !racesResponse.ok || !abilitiesResponse.ok) throw new Error("Data unavailable");
    state.data = await talentsResponse.json();
    const races = await racesResponse.json();
    const abilities = await abilitiesResponse.json();
    loadHash();
    renderClassPicker();
    renderTrees();
    renderRaces(races);
    renderAbilities(abilities);
    registerWebMcp();
    setupNavigation();
    $$(".segment").forEach((button) => button.addEventListener("click", () => {
      state.faction = button.dataset.faction;
      $$(".segment").forEach((item) => item.classList.toggle("is-active", item === button));
      renderRaces(races);
    }));
    $("#reset-build").addEventListener("click", () => { state.points = {}; state.selectedTalent = null; updateHash(); renderTrees(); });
    $("#copy-build").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(location.href); showToast("Link copied"); }
      catch { showToast("Could not copy the link"); }
    });
  } catch (error) {
    $("#talent-trees").innerHTML = '<p class="error">Talent data could not be loaded.</p>';
  }
}

init();
