const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type HeaderPair = { name: string; value: string };

export type RankLetter = "S" | "A" | "B" | "C" | "D" | "F";

export type ProbeResult = {
  success: true;
  target: {
    url: string;
    method: string;
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
  runs: Array<{
    index: number;
    ok: boolean;
    statusCode: number | null;
    durationMs: number;
    error: string | null;
    responseBytes: number | null;
    ttfbMs: number | null;
  }>;
  sample: {
    statusCode: number | null;
    contentType: string | null;
    bodyPreview: string | null;
  };
};

export type ProbeInput = {
  url: string;
  method: string;
  headers: HeaderPair[];
  body?: string;
  runs: number;
};

export type BarrageEndpoint = {
  id: string;
  method: string;
  url: string;
};

export type BarrageExecution = "sequential" | "concurrent" | "parallel";

export type BarrageItemResult =
  | { id: string; ok: true; result: ProbeResult }
  | { id: string; ok: false; method: string; url: string; error: string };

export type BarrageResult = {
  execution: BarrageExecution;
  concurrency: number;
  elapsedMs: number;
  items: BarrageItemResult[];
};

async function parseProbeResponse(response: Response): Promise<ProbeResult> {
  const raw = await response.text();
  let data: (ProbeResult & { error?: string }) | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as ProbeResult & { error?: string };
    } catch {
      throw new Error(
        raw.startsWith("Internal Server Error")
          ? "Server error — is the API running on port 3000?"
          : raw.slice(0, 200),
      );
    }
  }

  if (!response.ok || !data?.success) {
    throw new Error(
      data && typeof data === "object" && data.error
        ? String(data.error)
        : `Probe failed (${response.status})`,
    );
  }

  return data;
}

export async function probeApi(input: ProbeInput): Promise<ProbeResult> {
  const response = await fetch(`${API_URL}/v1/probe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseProbeResponse(response);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      const item = items[current];
      if (item === undefined) continue;
      results[current] = await worker(item, current);
    }
  }

  const pool = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: pool }, () => runWorker()));
  return results;
}

export async function barrageProbe(input: {
  endpoints: BarrageEndpoint[];
  headers: HeaderPair[];
  body?: string;
  runs: number;
  execution: BarrageExecution;
  concurrency: number;
}): Promise<BarrageResult> {
  const started = performance.now();
  const endpoints = input.endpoints.filter((e) => e.url.trim());

  async function probeOne(endpoint: BarrageEndpoint): Promise<BarrageItemResult> {
    try {
      const result = await probeApi({
        url: endpoint.url.trim(),
        method: endpoint.method,
        headers: input.headers,
        body: input.body,
        runs: input.runs,
      });
      return { id: endpoint.id, ok: true, result };
    } catch (error) {
      return {
        id: endpoint.id,
        ok: false,
        method: endpoint.method,
        url: endpoint.url.trim(),
        error: error instanceof Error ? error.message : "Probe failed",
      };
    }
  }

  let items: BarrageItemResult[];

  if (input.execution === "sequential") {
    items = [];
    for (const endpoint of endpoints) {
      items.push(await probeOne(endpoint));
    }
  } else if (input.execution === "parallel") {
    items = await Promise.all(endpoints.map((endpoint) => probeOne(endpoint)));
  } else {
    items = await mapWithConcurrency(endpoints, input.concurrency, (endpoint) =>
      probeOne(endpoint),
    );
  }

  return {
    execution: input.execution,
    concurrency: input.concurrency,
    elapsedMs: performance.now() - started,
    items,
  };
}
