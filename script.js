const textEl = document.getElementById("text");
const choicesEl = document.getElementById("choices");
const statusEl = document.getElementById("status");
const collectionEl = document.getElementById("collection");
const unlockMessageEl = document.getElementById("unlockMessage");
const cardEl = document.querySelector(".game-card");
const sakuraLayerEl = document.getElementById("sakuraLayer");

const SAVE_KEY = "sakura_namiki_progress";

const state = {
  closeness: 0,
  embarrassment: 0,
  missed: 0,
  lastChoice: null
};

let storyData = null;
let petalIntervalId = null;

let unlocked = {
  ed1: false,
  ed2: false,
  ed3: false,
  ed4: false,
  ed4Shown: false
};

async function init() {
  try {
    const response = await fetch("./story.json");
    if (!response.ok) {
      throw new Error(`story.json の読み込みに失敗しました: ${response.status}`);
    }

    storyData = await response.json();
    loadProgress();
    updateCollection();
    hideUnlockMessage();
    renderScene("scene1");
    startSakura();
  } catch (error) {
    textEl.textContent =
      "読み込みに失敗しました。\nローカルサーバー経由で開いているか確認してください。";
    choicesEl.innerHTML = "";
    console.error(error);
  }
}

function updateStatus() {
  if (!statusEl) return;
  statusEl.textContent =
    `closeness: ${state.closeness} / embarrassment: ${state.embarrassment} / missed: ${state.missed} / lastChoice: ${state.lastChoice ?? "-"}`;
}

function updateCollection() {
  if (!collectionEl) return;

  const count =
    Number(unlocked.ed1) +
    Number(unlocked.ed2) +
    Number(unlocked.ed3) +
    Number(unlocked.ed4);

  collectionEl.textContent = `ED回収：${count} / 4`;
}

function showUnlockMessage(message) {
  if (!unlockMessageEl) return;

  unlockMessageEl.textContent = message;
  unlockMessageEl.classList.remove("show");

  requestAnimationFrame(() => {
    unlockMessageEl.classList.add("show");
  });
}

function hideUnlockMessage() {
  if (!unlockMessageEl) return;

  unlockMessageEl.classList.remove("show");
  unlockMessageEl.textContent = "";
}

function saveProgress() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(unlocked));
}

function loadProgress() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    unlocked = {
      ed1: Boolean(saved.ed1),
      ed2: Boolean(saved.ed2),
      ed3: Boolean(saved.ed3),
      ed4: Boolean(saved.ed4),
      ed4Shown: Boolean(saved.ed4Shown)
    };
  } catch (error) {
    console.error("保存データの読み込みに失敗しました", error);
  }
}

function applyEffects(effects = {}) {
  state.closeness += effects.closeness || 0;
  state.embarrassment += effects.embarrassment || 0;
  state.missed += effects.missed || 0;

  if (effects.lastChoice !== undefined) {
    state.lastChoice = effects.lastChoice;
  }
}

/**
 * 条件文字列の例:
 * - closeness>=1
 * - missed<=2
 * - lastChoice == good
 * - lastChoice === "normal"
 */
function parseCondition(condition) {
  if (typeof condition !== "string") return false;

  const match = condition.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|===|==)\s*(.+)$/
  );

  if (!match) return false;

  const [, key, operator, rawValue] = match;
  const left = state[key];

  // 右辺を整形
  const trimmed = rawValue.trim();

  // "good" / 'good' / good を全部文字列 good として扱う
  const isQuoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));

  const right = isQuoted
    ? trimmed.slice(1, -1)
    : Number.isNaN(Number(trimmed))
      ? trimmed
      : Number(trimmed);

  switch (operator) {
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    case "===":
    case "==":
      return left === right;
    default:
      return false;
  }
}

function matchesWhen(when = { all: [] }) {
  const allConditions = when.all || [];
  return allConditions.every(parseCondition);
}

function pickSceneText(scene) {
  if (scene.text) {
    return scene.text;
  }

  if (scene.textVariants) {
    const matched = scene.textVariants.find((variant) =>
      matchesWhen(variant.when)
    );
    return matched ? matched.text : "";
  }

  return "";
}

function clearChoices() {
  choicesEl.innerHTML = "";
}

function renderChoices(choices) {
  clearChoices();

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.textContent = choice.label;

    button.addEventListener("click", () => {
      applyEffects(choice.effects);

      if (choice.next === "ending") {
        renderEnding();
      } else {
        renderScene(choice.next);
      }
    });

    choicesEl.appendChild(button);
  });
}

function setTextWithFade(newText, isHTML = false) {
  textEl.classList.remove("fade-in");
  textEl.classList.add("fade-out");

  setTimeout(() => {
    if (isHTML) {
      textEl.innerHTML = newText;
    } else {
      textEl.textContent = newText;
    }

    textEl.classList.remove("fade-out");
    textEl.classList.add("fade-in");
  }, 180);
}

function renderScene(sceneId) {
  const scene = storyData.scenes[sceneId];

  if (!scene) {
    textEl.textContent = `シーンが見つかりません: ${sceneId}`;
    clearChoices();
    return;
  }

  if (cardEl) {
    cardEl.classList.remove("ending");
  }

  hideUnlockMessage();
  updateCollection();
  updateStatus();

  const sceneText = pickSceneText(scene);
  setTextWithFade(sceneText);
  renderChoices(scene.choices || []);
}

function pickEnding() {
  const allUnlocked = unlocked.ed1 && unlocked.ed2 && unlocked.ed3;

  if (
    allUnlocked &&
    state.closeness >= 2 &&
    state.embarrassment >= 2 &&
    state.missed >= 1
  ) {
    return storyData.endings.ed4;
  }

  if (state.missed >= 4) {
    return storyData.endings.ed3;
  }

  if (state.closeness >= 4 && state.missed <= 1) {
    return storyData.endings.ed1;
  }

  return storyData.endings.ed2;
}

function renderEnding() {
  const ending = pickEnding();

  if (cardEl) {
    cardEl.classList.add("ending");
  }

  if (ending === storyData.endings.ed1) unlocked.ed1 = true;
  if (ending === storyData.endings.ed2) unlocked.ed2 = true;
  if (ending === storyData.endings.ed3) unlocked.ed3 = true;
  if (ending === storyData.endings.ed4) unlocked.ed4 = true;

  const allUnlocked = unlocked.ed1 && unlocked.ed2 && unlocked.ed3;

  if (allUnlocked && !unlocked.ed4Shown) {
    showUnlockMessage("新しいエンディングが解放されました");
    unlocked.ed4Shown = true;
  } else {
    hideUnlockMessage();
  }

  saveProgress();
  updateCollection();
  updateStatus();

  setTextWithFade(
    `<span class="end-title">${escapeHtml(ending.title)}</span><br><br>${escapeHtml(ending.text).replace(/\n/g, "<br>")}`,
    true
  );

  clearChoices();

  const restartButton = document.createElement("button");
  restartButton.className = "choice-button";
  restartButton.textContent = "もう一度読む";
  restartButton.addEventListener("click", restartGame);
  choicesEl.appendChild(restartButton);
}

function restartGame() {
  state.closeness = 0;
  state.embarrassment = 0;
  state.missed = 0;
  state.lastChoice = null;
  renderScene("scene1");
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createPetal() {
  if (!sakuraLayerEl) return;

  const petal = document.createElement("div");
  petal.className = "petal";

  const left = Math.random() * 100;
  const duration = 10 + Math.random() * 8;
  const delay = Math.random() * 2;
  const size = 14 + Math.random() * 10;
  const opacity = 0.45 + Math.random() * 0.35;

  petal.style.left = `${left}vw`;
  petal.style.animationDuration = `${duration}s`;
  petal.style.animationDelay = `-${delay}s`;
  petal.style.width = `${size}px`;
  petal.style.height = `${size * 1.3}px`;
  petal.style.opacity = opacity.toFixed(2);

  petal.addEventListener("pointerdown", () => {
    if (petal.classList.contains("is-gone")) return;

    petal.classList.add("is-gone");

    setTimeout(() => {
      petal.remove();
    }, 450);
  });

  petal.addEventListener("animationend", () => {
    if (!petal.classList.contains("is-gone")) {
      petal.remove();
    }
  });

  sakuraLayerEl.appendChild(petal);
}

function startSakura() {
  if (!sakuraLayerEl) return;
  if (petalIntervalId) return;

  for (let i = 0; i < 8; i += 1) {
    setTimeout(() => createPetal(), i * 280);
  }

  petalIntervalId = setInterval(() => {
    const petalCount = document.querySelectorAll(".petal").length;
    if (petalCount < 18) {
      createPetal();
    }
  }, 900);
}

init();