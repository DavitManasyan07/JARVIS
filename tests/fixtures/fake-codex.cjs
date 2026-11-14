// Explicit mock app-server for automated tests. Production never uses this fixture.
const readline = require("node:readline");
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const threads = new Map();
let next = 1;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  const { id, method, params = {} } = request;
  const reply = (result) => send({ id, result });
  if (method === "initialize") {
    reply({ userAgent: "explicit-test-fixture" });
    return;
  }
  if (method === "initialized") return;
  if (method === "account/read") {
    reply({ account: null, requiresOpenaiAuth: true });
    return;
  }
  if (method === "model/list") {
    reply({
      data: [
        {
          id: "fixture-model",
          model: "fixture-model",
          displayName: "Test fixture",
        },
      ],
      nextCursor: null,
    });
    return;
  }
  if (method === "fixture/no-response") return;
  if (method === "fixture/exit") {
    process.exit(19);
    return;
  }
  if (method === "fixture/bad-output") {
    process.stdout.write("not protocol\n");
    process.stderr.write("Authorization: Bearer sk-very-secret-value\n");
    reply({ ok: true });
    return;
  }
  if (method === "fixture/unknown-request") {
    send({ id: "unknown-server", method: "unsupported/method", params: {} });
    reply({ ok: true });
    return;
  }
  if (method === "thread/start") {
    const thread = {
      id: `fixture-thread-${next++}`,
      cwd: params.cwd,
      turns: [],
    };
    threads.set(thread.id, thread);
    const type =
      params.sandbox === "read-only"
        ? "readOnly"
        : params.sandbox === "workspace-write"
          ? "workspaceWrite"
          : "dangerFullAccess";
    reply({
      thread,
      cwd: params.cwd,
      sandbox: {
        type: process.env.JARVIS_FIXTURE_WEAK_POLICY
          ? "dangerFullAccess"
          : type,
      },
      approvalPolicy: params.approvalPolicy,
      approvalsReviewer: params.approvalsReviewer,
    });
    return;
  }
  if (method === "thread/read") {
    reply({ thread: threads.get(params.threadId) });
    return;
  }
  if (method === "thread/turns/list") {
    reply({
      data: threads.get(params.threadId).turns.slice().reverse(),
      nextCursor: null,
    });
    return;
  }
  if (method === "thread/resume") {
    const type =
      params.sandbox === "read-only"
        ? "readOnly"
        : params.sandbox === "workspace-write"
          ? "workspaceWrite"
          : "dangerFullAccess";
    reply({
      thread: threads.get(params.threadId),
      cwd: params.cwd,
      sandbox: { type },
      approvalPolicy: params.approvalPolicy,
      approvalsReviewer: params.approvalsReviewer,
    });
    return;
  }
  if (method === "turn/start") {
    const thread = threads.get(params.threadId);
    const turn = {
      id: `fixture-turn-${next++}`,
      status: "inProgress",
      items: [],
    };
    thread.turns.push(turn);
    reply({ turn, echoedPolicy: params.sandboxPolicy });
    send({ method: "turn/started", params: { threadId: thread.id, turn } });
    const text = params.input[0].text;
    if (text === "approval") {
      send({
        id: "approval-1",
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: thread.id,
          turnId: turn.id,
          command: "fixture command",
          cwd: thread.cwd,
        },
      });
      return;
    }
    if (text === "permissions") {
      send({
        id: "permission-1",
        method: "item/permissions/requestApproval",
        params: {
          threadId: thread.id,
          turnId: turn.id,
          permissions: { network: { enabled: true } },
        },
      });
      return;
    }
    if (text === "hang") return;
    send({
      method: "item/agentMessage/delta",
      params: {
        threadId: thread.id,
        turnId: turn.id,
        itemId: "fixture-message",
        delta: "Explicit fixture reply.",
      },
    });
    setTimeout(() => {
      turn.status = "completed";
      turn.items = [
        {
          id: "fixture-message",
          type: "agentMessage",
          text: "Explicit fixture reply.",
        },
      ];
      send({ method: "turn/completed", params: { threadId: thread.id, turn } });
    }, 10);
    return;
  }
  if (method === "turn/interrupt") {
    const thread = threads.get(params.threadId),
      turn = thread.turns.find((t) => t.id === params.turnId);
    turn.status = "interrupted";
    reply({});
    send({ method: "turn/completed", params: { threadId: thread.id, turn } });
    return;
  }
  if (method === "account/login/start") {
    reply({
      type: "chatgpt",
      authUrl: "https://auth.openai.com/fixture",
      loginId: "fixture-login",
    });
    return;
  }
  if (method === "thread/archive" || method === "thread/name/set") {
    reply({});
    return;
  }
  if (id && !method) return;
  send({ id, error: { code: -32601, message: "Unknown fixture method" } });
});
