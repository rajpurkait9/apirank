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

export async function probeApi(input: ProbeInput): Promise<ProbeResult> {
  const response = await fetch(`${API_URL}/v1/probe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

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
