import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { guardMutation } from "../src/lib/api/guard";

function request(method: string, host: string, token?: string): Request {
  const headers: Record<string, string> = { host };
  if (token) headers["x-ai-radar-token"] = token;
  return new Request("http://localhost/api/test", {
    method,
    headers,
    ...(method === "GET" ? {} : { body: "{}" }),
  });
}

afterEach(() => {
  delete process.env.AI_RADAR_ACCESS_TOKEN;
});

describe("guardMutation", () => {
  it("povolí GET vždy", () => {
    assert.equal(guardMutation(request("GET", "radar.example.com")).ok, true);
  });

  it("povolí POST z localhostu", () => {
    assert.equal(guardMutation(request("POST", "127.0.0.1:3000")).ok, true);
    assert.equal(guardMutation(request("POST", "localhost:3000")).ok, true);
    assert.equal(guardMutation(request("POST", "[::1]:3000")).ok, true);
  });

  it("odmítne POST z cizí adresy bez tokenu", () => {
    const result = guardMutation(request("POST", "radar.example.com"));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.status : 0, 403);
  });

  it("vyžaduje token, když je nastavený", () => {
    process.env.AI_RADAR_ACCESS_TOKEN = "tajny-token";
    const denied = guardMutation(request("POST", "radar.example.com"));
    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false ? denied.status : 0, 401);

    const wrong = guardMutation(request("POST", "radar.example.com", "spatny"));
    assert.equal(wrong.ok, false);

    const allowed = guardMutation(request("POST", "radar.example.com", "tajny-token"));
    assert.equal(allowed.ok, true);
  });
});
