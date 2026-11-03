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
  delete process.env.AI_RADAR_ALLOWED_HOSTS;
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

describe("guardMutation a AI_RADAR_ALLOWED_HOSTS", () => {
  it("povolí hostitele ze seznamu, i s portem a velkými písmeny", () => {
    process.env.AI_RADAR_ALLOWED_HOSTS = "192.168.3.241, NEMESIS";
    assert.equal(guardMutation(request("POST", "192.168.3.241:3000")).ok, true);
    assert.equal(guardMutation(request("POST", "nemesis:3000")).ok, true);
  });

  it("sníží hostitele zadaného jako URL nebo s portem", () => {
    process.env.AI_RADAR_ALLOWED_HOSTS = "https://radar.local:8443/, https://100.86.138.22";
    assert.equal(guardMutation(request("POST", "radar.local:8443")).ok, true);
    assert.equal(guardMutation(request("POST", "100.86.138.22:3000")).ok, true);
  });

  it("zvládne IPv6 v hranatých závorkách i bez nich", () => {
    process.env.AI_RADAR_ALLOWED_HOSTS = "fd7a:115c:a1e0::d035:8a17";
    assert.equal(guardMutation(request("POST", "[fd7a:115c:a1e0::d035:8a17]:3000")).ok, true);
    assert.equal(guardMutation(request("POST", "fd7a:115c:a1e0::d035:8a17")).ok, true);
  });

  it("hostitele mimo seznam dál odmítne", () => {
    process.env.AI_RADAR_ALLOWED_HOSTS = "192.168.3.241";
    const result = guardMutation(request("POST", "radar.example.com"));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.status : 0, 403);
    assert.match(result.ok === false ? result.message : "", /AI_RADAR_ALLOWED_HOSTS/);
    assert.match(result.ok === false ? result.message : "", /radar\.example\.com/);
  });

  it("nepustí allowlistem obcházet nastavený token", () => {
    process.env.AI_RADAR_ACCESS_TOKEN = "tajny-token";
    process.env.AI_RADAR_ALLOWED_HOSTS = "192.168.3.241";
    const result = guardMutation(request("POST", "192.168.3.241:3000"));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.status : 0, 401);
  });

  it("prázdný seznam nic nepovolí", () => {
    process.env.AI_RADAR_ALLOWED_HOSTS = "   ,  ";
    assert.equal(guardMutation(request("POST", "192.168.3.241:3000")).ok, false);
  });
});
