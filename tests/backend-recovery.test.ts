import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Backend } from "../src/main/backend";
import { defaults } from "../src/shared";
vi.mock("electron", () => ({
  safeStorage: {},
  dialog: {},
  clipboard: {},
  shell: {},
}));

const backends: Backend[] = [];
afterEach(() => backends.splice(0).forEach((backend) => backend.shutdown()));
function fixture() {
  let conversation = {
    id: "recovery-conversation",
    threadId: "persisted-codex-thread",
    title: "Existing conversation",
    project: process.cwd(),
    draft: "",
    archived: false,
  };
  const store = {
    list: vi.fn(() => [conversation]),
    conversation: vi.fn(() => conversation),
    settings: vi.fn(() => ({ ...defaults })),
    update: vi.fn((_id, patch) => {
      conversation = { ...conversation, ...patch };
      return conversation;
    }),
  };
  const codex = Object.assign(new EventEmitter(), {
    status: {
      connected: true,
      account: { type: "explicit-test-fixture" },
      requiresOpenaiAuth: false,
    },
    readThread: vi.fn(async () => ({
      thread: {
        id: conversation.threadId,
        status: { type: "idle" },
        turns: [{ id: "turn-1", status: "completed", items: [] }],
      },
    })),
    resumeThread: vi.fn(async () => ({
      thread: { id: conversation.threadId },
    })),
    send: vi.fn(async () => ({ turn: { id: "turn-1", status: "inProgress" } })),
    stop: vi.fn(async () => ({
      requested: true,
      interrupted: false,
      subprocessTerminationConfirmed: false,
    })),
  });
  const events: any[] = [];
  const backend = new Backend(
    store as any,
    codex as any,
    () => ({}) as any,
    (event) => events.push(event),
    { config: "/explicit-fixture/does-not-write" },
    () => {},
  );
  backends.push(backend);
  const drop = () => {
    codex.status.connected = false;
    codex.emit("event", { method: "connection", params: { connected: false } });
  };
  const reconnect = () => {
    codex.status.connected = true;
    codex.emit("event", { method: "connection", params: { connected: true } });
  };
  return {
    backend,
    store,
    codex,
    events,
    drop,
    reconnect,
    id: conversation.id,
  };
}

describe("backend recovery with an explicit mock Codex provider", () => {
  it("keeps unknown work busy when the connection drops without claiming it stopped", async () => {
    const f = fixture();
    await f.backend.invoke("chat.send", { id: f.id, text: "Initial request" });
    f.drop();
    expect(f.backend.hasActiveTurns()).toBe(true);
    await expect(
      f.backend.invoke("chat.send", { id: f.id, text: "A second request" }),
    ).rejects.toThrow("unknown outcome");
    expect(f.codex.send).toHaveBeenCalledTimes(1);
    expect(
      f.events.some((event) => event.method === "conversation.recovered"),
    ).toBe(false);
  });
  it("reads the saved state after reconnect and never replays a message during recovery", async () => {
    const f = fixture();
    await f.backend.invoke("chat.send", { id: f.id, text: "Initial request" });
    f.drop();
    f.reconnect();
    await expect(
      f.backend.invoke("chat.send", { id: f.id, text: "Potential duplicate" }),
    ).rejects.toThrow("Your message was not sent");
    expect(f.codex.readThread).toHaveBeenCalledWith("persisted-codex-thread");
    expect(f.backend.hasActiveTurns()).toBe(false);
    expect(f.codex.send).toHaveBeenCalledTimes(1);
    expect(
      f.events.find((event) => event.method === "conversation.recovered")
        ?.params,
    ).toMatchObject({ reviewRequired: true, status: "idle" });
    await f.backend.invoke("conversations.open", { id: f.id });
    await f.backend.invoke("chat.send", {
      id: f.id,
      text: "New request after reviewing history",
    });
    expect(f.codex.send).toHaveBeenCalledTimes(2);
  });
  it("does not clear busy when Codex still reports an active turn", async () => {
    const f = fixture();
    await f.backend.invoke("chat.send", { id: f.id, text: "Initial request" });
    f.drop();
    f.reconnect();
    f.codex.readThread.mockResolvedValue({
      thread: {
        id: "persisted-codex-thread",
        status: { type: "active" },
        turns: [{ id: "turn-1", status: "inProgress", items: [] }],
      },
    });
    await expect(
      f.backend.invoke("chat.send", { id: f.id, text: "Second request" }),
    ).rejects.toThrow("unknown outcome");
    expect(f.backend.hasActiveTurns()).toBe(true);
    expect(f.codex.send).toHaveBeenCalledTimes(1);
  });
  it("reconciles opening a conversation only after metadata and the latest turn confirm inactivity", async () => {
    const f = fixture();
    await f.backend.invoke("chat.send", { id: f.id, text: "Initial request" });
    f.drop();
    f.reconnect();
    f.codex.readThread.mockResolvedValueOnce({
      thread: {
        id: "persisted-codex-thread",
        status: { type: "idle" },
        turns: [{ id: "turn-1", status: "inProgress", items: [] }],
      },
    });
    await f.backend.invoke("conversations.open", { id: f.id });
    expect(f.backend.hasActiveTurns()).toBe(true);
    await f.backend.invoke("conversations.open", { id: f.id });
    expect(f.backend.hasActiveTurns()).toBe(false);
  });
  it("retains an unknown turn-start timeout until its saved state is inspected", async () => {
    const f = fixture();
    f.codex.send.mockRejectedValueOnce(
      new Error("turn/start timed out. Its result is unknown."),
    );
    await expect(
      f.backend.invoke("chat.send", { id: f.id, text: "Initial request" }),
    ).rejects.toThrow("timed out");
    expect(f.backend.hasActiveTurns()).toBe(true);
    await expect(
      f.backend.invoke("chat.send", { id: f.id, text: "Potential duplicate" }),
    ).rejects.toThrow("Your message was not sent");
    expect(f.codex.send).toHaveBeenCalledTimes(1);
    expect(f.backend.hasActiveTurns()).toBe(false);
  });
  it("clears uncertainty on a genuine completion event", async () => {
    const f = fixture();
    await f.backend.invoke("chat.send", { id: f.id, text: "Initial request" });
    f.drop();
    f.reconnect();
    f.codex.emit("event", {
      method: "turn/completed",
      params: {
        threadId: "persisted-codex-thread",
        turn: { id: "turn-1", status: "completed" },
      },
    });
    expect(f.backend.hasActiveTurns()).toBe(false);
    await f.backend.invoke("chat.send", { id: f.id, text: "Next request" });
    expect(f.codex.send).toHaveBeenCalledTimes(2);
  });
});
