// Rows of the which-key overlay. The input is the bind file that
// home/programs/niri.nix writes:
//   { binds: [{ key: "Mod+Shift+H", action, title }],
//     groups: { "Mod+Alt": "monitor: focus" } }
//
// A layer is the set of held modifiers. Its name is "Mod" and then the other
// held modifiers in the order Alt, Ctrl, Shift, for example "Mod+Alt+Ctrl".
// A row is { label, title }, for example { label: "h/l", title: "Focus
// Column Left/Right" } or { label: "⏎", title: "Open Terminal" }. A modifier
// row also has isGroup: { label: "alt", title: "+monitor: focus" }.

// The keymods reader reports these modifiers. niri also accepts
// ISO_Level3_Shift and ISO_Level5_Shift, so binds with them do not show.
const layerModifiers = ["Alt", "Ctrl", "Shift"];

// niri modifier names, in lowercase. Super is Mod, because
// home/programs/niri.nix allows no other mod key.
const modifierNames = {
  mod: "Mod",
  super: "Mod",
  win: "Mod",
  alt: "Alt",
  ctrl: "Ctrl",
  control: "Ctrl",
  shift: "Shift",
};

// Last words of a title that name a variant of one action. Rows whose titles
// differ only in a last word of the same class share a row. Signed amounts,
// such as -10% and +10%, are one more class.
const variantClasses = [
  ["Left", "Right", "Up", "Down"],
  ["First", "Last"],
  ["Next", "Previous"],
];

// Words that stay lowercase in a derived title, after the first word.
const minorWords = { and: true, from: true, into: true, of: true, or: true, to: true };

// Symbol keys in keyboard order, which is also their sort order.
const symbolKeys = [
  ["grave", "`"],
  ["minus", "-"],
  ["equal", "="],
  ["bracketleft", "["],
  ["bracketright", "]"],
  ["backslash", "\\"],
  ["semicolon", ";"],
  ["apostrophe", "'"],
  ["comma", ","],
  ["period", "."],
  ["slash", "/"],
];

// Named keys in sort order. Keys in neither table show their niri name.
const namedKeys = [
  ["left", "←"],
  ["down", "↓"],
  ["up", "↑"],
  ["right", "→"],
  ["wheelscrollleft", "wheel←"],
  ["wheelscrolldown", "wheel↓"],
  ["wheelscrollup", "wheel↑"],
  ["wheelscrollright", "wheel→"],
  ["escape", "Esc"],
  ["tab", "Tab"],
  ["return", "⏎"],
  ["space", "Space"],
  ["backspace", "⌫"],
  ["delete", "Del"],
  ["home", "Home"],
  ["end", "End"],
  ["page_up", "PgUp"],
  ["page_down", "PgDn"],
  ["print", "Print"],
];

function tableIndex(table, name) {
  for (let i = 0; i < table.length; i++) {
    if (table[i][0] === name) return i;
  }
  return -1;
}

// The layer name for a list of modifier names, or "" when Mod is missing or
// a modifier is one that the overlay cannot show.
function layerOf(modifiers) {
  const held = {};
  for (const part of modifiers) {
    const name = modifierNames[String(part).trim().toLowerCase()];
    if (!name) return "";
    held[name] = true;
  }
  if (!held.Mod) return "";
  return ["Mod"].concat(layerModifiers.filter((m) => held[m])).join("+");
}

// "Mod+Shift+Alt" → "Mod+Alt+Shift". Returns "" for a name without Mod.
function canonicalLayer(name) {
  return layerOf(String(name || "").split("+"));
}

// The layer for a state line of the keymods reader, or "" when Mod is up.
function layerName(state) {
  if (!state || !state.mod) return "";
  return ["Mod"]
    .concat(layerModifiers.filter((m) => state[m.toLowerCase()]))
    .join("+");
}

// "Mod+Shift+H" → { layer: "Mod+Shift", key: "H" }.
function splitBind(name) {
  const parts = String(name).split("+");
  const key = parts.pop();
  return { layer: layerOf(parts), key: key };
}

function keyLabel(key) {
  const lower = String(key).toLowerCase();
  if (/^[a-z0-9]$/.test(lower)) return lower;
  const symbol = tableIndex(symbolKeys, lower);
  if (symbol !== -1) return symbolKeys[symbol][1];
  const named = tableIndex(namedKeys, lower);
  if (named !== -1) return namedKeys[named][1];
  return String(key);
}

// Letters, then digits (1 to 9, then 0), then symbols, then named keys, then
// other keys.
function keyRank(key) {
  const lower = String(key).toLowerCase();
  if (/^[a-z]$/.test(lower)) return lower.charCodeAt(0);
  if (/^[0-9]$/.test(lower)) return 1000 + (lower === "0" ? 10 : Number(lower));
  const symbol = tableIndex(symbolKeys, lower);
  if (symbol !== -1) return 2000 + symbol;
  const named = tableIndex(namedKeys, lower);
  if (named !== -1) return 3000 + named;
  return 4000;
}

function compareKeys(a, b) {
  return keyRank(a) - keyRank(b) || keyLabel(a).localeCompare(keyLabel(b));
}

// { "focus-workspace": [3] } → { name: "focus-workspace", args: [3] }.
function actionParts(action) {
  const name = Object.keys(action || {})[0] || "";
  return { name: name, args: name ? action[name] : [] };
}

// The string and number arguments. Objects such as { focus: true } are
// options, so they are not part of the title.
function scalarArgs(args) {
  const list = Array.isArray(args) ? args : [args];
  return list.filter((a) => typeof a === "string" || typeof a === "number");
}

function titleCase(actionName) {
  return actionName
    .split("-")
    .map((word, index) =>
      index > 0 && minorWords[word]
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function basename(path) {
  const parts = String(path).split("/");
  return parts[parts.length - 1];
}

function firstWord(command) {
  return basename(String(command).trim().split(/\s+/)[0] || "");
}

// The program that a spawn action starts. `sh -c "cmd ..."` starts cmd.
function spawnName(args) {
  const argv = Array.isArray(args) ? args : [args];
  if (
    argv.length >= 3 &&
    /^(ba|da|z)?sh$/.test(basename(argv[0])) &&
    argv[1] === "-c"
  ) {
    return firstWord(argv[2]);
  }
  return basename(argv[0] || "");
}

function titleFor(entry) {
  if (entry.title) return entry.title;
  const parts = actionParts(entry.action);
  if (parts.name === "spawn") return "Spawn " + spawnName(parts.args);
  if (parts.name === "spawn-sh") {
    return "Spawn " + firstWord(scalarArgs(parts.args)[0] || "");
  }
  return [titleCase(parts.name)]
    .concat(scalarArgs(parts.args).map(String))
    .join(" ");
}

function digitValue(key) {
  return key === "0" ? 10 : Number(key);
}

// A digit bind whose number argument is the digit (0 = 10), for example
// Mod+3 → focus-workspace 3. Returns the group of binds that can merge with
// it, or null. Binds with a title do not merge.
function digitGroup(bind) {
  if (bind.entry.title || !/^[0-9]$/.test(bind.key)) return null;
  const parts = actionParts(bind.entry.action);
  const args = Array.isArray(parts.args) ? parts.args : [parts.args];
  const index = args.indexOf(digitValue(bind.key));
  if (index === -1) return null;
  const template = args.slice();
  template[index] = null;
  return parts.name + JSON.stringify(template);
}

// "Focus Workspace 1–10" for a run of digit binds.
function rangeTitle(entry, first, last) {
  const parts = actionParts(entry.action);
  const args = scalarArgs(parts.args).map(String);
  args[args.indexOf(String(first))] = first + "–" + last;
  return [titleCase(parts.name)].concat(args).join(" ");
}

function isConsecutive(numbers) {
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) return false;
  }
  return true;
}

// "Focus Column Left" → { group: "0\nFocus Column", word: "Left" }, or null
// when the last word is not a variant.
function variantOf(title) {
  const words = String(title).split(" ");
  if (words.length < 2) return null;
  const word = words[words.length - 1];
  const prefix = words.slice(0, -1).join(" ");
  for (let i = 0; i < variantClasses.length; i++) {
    if (variantClasses[i].indexOf(word) !== -1) {
      return { group: i + "\n" + prefix, prefix: prefix, word: word };
    }
  }
  if (/^[+-][0-9]+(\.[0-9]+)?%?$/.test(word)) {
    return { group: "amount\n" + prefix, prefix: prefix, word: word };
  }
  return null;
}

// One row for the variant rows of a group, for example "h/l  Focus Column
// Left/Right". It shows only the first key of each member, so aliases such
// as arrows and wheel keys are left out. Returns the rows unchanged when the
// group has one row or a repeated variant.
function mergeVariants(prefix, members) {
  const words = members.map((m) => m.word);
  if (members.length < 2 || new Set(words).size !== words.length) {
    return members.map((m) => m.row);
  }
  const sorted = members
    .slice()
    .sort((a, b) => compareKeys(a.row.keys[0], b.row.keys[0]));
  return [
    {
      keys: sorted.map((m) => m.row.keys[0]),
      label: sorted.map((m) => keyLabel(m.row.keys[0])).join("/"),
      title: prefix + " " + sorted.map((m) => m.word).join("/"),
    },
  ];
}

// Groups the variant rows. Rows with a label (digit runs) stay as they are.
function groupVariants(rows) {
  const groups = {};
  const order = [];
  for (const row of rows) {
    const variant = row.label === undefined ? variantOf(row.title) : null;
    if (variant === null) {
      order.push({ row: row });
      continue;
    }
    if (!groups[variant.group]) {
      groups[variant.group] = { prefix: variant.prefix, members: [] };
      order.push({ group: groups[variant.group] });
    }
    groups[variant.group].members.push({ row: row, word: variant.word });
  }

  const result = [];
  for (const item of order) {
    if (item.row) result.push(item.row);
    else result.push(...mergeVariants(item.group.prefix, item.group.members));
  }
  return result;
}

// The rows of one layer. binds: [{ key: "H", entry }].
function compactLayer(binds) {
  const digitGroups = {};
  const single = [];
  for (const bind of binds) {
    const group = digitGroup(bind);
    if (group === null) {
      single.push(bind);
    } else {
      digitGroups[group] = (digitGroups[group] || []).concat([bind]);
    }
  }

  const rows = [];
  for (const group in digitGroups) {
    const run = digitGroups[group]
      .slice()
      .sort((a, b) => digitValue(a.key) - digitValue(b.key));
    const numbers = run.map((bind) => digitValue(bind.key));
    if (run.length < 2 || !isConsecutive(numbers)) {
      single.push(...run);
      continue;
    }
    const first = run[0];
    const last = run[run.length - 1];
    rows.push({
      keys: [first.key],
      label: keyLabel(first.key) + "…" + keyLabel(last.key),
      title: rangeTitle(first.entry, numbers[0], numbers[numbers.length - 1]),
    });
  }

  // Binds with the same action and title share a row, for example Mod+H and
  // Mod+Left.
  const byAction = {};
  for (const bind of single) {
    const title = titleFor(bind.entry);
    const id = JSON.stringify(bind.entry.action) + "\n" + title;
    if (byAction[id]) {
      byAction[id].keys.push(bind.key);
    } else {
      byAction[id] = { keys: [bind.key], title: title };
      rows.push(byAction[id]);
    }
  }

  for (const row of rows) row.keys.sort(compareKeys);
  const grouped = groupVariants(rows);
  for (const row of grouped) {
    if (row.label === undefined) row.label = row.keys.map(keyLabel).join(" ");
  }
  grouped.sort((a, b) => compareKeys(a.keys[0], b.keys[0]));
  return grouped.map((row) => ({ label: row.label, title: row.title }));
}

// Layer name → [{ key: "H", entry }], for every layer that has a bind.
function bindsByLayer(entries) {
  const binds = {};
  for (const entry of entries || []) {
    if (!entry || typeof entry.key !== "string" || !entry.action) continue;
    const bind = splitBind(entry.key);
    if (bind.layer === "") continue;
    binds[bind.layer] = (binds[bind.layer] || []).concat([
      { key: bind.key, entry: entry },
    ]);
  }
  return binds;
}

// Layer name → rows, for every layer that has a bind.
function buildLayers(entries) {
  const binds = bindsByLayer(entries);
  const layers = {};
  for (const layer in binds) layers[layer] = compactLayer(binds[layer]);
  return layers;
}

// The bind file → { layers, groups, counts }. `groups` has canonical layer
// names, and `counts` has the number of binds in each layer.
function parseBindFile(data) {
  // Older generations wrote only the bind list. The dotfiles are live, so
  // they can meet such a file until the next switch or after a rollback.
  const list = Array.isArray(data) ? data : data && data.binds;
  const entries = Array.isArray(list) ? list : [];
  const binds = bindsByLayer(entries);
  const counts = {};
  for (const layer in binds) counts[layer] = binds[layer].length;

  const groups = {};
  const labels = data && data.groups ? data.groups : {};
  for (const name in labels) {
    const layer = canonicalLayer(name);
    if (layer !== "" && typeof labels[name] === "string") {
      groups[layer] = labels[name];
    }
  }
  return { layers: buildLayers(entries), groups: groups, counts: counts };
}

// The rows of a layer. A layer without binds has no rows.
function rowsFor(layers, layer) {
  return layers && layers[layer] ? layers[layer] : [];
}

// The binds of `layer` and of every layer that adds modifiers to it.
function bindsBelow(counts, layer) {
  const held = layer.split("+");
  let total = 0;
  for (const name in counts) {
    const other = name.split("+");
    if (held.every((m) => other.indexOf(m) !== -1)) total += counts[name];
  }
  return total;
}

// A row for each modifier that can join `layer` and lead to binds, in the
// order Alt, Ctrl, Shift. The title is the group label, or the bind count.
function modifierRows(view, layer) {
  if (!view || !layer) return [];
  const held = layer.split("+");
  const rows = [];
  for (const modifier of layerModifiers) {
    if (held.indexOf(modifier) !== -1) continue;
    const next = canonicalLayer(layer + "+" + modifier);
    const count = bindsBelow(view.counts, next);
    if (count === 0) continue;
    const label =
      view.groups[next] || count + (count === 1 ? " bind" : " binds");
    rows.push({
      label: modifier.toLowerCase(),
      title: "+" + label,
      isGroup: true,
    });
  }
  return rows;
}

// The modifier rows first, then the key rows.
function viewRows(view, layer) {
  if (!view) return [];
  return modifierRows(view, layer).concat(rowsFor(view.layers, layer));
}

// Splits the rows into columns of at most `perColumn` rows.
function columns(rows, perColumn) {
  const size = Math.max(1, Math.floor(perColumn));
  const result = [];
  for (let i = 0; i < rows.length; i += size) {
    result.push(rows.slice(i, i + size));
  }
  return result;
}

// The cells of a two-column grid: key, title, key, title, and so on.
function gridCells(rows) {
  const cells = [];
  for (const row of rows) {
    const isGroup = row.isGroup === true;
    cells.push({ text: row.label, isKey: true, isGroup: isGroup });
    cells.push({ text: row.title, isKey: false, isGroup: isGroup });
  }
  return cells;
}
