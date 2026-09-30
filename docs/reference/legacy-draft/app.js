import { solveRequiredGross } from "./tax-engine.js";

const COLORS = ["#df6837", "#e7b94f", "#6e9bb0", "#58907e", "#a882b3", "#ba795d"];
const DEFAULT_GOALS = [
  { name: "房租与居住", amount: 3200 },
  { name: "日常生活", amount: 1200 },
  { name: "旅行与体验", amount: 800 },
  { name: "储蓄与投资", amount: 1500 },
];
const STORAGE_KEY = "california-income-planner-v1";

const elements = {
  goalsList: document.querySelector("#goals-list"),
  goalTemplate: document.querySelector("#goal-template"),
  addGoal: document.querySelector("#add-goal-button"),
  reset: document.querySelector("#reset-button"),
  filingStatus: document.querySelector("#filing-status"),
  pretaxDeductions: document.querySelector("#pretax-deductions"),
  buffer: document.querySelector("#buffer"),
  bufferValue: document.querySelector("#buffer-value"),
  monthlyGoalTotal: document.querySelector("#monthly-goal-total"),
  annualGross: document.querySelector("#annual-gross"),
  monthlyGross: document.querySelector("#monthly-gross"),
  monthlyTakeHome: document.querySelector("#monthly-take-home"),
  effectiveTaxRate: document.querySelector("#effective-tax-rate"),
  incomeBar: document.querySelector("#income-bar"),
  taxRows: document.querySelector("#tax-rows"),
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.goals)) throw new Error("No saved state");
    return {
      goals: stored.goals.map((goal) => ({
        name: String(goal.name || "新目标"),
        amount: safeNumber(goal.amount),
      })),
      filingStatus: ["single", "married", "head"].includes(stored.filingStatus)
        ? stored.filingStatus
        : "single",
      pretaxDeductions: safeNumber(stored.pretaxDeductions),
      buffer: Math.min(25, safeNumber(stored.buffer)),
    };
  } catch {
    return {
      goals: structuredClone(DEFAULT_GOALS),
      filingStatus: "single",
      pretaxDeductions: 0,
      buffer: 5,
    };
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createGoalRow(goal, index) {
  const fragment = elements.goalTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".goal-row");
  const color = fragment.querySelector(".goal-color");
  const nameInput = fragment.querySelector(".goal-name");
  const amountInput = fragment.querySelector(".goal-amount");
  const removeButton = fragment.querySelector(".remove-goal");

  color.style.background = COLORS[index % COLORS.length];
  nameInput.value = goal.name;
  amountInput.value = goal.amount;

  nameInput.addEventListener("input", () => {
    state.goals[index].name = nameInput.value;
    saveState();
  });

  amountInput.addEventListener("input", () => {
    state.goals[index].amount = safeNumber(amountInput.value);
    updateResults();
  });

  removeButton.addEventListener("click", () => {
    state.goals.splice(index, 1);
    renderGoals();
    updateResults();
  });

  row.dataset.index = String(index);
  return fragment;
}

function renderGoals() {
  elements.goalsList.replaceChildren();
  state.goals.forEach((goal, index) => {
    elements.goalsList.append(createGoalRow(goal, index));
  });
}

function createTaxRow(label, amount, className = "") {
  const row = document.createElement("div");
  row.className = `tax-row ${className}`.trim();
  const name = document.createElement("span");
  const value = document.createElement("strong");
  name.textContent = label;
  value.textContent = `${money.format(amount / 12)} / 月`;
  row.append(name, value);
  return row;
}

function renderIncomeBar(result, targetAnnual) {
  const gross = Math.max(1, result.grossIncome);
  const goalWidth = (targetAnnual / gross) * 100;
  const pretaxWidth = (result.pretaxDeductions / gross) * 100;
  const taxWidth = (result.totalTax / gross) * 100;

  elements.incomeBar.replaceChildren();
  [
    ["goals", goalWidth, "生活目标"],
    ["pretax", pretaxWidth, "税前扣除"],
    ["taxes", taxWidth, "预计税费"],
  ].forEach(([className, width, label]) => {
    const segment = document.createElement("span");
    segment.className = className;
    segment.style.width = `${Math.max(0, width)}%`;
    segment.title = `${label}: ${width.toFixed(1)}%`;
    elements.incomeBar.append(segment);
  });
}

function updateResults() {
  const monthlyGoals = state.goals.reduce((total, goal) => total + safeNumber(goal.amount), 0);
  const bufferMultiplier = 1 + state.buffer / 100;
  const targetAnnual = monthlyGoals * bufferMultiplier * 12;
  const pretaxAnnual = state.pretaxDeductions * 12;
  const result = solveRequiredGross({
    targetTakeHome: targetAnnual,
    filingStatus: state.filingStatus,
    pretaxDeductions: pretaxAnnual,
  });

  elements.bufferValue.textContent = `${state.buffer}%`;
  elements.monthlyGoalTotal.textContent = money.format(monthlyGoals);
  elements.annualGross.textContent = money.format(Math.ceil(result.grossIncome / 100) * 100);
  elements.monthlyGross.textContent = money.format(result.grossIncome / 12);
  elements.monthlyTakeHome.textContent = money.format(result.takeHome / 12);
  elements.effectiveTaxRate.textContent = `${(result.effectiveTaxRate * 100).toFixed(1)}%`;

  renderIncomeBar(result, targetAnnual);
  elements.taxRows.replaceChildren(
    createTaxRow("Federal income tax", result.taxes.federalIncomeTax),
    createTaxRow("California income tax", result.taxes.californiaIncomeTax),
    createTaxRow("Social Security", result.taxes.socialSecurity),
    createTaxRow("Medicare", result.taxes.medicare),
    createTaxRow("CA SDI", result.taxes.californiaSdi),
    createTaxRow("预计税费合计", result.totalTax, "total"),
  );
  saveState();
}

elements.addGoal.addEventListener("click", () => {
  state.goals.push({ name: "新的生活目标", amount: 500 });
  renderGoals();
  updateResults();
  const lastRow = elements.goalsList.lastElementChild;
  lastRow?.querySelector(".goal-name")?.select();
});

elements.reset.addEventListener("click", () => {
  state = {
    goals: structuredClone(DEFAULT_GOALS),
    filingStatus: "single",
    pretaxDeductions: 0,
    buffer: 5,
  };
  syncControls();
  renderGoals();
  updateResults();
});

elements.filingStatus.addEventListener("change", () => {
  state.filingStatus = elements.filingStatus.value;
  updateResults();
});

elements.pretaxDeductions.addEventListener("input", () => {
  state.pretaxDeductions = safeNumber(elements.pretaxDeductions.value);
  updateResults();
});

elements.buffer.addEventListener("input", () => {
  state.buffer = safeNumber(elements.buffer.value);
  updateResults();
});

function syncControls() {
  elements.filingStatus.value = state.filingStatus;
  elements.pretaxDeductions.value = state.pretaxDeductions;
  elements.buffer.value = state.buffer;
}

syncControls();
renderGoals();
updateResults();
