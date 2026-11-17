#!/usr/bin/env node
// Explicit JSON-RPC fixture for packaged voice-flow tests. Never used by production.
const fs = require("node:fs");
const readline = require("node:readline");
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli explicit-voice-flow-fixture\n");
  process.exit(0);
}
if (!process.env.JARVIS_VOICE_FIXTURE_LOG) {
  process.stderr.write(
    "This explicit fixture requires JARVIS_VOICE_FIXTURE_LOG.\n",
  );
  process.exit(2);
}
const log = (event) =>
  fs.appendFileSync(
    process.env.JARVIS_VOICE_FIXTURE_LOG,
    JSON.stringify(event) + "\n",
    { mode: 0o600 },
  );
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const threads = new Map();
let next = 1;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  const { method, params = {}, id } = request;
  const reply = (result) => send({ id, result });
  const policy = () => ({
    type:
      params.sandbox === "read-only"
        ? "readOnly"
        : params.sandbox === "workspace-write"
          ? "workspaceWrite"
          : "dangerFullAccess",
  });
  if (method === "initialize") {
    reply({ userAgent: "JARVIS EXPLICIT VOICE-FLOW FIXTURE" });
    return;
  }
  if (method === "initialized") return;
  if (method === "account/read") {
    reply({
      account: {
        type: "chatgpt",
        email: "fixture@example.invalid",
        planType: "explicit-test-fixture",
      },
      requiresOpenaiAuth: true,
    });
    return;
  }
  if (method === "model/list") {
    reply({
      data: [
        {
          id: "voice-fixture-model",
          model: "voice-fixture-model",
          displayName: "Explicit voice fixture",
          isDefault: true,
        },
      ],
      nextCursor: null,
    });
    return;
  }
  if (method === "thread/start") {
    const thread = {
      id: `voice-fixture-thread-${next++}`,
      cwd: params.cwd,
      turns: [],
      status: { type: "idle" },
      name: null,
    };
    threads.set(thread.id, thread);
    log({ method, threadId: thread.id, cwd: params.cwd });
    reply({
      thread,
      cwd: params.cwd,
      sandbox: policy(),
      approvalPolicy: params.approvalPolicy,
      approvalsReviewer: params.approvalsReviewer,
    });
    return;
  }
  const thread = threads.get(params.threadId);
  if (method === "thread/read") {
    reply({ thread });
    return;
  }
  if (method === "thread/turns/list") {
    reply({ data: thread.turns.slice().reverse(), nextCursor: null });
    return;
  }
  if (method === "thread/resume") {
    reply({
      thread,
      cwd: params.cwd,
      sandbox: policy(),
      approvalPolicy: params.approvalPolicy,
      approvalsReviewer: params.approvalsReviewer,
    });
    return;
  }
  if (method === "turn/start") {
    const text = params.input[0].text;
    const user = {
      id: `voice-fixture-user-${next++}`,
      type: "userMessage",
      content: [{ type: "text", text, text_elements: [] }],
    };
    const assistant = {
      id: `voice-fixture-assistant-${next++}`,
      type: "agentMessage",
      text: `Fixture text reply: ${text}`,
      phase: "final",
    };
    const turn = {
      id: `voice-fixture-turn-${next++}`,
      status: "inProgress",
      items: [user],
    };
    thread.status = { type: "active", activeFlags: [] };
    thread.turns.push(turn);
    log({
      method,
      threadId: thread.id,
      turnId: turn.id,
      cwd: params.cwd,
      text,
      policy: params.sandboxPolicy,
    });
    reply({ turn });
    send({ method: "turn/started", params: { threadId: thread.id, turn } });
    send({
      method: "item/started",
      params: { threadId: thread.id, turnId: turn.id, item: user },
    });
    send({
      method: "item/started",
      params: {
        threadId: thread.id,
        turnId: turn.id,
        item: { ...assistant, text: "" },
      },
    });
    setTimeout(() => {
      send({
        method: "item/agentMessage/delta",
        params: {
          threadId: thread.id,
          turnId: turn.id,
          itemId: assistant.id,
          delta: assistant.text,
        },
      });
      send({
        method: "item/completed",
        params: { threadId: thread.id, turnId: turn.id, item: assistant },
      });
      turn.status = "completed";
      turn.items = [user, assistant];
      thread.status = { type: "idle" };
      send({ method: "turn/completed", params: { threadId: thread.id, turn } });
    }, 40);
    return;
  }
  if (method === "turn/interrupt") {
    reply({});
    return;
  }
  if (method === "thread/name/set") {
    thread.name = params.name;
    reply({});
    return;
  }
  if (method === "thread/archive") {
    reply({});
    return;
  }
  send({
    id,
    error: {
      code: -32601,
      message: `Unsupported explicit fixture method: ${method}`,
    },
  });
});
