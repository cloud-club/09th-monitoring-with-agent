const bootstrap = JSON.parse(document.getElementById("qa-scenarios-bootstrap").textContent);
const templates = bootstrap.templates;
const defaultTemplateId = bootstrap.defaultTemplateId;
const monitoringLinks = bootstrap.monitoringLinks;

const templateList = document.getElementById("template-list");
const templateCount = document.getElementById("template-count");
const templateSearch = document.getElementById("template-search");
const editor = document.getElementById("scenario-editor");
const scenarioDescription = document.getElementById("scenario-description");
const validationPill = document.getElementById("validation-pill");
const editorDirty = document.getElementById("editor-dirty");
const validationErrors = document.getElementById("validation-errors");
const summaryGrid = document.getElementById("summary-grid");
const resultList = document.getElementById("result-list");
const runStatus = document.getElementById("run-status");
const runStatusDetail = document.getElementById("run-status-detail");
const executionGrid = document.getElementById("execution-grid");
const stepStatusList = document.getElementById("step-status-list");
const observabilityList = document.getElementById("observability-list");
const runButton = document.getElementById("run-button");
const validateButton = document.getElementById("validate-button");
const resetButton = document.getElementById("reset-button");
const formatButton = document.getElementById("format-button");
const copyButton = document.getElementById("copy-button");

let activeTemplateId = defaultTemplateId;
let pristineEditorValue = "";
let activeScenario = null;
let filterQuery = "";

function getTemplate(id) {
  return templates.find((template) => template.id === id) || templates[0];
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getStepCount(template) {
  return Array.isArray(template.steps) ? template.steps.length : 0;
}

function getAssertions(template) {
  const steps = Array.isArray(template.steps) ? template.steps : [];
  return steps.flatMap((step) => Array.isArray(step.assertions) ? step.assertions : []);
}

function getMethods(template) {
  const steps = Array.isArray(template.steps) ? template.steps : [];
  return [...new Set(steps.map((step) => step.method || "GET"))];
}

function deriveTemplateTags(template) {
  const text = JSON.stringify({
    id: template.id,
    name: template.name,
    description: template.description,
    steps: template.steps,
  }).toLowerCase();
  const tags = new Set([template.mode || "n/a", `${getStepCount(template)} steps`]);

  if (template.id?.startsWith("buyer-")) tags.add("buyer");
  if (text.includes("payment")) tags.add("payment");
  if (text.includes("cart")) tags.add("cart");
  if (text.includes("order")) tags.add("order");
  if (text.includes("catalog")) tags.add("catalog");
  if (text.includes("search")) tags.add("search");
  if (text.includes("recommendation")) tags.add("recommendation");
  if (text.includes("health") || text.includes("metrics")) tags.add("core");

  const hasExpectedFailure = getAssertions(template).some((assertion) => assertion.type === "status" && assertion.equals >= 400)
    || /fail|failure|not-found|validation|conflict/.test(text);
  tags.add(hasExpectedFailure ? "failure-path" : "success-path");
  getMethods(template).forEach((method) => tags.add(method));

  return [...tags];
}

function templateMatchesFilter(template) {
  if (filterQuery.length === 0) {
    return true;
  }
  const searchable = [
    template.id,
    template.name,
    template.description,
    ...deriveTemplateTags(template),
  ].join(" ").toLowerCase();
  return searchable.includes(filterQuery);
}

function getGroupedTemplates() {
  const visible = templates.filter(templateMatchesFilter);
  const buyerTemplates = visible.filter((template) => template.id.startsWith("buyer-"));
  const nonBuyerTemplates = visible.filter((template) => !template.id.startsWith("buyer-"));
  const backendTemplates = nonBuyerTemplates.filter((template) => (
    template.id !== "health-success"
    && template.id !== "metrics-text-check"
    && template.id !== "health-metrics-parallel"
    && template.id !== "route-not-found"
  ));
  const coreTemplates = nonBuyerTemplates.filter((template) => !backendTemplates.includes(template));
  return [
    ["Buyer journey scenarios", buyerTemplates],
    ["Backend API scenarios", backendTemplates],
    ["Core checks", coreTemplates],
  ];
}

function renderTemplates() {
  const groupedTemplates = getGroupedTemplates();
  const visibleCount = groupedTemplates.reduce((sum, [, groupTemplates]) => sum + groupTemplates.length, 0);
  templateCount.textContent = `${visibleCount} / ${templates.length}`;

  const renderGroup = (title, groupTemplates) => {
    if (groupTemplates.length === 0) {
      return "";
    }

    const cards = groupTemplates.map((template) => {
      const activeClass = template.id === activeTemplateId ? " is-active" : "";
      const tags = deriveTemplateTags(template)
        .map((tag) => `<span>${escapeText(tag)}</span>`)
        .join("");
      return `<button class="template-card${activeClass}" type="button" data-template-id="${escapeText(template.id)}">`
        + `<strong>${escapeText(template.name)}</strong>`
        + `<span class="muted tiny">${escapeText(template.description)}</span>`
        + `<div class="template-meta">${tags}</div>`
        + "</button>";
    }).join("");

    return `<section class="template-group"><h3 class="template-group-title"><span>${escapeText(title)}</span><span class="template-group-count">${groupTemplates.length} scenarios</span></h3>${cards}</section>`;
  };

  templateList.innerHTML = groupedTemplates.map(([title, groupTemplates]) => renderGroup(title, groupTemplates)).join("")
    || '<div class="empty-state">No scenarios match this search.</div>';
}

function getScenarioFromEditor() {
  return JSON.parse(editor.value);
}

function setDirtyState() {
  const dirty = editor.value !== pristineEditorValue;
  editorDirty.className = `status-pill ${dirty ? "status-running" : "status-neutral"}`;
  editorDirty.textContent = dirty ? "Unsaved edits" : "Clean";
}

function setValidationState(state, errors = []) {
  validationPill.className = `status-pill ${state === "valid" ? "status-valid" : state === "running" ? "status-running" : "status-invalid"}`;
  validationPill.textContent = state === "valid" ? "Valid scenario" : state === "running" ? "Running..." : "Validation failed";
  validationErrors.hidden = errors.length === 0;
  validationErrors.innerHTML = errors.map((error) => `<li>${escapeText(error)}</li>`).join("");
}

function renderExecutionProfile(template) {
  const steps = Array.isArray(template.steps) ? template.steps : [];
  const assertionCount = steps.reduce((sum, step) => sum + (Array.isArray(step.assertions) ? step.assertions.length : 0), 0);
  const methods = getMethods(template).join(", ") || "n/a";

  executionGrid.innerHTML = [
    ["Mode", template.mode || "n/a"],
    ["Steps", String(steps.length)],
    ["Assertions", String(assertionCount)],
    ["Methods", methods],
    ["Timeout", steps.some((step) => step.timeoutMs) ? "custom" : "8s default"],
    ["Endpoint", "/qa/scenarios/run"],
  ].map(([label, value]) => `<div class="execution-metric"><span class="muted tiny">${escapeText(label)}</span><strong>${escapeText(value)}</strong></div>`).join("");

  renderStepStatuses(steps, {});
}

function getStepKey(step, index) {
  return String(step.id || step.label || step.path || `step-${index + 1}`);
}

function statusClass(status) {
  if (status === "pass") return "status-valid";
  if (status === "fail") return "status-invalid";
  if (status === "running") return "status-running";
  return "status-neutral";
}

function setRunStatus(className, label, detail = "") {
  runStatus.className = `status-pill ${className}`;
  runStatus.textContent = label;
  if (!runStatusDetail) {
    return;
  }
  runStatusDetail.hidden = detail.length === 0;
  runStatusDetail.textContent = detail;
}

function renderStepStatuses(steps, statusByKey) {
  if (!Array.isArray(steps) || steps.length === 0) {
    stepStatusList.innerHTML = '<div class="empty-state">No steps loaded.</div>';
    return;
  }

  stepStatusList.innerHTML = steps.map((step, index) => {
    const key = getStepKey(step, index);
    const status = statusByKey[key] || "pending";
    return '<div class="step-status-item">'
      + '<div class="step-status-head">'
      + `<strong>${escapeText(step.label || step.path || key)}</strong>`
      + `<span class="status-pill ${statusClass(status)}">${escapeText(status.toUpperCase())}</span>`
      + "</div>"
      + `<div class="tiny muted mono">${escapeText((step.method || "GET") + " " + (step.path || ""))}</div>`
      + "</div>";
  }).join("");
}

function renderResultStepStatuses(results) {
  const steps = Array.isArray(activeScenario?.steps) ? activeScenario.steps : [];
  const statusByKey = {};
  results.forEach((result) => {
    statusByKey[String(result.id || result.label || result.path)] = result.passed ? "pass" : "fail";
  });
  renderStepStatuses(steps, statusByKey);
}

function resetResults() {
  summaryGrid.hidden = true;
  setRunStatus("status-valid", "No run yet");
  resultList.innerHTML = '<div class="result-card"><div class="result-body muted">Run a scenario to see step results here.</div></div>';
}

function loadTemplate(id) {
  const template = structuredClone(getTemplate(id));
  activeTemplateId = template.id;
  activeScenario = template;
  scenarioDescription.textContent = template.description;
  editor.value = JSON.stringify(template, null, 2);
  pristineEditorValue = editor.value;
  renderTemplates();
  renderExecutionProfile(template);
  renderObservability();
  setValidationState("valid");
  setDirtyState();
  resetResults();
}

async function validateCurrentScenario() {
  let scenario;
  try {
    scenario = getScenarioFromEditor();
  } catch (error) {
    setValidationState("invalid", [`JSON parse error: ${error.message}`]);
    return null;
  }

  const response = await fetch("/qa/scenarios/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: true, scenario }),
  });
  const payload = await response.json();
  if (!payload.success) {
    setValidationState("invalid", payload.errors || ["Validation failed"]);
    return null;
  }

  activeScenario = scenario;
  setValidationState("valid");
  renderExecutionProfile(scenario);
  return scenario;
}

function renderSummary(summary, mode, backendBaseUrl, runId) {
  summaryGrid.hidden = false;
  summaryGrid.innerHTML = [
    ["Mode", mode],
    ["Total steps", String(summary.totalSteps)],
    ["Passed", String(summary.passedSteps)],
    ["Failed", String(summary.failedSteps)],
  ].map(([label, value]) => `<article class="summary-card"><span class="muted tiny">${escapeText(label)}</span><strong>${escapeText(value)}</strong></article>`).join("");
  setRunStatus(
    summary.passed ? "status-valid" : "status-invalid",
    summary.passed ? "Passed" : "Failed",
    `${backendBaseUrl}${runId ? ` - ${runId}` : ""}`,
  );
}

function renderAssertions(assertions) {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    return '<div class="assertion-item">No assertions executed</div>';
  }

  return assertions.map((assertion) => {
    const actual = JSON.stringify(assertion.actual, null, 2);
    const expected = JSON.stringify(assertion.expected, null, 2);
    return `<div class="assertion-item ${assertion.passed ? "pass" : "fail"}">`
      + `<strong>${assertion.passed ? "PASS" : "FAIL"}</strong> - ${escapeText(assertion.label)}`
      + `<div class="assertion-detail tiny">expected: ${escapeText(expected)}\nactual: ${escapeText(actual)}</div>`
      + "</div>";
  }).join("");
}

function renderResults(results) {
  const orderedResults = results
    .map((result, index) => ({ result, index }))
    .sort((left, right) => {
      if (left.result.passed === right.result.passed) {
        return left.index - right.index;
      }
      return left.result.passed ? 1 : -1;
    });

  resultList.innerHTML = orderedResults.map(({ result }) => {
    const requestPreview = JSON.stringify({ headers: result.requestHeaders || {}, body: result.requestBody }, null, 2);
    const errorMarkup = result.error
      ? `<div class="assertion-item fail"><strong>Execution error</strong><div class="tiny muted">${escapeText(result.error)}</div></div>`
      : "";
    const statusText = result.status === null ? "NO RESPONSE" : `status ${result.status}`;
    return `<details class="result-card ${result.passed ? "result-pass" : "result-fail"}" ${result.passed ? "" : "open"}>`
      + '<summary class="result-summary">'
      + '<div class="result-head">'
      + `<div><strong>${escapeText(result.label)}</strong><div class="result-meta"><span class="mono">${escapeText(result.method + " " + result.path)}</span><span>${escapeText(statusText)}</span><span>${escapeText(result.durationMs)}ms</span><span>${escapeText(result.contentType || "n/a")}</span></div></div>`
      + `<div class="status-pill ${result.passed ? "status-valid" : "status-invalid"}">${result.passed ? "PASS" : "FAIL"}</div>`
      + "</div>"
      + "</summary>"
      + '<div class="result-body">'
      + `<div><div class="tiny muted">Request</div><pre>${escapeText(requestPreview)}</pre></div>`
      + `<div><div class="tiny muted">Response preview</div><pre>${escapeText(result.preview || "")}</pre></div>`
      + errorMarkup
      + `<div><div class="tiny muted">Assertions</div><div class="assertion-list">${renderAssertions(result.assertions)}</div></div>`
      + "</div>"
      + "</details>";
  }).join("");
}

function collectRequestIds(run) {
  const ids = new Set();
  if (run?.runId) {
    ids.add(run.runId);
  }

  (run?.results || []).forEach((result) => {
    Object.entries(result.requestHeaders || {}).forEach(([name, value]) => {
      if (name.toLowerCase() === "x-request-id" && typeof value === "string" && value.length > 0) {
        ids.add(value);
      }
    });
  });

  return [...ids];
}

function buildMonitoringUrls(run) {
  const requestIds = collectRequestIds(run);
  const logNeedle = requestIds[0] || "event_name";
  const encodedLogQuery = encodeURIComponent(`{service_name="mwa-backend"} |= "${logNeedle}"`);
  const encodedScenarioMetric = encodeURIComponent("mwa_monitoring_scenario_runs_total");
  const encodedHttpMetric = encodeURIComponent("rate(mwa_http_requests_total[5m])");

  return [
    ["Prometheus", `${monitoringLinks.prometheus}/graph?g0.expr=${encodedScenarioMetric}`, "scenario run counters"],
    ["HTTP Metrics", `${monitoringLinks.prometheus}/graph?g0.expr=${encodedHttpMetric}`, "backend request rate"],
    ["Loki", `${monitoringLinks.loki}/loki/api/v1/query?query=${encodedLogQuery}`, run ? "logs scoped by run/request id" : "backend event logs"],
    ["Grafana", `${monitoringLinks.grafana}/dashboards`, "provisioned dashboards"],
  ].map(([label, href, description]) => ({ label, href, description }));
}

function renderObservability(run = null) {
  const links = buildMonitoringUrls(run);
  const requestIds = collectRequestIds(run);
  const visibleRequestIds = requestIds.filter((id) => id !== run?.runId).slice(0, 3);
  const contextMarkup = run
    ? `<div class="run-context"><span class="chip mono">run ${escapeText(run.runId || "n/a")}</span>${visibleRequestIds.map((id) => `<span class="chip mono">${escapeText(id)}</span>`).join("")}</div>`
    : "";
  observabilityList.innerHTML = contextMarkup + links.map((link) => (
    `<a class="observability-link" href="${escapeText(link.href)}" target="_blank" rel="noreferrer">`
      + `<span><strong>${escapeText(link.label)}</strong><br><span class="tiny muted">${escapeText(link.description)}</span></span>`
      + `<span class="link-target mono">${escapeText(link.href)}</span>`
      + "</a>"
  )).join("");
}

async function formatEditor() {
  try {
    const scenario = getScenarioFromEditor();
    editor.value = JSON.stringify(scenario, null, 2);
    setValidationState("valid");
    setDirtyState();
  } catch (error) {
    setValidationState("invalid", [`JSON parse error: ${error.message}`]);
  }
}

async function copyEditor() {
  try {
    await navigator.clipboard.writeText(editor.value);
    copyButton.textContent = "Copied";
    setTimeout(() => {
      copyButton.textContent = "Copy JSON";
    }, 1200);
  } catch {
    setValidationState("invalid", ["Unable to copy JSON in this browser context."]);
  }
}

templateList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-id]");
  if (!button) {
    return;
  }
  loadTemplate(button.getAttribute("data-template-id"));
});

templateSearch.addEventListener("input", () => {
  filterQuery = templateSearch.value.trim().toLowerCase();
  renderTemplates();
});

editor.addEventListener("input", setDirtyState);

formatButton.addEventListener("click", formatEditor);
copyButton.addEventListener("click", copyEditor);

validateButton.addEventListener("click", async () => {
  await validateCurrentScenario();
});

resetButton.addEventListener("click", () => {
  loadTemplate(activeTemplateId);
});

runButton.addEventListener("click", async () => {
  const scenario = await validateCurrentScenario();
  if (!scenario) {
    return;
  }

  const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
  const runningStatuses = Object.fromEntries(steps.map((step, index) => [getStepKey(step, index), "running"]));
  setValidationState("running");
  runButton.disabled = true;
  setRunStatus("status-running", "Running");
  renderStepStatuses(steps, runningStatuses);

  try {
    const response = await fetch("/qa/scenarios/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    const payload = await response.json();

    if (!payload.success) {
      setValidationState("invalid", payload.errors || ["Execution failed"]);
      setRunStatus("status-invalid", "Execution blocked", (payload.errors || []).join(" / "));
      return;
    }

    setValidationState("valid");
    renderSummary(payload.run.summary, payload.run.mode, payload.run.backendBaseUrl, payload.run.runId);
    renderResults(payload.run.results);
    renderResultStepStatuses(payload.run.results);
    renderObservability(payload.run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    setValidationState("invalid", [message]);
    setRunStatus("status-invalid", "Execution failed", message);
  } finally {
    runButton.disabled = false;
  }
});

loadTemplate(defaultTemplateId);
