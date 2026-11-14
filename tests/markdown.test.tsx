import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageMarkdown } from "../src/renderer/Chat";

const render = (text: string) =>
  renderToStaticMarkup(createElement(MessageMarkdown, { text }));

describe("untrusted conversation Markdown", () => {
  it("does not create executable raw HTML from provider or project text", () => {
    const html = render(
      `A normal **reply**.\n\n<script>alert('unsafe')</script>\n\n<img src="x" onerror="alert(1)">\n\n<iframe src="https://example.invalid"></iframe>`,
    );
    expect(html).toContain("<strong>reply</strong>");
    expect(html).not.toMatch(/<(script|img|iframe)\b/i);
    expect(html).not.toMatch(/\sonerror\s*=/i);
  });

  it("removes executable link protocols and does not load remote message images", () => {
    const html = render(
      "[unsafe](javascript:alert%281%29)\n\n![private diagram](https://example.invalid/tracker.png)\n\n[Docs](https://developers.openai.com/codex/)",
    );
    expect(html).not.toMatch(/href=["']javascript:/i);
    expect(html).not.toContain("tracker.png");
    expect(html).not.toContain("<img");
    expect(html).toContain("[Image: private diagram]");
    expect(html).toContain("https://developers.openai.com/codex/");
    expect(html).toContain('rel="noreferrer"');
  });

  it("escapes source code while retaining an accessible Copy control", () => {
    const html = render(
      '```html\n<img src="x" onerror="alert(1)">\n<script>alert(2)</script>\n```',
    );
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<(img|script)\b/i);
    expect(html).toContain('aria-label="Copy text"');
    expect(html).toContain('class="language-html"');
  });

  it("renders useful Markdown structure without an HTML execution plugin", () => {
    const html = render(
      "| File | Result |\n| --- | --- |\n| `notes.txt` | Ready |\n\n- Review the diff\n- Save the file",
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<code>notes.txt</code>");
    expect(html).toContain("<li>Review the diff</li>");
  });
});
