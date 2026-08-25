import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Hono } from "hono";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type HttpMethod = (typeof METHODS)[number];

const MAX_RUNS = 10;
const MIN_RUNS = 1;
const DEFAULT_RUNS = 5;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BODY_CHARS = 100_000;
const MAX_HEADER_CHARS = 8_000;
const MAX_RESPONSE_SAMPLE = 2_000;

type HeaderPair = { name: string; value: string };

type ProbeRequest = {
  url: string;
  method?: string;
  headers?: HeaderPair[];
  body?: string;
  runs?: number;
};

type RunResult = {
  index: number;
  ok: boolean;
  statusCode: number | null;
  durationMs: number;
  error: string | null;
  responseBytes: number | null;
  ttfbMs: number | null;
};

export type RankLetter = "S" | "A" | "B" | "C" | "D" | "F";

export type ProbeResponse = {
  success: true;
  target: {
    url: string;
    method: HttpMethod;
    runs: number;
  };
  summary: {
    successCount: number;
    failureCount: number;
    successRate: number;
    avgMs: number | null;
    minMs: number | null;
    maxMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    stdDevMs: number | null;
  };
  score: {
    overall: number;
    grade: RankLetter;
    label: string;
    categories: Array<{
      id: "speed" | "reliability" | "consistency" | "health";
      label: string;
      score: number;
      detail: string;
    }>;
  };
  runs: RunResult[];
  sample: {
    statusCode: number | null;
    contentType: string | null;
    bodyPreview: string | null;
  };
};

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "0.0.0.0") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")) return true;

  const parts = v.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return false;
  }

  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid URL (including https://).");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Local and internal hosts cannot be probed.");
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error("Private or loopback IP addresses cannot be probed.");
    }
    return parsed;
  }

  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error("Could not resolve the hostname.");
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error("Hostname resolves to a private network address.");
    }
  }

  return parsed;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0] ?? null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  const t = idx - lo;
  return a + (b - a) * t;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function scoreSpeed(p50: number | null): { score: number; detail: string } {
  if (p50 == null) return { score: 0, detail: "No successful timings" };
  if (p50 < 100) return { score: 100, detail: `${Math.round(p50)} ms median — excellent` };
  if (p50 < 200) return { score: 92, detail: `${Math.round(p50)} ms median — very fast` };
  if (p50 < 400) return { score: 80, detail: `${Math.round(p50)} ms median — solid` };
  if (p50 < 800) return { score: 62, detail: `${Math.round(p50)} ms median — acceptable` };
  if (p50 < 1500) return { score: 40, detail: `${Math.round(p50)} ms median — slow` };
  if (p50 < 3000) return { score: 22, detail: `${Math.round(p50)} ms median — very slow` };
  return { score: 8, detail: `${Math.round(p50)} ms median — critical lag` };
}

function scoreReliability(rate: number, runs: number): { score: number; detail: string } {
  const pct = Math.round(rate * 100);
  if (runs === 0) return { score: 0, detail: "No runs completed" };
  if (rate >= 1) return { score: 100, detail: `${pct}% success across ${runs} runs` };
  if (rate >= 0.8) return { score: 70, detail: `${pct}% success — intermittent failures` };
  if (rate >= 0.5) return { score: 40, detail: `${pct}% success — unreliable` };
  return { score: 10, detail: `${pct}% success — mostly failing` };
}

function scoreConsistency(
  dev: number | null,
  p50: number | null,
): { score: number; detail: string } {
  if (dev == null || p50 == null || p50 === 0) {
    return { score: 50, detail: "Need more successful runs to judge jitter" };
  }
  const cv = dev / p50;
  if (cv < 0.08) return { score: 100, detail: `±${Math.round(dev)} ms — very stable` };
  if (cv < 0.18) return { score: 85, detail: `±${Math.round(dev)} ms — consistent` };
  if (cv < 0.35) return { score: 65, detail: `±${Math.round(dev)} ms — moderate jitter` };
  if (cv < 0.6) return { score: 40, detail: `±${Math.round(dev)} ms — noisy` };
  return { score: 18, detail: `±${Math.round(dev)} ms — highly variable` };
}

function scoreHealth(statusCodes: number[]): { score: number; detail: string } {
  if (statusCodes.length === 0) return { score: 0, detail: "No HTTP responses received" };
  const ok = statusCodes.filter((c) => c >= 200 && c < 400).length;
  const rate = ok / statusCodes.length;
  const sample = statusCodes[0];
  if (rate === 1 && sample != null && sample < 300) {
    return { score: 100, detail: `HTTP ${sample} — healthy responses` };
  }
  if (rate === 1)
    return { score: 78, detail: `HTTP ${sample} — redirected or non-2xx success path` };
  if (rate >= 0.5) return { score: 45, detail: "Mixed success and error status codes" };
  return { score: 12, detail: "Mostly error status codes" };
}

function gradeFromScore(score: number): { grade: RankLetter; label: string } {
  if (score >= 95) return { grade: "S", label: "Elite" };
  if (score >= 85) return { grade: "A", label: "Excellent" };
  if (score >= 72) return { grade: "B", label: "Good" };
  if (score >= 58) return { grade: "C", label: "Fair" };
  if (score >= 40) return { grade: "D", label: "Poor" };
  return { grade: "F", label: "Critical" };
}

type RunOnceResult = RunResult & {
  contentType: string | null;
  bodyPreview: string | null;
};

async function runOnce(
  url: string,
  method: HttpMethod,
  headers: Headers,
  body: string | undefined,
  index: number,
  captureBody: boolean,
): Promise<RunOnceResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = performance.now();
  let ttfbMs: number | null = null;

  try {
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
      redirect: "follow",
    };
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = body;
    }

    const response = await fetch(url, init);
    ttfbMs = performance.now() - started;
    const contentType = response.headers.get("content-type");
    const buffer = await response.arrayBuffer();
    const durationMs = performance.now() - started;
    const bodyPreview = captureBody
      ? new TextDecoder().decode(buffer.slice(0, MAX_RESPONSE_SAMPLE))
      : null;

    return {
      index,
      ok: response.ok || (response.status >= 200 && response.status < 400),
      statusCode: response.status,
      durationMs,
      error: null,
      responseBytes: buffer.byteLength,
      ttfbMs,
      contentType,
      bodyPreview,
    };
  } catch (error) {
    const durationMs = performance.now() - started;
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
          : error.message
        : "Request failed";
    return {
      index,
      ok: false,
      statusCode: null,
      durationMs,
      error: message,
      responseBytes: null,
      ttfbMs,
      contentType: null,
      bodyPreview: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const probeRoutes = new Hono();

probeRoutes.post("/", async (c) => {
  const payload = (await c.req.json().catch(() => null)) as ProbeRequest | null;
  if (!payload || typeof payload.url !== "string" || !payload.url.trim()) {
    return c.json({ success: false, error: "URL is required." }, 400);
  }

  const methodRaw = (payload.method ?? "GET").toUpperCase();
  if (!METHODS.includes(methodRaw as HttpMethod)) {
    return c.json({ success: false, error: "Unsupported HTTP method." }, 400);
  }
  const method = methodRaw as HttpMethod;

  const runs = Math.min(
    MAX_RUNS,
    Math.max(
      MIN_RUNS,
      Number.isFinite(payload.runs) ? Math.floor(Number(payload.runs)) : DEFAULT_RUNS,
    ),
  );

  if (payload.body != null && payload.body.length > MAX_BODY_CHARS) {
    return c.json({ success: false, error: "Request body is too large." }, 400);
  }

  let target: URL;
  try {
    target = await assertPublicUrl(payload.url.trim());
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Invalid URL" },
      400,
    );
  }

  const headers = new Headers();
  const pairs = Array.isArray(payload.headers) ? payload.headers : [];
  let headerBudget = 0;
  for (const pair of pairs) {
    if (!pair?.name?.trim()) continue;
    const name = pair.name.trim();
    const value = String(pair.value ?? "");
    headerBudget += name.length + value.length;
    if (headerBudget > MAX_HEADER_CHARS) {
      return c.json({ success: false, error: "Headers are too large." }, 400);
    }
    const lower = name.toLowerCase();
    if (lower === "host" || lower === "content-length" || lower === "transfer-encoding") {
      continue;
    }
    headers.set(name, value);
  }
  if (!headers.has("user-agent")) {
    headers.set("user-agent", "APIRank-Probe/1.0");
  }
  if (!headers.has("accept")) {
    headers.set("accept", "*/*");
  }

  const body =
    payload.body != null && method !== "GET" && method !== "HEAD" ? payload.body : undefined;

  const detailed: RunOnceResult[] = [];
  for (let i = 0; i < runs; i += 1) {
    detailed.push(await runOnce(target.toString(), method, headers, body, i + 1, i === runs - 1));
  }
  const results: RunResult[] = detailed.map(({ contentType: _c, bodyPreview: _b, ...run }) => run);
  const last = detailed.at(-1);
  const sample: ProbeResponse["sample"] = {
    statusCode: last?.statusCode ?? null,
    contentType: last?.contentType ?? null,
    bodyPreview: last?.bodyPreview ?? null,
  };

  const successRuns = results.filter((r) => r.ok && r.statusCode != null);
  const durations = successRuns.map((r) => r.durationMs).sort((a, b) => a - b);
  const statusCodes = results
    .map((r) => r.statusCode)
    .filter((code): code is number => code != null);

  const successRate = results.length === 0 ? 0 : successRuns.length / results.length;
  const avgMs =
    durations.length === 0 ? null : durations.reduce((s, v) => s + v, 0) / durations.length;
  const p50Ms = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  const stdDevMs = stdDev(durations);

  const speed = scoreSpeed(p50Ms);
  const reliability = scoreReliability(successRate, results.length);
  const consistency = scoreConsistency(stdDevMs, p50Ms);
  const health = scoreHealth(statusCodes);

  const overall = Math.round(
    speed.score * 0.4 + reliability.score * 0.3 + consistency.score * 0.15 + health.score * 0.15,
  );
  const { grade, label } = gradeFromScore(overall);

  const response: ProbeResponse = {
    success: true,
    target: {
      url: target.toString(),
      method,
      runs,
    },
    summary: {
      successCount: successRuns.length,
      failureCount: results.length - successRuns.length,
      successRate,
      avgMs,
      minMs: durations[0] ?? null,
      maxMs: durations.at(-1) ?? null,
      p50Ms,
      p95Ms,
      stdDevMs,
    },
    score: {
      overall,
      grade,
      label,
      categories: [
        { id: "speed", label: "Speed", score: speed.score, detail: speed.detail },
        {
          id: "reliability",
          label: "Reliability",
          score: reliability.score,
          detail: reliability.detail,
        },
        {
          id: "consistency",
          label: "Consistency",
          score: consistency.score,
          detail: consistency.detail,
        },
        { id: "health", label: "Health", score: health.score, detail: health.detail },
      ],
    },
    runs: results,
    sample,
  };

  return c.json(response);
});
