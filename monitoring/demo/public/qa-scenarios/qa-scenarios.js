const bootstrap = JSON.parse(document.getElementById("qa-scenarios-bootstrap").textContent);
const k6Config = bootstrap.k6 || {
  catalog: { packs: ["smoke"], scenarios: [], error: null },
  latestSummary: { found: false },
  runnerEnabled: false,
  defaultPack: "smoke",
  command: "npm run monitoring:scenario:k6 -- --pack smoke",
};
const templates = bootstrap.templates;
const chaosConfig = bootstrap.chaos || { enabled: false, scenarios: [] };

const k6ScenarioList = document.getElementById("k6-scenario-list");
const k6PackTabs = document.getElementById("k6-pack-tabs");
const k6RunPackButton = document.getElementById("k6-run-pack-button");
const k6RunSelectedButton = document.getElementById("k6-run-selected-button");
const k6SelectAllButton = document.getElementById("k6-select-all-button");
const k6ClearButton = document.getElementById("k6-clear-button");
const k6SummaryGrid = document.getElementById("k6-summary-grid");
const k6Status = document.getElementById("k6-status");
const scenarioList = document.getElementById("scenario-list");
const templateCount = document.getElementById("template-count");
const selectedCount = document.getElementById("selected-count");
const runStatus = document.getElementById("run-status");
const progressBar = document.getElementById("progress-bar");
const summaryGrid = document.getElementById("summary-grid");
const resultList = document.getElementById("result-list");
const runId = document.getElementById("run-id");
const runAllButton = document.getElementById("run-all-button");
const runSelectedButton = document.getElementById("run-selected-button");
const selectAllButton = document.getElementById("select-all-button");
const clearButton = document.getElementById("clear-button");
const chaosList = document.getElementById("chaos-list");
const chaosRunAllButton = document.getElementById("chaos-run-all-button");
const chaosRunSelectedButton = document.getElementById("chaos-run-selected-button");
const chaosSelectAllButton = document.getElementById("chaos-select-all-button");
const chaosClearButton = document.getElementById("chaos-clear-button");
const chaosCancelButton = document.getElementById("chaos-cancel-button");
const chaosRecoverButton = document.getElementById("chaos-recover-button");
const chaosSummaryGrid = document.getElementById("chaos-summary-grid");
const chaosStatus = document.getElementById("chaos-status");

const selectedScenarioIds = new Set(templates.map((template) => template.id));
const resultByScenarioId = new Map();
let isRunning = false;
let activeK6Pack = k6Config.defaultPack || "smoke";
const selectedK6ScenarioIds = new Set(
  (k6Config.catalog.scenarios || [])
    .filter((scenario) => scenario.pack === activeK6Pack)
    .map((scenario) => scenario.id),
);
const selectedChaosScenarioIds = new Set(chaosConfig.scenarios.map((scenario) => scenario.id));
const chaosRunByScenarioId = new Map();
let activeChaosBatchId = "";
let activeChaosRunId = "";
let chaosPollTimer = null;
let currentChaosSummary = {};

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return "";
  }

  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
}

function statusClass(status) {
  if (status === "pass") return "status-valid";
  if (status === "fail") return "status-invalid";
  if (status === "running") return "status-running";
  return "status-neutral";
}

function statusLabel(status) {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  if (status === "running") return "RUNNING";
  return "READY";
}

function getK6ScenariosForPack(pack) {
  const scenarios = k6Config.catalog.scenarios || [];
  return pack === "all" ? scenarios : scenarios.filter((scenario) => scenario.pack === pack);
}

function getSelectedK6Ids() {
  const availableIds = new Set(getK6ScenariosForPack(activeK6Pack).map((scenario) => scenario.id));
  return [...selectedK6ScenarioIds].filter((scenarioId) => availableIds.has(scenarioId));
}

function renderK6PackTabs() {
  if (!k6PackTabs) return;
  const packs = k6Config.catalog.packs || ["smoke"];
  k6PackTabs.innerHTML = packs.map((pack) => {
    const activeClass = pack === activeK6Pack ? "is-active" : "";
    const count = getK6ScenariosForPack(pack).length;
    return `<button class="pack-tab ${activeClass}" type="button" data-pack="${escapeText(pack)}">${escapeText(pack)} <span class="mono">${escapeText(count)}</span></button>`;
  }).join("");
}

function renderK6ScenarioList() {
  if (!k6ScenarioList) return;
  const scenarios = getK6ScenariosForPack(activeK6Pack);
  if (scenarios.length === 0) {
    k6ScenarioList.innerHTML = `<div class="empty-state">${escapeText(k6Config.catalog.error || "No k6 scenarios are configured.")}</div>`;
    return;
  }

  k6ScenarioList.innerHTML = scenarios.map((scenario) => {
    const checked = selectedK6ScenarioIds.has(scenario.id) ? "checked" : "";
    const tags = Array.isArray(scenario.tags) && scenario.tags.length > 0 ? scenario.tags.join(", ") : "untagged";
    return `<label class="scenario-item" data-k6-id="${escapeText(scenario.id)}">`
      + `<input type="checkbox" value="${escapeText(scenario.id)}" ${checked} />`
      + '<span class="scenario-copy">'
      + `<strong>${escapeText(scenario.name || scenario.id)}</strong>`
      + `<span class="muted">${escapeText(scenario.description)}</span>`
      + `<span class="tiny muted">${escapeText(scenario.pack)} · ${escapeText(tags)}</span>`
      + '</span>'
      + '<span class="scenario-state">'
      + `<span class="status-pill status-neutral">k6</span>`
      + '</span>'
      + '</label>';
  }).join("");
}

function renderK6Summary() {
  if (!k6SummaryGrid) return;
  const scenarios = k6Config.catalog.scenarios || [];
  const latest = k6Config.latestSummary || {};
  const checks = latest.summary?.metrics?.checks?.rate;
  const failures = latest.summary?.metrics?.mwa_scenario_failed?.rate;
  const values = [
    ["Scenarios", scenarios.length],
    ["Selected", getSelectedK6Ids().length],
    ["Latest checks", Number.isFinite(checks) ? `${Math.round(checks * 100)}%` : "none"],
    ["Failure rate", Number.isFinite(failures) ? `${Math.round(failures * 100)}%` : "none"],
  ];
  k6SummaryGrid.innerHTML = values.map(([label, value]) => (
    `<div class="summary-card"><span class="muted tiny">${escapeText(label)}</span><strong>${escapeText(value)}</strong></div>`
  )).join("");
}

function renderK6Status(message = "") {
  if (!k6Status) return;
  const latest = k6Config.latestSummary || {};
  if (message) {
    k6Status.innerHTML = message;
    return;
  }

  if (k6Config.catalog.error) {
    k6Status.innerHTML = `<div class="empty-state error">${escapeText(k6Config.catalog.error)}</div>`;
    return;
  }

  if (!latest.found) {
    k6Status.innerHTML = `<div class="empty-state">No k6 summary yet. Run <span class="mono">${escapeText(k6Config.command)}</span></div>`;
    return;
  }

  k6Status.innerHTML = '<div class="result-row">'
    + '<span class="status-pill status-valid">SUMMARY</span>'
    + '<strong>Latest k6 summary available</strong>'
    + `<span class="muted tiny mono">${escapeText(latest.source || "summary.json")}</span>`
    + '</div>';
}

function renderK6Panel() {
  renderK6PackTabs();
  renderK6ScenarioList();
  renderK6Summary();
  renderK6Status();
  if (k6RunSelectedButton) k6RunSelectedButton.disabled = getSelectedK6Ids().length === 0;
}

async function runK6Selection(mode) {
  const scenarioIds = mode === "selected" ? getSelectedK6Ids() : [];
  const command = scenarioIds.length > 0
    ? `npm run monitoring:scenario:k6 -- --scenario ${scenarioIds.join(",")}`
    : `npm run monitoring:scenario:k6 -- --pack ${activeK6Pack}`;

  renderK6Status(`<div class="empty-state">Starting k6: <span class="mono">${escapeText(command)}</span></div>`);
  try {
    const response = await fetch("/qa/scenarios/k6/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioIds, pack: activeK6Pack }),
    });
    const payload = await response.json();
    if (!payload.success) {
      renderK6Status(`<div class="empty-state">${escapeText((payload.errors || ["Run from CLI"]).join(" / "))}<br><span class="mono">${escapeText(payload.command || command)}</span></div>`);
      return;
    }
    renderK6Status(`<div class="result-row"><span class="status-pill status-valid">DONE</span><strong>k6 run completed</strong><span class="muted tiny mono">${escapeText(payload.command || command)}</span></div>`);
  } catch (error) {
    renderK6Status(`<div class="empty-state error">${escapeText(error instanceof Error ? error.message : "Unable to start k6")}</div>`);
  }
}

function getSelectedIds() {
  return templates
    .filter((template) => selectedScenarioIds.has(template.id))
    .map((template) => template.id);
}

function setRunningState(nextIsRunning) {
  isRunning = nextIsRunning;
  runAllButton.disabled = nextIsRunning;
  runSelectedButton.disabled = nextIsRunning || selectedScenarioIds.size === 0;
  selectAllButton.disabled = nextIsRunning;
  clearButton.disabled = nextIsRunning;
  scenarioList.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.disabled = nextIsRunning;
  });
}

function updateSelectedCount() {
  selectedCount.textContent = `${selectedScenarioIds.size} selected`;
  templateCount.textContent = `${templates.length} scenarios`;
  runSelectedButton.disabled = isRunning || selectedScenarioIds.size === 0;
}

function renderScenarioList() {
  scenarioList.innerHTML = templates.map((template) => {
    const checked = selectedScenarioIds.has(template.id) ? "checked" : "";
    const result = resultByScenarioId.get(template.id);
    const status = result?.status || "ready";
    const duration = result?.durationMs ? `<span class="duration mono">${escapeText(formatDuration(result.durationMs))}</span>` : "";
    const meta = `${template.stepCount} steps · ${template.mode}${template.group === "buyer" ? " · serialized buyer flow" : ""}`;

    return `<label class="scenario-item ${status === "fail" ? "has-failure" : ""}" data-scenario-id="${escapeText(template.id)}">`
      + `<input type="checkbox" value="${escapeText(template.id)}" ${checked} />`
      + '<span class="scenario-copy">'
      + `<strong>${escapeText(template.name)}</strong>`
      + `<span class="muted">${escapeText(template.description)}</span>`
      + `<span class="tiny muted">${escapeText(meta)}</span>`
      + '</span>'
      + '<span class="scenario-state">'
      + duration
      + `<span class="status-pill ${statusClass(status)}">${statusLabel(status)}</span>`
      + '</span>'
      + '</label>';
  }).join("");

  updateSelectedCount();
}

function renderSummary(summary = null) {
  const total = summary?.totalScenarios ?? templates.length;
  const passed = summary?.passedScenarios ?? 0;
  const failed = summary?.failedScenarios ?? 0;
  const running = isRunning ? selectedScenarioIds.size : 0;

  summaryGrid.innerHTML = [
    ["Total", total],
    ["Passed", passed],
    ["Failed", failed],
    ["Running", running],
  ].map(([label, value]) => `<div class="summary-card"><span class="muted tiny">${escapeText(label)}</span><strong>${escapeText(value)}</strong></div>`).join("");
}

function renderFailureDetails(result) {
  if (!Array.isArray(result.failures) || result.failures.length === 0) {
    return "";
  }

  return result.failures.map((failure) => {
    const assertionMarkup = Array.isArray(failure.assertions) && failure.assertions.length > 0
      ? failure.assertions.map((assertion) => (
        `<div class="assertion-row"><strong>${escapeText(assertion.label)}</strong>`
        + `<pre>expected: ${escapeText(JSON.stringify(assertion.expected, null, 2))}\nactual: ${escapeText(JSON.stringify(assertion.actual, null, 2))}</pre></div>`
      )).join("")
      : `<div class="assertion-row"><strong>${escapeText(failure.error || "Step failed")}</strong></div>`;

    return '<div class="failure-step">'
      + `<div class="failure-head"><strong>${escapeText(failure.label)}</strong><span class="chip mono">${escapeText(failure.status ?? "NO RESPONSE")}</span></div>`
      + `<div class="tiny muted mono">${escapeText(failure.method)} ${escapeText(failure.path)} · ${escapeText(formatDuration(failure.durationMs))}</div>`
      + assertionMarkup
      + `<pre>${escapeText(failure.preview || "")}</pre>`
      + '</div>';
  }).join("");
}

function renderResults(results = []) {
  if (results.length === 0) {
    resultList.innerHTML = '<div class="empty-state">Run all or selected scenarios to see results.</div>';
    return;
  }

  resultList.innerHTML = results.map((result) => {
    if (result.status === "pass") {
      return '<div class="result-row">'
        + `<span class="status-pill status-valid">PASS</span>`
        + `<strong>${escapeText(result.scenarioName)}</strong>`
        + `<span class="muted tiny">${escapeText(result.totalSteps)} steps · ${escapeText(formatDuration(result.durationMs))}</span>`
        + '</div>';
    }

    return `<details class="result-row result-failure" open>`
      + '<summary>'
      + `<span class="status-pill status-invalid">FAIL</span>`
      + `<strong>${escapeText(result.scenarioName)}</strong>`
      + `<span class="muted tiny">${escapeText(result.failedSteps)} failed · ${escapeText(formatDuration(result.durationMs))}</span>`
      + '</summary>'
      + `<div class="failure-list">${renderFailureDetails(result)}</div>`
      + '</details>';
  }).join("");
}

function setProgress(completed, total) {
  const ratio = total > 0 ? completed / total : 0;
  progressBar.style.width = `${Math.round(ratio * 100)}%`;
}

function markSelectedRunning(scenarioIds) {
  resultByScenarioId.clear();
  scenarioIds.forEach((scenarioId) => {
    resultByScenarioId.set(scenarioId, { status: "running" });
  });
  renderScenarioList();
  setProgress(0, scenarioIds.length);
  renderSummary({
    totalScenarios: scenarioIds.length,
    passedScenarios: 0,
    failedScenarios: 0,
  });
}

async function runScenarios(scenarioIds) {
  if (scenarioIds.length === 0 || isRunning) {
    return;
  }

  setRunningState(true);
  markSelectedRunning(scenarioIds);
  runStatus.className = "status-pill status-running";
  runStatus.textContent = "Running";
  runId.textContent = "running";
  resultList.innerHTML = '<div class="empty-state">Executing selected scenarios...</div>';

  try {
    const response = await fetch("/qa/scenarios/run-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioIds }),
    });
    const payload = await response.json();

    if (!payload.success) {
      throw new Error((payload.errors || ["Batch execution failed"]).join(" / "));
    }

    payload.results.forEach((result) => {
      resultByScenarioId.set(result.scenarioId, result);
    });
    runStatus.className = `status-pill ${payload.summary.passed ? "status-valid" : "status-invalid"}`;
    runStatus.textContent = payload.summary.passed ? "Passed" : "Failed";
    runId.textContent = payload.runId || "batch";
    renderSummary(payload.summary);
    renderScenarioList();
    renderResults(payload.results);
    setProgress(payload.summary.totalScenarios, payload.summary.totalScenarios);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch execution failed";
    runStatus.className = "status-pill status-invalid";
    runStatus.textContent = "Error";
    runId.textContent = "failed";
    resultList.innerHTML = `<div class="empty-state error">${escapeText(message)}</div>`;
  } finally {
    setRunningState(false);
    updateSelectedCount();
  }
}

k6PackTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pack]");
  if (!button) return;
  activeK6Pack = button.dataset.pack;
  selectedK6ScenarioIds.clear();
  getK6ScenariosForPack(activeK6Pack).forEach((scenario) => selectedK6ScenarioIds.add(scenario.id));
  renderK6Panel();
});

k6ScenarioList?.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;
  if (input.checked) {
    selectedK6ScenarioIds.add(input.value);
  } else {
    selectedK6ScenarioIds.delete(input.value);
  }
  renderK6Summary();
  if (k6RunSelectedButton) k6RunSelectedButton.disabled = getSelectedK6Ids().length === 0;
});

k6RunPackButton?.addEventListener("click", () => runK6Selection("pack"));
k6RunSelectedButton?.addEventListener("click", () => runK6Selection("selected"));
k6SelectAllButton?.addEventListener("click", () => {
  getK6ScenariosForPack(activeK6Pack).forEach((scenario) => selectedK6ScenarioIds.add(scenario.id));
  renderK6Panel();
});
k6ClearButton?.addEventListener("click", () => {
  selectedK6ScenarioIds.clear();
  renderK6Panel();
});

scenarioList.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) {
    return;
  }

  if (input.checked) {
    selectedScenarioIds.add(input.value);
  } else {
    selectedScenarioIds.delete(input.value);
  }
  updateSelectedCount();
});

runAllButton.addEventListener("click", () => {
  templates.forEach((template) => selectedScenarioIds.add(template.id));
  renderScenarioList();
  runScenarios(templates.map((template) => template.id));
});

runSelectedButton.addEventListener("click", () => {
  runScenarios(getSelectedIds());
});

selectAllButton.addEventListener("click", () => {
  templates.forEach((template) => selectedScenarioIds.add(template.id));
  renderScenarioList();
});

clearButton.addEventListener("click", () => {
  selectedScenarioIds.clear();
  renderScenarioList();
});

function chaosStatusClass(status) {
  if (status === "pass") return "status-valid";
  if (status === "running" || status === "queued") return "status-running";
  if (status === "blocked_by_safety_cap") return "status-neutral";
  if (status === "fail" || status === "cancelled") return "status-invalid";
  return "status-neutral";
}

function getChaosSelectedIds() {
  return chaosConfig.scenarios
    .filter((scenario) => selectedChaosScenarioIds.has(scenario.id))
    .map((scenario) => scenario.id);
}

function getLastPrometheusObservation(run) {
  return (run?.observations || [])
    .slice()
    .reverse()
    .find((observation) => observation.phase === "prometheus_poll");
}

function renderChaosSummary(summary = {}) {
  if (!chaosSummaryGrid) {
    return;
  }

  const values = [
    ["Total", summary.total ?? chaosConfig.scenarios.length],
    ["Queued", summary.queued ?? 0],
    ["Running", summary.running ?? 0],
    ["Passed", summary.passed ?? 0],
    ["Failed", summary.failed ?? 0],
    ["Blocked", summary.blocked ?? 0],
    ["Cancelled", summary.cancelled ?? 0],
  ];
  chaosSummaryGrid.innerHTML = values.map(([label, value]) => (
    `<div class="summary-card"><span class="muted tiny">${escapeText(label)}</span><strong>${escapeText(value)}</strong></div>`
  )).join("");
}

function renderChaosList() {
  if (!chaosList) {
    return;
  }

  if (chaosConfig.scenarios.length === 0) {
    chaosList.innerHTML = '<div class="empty-state">No chaos scenarios are configured.</div>';
    return;
  }

  const isBatchActive = (currentChaosSummary.queued || 0) > 0 || (currentChaosSummary.running || 0) > 0;
  chaosList.innerHTML = chaosConfig.scenarios.map((scenario) => {
    const checked = selectedChaosScenarioIds.has(scenario.id) ? "checked" : "";
    const disabled = isBatchActive ? "disabled" : "";
    const run = chaosRunByScenarioId.get(scenario.id);
    const status = run?.status || "ready";
    const alert = scenario.expectedAlert ? `alert ${scenario.expectedAlert}` : "no alert target";
    const lastPrometheus = getLastPrometheusObservation(run);
    const lastObservation = (run?.observations || []).slice(-1)[0];
    const phase = run ? `phase ${run.phase}` : "not run";
    const progress = run ? `${run.progress.completedSteps}/${run.progress.totalSteps}` : `${scenario.stepCount} steps`;
    const prometheusText = lastPrometheus ? ` · prom ${lastPrometheus.value}/${lastPrometheus.threshold}` : "";
    const observedAt = lastObservation ? ` · ${lastObservation.ts}` : "";

    return `<label class="chaos-item ${run?.status === "fail" ? "has-failure" : ""}" data-chaos-id="${escapeText(scenario.id)}">`
      + `<input type="checkbox" value="${escapeText(scenario.id)}" ${checked} ${disabled} />`
      + '<span class="scenario-copy">'
      + `<strong>${escapeText(scenario.name)}</strong>`
      + `<span class="muted">${escapeText(scenario.description)}</span>`
      + `<span class="tiny muted">${escapeText(formatDuration(scenario.estimatedDurationMs))} · ${escapeText(alert)}</span>`
      + `<span class="tiny muted mono">${escapeText(phase)} · ${escapeText(progress)}${escapeText(prometheusText)}${escapeText(observedAt)}</span>`
      + '</span>'
      + `<span class="status-pill ${chaosStatusClass(status)}">${escapeText(String(status).toUpperCase())}</span>`
      + '</label>';
  }).join("");
}

function renderChaosDetails(runs = []) {
  if (!chaosStatus) {
    return;
  }

  if (runs.length === 0) {
    chaosStatus.innerHTML = '<div class="empty-state">Run all or selected chaos scenarios to see progress.</div>';
    return;
  }

  const orderedRuns = runs.slice().sort((left, right) => new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime());
  chaosStatus.innerHTML = orderedRuns.map((run) => {
    const lastObservation = (run.observations || []).slice(-1)[0];
    const stepRows = (run.steps || []).map((step) => (
      '<div class="chaos-step">'
      + `<span class="status-pill ${chaosStatusClass(step.status)}">${escapeText(String(step.status || "pending").toUpperCase())}</span>`
      + `<strong>${escapeText(step.label || step.type)}</strong>`
      + `<span class="muted tiny">${escapeText(formatDuration(step.durationMs))}</span>`
      + `<pre>${escapeText(JSON.stringify(step.details || {}, null, 2))}</pre>`
      + '</div>'
    )).join("");

    return '<details class="chaos-current" open>'
      + '<summary>'
      + `<span class="status-pill ${chaosStatusClass(run.status)}">${escapeText(String(run.status).toUpperCase())}</span>`
      + `<strong>${escapeText(run.scenarioName)}</strong>`
      + `<span class="muted tiny">${escapeText(run.progress.completedSteps)} / ${escapeText(run.progress.totalSteps)} · ${escapeText(formatDuration(run.durationMs))}</span>`
      + '</summary>'
      + `<div class="tiny muted mono">phase ${escapeText(run.phase)}${lastObservation ? ` · ${escapeText(lastObservation.ts)} ${escapeText(lastObservation.phase)} ${escapeText(lastObservation.value ?? "")}` : ""}</div>`
      + (run.error ? `<div class="empty-state error">${escapeText(run.error)}</div>` : "")
      + (run.blockedReason ? `<div class="empty-state">${escapeText(run.blockedReason)}</div>` : "")
      + `<div class="chaos-steps">${stepRows || '<div class="empty-state">Waiting for the first phase...</div>'}</div>`
      + '</details>';
  }).join("");
}

function setChaosButtons(summary = {}) {
  const effectiveSummary = Object.keys(summary).length === 0 ? currentChaosSummary : summary;
  const selectedCount = selectedChaosScenarioIds.size;
  const isActive = (effectiveSummary.queued || 0) > 0 || (effectiveSummary.running || 0) > 0;
  if (chaosRunAllButton) chaosRunAllButton.disabled = !chaosConfig.enabled || isActive;
  if (chaosRunSelectedButton) chaosRunSelectedButton.disabled = !chaosConfig.enabled || isActive || selectedCount === 0;
  if (chaosSelectAllButton) chaosSelectAllButton.disabled = isActive;
  if (chaosClearButton) chaosClearButton.disabled = isActive;
  if (chaosCancelButton) chaosCancelButton.disabled = !effectiveSummary.activeRunId;
}

function applyChaosRuns(runs, summary = {}) {
  currentChaosSummary = summary;
  chaosRunByScenarioId.clear();
  runs.forEach((run) => {
    chaosRunByScenarioId.set(run.scenarioId, run);
  });
  activeChaosRunId = summary.activeRunId || runs.find((run) => run.status === "running")?.id || "";
  renderChaosSummary(summary);
  renderChaosList();
  renderChaosDetails(runs);
  setChaosButtons(summary);
}

async function pollChaosState() {
  try {
    const response = activeChaosBatchId
      ? await fetch(`/qa/chaos/batches/${encodeURIComponent(activeChaosBatchId)}`)
      : await fetch("/qa/chaos/runs");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error((payload.errors || ["Unable to poll chaos state"]).join(" / "));
    }

    const runs = payload.batch?.runs || payload.runs || [];
    const summary = payload.batch?.summary || payload.summary || {};
    applyChaosRuns(runs, summary);
    const isActive = (summary.queued || 0) > 0 || (summary.running || 0) > 0;
    if (!isActive && chaosPollTimer) {
      clearInterval(chaosPollTimer);
      chaosPollTimer = null;
    }
  } catch (error) {
    chaosStatus.innerHTML = `<div class="empty-state error">${escapeText(error instanceof Error ? error.message : "Unable to poll chaos state")}</div>`;
  }
}

function startChaosPolling() {
  if (chaosPollTimer) clearInterval(chaosPollTimer);
  chaosPollTimer = setInterval(pollChaosState, 5000);
}

async function startChaosBatch(scenarioIds) {
  if (scenarioIds.length === 0 || !chaosConfig.enabled) {
    return;
  }

  chaosStatus.innerHTML = '<div class="empty-state">Starting chaos batch...</div>';
  setChaosButtons({ queued: 1, running: 0, activeRunId: activeChaosRunId });
  try {
    const response = await fetch("/qa/chaos/run-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioIds }),
    });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error((payload.errors || ["Unable to start chaos batch"]).join(" / "));
    }
    activeChaosBatchId = payload.batch.id;
    applyChaosRuns(payload.batch.runs, payload.batch.summary);
    startChaosPolling();
  } catch (error) {
    chaosStatus.innerHTML = `<div class="empty-state error">${escapeText(error instanceof Error ? error.message : "Unable to start chaos batch")}</div>`;
    setChaosButtons();
  }
}

async function cancelActiveChaosRun() {
  if (!activeChaosRunId) {
    return;
  }
  const response = await fetch(`/qa/chaos/runs/${encodeURIComponent(activeChaosRunId)}/cancel`, { method: "POST" });
  const payload = await response.json();
  if (payload.success) {
    await pollChaosState();
  }
}

async function recoverChaos() {
  chaosStatus.innerHTML = '<div class="empty-state">Running recovery...</div>';
  try {
    const response = await fetch("/qa/chaos/recover", { method: "POST" });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error((payload.errors || ["Recovery failed"]).join(" / "));
    }
    activeChaosRunId = "";
    activeChaosBatchId = "";
    if (chaosPollTimer) clearInterval(chaosPollTimer);
    chaosStatus.innerHTML = `<div class="chaos-current"><span class="status-pill status-valid">RECOVERED</span><pre>${escapeText(JSON.stringify(payload.recovery, null, 2))}</pre></div>`;
    await pollChaosState();
  } catch (error) {
    chaosStatus.innerHTML = `<div class="empty-state error">${escapeText(error instanceof Error ? error.message : "Recovery failed")}</div>`;
  }
}

chaosList?.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;
  if (input.checked) {
    selectedChaosScenarioIds.add(input.value);
  } else {
    selectedChaosScenarioIds.delete(input.value);
  }
  setChaosButtons();
});

chaosRunAllButton?.addEventListener("click", () => {
  chaosConfig.scenarios.forEach((scenario) => selectedChaosScenarioIds.add(scenario.id));
  renderChaosList();
  startChaosBatch(chaosConfig.scenarios.map((scenario) => scenario.id));
});
chaosRunSelectedButton?.addEventListener("click", () => startChaosBatch(getChaosSelectedIds()));
chaosSelectAllButton?.addEventListener("click", () => {
  chaosConfig.scenarios.forEach((scenario) => selectedChaosScenarioIds.add(scenario.id));
  renderChaosList();
  setChaosButtons();
});
chaosClearButton?.addEventListener("click", () => {
  selectedChaosScenarioIds.clear();
  renderChaosList();
  setChaosButtons();
});
chaosCancelButton?.addEventListener("click", cancelActiveChaosRun);
chaosRecoverButton?.addEventListener("click", recoverChaos);

renderK6Panel();
renderScenarioList();
renderSummary();
setProgress(0, templates.length);
renderChaosSummary();
renderChaosList();
renderChaosDetails();
setChaosButtons();
