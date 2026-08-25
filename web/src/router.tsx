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
import { type HeaderPair, type ProbeResult, probeApi } from "./api";
import "./styles.css";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;

type HeaderRow = HeaderPair & { id: string };

function newHeader(name = "", value = ""): HeaderRow {
  return { id: crypto.randomUUID(), name, value };
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
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GET");
  const [runs, setRuns] = useState(5);
  const [headers, setHeaders] = useState<HeaderRow[]>([newHeader("Accept", "application/json")]);
  const [body, setBody] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  const probe = useMutation({
    mutationFn: () =>
      probeApi({
        url: url.trim(),
        method,
        headers: headers.filter((h) => h.name.trim()),
        body: body.trim() ? body : undefined,
        runs,
      }),
    onSuccess: (data) => setResult(data),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    probe.mutate();
  }

  function updateHeader(id: string, patch: Partial<HeaderPair>) {
    setHeaders((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeHeader(id: string) {
    setHeaders((prev) => prev.filter((row) => row.id !== id));
  }

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true" />

      <main className="stage">
        <section className="hero">
          <p className="brand-mark">APIRank</p>
          <h1>Test any API. Get a performance rank.</h1>
          <p className="lede">
            Paste a public endpoint. We run timed requests and score speed, reliability, and
            consistency — no account needed.
          </p>
        </section>

        <section className="workbench" aria-label="API performance test">
          <form className="probe-form" onSubmit={onSubmit}>
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
              <button type="submit" className="primary" disabled={probe.isPending || !url.trim()}>
                {probe.isPending ? <span className="pulse-label">Testing…</span> : "Test & rank"}
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
                  <span>Runs (1–10)</span>
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
                    <span>Headers</span>
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

                {method !== "GET" && method !== "HEAD" ? (
                  <label className="field">
                    <span>Body</span>
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

            {probe.isError ? <p className="error">{(probe.error as Error).message}</p> : null}
          </form>
        </section>

        {probe.isPending ? (
          <section className="results pending" aria-live="polite">
            <div className="pending-meter" />
            <p>
              Running {runs} timed request{runs === 1 ? "" : "s"} against your API…
            </p>
          </section>
        ) : null}

        {result && !probe.isPending ? <ResultsPanel result={result} /> : null}
      </main>
    </div>
  );
}

function ResultsPanel({ result }: { result: ProbeResult }) {
  const { score, summary, runs, sample, target } = result;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score.overall / 100) * circumference;

  return (
    <section className="results reveal" aria-live="polite">
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
