const STORAGE_KEY = "js_rpg_save_v1";

class Weapon {
  constructor({ id, name, attackBonus = 0, price = 0, image = "" }) {
    this.id = id;
    this.name = name;
    this.attackBonus = attackBonus;
    this.price = price;
    this.image = image;
  }
}

class Armor {
  constructor({ id, name, defenseBonus = 0, price = 0, image = "" }) {
    this.id = id;
    this.name = name;
    this.defenseBonus = defenseBonus;
    this.price = price;
    this.image = image;
  }
}

class Inventory {
  constructor() {
    this.items = []; // { id, type, name, qty, ... }
  }

  add(item, qty = 1) {
    const existing = this.items.find((i) => i.id === item.id);
    if (existing) existing.qty += qty;
    else this.items.push({ ...item, qty });
  }

  remove(itemId, qty = 1) {
    const existing = this.items.find((i) => i.id === itemId);
    if (!existing) return false;
    existing.qty -= qty;
    if (existing.qty <= 0) this.items = this.items.filter((i) => i.id !== itemId);
    return true;
  }

  has(itemId, qty = 1) {
    const existing = this.items.find((i) => i.id === itemId);
    return Boolean(existing && existing.qty >= qty);
  }

  toJSON() {
    return { items: this.items.map((i) => ({ ...i })) };
  }

  static fromJSON(json) {
    const inv = new Inventory();
    inv.items = Array.isArray(json?.items) ? json.items.map((i) => ({ ...i })) : [];
    return inv;
  }
}

//Characters
class Character {
  constructor({ name, health, attackPower, defense, level }) {
    this.name = name;
    this.maxHealth = health;
    this.health = health;
    this.attackPower = attackPower;
    this.defense = defense;
    this.level = level;
  }

  attack(target) {
    const base = this.attackPower;
    const variance = randInt(-2, 2);
    const raw = Math.max(1, base + variance);
    return target.takeDamage(raw);
  }

  takeDamage(amount) {
    const reduced = Math.max(1, amount - this.defense);
    this.health = clamp(this.health - reduced, 0, this.maxHealth);
    return reduced;
  }

  heal(amount) {
    const before = this.health;
    this.health = clamp(this.health + amount, 0, this.maxHealth);
    return this.health - before;
  }

  levelUp() {
    this.level += 1;
    this.maxHealth += 12;
    this.attackPower += 2;
    this.defense += 1;
    this.health = this.maxHealth;
  }

  // Base version; subclasses override.
  skill(_target) {
    return { ok: false, message: `${this.name} has no skill.` };
  }
}

class Player extends Character {
  constructor({ name, classId, className, baseStats, startingGold = 0 }) {
    super({ name, ...baseStats });
    this.classId = classId;
    this.className = className;
    this.gold = startingGold;

    // composition
    this.inventory = new Inventory();
    this.weapon = null;
    this.armor = null;

    // simple cooldown system (turn-based)
    this.skillCooldownTurns = 0;
    this.skillSpec = null;
  }

  get totalAttack() {
    return this.attackPower + (this.weapon?.attackBonus ?? 0);
  }

  get totalDefense() {
    return this.defense + (this.armor?.defenseBonus ?? 0);
  }

  attack(target) {
    const base = this.totalAttack;
    const variance = randInt(-2, 2);
    const raw = Math.max(1, base + variance);
    return target.takeDamage(raw);
  }

  takeDamage(amount) {
    const reduced = Math.max(1, amount - this.totalDefense);
    this.health = clamp(this.health - reduced, 0, this.maxHealth);
    return reduced;
  }

  startTurn() {
    if (this.skillCooldownTurns > 0) this.skillCooldownTurns -= 1;
  }

  skill(target) {
    if (!this.skillSpec) return { ok: false, message: "No skill equipped." };
    if (this.skillCooldownTurns > 0) {
      return { ok: false, message: `${this.skillSpec.name} is on cooldown (${this.skillCooldownTurns} turn(s)).` };
    }

    const spec = this.skillSpec;
    this.skillCooldownTurns = spec.cooldownTurns ?? 3;

    if (spec.type === "damage") {
      const dmgBase = Math.max(1, spec.power + Math.floor(this.totalAttack * 0.35));
      const dealt = target.takeDamage(dmgBase);
      return { ok: true, message: `${this.name} uses ${spec.name} for ${dealt} damage!`, dealt };
    }

    if (spec.type === "heal") {
      const healed = this.heal(spec.power);
      return { ok: true, message: `${this.name} uses ${spec.name} and heals ${healed} HP.`, healed };
    }

    return { ok: false, message: "Skill fizzles." };
  }
}

class Warrior extends Player {}
class Mage extends Player {}
class Thief extends Player {}
class Archer extends Player {}

class Enemy extends Character {
  constructor({ enemyId, name, stats, rewardGold = 0, loot = [], image = "" }) {
    super({ name, ...stats });
    this.enemyId = enemyId;
    this.rewardGold = rewardGold;
    this.loot = loot;
    this.image = image;
  }

  skill(target) {
    if (this.level >= 5 && Math.random() < 0.25) {
      const raw = this.attackPower + 8;
      const dealt = target.takeDamage(raw);
      return { ok: true, message: `${this.name} unleashes a brutal strike for ${dealt} damage!`, dealt };
    }
    return { ok: false, message: "" };
  }
}

class Goblin extends Enemy {}
class Troll extends Enemy {}
class EvilSoldier extends Enemy {}
class Soldier extends Enemy {}
class Dragon extends Enemy {}

//helpers
function buildItemIndex(data) {
  const idx = new Map();
  for (const w of data.items.weapons) idx.set(w.id, { ...w, kind: "weapon" });
  for (const a of data.items.armor) idx.set(a.id, { ...a, kind: "armor" });
  for (const c of data.items.consumables) idx.set(c.id, { ...c, kind: "consumable" });
  return idx;
}

function buildEnemyIndex(data) {
  const idx = new Map();
  for (const e of data.enemies) idx.set(e.id, e);
  return idx;
}

function buildLocationIndex(data) {
  const idx = new Map();
  for (const l of data.locations) idx.set(l.id, l);
  return idx;
}

function playerFactory(classId, payload) {
  const common = {
    name: payload.name,
    classId: payload.classId,
    className: payload.className,
    baseStats: payload.baseStats,
    startingGold: payload.startingGold
  };
  switch (classId) {
    case "warrior":
      return new Warrior(common);
    case "mage":
      return new Mage(common);
    case "thief":
      return new Thief(common);
    case "archer":
      return new Archer(common);
    default:
      return new Player(common);
  }
}

function enemyFactory(enemyId, spec) {
  const payload = {
    enemyId,
    name: spec.name,
    stats: spec.stats,
    rewardGold: spec.rewardGold,
    loot: spec.loot,
    image: spec.image
  };
  switch (enemyId) {
    case "goblin":
      return new Goblin(payload);
    case "troll":
      return new Troll(payload);
    case "evil_soldier":
      return new EvilSoldier(payload);
    case "soldier":
      return new Soldier(payload);
    case "dragon":
      return new Dragon(payload);
    default:
      return new Enemy(payload);
  }
}

// ---------- UI / Game State ----------
const els = {
  storyText: document.getElementById("storyText"),
  sceneTag: document.getElementById("sceneTag"),
  battleTag: document.getElementById("battleTag"),
  actionButtons: document.getElementById("actionButtons"),

  classTag: document.getElementById("classTag"),
  statName: document.getElementById("statName"),
  statLevel: document.getElementById("statLevel"),
  statHealth: document.getElementById("statHealth"),
  statAttack: document.getElementById("statAttack"),
  statDefense: document.getElementById("statDefense"),
  statGold: document.getElementById("statGold"),

  equipWeapon: document.getElementById("equipWeapon"),
  equipArmor: document.getElementById("equipArmor"),
  inventoryList: document.getElementById("inventoryList"),

  canvas: document.getElementById("battleCanvas"),
  sceneImage: document.getElementById("sceneImage"),

  btnSave: document.getElementById("btnSave"),
  btnLoad: document.getElementById("btnLoad"),
  btnNew: document.getElementById("btnNew")
};

const ctx = els.canvas.getContext("2d");

const game = {
  data: null,
  itemIndex: null,
  enemyIndex: null,
  locationIndex: null,

  player: null,
  enemy: null,
  locationId: null,
  mode: "boot",
  lastMessage: "",
  battleEffect: null
};

//DOM rendering
function setStory(text, tag = "") {
  els.storyText.textContent = text;
  els.sceneTag.textContent = tag || game.mode;
}

function setSceneImage(src) {
  els.sceneImage.src = src || "";
}

function clearButtons() {
  els.actionButtons.innerHTML = "";
}

function addButton(label, { variant = "btn", disabled = false } = {}, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn ${variant}`.trim();
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  els.actionButtons.appendChild(b);
  return b;
}

function renderSidebar() {
  const p = game.player;
  if (!p) {
    els.classTag.textContent = "—";
    els.statName.textContent = "—";
    els.statLevel.textContent = "—";
    els.statHealth.textContent = "—";
    els.statAttack.textContent = "—";
    els.statDefense.textContent = "—";
    els.statGold.textContent = "—";
    els.equipWeapon.textContent = "—";
    els.equipArmor.textContent = "—";
    els.inventoryList.innerHTML = "";
    return;
  }

  els.classTag.textContent = p.className;
  els.statName.textContent = p.name;
  els.statLevel.textContent = String(p.level);
  els.statHealth.textContent = `${p.health}/${p.maxHealth}`;
  els.statAttack.textContent = String(p.totalAttack);
  els.statDefense.textContent = String(p.totalDefense);
  els.statGold.textContent = String(p.gold);
  els.equipWeapon.textContent = p.weapon ? `${p.weapon.name} (+${p.weapon.attackBonus} ATK)` : "None";
  els.equipArmor.textContent = p.armor ? `${p.armor.name} (+${p.armor.defenseBonus} DEF)` : "None";

  els.inventoryList.innerHTML = "";
  if (p.inventory.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "invItem";
    empty.innerHTML = `<div class="invItem__name">Empty</div><div class="invItem__meta">Find loot in battle or shop.</div>`;
    els.inventoryList.appendChild(empty);
    return;
  }

  for (const item of p.inventory.items.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    const row = document.createElement("div");
    row.className = "invItem";
    const meta = item.kind === "consumable" ? `Heals ${item.healAmount} • x${item.qty}` : `x${item.qty}`;
    row.innerHTML = `<div class="invItem__name">${escapeHtml(item.name)}</div><div class="invItem__meta">${escapeHtml(meta)}</div>`;
    els.inventoryList.appendChild(row);
  }
}

//Canvas
function drawBattleCanvas() {
  const w = els.canvas.width;
  const h = els.canvas.height;
  ctx.clearRect(0, 0, w, h);

  // background
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  roundRect(ctx, 10, 12, w - 20, h - 24, 14, true, false);

  const p = game.player;
  const e = game.enemy;
  const hasCombat = Boolean(p && e && game.mode === "combat");

  // labels
  ctx.fillStyle = "rgba(239,232,220,0.92)";
  ctx.font = "600 14px ui-serif, Georgia, serif";
  ctx.fillText(p ? `${p.name} (Lv ${p.level})` : "—", 26, 46);
  ctx.fillText(e ? `${e.name} (Lv ${e.level})` : "—", 26, 118);

  // bars
  drawHpBar(26, 56, w - 52, 18, p?.health ?? 0, p?.maxHealth ?? 1, "#63d38a");
  drawHpBar(26, 128, w - 52, 18, e?.health ?? 0, e?.maxHealth ?? 1, "#d3635c");

  // effect flash
  const now = Date.now();
  if (hasCombat && game.battleEffect && game.battleEffect.untilTs > now) {
    ctx.save();
    const isPlayerHit = game.battleEffect.type === "playerHit";
    const isEnemyHit = game.battleEffect.type === "enemyHit";
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = isPlayerHit ? "#d3635c" : isEnemyHit ? "#63d38a" : "#e3c06a";
    ctx.fillRect(10, 12, w - 20, h - 24);
    ctx.restore();
  }
}

function drawHpBar(x, y, width, height, hp, maxHp, color) {
  const pct = clamp(maxHp <= 0 ? 0 : hp / maxHp, 0, 1);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, x, y, width, height, 10, true, false);
  ctx.fillStyle = color;
  roundRect(ctx, x, y, Math.max(6, width * pct), height, 10, true, false);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 10, false, true);
  ctx.fillStyle = "rgba(12,11,9,0.9)";
  ctx.font = "700 12px ui-serif, Georgia, serif";
  ctx.fillText(`${hp}/${maxHp}`, x + width - 62, y + 13);
}

function roundRect(c, x, y, w, h, r, fill, stroke) {
  const radius = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
  if (fill) c.fill();
  if (stroke) c.stroke();
}

// ---------- Game flow ----------
async function boot() {
  game.mode = "boot";
  setStory("Loading the realm...", "Loading");
  clearButtons();
  renderSidebar();
  setSceneImage("RPGImages/map1.webp");
  drawBattleCanvas();

  const data = await fetch("./data.json").then((r) => {
    if (!r.ok) throw new Error(`Failed to load data.json (${r.status})`);
    return r.json();
  });

  game.data = data;
  game.itemIndex = buildItemIndex(data);
  game.enemyIndex = buildEnemyIndex(data);
  game.locationIndex = buildLocationIndex(data);

  startClassSelect();
}

function startClassSelect() {
  game.mode = "chooseClass";
  game.player = null;
  game.enemy = null;
  game.locationId = null;
  game.battleEffect = null;

  setSceneImage("RPGImages/Map2.webp");
  setStory(
    "Welcome, traveler.\n\nChoose your class to begin. Your adventure will be driven entirely by buttons in the UI, with your stats and inventory updating live.",
    "Choose Class"
  );
  clearButtons();

  for (const cls of game.data.playerClasses) {
    addButton(cls.name, { variant: "btn--primary" }, () => chooseClass(cls.id));
  }

  drawBattleCanvas();
  renderSidebar();
}

function chooseClass(classId) {
  const cls = game.data.playerClasses.find((c) => c.id === classId);
  if (!cls) return;

  const name = `${cls.name}`;
  const p = playerFactory(classId, {
    name,
    classId: cls.id,
    className: cls.name,
    baseStats: cls.baseStats,
    startingGold: cls.startingGold
  });

  p.skillSpec = cls.skill;

  // Equip starting gear from JSON items.
  const weaponSpec = game.itemIndex.get(cls.startingWeaponId);
  const armorSpec = game.itemIndex.get(cls.startingArmorId);
  if (weaponSpec?.kind === "weapon") p.weapon = new Weapon(weaponSpec);
  if (armorSpec?.kind === "armor") p.armor = new Armor(armorSpec);

  // Add starting items.
  for (const itemId of cls.startingItems ?? []) {
    const spec = game.itemIndex.get(itemId);
    if (spec) p.inventory.add(spec, 1);
  }

  game.player = p;
  game.locationId = "village_market";

  setStory(
    `You are a ${p.className}.\n\nYour first steps lead to the Village Market, where you can rest, shop, or set out for danger.`,
    "New Hero"
  );
  setSceneImage("RPGImages/shop1.webp");
  renderSidebar();
  drawBattleCanvas();

  startExplore();
}

function startExplore(extraText = "") {
  game.mode = "explore";
  game.enemy = null;
  game.battleEffect = null;

  const loc = game.locationIndex.get(game.locationId) ?? game.data.locations[0];
  game.locationId = loc.id;
  setSceneImage(loc.image);
  els.battleTag.textContent = "Canvas";

  const base = `${loc.name}\n\n${loc.description}`;
  const tail = extraText ? `\n\n${extraText}` : "";
  setStory(base + tail, "Explore");

  clearButtons();

  // Location actions
  if (loc.actions?.includes("explore")) {
    addButton("Explore", { variant: "btn--primary" }, () => exploreLocation(loc.id));
  }
  if (loc.actions?.includes("rest")) {
    addButton("Rest", { variant: "btn--ok" }, () => restAtLocation(loc.id));
  }
  if (loc.actions?.includes("shop")) {
    addButton("Shop", { variant: "btn--primary" }, () => openShop(loc.id));
  }

  // Travel
  addButton("Travel", {}, () => openTravel());

  drawBattleCanvas();
  renderSidebar();
}

function openTravel() {
  game.mode = "explore";
  const loc = game.locationIndex.get(game.locationId);
  setStory(
    `Where will you travel next?\n\nCurrent: ${loc?.name ?? "Unknown"}`,
    "Travel"
  );
  clearButtons();
  for (const l of game.data.locations) {
    addButton(l.name, { variant: l.id === game.locationId ? "btn--ok" : "" }, () => {
      game.locationId = l.id;
      startExplore(`You arrive at ${l.name}.`);
    });
  }
  addButton("Back", {}, () => startExplore());
}

function restAtLocation(locationId) {
  const p = game.player;
  const loc = game.locationIndex.get(locationId);
  if (!p || !loc) return;
  const healed = p.heal(Math.max(18, Math.floor(p.maxHealth * 0.35)));
  startExplore(`You rest and recover ${healed} HP.`);
}

function exploreLocation(locationId) {
  const loc = game.locationIndex.get(locationId);
  if (!loc) return;

  const roll = Math.random();
  if (roll < 0.70 && Array.isArray(loc.encounters) && loc.encounters.length > 0) {
    const enemyId = pick(loc.encounters);
    startCombat(enemyId, loc.id);
    return;
  }

  // small economy find
  const p = game.player;
  const foundGold = randInt(4, 12);
  p.gold += foundGold;
  startExplore(`You search the area and find ${foundGold} gold.`);
}

function startCombat(enemyId, fromLocationId) {
  const spec = game.enemyIndex.get(enemyId);
  if (!spec) return;

  game.mode = "combat";
  game.locationId = fromLocationId;
  game.enemy = enemyFactory(enemyId, spec);
  game.battleEffect = null;

  setSceneImage(spec.image || (game.locationIndex.get(fromLocationId)?.image ?? ""));
  els.battleTag.textContent = "Combat";

  setStory(
    `A ${game.enemy.name} blocks your path!\n\nChoose your action.`,
    "Combat"
  );
  renderCombatButtons();
  drawBattleCanvas();
  renderSidebar();
}

function renderCombatButtons(extra = "") {
  const p = game.player;
  const e = game.enemy;
  if (!p || !e) return;

  clearButtons();

  if (extra) {
    setStory(`${els.storyText.textContent}\n\n${extra}`, "Combat");
  }

  addButton("Attack", { variant: "btn--primary" }, () => playerTurn("attack"));
  addButton(
    p.skillSpec?.name ? `Skill: ${p.skillSpec.name}` : "Skill",
    { variant: "btn--primary", disabled: !p.skillSpec },
    () => playerTurn("skill")
  );
  addButton("Use Potion", { variant: "btn--ok", disabled: !hasAnyPotion(p) }, () => openPotionMenu());
  addButton("Run", { variant: "btn--danger" }, () => tryRun());
}

function openPotionMenu() {
  const p = game.player;
  if (!p) return;
  setStory("Choose a potion to use.", "Potion");
  clearButtons();

  const potions = p.inventory.items.filter((i) => i.kind === "consumable");
  if (potions.length === 0) {
    addButton("Back", {}, () => renderCombatButtons("You have no potions."));
    return;
  }

  for (const pot of potions) {
    addButton(`${pot.name} (x${pot.qty})`, { variant: "btn--ok" }, () => {
      usePotion(pot.id);
      playerTurn("potion"); // counts as turn
    });
  }
  addButton("Back", {}, () => renderCombatButtons());
}

function usePotion(itemId) {
  const p = game.player;
  const spec = game.itemIndex.get(itemId);
  if (!p || !spec || spec.kind !== "consumable") return { ok: false, msg: "Invalid potion." };
  if (!p.inventory.has(itemId, 1)) return { ok: false, msg: "No potion left." };

  p.inventory.remove(itemId, 1);
  const healed = p.heal(spec.healAmount ?? 0);
  return { ok: true, msg: `You drink a potion and heal ${healed} HP.` };
}

function playerTurn(action) {
  const p = game.player;
  const e = game.enemy;
  if (!p || !e || game.mode !== "combat") return;

  p.startTurn();

  let log = "";
  if (action === "attack") {
    const dealt = p.attack(e);
    game.battleEffect = { type: "enemyHit", untilTs: Date.now() + 180 };
    log = `You strike the ${e.name} for ${dealt} damage.`;
  } else if (action === "skill") {
    const res = p.skill(e);
    if (!res.ok) {
      renderCombatButtons(res.message);
      drawBattleCanvas();
      renderSidebar();
      return;
    }
    game.battleEffect = { type: "enemyHit", untilTs: Date.now() + 220 };
    log = res.message;
  } else if (action === "potion") {
    const lastLine = els.storyText.textContent.split("\n").slice(-1)[0];
    log = lastLine || "You steady your breath.";
  } else {
    log = "You hesitate...";
  }

  if (e.health <= 0) {
    endCombatVictory(log);
    return;
  }

  // Enemy response
  const enemyLog = enemyTurn();
  if (p.health <= 0) {
    endGame(`${log}\n\n${enemyLog}\n\nYou fall in battle. The realm grows darker...`);
    return;
  }

  setStory(`${log}\n\n${enemyLog}`, "Combat");
  renderCombatButtons();
  drawBattleCanvas();
  renderSidebar();
}

function enemyTurn() {
  const p = game.player;
  const e = game.enemy;
  if (!p || !e) return "";

  // enemy may use a skill sometimes
  const special = e.skill(p);
  if (special.ok) {
    game.battleEffect = { type: "playerHit", untilTs: Date.now() + 220 };
    return special.message;
  }

  const dealt = e.attack(p);
  game.battleEffect = { type: "playerHit", untilTs: Date.now() + 180 };
  return `The ${e.name} hits you for ${dealt} damage.`;
}

function endCombatVictory(openingLog) {
  const p = game.player;
  const e = game.enemy;
  if (!p || !e) return;

  const gold = e.rewardGold ?? 0;
  p.gold += gold;

  // loot rolls
  const gained = [];
  for (const drop of e.loot ?? []) {
    if (Math.random() < (drop.chance ?? 0)) {
      const spec = game.itemIndex.get(drop.itemId);
      if (spec) {
        p.inventory.add(spec, 1);
        gained.push(spec.name);
      }
    }
  }

  // simple XP-ish level up: level up every 2 victories
  p._wins = (p._wins ?? 0) + 1;
  const leveled = p._wins % 2 === 0;
  if (leveled) p.levelUp();

  game.enemy = null;
  game.mode = "explore";

  const lootLine = gained.length ? `Loot found: ${gained.join(", ")}.` : "No loot found.";
  const lvlLine = leveled ? `\n\nYou feel stronger and reach level ${p.level}.` : "";

  startExplore(`${openingLog}\n\nVictory! You gain ${gold} gold.\n${lootLine}${lvlLine}`);
}

function tryRun() {
  const p = game.player;
  const e = game.enemy;
  if (!p || !e) return;

  const chance = 0.55 + (p.classId === "thief" ? 0.10 : 0);
  if (Math.random() < chance) {
    game.enemy = null;
    startExplore("You escape and live to fight another day.");
    return;
  }

  const enemyLog = enemyTurn();
  if (p.health <= 0) {
    endGame(`You fail to escape.\n\n${enemyLog}\n\nYou fall in battle. The realm grows darker...`);
    return;
  }

  setStory(`You fail to escape.\n\n${enemyLog}`, "Combat");
  renderCombatButtons();
  drawBattleCanvas();
  renderSidebar();
}

function openShop(locationId) {
  const loc = game.locationIndex.get(locationId);
  const p = game.player;
  if (!loc || !p) return;

  game.mode = "shop";
  setSceneImage(loc.image);
  setStory(`${loc.name}\n\nA merchant shows you their wares.`, "Shop");
  clearButtons();

  const inv = (loc.shopInventory ?? []).map((id) => game.itemIndex.get(id)).filter(Boolean);
  for (const spec of inv) {
    const price = spec.price ?? 0;
    const affordable = p.gold >= price;
    addButton(
      `Buy: ${spec.name} (${price}g)`,
      { variant: affordable ? "btn--primary" : "", disabled: !affordable },
      () => buyItem(spec.id)
    );
  }

  addButton("Sell: Potion (5g)", {}, () => sellPotion());
  addButton("Back", {}, () => startExplore());

  drawBattleCanvas();
  renderSidebar();
}

function buyItem(itemId) {
  const p = game.player;
  const spec = game.itemIndex.get(itemId);
  if (!p || !spec) return;

  const price = spec.price ?? 0;
  if (p.gold < price) return;
  p.gold -= price;

  if (spec.kind === "weapon") {
    p.weapon = new Weapon(spec);
    startExplore(`You buy and equip the ${spec.name}.`);
  } else if (spec.kind === "armor") {
    p.armor = new Armor(spec);
    startExplore(`You buy and equip the ${spec.name}.`);
  } else {
    p.inventory.add(spec, 1);
    startExplore(`You buy a ${spec.name}.`);
  }
}

function sellPotion() {
  const p = game.player;
  if (!p) return;
  const potion = p.inventory.items.find((i) => i.kind === "consumable");
  if (!potion) {
    startExplore("You have no potions to sell.");
    return;
  }
  p.inventory.remove(potion.id, 1);
  p.gold += 5;
  startExplore(`You sell a potion for 5 gold.`);
}

function hasAnyPotion(p) {
  return p.inventory.items.some((i) => i.kind === "consumable" && i.qty > 0);
}

function endGame(text) {
  game.mode = "gameOver";
  game.enemy = null;
  setSceneImage("RPGImages/Castle6.webp");
  setStory(text, "Game Over");
  clearButtons();
  addButton("New Game", { variant: "btn--primary" }, () => startClassSelect());
  addButton("Load Save", {}, () => loadGame());
  drawBattleCanvas();
  renderSidebar();
}

// ---------- Save/Load (localStorage + JSON.stringify) ----------
function serializeGame() {
  const p = game.player;
  if (!p) return null;
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    mode: game.mode,
    locationId: game.locationId,
    player: {
      classId: p.classId,
      className: p.className,
      name: p.name,
      maxHealth: p.maxHealth,
      health: p.health,
      attackPower: p.attackPower,
      defense: p.defense,
      level: p.level,
      gold: p.gold,
      skillCooldownTurns: p.skillCooldownTurns,
      skillSpec: p.skillSpec,
      wins: p._wins ?? 0,
      weaponId: p.weapon?.id ?? null,
      armorId: p.armor?.id ?? null,
      inventory: p.inventory.toJSON()
    }
  };
}

function saveGame() {
  const snapshot = serializeGame();
  if (!snapshot) {
    setStory("Nothing to save yet. Start a new game first.", "Save");
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  const loc = game.locationIndex.get(game.locationId)?.name ?? "Unknown";
  startExplore(`Game saved.\n\nLocation: ${loc}`);
}

function loadGame() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    setStory("No save found in localStorage. Start a new game first.", "Load");
    clearButtons();
    addButton("New Game", { variant: "btn--primary" }, () => startClassSelect());
    drawBattleCanvas();
    renderSidebar();
    return;
  }

  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    setStory("Save data is corrupted. Try starting a new game.", "Load");
    clearButtons();
    addButton("New Game", { variant: "btn--primary" }, () => startClassSelect());
    return;
  }

  const sp = snapshot.player;
  if (!sp?.classId) {
    setStory("Save data is missing player info. Try starting a new game.", "Load");
    clearButtons();
    addButton("New Game", { variant: "btn--primary" }, () => startClassSelect());
    return;
  }

  const classSpec = game.data.playerClasses.find((c) => c.id === sp.classId);
  const baseStats = classSpec?.baseStats ?? { health: sp.maxHealth, attackPower: sp.attackPower, defense: sp.defense, level: sp.level };

  const p = playerFactory(sp.classId, {
    name: sp.name,
    classId: sp.classId,
    className: sp.className,
    baseStats,
    startingGold: sp.gold
  });

  // restore numeric stats
  p.maxHealth = sp.maxHealth;
  p.health = sp.health;
  p.attackPower = sp.attackPower;
  p.defense = sp.defense;
  p.level = sp.level;
  p.gold = sp.gold;
  p.skillCooldownTurns = sp.skillCooldownTurns ?? 0;
  p.skillSpec = sp.skillSpec ?? classSpec?.skill ?? null;
  p._wins = sp.wins ?? 0;

  // restore equipment
  const wSpec = sp.weaponId ? game.itemIndex.get(sp.weaponId) : null;
  const aSpec = sp.armorId ? game.itemIndex.get(sp.armorId) : null;
  p.weapon = wSpec?.kind === "weapon" ? new Weapon(wSpec) : null;
  p.armor = aSpec?.kind === "armor" ? new Armor(aSpec) : null;

  // restore inventory
  p.inventory = Inventory.fromJSON(sp.inventory);

  game.player = p;
  game.locationId = snapshot.locationId ?? "village_market";
  game.enemy = null;
  game.mode = "explore";
  startExplore(`Game loaded.\n\nWelcome back, ${p.name}.`);
}

// ---------- Utilities ----------
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    const m = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return m[c] || c;
  });
}

// ---------- Wire top-level buttons ----------
els.btnSave.addEventListener("click", () => saveGame());
els.btnLoad.addEventListener("click", () => loadGame());
els.btnNew.addEventListener("click", () => startClassSelect());

// keep canvas lively during battle effect flashes
setInterval(() => {
  if (game.mode === "combat" && game.battleEffect) drawBattleCanvas();
}, 60);

// initial boot
boot().catch((err) => {
  setStory(`Failed to start game.\n\n${err?.message ?? err}`, "Error");
  clearButtons();
});

