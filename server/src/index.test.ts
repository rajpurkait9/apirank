import { describe, expect, test } from "bun:test";
import { app } from "./index.ts";

describe("GET /health", () => {
  test("returns the infrastructure health payload", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      service: "apirank-server",
    });
  });
});
