const ICON_ROOT = "https://wow.zamimg.com/images/wow/icons/large/";

const state = {
  data: null,
  classId: "warrior",
  points: {},
  selectedTalent: null,
  faction: "all",
  editor: { data: null, classId: "warrior", treeId: null, selectedTalentId: null, dirty: false }
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const FEATURE_FLAGS = {
  editor: window.APP_FEATURES?.editor === true,
  races: window.APP_FEATURES?.races === true,
  abilities: window.APP_FEATURES?.abilities === true
};

function iconUrl(icon) { return `${ICON_ROOT}${String(icon).toLowerCase()}.jpg`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
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

function setupFeatureFlags() {
  for (const [view, enabled] of Object.entries(FEATURE_FLAGS)) {
    const button = $(`.nav-tab[data-view="${view}"]`);
    const section = $(`#${view}-view`);
    if (button) button.hidden = !enabled;
    if (section) section.hidden = !enabled;
  }
}

function editorClass() {
  return state.editor.data.classes.find((entry) => entry.id === state.editor.classId);
}

function editorTree() {
  return editorClass()?.trees.find((tree) => tree.id === state.editor.treeId);
}

function editorTalent() {
  return editorTree()?.talents.find((talent) => talent.id === state.editor.selectedTalentId);
}

function setEditorStatus(message, isError = false) {
  const status = $("#editor-status");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function markEditorDirty(message = "Unsaved changes — export the YAML when you finish") {
  state.editor.dirty = true;
  setEditorStatus(message);
}

function renderEditorTreeOptions() {
  const classEntry = editorClass();
  const picker = $("#editor-tree");
  picker.innerHTML = classEntry.trees.map((tree) => `<option value="${escapeHtml(tree.id)}">${escapeHtml(tree.name)}</option>`).join("");
  if (!classEntry.trees.some((tree) => tree.id === state.editor.treeId)) state.editor.treeId = classEntry.trees[0].id;
  picker.value = state.editor.treeId;
}

function renderEditorGrid() {
  const tree = editorTree();
  const grid = $("#editor-grid");
  grid.innerHTML = "";
  for (let row = 1; row <= 7; row += 1) {
    for (let column = 1; column <= 4; column += 1) {
      const cell = document.createElement("div");
      cell.className = "editor-cell";
      cell.style.gridRow = row;
      cell.style.gridColumn = column;
      cell.dataset.row = row;
      cell.dataset.column = column;
      cell.addEventListener("dragover", (event) => { event.preventDefault(); cell.classList.add("is-drag-over"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("is-drag-over"));
      cell.addEventListener("drop", (event) => {
        event.preventDefault();
        cell.classList.remove("is-drag-over");
        moveEditorTalent(event.dataTransfer.getData("text/plain"), row, column);
      });
      grid.append(cell);
    }
  }
  for (const talent of tree.talents) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `editor-talent${talent.id === state.editor.selectedTalentId ? " is-selected" : ""}`;
    button.style.gridRow = talent.row;
    button.style.gridColumn = talent.column;
    button.draggable = true;
    button.dataset.talentId = talent.id;
    button.title = `${talent.name} · row ${talent.row}, column ${talent.column}`;
    button.setAttribute("aria-label", `Edit ${talent.name}`);
    button.innerHTML = `<img src="${iconUrl(talent.icon)}" alt=""><span>${escapeHtml(talent.name)}</span>`;
    button.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", talent.id);
    });
    button.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      moveEditorTalent(event.dataTransfer.getData("text/plain"), talent.row, talent.column);
    });
    button.addEventListener("click", () => {
      state.editor.selectedTalentId = talent.id;
      renderEditorGrid();
      renderEditorForm();
    });
    grid.append(button);
  }
  requestAnimationFrame(drawEditorDependencies);
}

function drawEditorDependencies() {
  const grid = $("#editor-grid");
  if (!grid) return;
  $$(".editor-dependency", grid).forEach((line) => line.remove());
  const gridRect = grid.getBoundingClientRect();
  for (const talent of editorTree().talents.filter((item) => item.requires)) {
    const source = $(`.editor-talent[data-talent-id="${CSS.escape(talent.requires.talentId)}"]`, grid);
    const target = $(`.editor-talent[data-talent-id="${CSS.escape(talent.id)}"]`, grid);
    if (!source || !target) continue;
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const startX = sourceRect.left - gridRect.left + sourceRect.width / 2;
    const startY = sourceRect.top - gridRect.top + sourceRect.height / 2;
    const endX = targetRect.left - gridRect.left + targetRect.width / 2;
    const endY = targetRect.top - gridRect.top + targetRect.height / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    const line = document.createElement("span");
    line.className = "editor-dependency";
    line.style.left = `${startX}px`;
    line.style.top = `${startY}px`;
    line.style.height = `${Math.hypot(dx, dy)}px`;
    line.style.transform = `rotate(${-Math.atan2(dx, dy) * 180 / Math.PI}deg)`;
    grid.prepend(line);
  }
}

function moveEditorTalent(talentId, row, column) {
  const tree = editorTree();
  const moving = tree.talents.find((talent) => talent.id === talentId);
  if (!moving || (moving.row === row && moving.column === column)) return;
  const occupant = tree.talents.find((talent) => talent.row === row && talent.column === column);
  const previous = { row: moving.row, column: moving.column };
  moving.row = row;
  moving.column = column;
  if (occupant) {
    occupant.row = previous.row;
    occupant.column = previous.column;
  }
  state.editor.selectedTalentId = moving.id;
  markEditorDirty(occupant ? `Swapped ${moving.name} with ${occupant.name}` : `Moved ${moving.name} to row ${row}, column ${column}`);
  renderEditorGrid();
  renderEditorForm();
}

function renderEditorDescriptions(talent) {
  const container = $("#editor-descriptions");
  container.innerHTML = talent.descriptions.map((description, index) => `<label>Rank ${index + 1}<textarea data-rank="${index}">${escapeHtml(description)}</textarea></label>`).join("");
}

function renderEditorTooltip(talent, rankIndex = 0) {
  const tree = editorTree();
  const preview = $("#editor-tooltip-preview");
  const safeRankIndex = Math.max(0, Math.min(rankIndex, talent.maxRanks - 1));
  const requirement = talent.requires
    ? `<p class="tooltip-requirement">Requires ${talent.requires.ranks} points in ${escapeHtml(tree.talents.find((item) => item.id === talent.requires.talentId)?.name || talent.requires.talentId)}</p>`
    : "";
  preview.innerHTML = `<div class="tooltip-head"><strong>${escapeHtml(talent.name)}</strong><span class="tooltip-rank">Rank ${safeRankIndex + 1}/${talent.maxRanks}</span></div>${requirement}<p class="tooltip-description">${escapeHtml(talent.descriptions[safeRankIndex] || "No description yet")}</p>`;
}

function renderEditorForm() {
  const talent = editorTalent();
  $("#editor-empty").hidden = Boolean(talent);
  const form = $("#editor-form");
  form.hidden = !talent;
  if (!talent) return;
  $("#editor-talent-id").textContent = talent.id;
  $("#editor-id").value = talent.id;
  $("#editor-name").value = talent.name;
  $("#editor-icon").value = talent.icon;
  $("#editor-max-ranks").value = talent.maxRanks;
  $("#editor-row").value = talent.row;
  $("#editor-column").value = talent.column;
  const requiredPicker = $("#editor-requires-talent");
  requiredPicker.innerHTML = `<option value="">None</option>${editorTree().talents.filter((item) => item.id !== talent.id).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}`;
  requiredPicker.value = talent.requires?.talentId || "";
  const ranksInput = $("#editor-requires-ranks");
  ranksInput.disabled = !talent.requires;
  ranksInput.value = talent.requires?.ranks || 1;
  renderEditorDescriptions(talent);
  renderEditorTooltip(talent);
}

function renderEditor() {
  const tree = editorTree();
  $("#editor-tree-name").textContent = tree.name;
  $("#editor-talent-count").textContent = `${tree.talents.length} talents`;
  renderEditorGrid();
  renderEditorForm();
  if (!state.editor.dirty) setEditorStatus("Select a talent or drag it to another cell");
}

function updateEditorPosition(field, value) {
  const talent = editorTalent();
  const next = Number(value);
  const limit = field === "row" ? 7 : 4;
  if (!Number.isInteger(next) || next < 1 || next > limit) {
    setEditorStatus(`${field === "row" ? "Row" : "Column"} must be between 1 and ${limit}`, true);
    renderEditorForm();
    return;
  }
  const row = field === "row" ? next : talent.row;
  const column = field === "column" ? next : talent.column;
  moveEditorTalent(talent.id, row, column);
}

function nextEditorTalentId(tree) {
  let id = "new-talent";
  let suffix = 2;
  while (tree.talents.some((talent) => talent.id === id)) id = `new-talent-${suffix++}`;
  return id;
}

function addEditorTalent() {
  const tree = editorTree();
  let position = null;
  for (let row = 1; row <= 7 && !position; row += 1) {
    for (let column = 1; column <= 4; column += 1) {
      if (!tree.talents.some((talent) => talent.row === row && talent.column === column)) {
        position = { row, column };
        break;
      }
    }
  }
  if (!position) return setEditorStatus("The 7 × 4 grid has no free cells", true);
  const talent = {
    id: nextEditorTalentId(tree),
    name: "New Talent",
    icon: "inv_misc_questionmark",
    row: position.row,
    column: position.column,
    maxRanks: 1,
    descriptions: ["Describe this talent."]
  };
  tree.talents.push(talent);
  state.editor.selectedTalentId = talent.id;
  markEditorDirty("New talent added — rename its ID in the exported YAML if needed");
  renderEditor();
}

function deleteEditorTalent() {
  const tree = editorTree();
  const talent = editorTalent();
  if (!talent) return;
  tree.talents = tree.talents.filter((item) => item.id !== talent.id);
  for (const item of tree.talents) if (item.requires?.talentId === talent.id) delete item.requires;
  state.editor.selectedTalentId = null;
  markEditorDirty(`${talent.name} deleted`);
  renderEditor();
}

function validateEditorTree(tree) {
  const errors = [];
  const ids = new Set();
  const positions = new Set();
  for (const talent of tree.talents) {
    if (!talent.id || ids.has(talent.id)) errors.push(`Duplicate or empty talent ID: ${talent.id || "(empty)"}`);
    ids.add(talent.id);
    const position = `${talent.row}:${talent.column}`;
    if (positions.has(position)) errors.push(`Two talents occupy row ${talent.row}, column ${talent.column}`);
    positions.add(position);
    if (!talent.name.trim() || !talent.icon.trim()) errors.push(`${talent.id} needs a name and icon`);
    if (talent.descriptions.length !== talent.maxRanks || talent.descriptions.some((description) => !description.trim())) errors.push(`${talent.id} needs one non-empty description per rank`);
    if (talent.requires) {
      const required = tree.talents.find((item) => item.id === talent.requires.talentId);
      if (!required) errors.push(`${talent.id} requires an unknown talent`);
      else {
        if (talent.requires.ranks > required.maxRanks) errors.push(`${talent.id} requires more ranks than ${required.id} has`);
      }
    }
  }
  for (const talent of tree.talents) {
    const visited = new Set([talent.id]);
    let current = talent;
    while (current.requires) {
      if (visited.has(current.requires.talentId)) {
        errors.push(`Circular requirement involving ${talent.id}`);
        break;
      }
      visited.add(current.requires.talentId);
      current = tree.talents.find((item) => item.id === current.requires.talentId);
      if (!current) break;
    }
  }
  return errors;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function treeToYaml(tree) {
  const lines = [
    `id: ${yamlString(tree.id)}`,
    `classId: ${yamlString(tree.classId)}`,
    `name: ${yamlString(tree.name)}`,
    `version: ${yamlString(tree.version)}`,
    `status: ${yamlString(tree.status)}`,
    "talents:"
  ];
  for (const talent of tree.talents) {
    lines.push(`  - id: ${yamlString(talent.id)}`);
    lines.push(`    name: ${yamlString(talent.name)}`);
    lines.push(`    icon: ${yamlString(talent.icon)}`);
    lines.push(`    row: ${talent.row}`);
    lines.push(`    column: ${talent.column}`);
    lines.push(`    maxRanks: ${talent.maxRanks}`);
    if (talent.requires) {
      lines.push("    requires:");
      lines.push(`      talentId: ${yamlString(talent.requires.talentId)}`);
      lines.push(`      ranks: ${talent.requires.ranks}`);
    }
    lines.push("    descriptions:");
    for (const description of talent.descriptions) lines.push(`      - ${yamlString(description)}`);
  }
  return `${lines.join("\n")}\n`;
}

function exportEditorYaml(mode) {
  const tree = editorTree();
  const errors = validateEditorTree(tree);
  if (errors.length) return setEditorStatus(errors[0], true);
  const yaml = treeToYaml(tree);
  if (mode === "download") {
    const url = URL.createObjectURL(new Blob([yaml], { type: "text/yaml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tree.id.replace(`${tree.classId}-`, "")}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
    setEditorStatus(`Downloaded ${link.download}`);
  } else {
    navigator.clipboard.writeText(yaml).then(() => setEditorStatus("YAML copied to the clipboard"), () => setEditorStatus("Clipboard access failed — use Download YAML", true));
  }
}

function resetEditor() {
  state.editor.data = JSON.parse(JSON.stringify(state.data));
  state.editor.selectedTalentId = null;
  state.editor.dirty = false;
  renderEditorTreeOptions();
  renderEditor();
}

function setupEditor() {
  state.editor.data = JSON.parse(JSON.stringify(state.data));
  state.editor.classId = state.classId;
  const classPicker = $("#editor-class");
  classPicker.innerHTML = state.editor.data.classes.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("");
  classPicker.value = state.editor.classId;
  renderEditorTreeOptions();
  classPicker.addEventListener("change", () => {
    state.editor.classId = classPicker.value;
    state.editor.treeId = null;
    state.editor.selectedTalentId = null;
    renderEditorTreeOptions();
    renderEditor();
  });
  $("#editor-tree").addEventListener("change", (event) => {
    state.editor.treeId = event.target.value;
    state.editor.selectedTalentId = null;
    renderEditor();
  });
  $("#editor-form").addEventListener("submit", (event) => event.preventDefault());
  $("#editor-id").addEventListener("change", (event) => {
    const talent = editorTalent();
    const previousId = talent.id;
    const nextId = event.target.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!nextId || editorTree().talents.some((item) => item !== talent && item.id === nextId)) {
      setEditorStatus("Talent ID must be unique and use letters, numbers, and hyphens", true);
      event.target.value = previousId;
      return;
    }
    talent.id = nextId;
    for (const item of editorTree().talents) if (item.requires?.talentId === previousId) item.requires.talentId = nextId;
    state.editor.selectedTalentId = nextId;
    markEditorDirty(`Talent ID changed from ${previousId} to ${nextId}`);
    renderEditor();
  });
  $("#editor-name").addEventListener("input", (event) => { editorTalent().name = event.target.value; markEditorDirty(); renderEditorGrid(); renderEditorTooltip(editorTalent()); });
  $("#editor-icon").addEventListener("input", (event) => { editorTalent().icon = event.target.value; markEditorDirty(); renderEditorGrid(); });
  $("#editor-max-ranks").addEventListener("change", (event) => {
    const talent = editorTalent();
    const maxRanks = Math.max(1, Math.min(5, Number(event.target.value) || 1));
    talent.maxRanks = maxRanks;
    talent.descriptions = Array.from({ length: maxRanks }, (_, index) => talent.descriptions[index] || "");
    markEditorDirty();
    renderEditorForm();
  });
  $("#editor-row").addEventListener("change", (event) => updateEditorPosition("row", event.target.value));
  $("#editor-column").addEventListener("change", (event) => updateEditorPosition("column", event.target.value));
  $("#editor-requires-talent").addEventListener("change", (event) => {
    const talent = editorTalent();
    if (event.target.value) talent.requires = { talentId: event.target.value, ranks: 1 };
    else delete talent.requires;
    markEditorDirty();
    renderEditorForm();
  });
  $("#editor-requires-ranks").addEventListener("change", (event) => {
    const talent = editorTalent();
    if (talent.requires) talent.requires.ranks = Math.max(1, Math.min(5, Number(event.target.value) || 1));
    markEditorDirty();
    renderEditorForm();
  });
  $("#editor-descriptions").addEventListener("input", (event) => {
    if (!event.target.matches("textarea[data-rank]")) return;
    const rankIndex = Number(event.target.dataset.rank);
    editorTalent().descriptions[rankIndex] = event.target.value;
    markEditorDirty();
    renderEditorTooltip(editorTalent(), rankIndex);
  });
  $("#editor-descriptions").addEventListener("focusin", (event) => {
    if (event.target.matches("textarea[data-rank]")) renderEditorTooltip(editorTalent(), Number(event.target.dataset.rank));
  });
  $("#editor-add-talent").addEventListener("click", addEditorTalent);
  $("#editor-delete-talent").addEventListener("click", deleteEditorTalent);
  $("#editor-copy-yaml").addEventListener("click", () => exportEditorYaml("copy"));
  $("#editor-download-yaml").addEventListener("click", () => exportEditorYaml("download"));
  $("#editor-reset").addEventListener("click", resetEditor);
  renderEditor();
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
    if (button.dataset.view === "editor") requestAnimationFrame(drawEditorDependencies);
  }));
}

async function init() {
  try {
    const [talentsResponse, racesResponse, abilitiesResponse] = await Promise.all([fetch("./data/talents.json"), fetch("./data/races.json"), fetch("./data/abilities.json")]);
    if (!talentsResponse.ok || !racesResponse.ok || !abilitiesResponse.ok) throw new Error("Data unavailable");
    state.data = await talentsResponse.json();
    const races = await racesResponse.json();
    const abilities = await abilitiesResponse.json();
    setupFeatureFlags();
    loadHash();
    renderClassPicker();
    renderTrees();
    renderRaces(races);
    renderAbilities(abilities);
    setupEditor();
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
