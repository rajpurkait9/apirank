import { useMutation } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import {
  type BarrageEndpoint,
  type BarrageExecution,
  type BarrageResult,
  barrageProbe,
  type HeaderPair,
  type ProbeResult,
  probeApi,
} from "./api";
import "./styles.css";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
type Mode = "single" | "barrage";

type HeaderRow = HeaderPair & { id: string };

function newHeader(name = "", value = ""): HeaderRow {
  return { id: crypto.randomUUID(), name, value };
}

function newEndpoint(method: string = "GET", url = ""): BarrageEndpoint {
  return { id: crypto.randomUUID(), method, url };
}

function formatMs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value < 10) return `${value.toFixed(1)} ms`;
  return `${Math.round(value)} ms`;
}

function gradeTone(grade: string): string {
  switch (grade) {
    case "S":
    case "A":
      return "tone-good";
    case "B":
      return "tone-ok";
    case "C":
      return "tone-mid";
    case "D":
      return "tone-poor";
    default:
      return "tone-bad";
  }
}

function ProbePage() {
  const [mode, setMode] = useState<Mode>("single");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GET");
  const [endpoints, setEndpoints] = useState<BarrageEndpoint[]>([
    newEndpoint("GET", ""),
    newEndpoint("GET", ""),
  ]);
  const [execution, setExecution] = useState<BarrageExecution>("concurrent");
  const [concurrency, setConcurrency] = useState(3);
  const [runs, setRuns] = useState(5);
  const [headers, setHeaders] = useState<HeaderRow[]>([newHeader("Accept", "application/json")]);
  const [body, setBody] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [singleResult, setSingleResult] = useState<ProbeResult | null>(null);
  const [barrageResult, setBarrageResult] = useState<BarrageResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sharedHeaders = () => headers.filter((h) => h.name.trim());
  const sharedBody = () => (body.trim() ? body : undefined);
  const filledEndpoints = endpoints.filter((e) => e.url.trim());

  const singleProbe = useMutation({
    mutationFn: () =>
      probeApi({
        url: url.trim(),
        method,
        headers: sharedHeaders(),
        body: sharedBody(),
        runs,
      }),
    onSuccess: (data) => {
      setBarrageResult(null);
      setSingleResult(data);
    },
  });

  const barrage = useMutation({
    mutationFn: () =>
      barrageProbe({
        endpoints: filledEndpoints,
        headers: sharedHeaders(),
        body: sharedBody(),
        runs,
        execution,
        concurrency,
      }),
    onSuccess: (data) => {
      setSingleResult(null);
      setBarrageResult(data);
      const firstOk = data.items.find((item) => item.ok);
      setExpandedId(firstOk?.id ?? null);
    },
  });

  const isPending = singleProbe.isPending || barrage.isPending;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "single") {
      if (!url.trim()) return;
      singleProbe.mutate();
      return;
    }
    if (filledEndpoints.length === 0) return;
    barrage.mutate();
  }

  function updateHeader(id: string, patch: Partial<HeaderPair>) {
    setHeaders((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeHeader(id: string) {
    setHeaders((prev) => prev.filter((row) => row.id !== id));
  }

  function updateEndpoint(id: string, patch: Partial<BarrageEndpoint>) {
    setEndpoints((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeEndpoint(id: string) {
    setEndpoints((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  }

  function switchMode(next: Mode) {
    setMode(next);
    setSingleResult(null);
    setBarrageResult(null);
    setExpandedId(null);
  }

  function loadBarrageDemo() {
    setEndpoints([
      newEndpoint("GET", "https://httpbin.org/get"),
      newEndpoint("GET", "https://jsonplaceholder.typicode.com/posts/1"),
      newEndpoint("GET", "https://httpbin.org/delay/1"),
    ]);
  }

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true" />

      <main className="stage">
        <section className="hero">
          <p className="brand-mark">APIRank</p>
          <h1>
            {mode === "single"
              ? "Test any API. Get a performance rank."
              : "Barrage multiple APIs. Rank them all."}
          </h1>
          <p className="lede">
            {mode === "single"
              ? "Paste a public endpoint. We run timed requests and score speed, reliability, and consistency — no account needed."
              : "Add many endpoints, fire them sequentially, concurrently, or in full parallel, then compare ranks side by side."}
          </p>
        </section>

        <section className="workbench" aria-label="API performance test">
          <div className="mode-switch" role="tablist" aria-label="Test mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "single"}
              className={mode === "single" ? "mode-btn is-active" : "mode-btn"}
              onClick={() => switchMode("single")}
            >
              Single
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "barrage"}
              className={mode === "barrage" ? "mode-btn is-active" : "mode-btn"}
              onClick={() => switchMode("barrage")}
            >
              Barrage
            </button>
          </div>

          <form className="probe-form" onSubmit={onSubmit}>
            {mode === "single" ? (
              <>
                <div className="url-bar">
                  <label className="method-field">
                    <span className="sr-only">HTTP method</span>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value as typeof method)}
                      aria-label="HTTP method"
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="url-field">
                    <span className="sr-only">API URL</span>
                    <input
                      type="url"
                      required
                      placeholder="https://api.example.com/v1/health"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      autoComplete="url"
                    />
                  </label>
                  <button type="submit" className="primary" disabled={isPending || !url.trim()}>
                    {isPending ? <span className="pulse-label">Testing…</span> : "Test & rank"}
                  </button>
                </div>

                <div className="quick-hints">
                  <span>Try:</span>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setUrl("https://httpbin.org/get")}
                  >
                    httpbin.org/get
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setUrl("https://httpbin.org/delay/1")}
                  >
                    slow endpoint
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setUrl("https://jsonplaceholder.typicode.com/posts/1")}
                  >
                    jsonplaceholder
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <div className="field-label-row">
                    <span>Endpoints</span>
                    <div className="row-actions">
                      <button type="button" className="ghost" onClick={loadBarrageDemo}>
                        Load demo set
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setEndpoints((prev) => [...prev, newEndpoint()])}
                      >
                        Add endpoint
                      </button>
                    </div>
                  </div>
                  <div className="endpoint-list">
                    {endpoints.map((endpoint, index) => (
                      <div className="endpoint-row" key={endpoint.id}>
                        <select
                          value={endpoint.method}
                          onChange={(e) => updateEndpoint(endpoint.id, { method: e.target.value })}
                          aria-label={`Endpoint ${index + 1} method`}
                        >
                          {METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <input
                          type="url"
                          placeholder={`https://api.example.com/path-${index + 1}`}
                          value={endpoint.url}
                          onChange={(e) => updateEndpoint(endpoint.id, { url: e.target.value })}
                          aria-label={`Endpoint ${index + 1} URL`}
                        />
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => removeEndpoint(endpoint.id)}
                          disabled={endpoints.length <= 1}
                          aria-label={`Remove endpoint ${index + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <fieldset className="execution-fieldset">
                  <legend>Execution</legend>
                  <div className="execution-options">
                    {(
                      [
                        {
                          value: "sequential",
                          title: "Sequential",
                          detail: "One endpoint after another",
                        },
                        {
                          value: "concurrent",
                          title: "Concurrent",
                          detail: "Limited overlap (safer on targets)",
                        },
                        {
                          value: "parallel",
                          title: "Parallel",
                          detail: "All endpoints at once",
                        },
                      ] as const
                    ).map((option) => (
                      <label
                        key={option.value}
                        className={
                          execution === option.value
                            ? "execution-card is-selected"
                            : "execution-card"
                        }
                      >
                        <input
                          type="radio"
                          name="execution"
                          value={option.value}
                          checked={execution === option.value}
                          onChange={() => setExecution(option.value)}
                        />
                        <span className="execution-title">{option.title}</span>
                        <span className="execution-detail">{option.detail}</span>
                      </label>
                    ))}
                  </div>

                  {execution === "concurrent" ? (
                    <label className="field concurrency-field">
                      <span>Concurrency limit</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={concurrency}
                        onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
                      />
                    </label>
                  ) : null}
                </fieldset>

                <div className="barrage-actions">
                  <button
                    type="submit"
                    className="primary"
                    disabled={isPending || filledEndpoints.length === 0}
                  >
                    {isPending ? (
                      <span className="pulse-label">Barraging…</span>
                    ) : (
                      `Rank ${filledEndpoints.length || ""} endpoint${filledEndpoints.length === 1 ? "" : "s"}`
                    )}
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              className="advanced-toggle"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen ? "Hide options" : "Headers, body & runs"}
            </button>

            {advancedOpen ? (
              <div className="advanced">
                <label className="field">
                  <span>Runs per endpoint (1–10)</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={runs}
                    onChange={(e) => setRuns(Number(e.target.value) || 1)}
                  />
                </label>

                <div className="field">
                  <div className="field-label-row">
                    <span>Headers (shared)</span>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setHeaders((prev) => [...prev, newHeader()])}
                    >
                      Add header
                    </button>
                  </div>
                  <div className="header-list">
                    {headers.map((header, index) => (
                      <div className="header-row" key={header.id}>
                        <input
                          placeholder="Name"
                          value={header.name}
                          onChange={(e) => updateHeader(header.id, { name: e.target.value })}
                          aria-label={`Header ${index + 1} name`}
                        />
                        <input
                          placeholder="Value"
                          value={header.value}
                          onChange={(e) => updateHeader(header.id, { value: e.target.value })}
                          aria-label={`Header ${index + 1} value`}
                        />
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => removeHeader(header.id)}
                          aria-label={`Remove header ${index + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {(mode === "single" ? method !== "GET" && method !== "HEAD" : true) ? (
                  <label className="field">
                    <span>Body (shared{mode === "barrage" ? ", used for non-GET" : ""})</span>
                    <textarea
                      rows={5}
                      placeholder='{"hello":"world"}'
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {singleProbe.isError ? (
              <p className="error">{(singleProbe.error as Error).message}</p>
            ) : null}
            {barrage.isError ? <p className="error">{(barrage.error as Error).message}</p> : null}
          </form>
        </section>

        {isPending ? (
          <section className="results pending" aria-live="polite">
            <div className="pending-meter" />
            <p>
              {mode === "single"
                ? `Running ${runs} timed request${runs === 1 ? "" : "s"} against your API…`
                : `Barraging ${filledEndpoints.length} endpoint${filledEndpoints.length === 1 ? "" : "s"} (${execution})…`}
            </p>
          </section>
        ) : null}

        {singleResult && !isPending ? <ResultsPanel result={singleResult} /> : null}

        {barrageResult && !isPending ? (
          <BarrageResults result={barrageResult} expandedId={expandedId} onExpand={setExpandedId} />
        ) : null}
      </main>
    </div>
  );
}

function BarrageResults({
  result,
  expandedId,
  onExpand,
}: {
  result: BarrageResult;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
}) {
  const ranked = [...result.items].sort((a, b) => {
    const scoreA = a.ok ? a.result.score.overall : -1;
    const scoreB = b.ok ? b.result.score.overall : -1;
    return scoreB - scoreA;
  });
  const okCount = result.items.filter((item) => item.ok).length;
  const expanded = ranked.find((item) => item.id === expandedId) ?? null;

  return (
    <section className="results reveal" aria-live="polite">
      <div className="barrage-summary">
        <div>
          <p className="eyebrow">Barrage leaderboard</p>
          <h2>
            {okCount}/{result.items.length} ranked
          </h2>
          <p className="muted mono">
            {result.execution}
            {result.execution === "concurrent" ? ` ×${result.concurrency}` : ""} · wall{" "}
            {formatMs(result.elapsedMs)}
          </p>
        </div>
      </div>

      <div className="leaderboard">
        {ranked.map((item, index) => {
          if (!item.ok) {
            return (
              <div className="leader-row is-fail" key={item.id}>
                <span className="leader-rank mono">—</span>
                <div className="leader-main">
                  <strong className="break">
                    {item.method} {item.url}
                  </strong>
                  <p className="error">{item.error}</p>
                </div>
                <span className="leader-grade tone-bad">F</span>
              </div>
            );
          }

          const { result: probe } = item;
          const selected = expandedId === item.id;

          return (
            <button
              type="button"
              key={item.id}
              className={selected ? "leader-row is-selected" : "leader-row"}
              onClick={() => onExpand(selected ? null : item.id)}
            >
              <span className="leader-rank mono">#{index + 1}</span>
              <div className="leader-main">
                <strong className="break">
                  {probe.target.method} {probe.target.url}
                </strong>
                <p className="muted mono">
                  {probe.score.label} · p50 {formatMs(probe.summary.p50Ms)} ·{" "}
                  {Math.round(probe.summary.successRate * 100)}% ok
                </p>
              </div>
              <span className={`leader-grade ${gradeTone(probe.score.grade)}`}>
                {probe.score.grade}
                <small>{probe.score.overall}</small>
              </span>
            </button>
          );
        })}
      </div>

      {expanded?.ok ? (
        <div className="barrage-detail">
          <ResultsPanel result={expanded.result} compact />
        </div>
      ) : null}
    </section>
  );
}

function ResultsPanel({ result, compact = false }: { result: ProbeResult; compact?: boolean }) {
  const { score, summary, runs, sample, target } = result;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score.overall / 100) * circumference;

  return (
    <section className={compact ? "results-inner" : "results reveal"} aria-live="polite">
      <div className="results-head">
        <div className={`grade-orb ${gradeTone(score.grade)}`}>
          <svg viewBox="0 0 120 120" className="grade-ring" aria-hidden="true">
            <circle className="ring-track" cx="60" cy="60" r="54" />
            <circle
              className="ring-value"
              cx="60"
              cy="60"
              r="54"
              style={{
                strokeDasharray: `${circumference}`,
                strokeDashoffset: offset,
              }}
            />
          </svg>
          <div className="grade-core">
            <span className="grade-letter">{score.grade}</span>
            <span className="grade-score">{score.overall}/100</span>
          </div>
        </div>
        <div className="results-copy">
          <p className="eyebrow">Performance rank</p>
          <h2>{score.label}</h2>
          <p className="muted break">
            {target.method} {target.url}
          </p>
          <p className="muted mono">
            {summary.successCount}/{target.runs} successful · p50 {formatMs(summary.p50Ms)} · p95{" "}
            {formatMs(summary.p95Ms)}
          </p>
        </div>
      </div>

      <div className="metric-strip">
        <Metric label="Average" value={formatMs(summary.avgMs)} />
        <Metric label="Fastest" value={formatMs(summary.minMs)} />
        <Metric label="Slowest" value={formatMs(summary.maxMs)} />
        <Metric label="Success" value={`${Math.round(summary.successRate * 100)}%`} />
      </div>

      <div className="category-grid">
        {score.categories.map((category) => (
          <article key={category.id} className="category">
            <div className="category-top">
              <h3>{category.label}</h3>
              <span className="mono">{category.score}</span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${category.score}%` }} />
            </div>
            <p>{category.detail}</p>
          </article>
        ))}
      </div>

      <div className="split">
        <div className="run-log">
          <h3>Run log</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>TTFB</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.index} className={run.ok ? undefined : "is-fail"}>
                    <td className="mono">{run.index}</td>
                    <td className="mono">{run.statusCode ?? "—"}</td>
                    <td className="mono">{formatMs(run.durationMs)}</td>
                    <td className="mono">{formatMs(run.ttfbMs)}</td>
                    <td>{run.error ?? (run.ok ? "OK" : "Failed")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sample">
          <h3>Response sample</h3>
          <p className="muted mono">
            {sample.statusCode ?? "—"}
            {sample.contentType ? ` · ${sample.contentType}` : ""}
          </p>
          <pre>
            <code>{sample.bodyPreview?.trim() || "No body captured for this run."}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value mono">{value}</span>
    </div>
  );
}

function NotFoundRedirect() {
  return <Navigate to="/" replace />;
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFoundRedirect,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProbePage,
});

const legacyLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const legacyRegisterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const routeTree = rootRoute.addChildren([indexRoute, legacyLoginRoute, legacyRegisterRoute]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundRedirect,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
