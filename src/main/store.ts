import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { defaults, type Conversation, type Settings } from "../shared";

export class Store {
  private db: DatabaseSync;
  constructor(public path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    const version = Number(
      (this.db.prepare("PRAGMA user_version").get() as any).user_version,
    );
    if (version > 1)
      throw new Error("This JARVIS database requires a newer application.");
    if (version < 1)
      this.db
        .exec(`BEGIN; CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE conversations(id TEXT PRIMARY KEY,threadId TEXT,title TEXT NOT NULL,project TEXT NOT NULL,
      createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,draft TEXT NOT NULL DEFAULT '',archived INTEGER NOT NULL DEFAULT 0);
      PRAGMA user_version=1; COMMIT;`);
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare("SELECT value FROM kv WHERE key=?")
      .get(key) as any;
    return row ? JSON.parse(row.value) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  settings(): Settings {
    return { ...defaults, ...this.get("settings", {}) };
  }
  updateSettings(patch: Partial<Settings>) {
    const next = { ...this.settings(), ...patch };
    this.set("settings", next);
    return next;
  }
  list(): Conversation[] {
    return this.db
      .prepare("SELECT * FROM conversations ORDER BY updatedAt DESC LIMIT 2000")
      .all()
      .map((r) => ({
        ...r,
        archived: !!r.archived,
      })) as unknown as Conversation[];
  }
  conversation(id: string): Conversation {
    const row = this.db
      .prepare("SELECT * FROM conversations WHERE id=?")
      .get(id) as any;
    if (!row) throw new Error("Conversation not found.");
    return { ...row, archived: !!row.archived };
  }
  create(project: string, title = "New conversation"): Conversation {
    const row: Conversation = {
      id: randomUUID(),
      threadId: null,
      title,
      project,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      draft: "",
      archived: false,
    };
    this.db
      .prepare("INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?)")
      .run(
        row.id,
        row.threadId,
        row.title,
        row.project,
        row.createdAt,
        row.updatedAt,
        row.draft,
        0,
      );
    return row;
  }
  update(
    id: string,
    patch: Partial<
      Pick<Conversation, "title" | "threadId" | "draft" | "archived">
    >,
  ) {
    const row = { ...this.conversation(id), ...patch, updatedAt: Date.now() };
    this.db
      .prepare(
        "UPDATE conversations SET threadId=?,title=?,draft=?,archived=?,updatedAt=? WHERE id=?",
      )
      .run(
        row.threadId,
        row.title,
        row.draft,
        +row.archived,
        row.updatedAt,
        id,
      );
    return row;
  }
  delete(id: string) {
    this.db.prepare("DELETE FROM conversations WHERE id=?").run(id);
  }
  clearRecents() {
    this.set("recents", []);
  }
  close() {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.close();
  }
}
