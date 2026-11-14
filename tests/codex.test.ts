import { afterEach, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { CodexEngine, sandboxFor, redactDiagnostic } from "../src/main/codex";

const engines: CodexEngine[] = [];
const cwd = resolve("tests/fixtures");
function engine(extra: Record<string, string> = {}) {
  const instance = new CodexEngine(process.execPath, {
    spawnArgs: [resolve("tests/fixtures/fake-codex.cjs")],
    version: "explicit fixture",
    requestTimeoutMs: 500,
    env: { ...process.env, ...extra },
  });
  engines.push(instance);
  return instance;
}
afterEach(async () => {
  await Promise.all(engines.splice(0).map((instance) => instance.disconnect()));
});

describe("Codex stdio client with an explicit mock provider", () => {
  it("initializes, discovers models and reports missing authentication without invented replies", async () => {
    const client = engine();
    const status = await client.connect();
    expect(status.connected).toBe(true);
    expect(status.account).toBeNull();
    expect(status.models).toHaveLength(1);
    expect(status.requiresOpenaiAuth).toBe(true);
    expect(await client.login()).toMatchObject({
      type: "chatgpt",
      authUrl: "https://auth.openai.com/fixture",
    });
  });
  it("streams a real protocol notification and resumes the same thread id", async () => {
    const client = engine();
    await client.connect();
    const created = await client.startThread(cwd, "workspace-write");
    const deltas: string[] = [];
    client.on("event", (event) => {
      if (event.method === "item/agentMessage/delta")
        deltas.push(event.params.delta);
    });
    const completed = new Promise<void>((done) =>
      client.once("event", function wait(event) {
        if (event.method === "turn/completed") done();
        else client.once("event", wait);
      }),
    );
    const turn = await client.send(
      created.thread.id,
      "fixture",
      cwd,
      "workspace-write",
    );
    expect(turn.echoedPolicy).toEqual(sandboxFor("workspace-write", cwd));
    await completed;
    expect(deltas).toEqual(["Explicit fixture reply."]);
    const resumed = await client.resumeThread(
      created.thread.id,
      cwd,
      "workspace-write",
    );
    expect(resumed.thread.id).toBe(created.thread.id);
    expect(resumed.thread.turns).toHaveLength(1);
    await client.rename(created.thread.id, "Fixture title");
    await client.archive(created.thread.id);
  });
  it("never changes an existing conversation working directory", async () => {
    const client = engine();
    await client.connect();
    const created = await client.startThread(cwd, "read-only");
    await expect(
      client.send(created.thread.id, "x", resolve("."), "read-only"),
    ).rejects.toThrow("different project");
    await expect(
      client.resumeThread(created.thread.id, resolve("."), "read-only"),
    ).rejects.toThrow("different project");
  });
  it("blocks tasks if a server returns weaker permissions", async () => {
    const client = engine({ JARVIS_FIXTURE_WEAK_POLICY: "1" });
    await client.connect();
    await expect(client.startThread(cwd, "read-only")).rejects.toThrow(
      "weaker policy",
    );
  });
  it("forwards approvals, validates answers and rejects stale answers", async () => {
    const client = engine();
    await client.connect();
    const created = await client.startThread(cwd, "workspace-write");
    const pending = new Promise<any>((done) =>
      client.on("event", (event) => {
        if (event.method === "approval") done(event.params);
      }),
    );
    await client.send(created.thread.id, "approval", cwd, "workspace-write");
    const approval = await pending;
    expect(approval.params.command).toBe("fixture command");
    expect(() =>
      client.respond(approval.id, { decision: "execute anything" }),
    ).toThrow("Unsupported");
    client.respond(approval.id, { decision: "decline" });
    expect(() => client.respond(approval.id, { decision: "accept" })).toThrow(
      "no longer pending",
    );
  });
  it("does not broaden additional grants through a generic approval", async () => {
    const client = engine();
    await client.connect();
    const created = await client.startThread(cwd, "workspace-write");
    const pending = new Promise<any>((done) =>
      client.on("event", (event) => {
        if (event.method === "approval") done(event.params);
      }),
    );
    await client.send(created.thread.id, "permissions", cwd, "workspace-write");
    const approval = await pending;
    expect(() =>
      client.respond(approval.id, {
        permissions: { network: { enabled: true } },
      }),
    ).toThrow("explicitly");
    client.respond(approval.id, { permissions: {} });
  });
  it("waits for interruption confirmation and never claims subprocess termination", async () => {
    const client = engine();
    await client.connect();
    const created = await client.startThread(cwd, "read-only");
    await client.send(created.thread.id, "hang", cwd, "read-only");
    const result = await client.stop(created.thread.id);
    expect(result.requested).toBe(true);
    expect(result.interrupted).toBe(true);
    expect(result.subprocessTerminationConfirmed).toBe(false);
    expect((await client.stop(created.thread.id)).requested).toBe(false);
  });
  it("times out once without repeating a mutation", async () => {
    const client = engine();
    await client.connect();
    await expect(client.request("fixture/no-response", {})).rejects.toThrow(
      "did not repeat",
    );
    expect(client.status.connected).toBe(true);
  });
  it("handles process failure and allows explicit reconnect", async () => {
    const client = engine();
    await client.connect();
    await expect(client.request("fixture/exit")).rejects.toThrow("exited");
    expect(client.status.connected).toBe(false);
    expect((await client.connect()).connected).toBe(true);
  });
  it("keeps malformed output out of protocol and redacts credentials in diagnostics", async () => {
    const client = engine();
    await client.connect();
    await client.request("fixture/bad-output");
    await new Promise((done) => setTimeout(done, 20));
    expect(client.diagnostics.join(" ")).toContain("non-JSON");
    expect(client.diagnostics.join(" ")).not.toContain("very-secret");
    expect(redactDiagnostic("access_token: secret-value")).not.toContain(
      "secret-value",
    );
    expect(redactDiagnostic("Bearer sk-private")).not.toContain("sk-private");
  });
  it("reports missing runtime without preventing local application startup", async () => {
    const client = new CodexEngine("/does/not/exist/jarvis-codex");
    engines.push(client);
    const status = await client.connect();
    expect(status.connected).toBe(false);
    expect(status.error).toBeTruthy();
  });
});

describe("sandbox policy mapping", () => {
  it("enforces workspace writes and default network restrictions", () => {
    expect(sandboxFor("read-only", cwd)).toEqual({
      type: "readOnly",
      networkAccess: false,
    });
    expect(sandboxFor("workspace-write", cwd)).toMatchObject({
      type: "workspaceWrite",
      writableRoots: [cwd],
      networkAccess: false,
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    });
    expect(sandboxFor("full", cwd)).toEqual({ type: "dangerFullAccess" });
    expect(() => sandboxFor("read-only", "relative")).toThrow("absolute");
    expect(() => sandboxFor("invalid" as any, cwd)).toThrow("Unsupported");
  });
});
