import { it, expect } from "vitest";
import { completedSpeechText } from "../src/renderer/App";
it("uses the current streamed final response when completion has no items", () => {
  expect(
    completedSpeechText(
      [],
      [
        {
          id: "tool",
          type: "commandExecution",
          aggregatedOutput: "private terminal output",
        },
        {
          id: "reply",
          type: "agentMessage",
          text: "Current reply.",
          phase: "final_answer",
        },
      ],
    ),
  ).toBe("Current reply.");
});
it("prefers the authoritative final answer to commentary and excludes tool-only turns", () => {
  expect(
    completedSpeechText(
      [
        {
          id: "commentary",
          type: "agentMessage",
          text: "Working.",
          phase: "commentary",
        },
        {
          id: "final",
          type: "agentMessage",
          text: "Complete.",
          phase: "final_answer",
        },
      ],
      [{ id: "stream", type: "agentMessage", text: "Partial" }],
    ),
  ).toBe("Complete.");
  expect(
    completedSpeechText(
      [],
      [
        {
          id: "command",
          type: "commandExecution",
          aggregatedOutput: "do not speak logs",
        },
      ],
    ),
  ).toBe("");
  expect(completedSpeechText([], [])).toBe("");
});
