# Language review

## Reference issue

The reference is **ASD-STE100 Simplified Technical English, Issue 9, January 2025**. Its issue date is 2025-01-15.

The official PDF was obtained from the [ASD-STE100 website](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf) during implementation.

The review consulted Part 1 writing rules and Part 2 dictionary entries. The publication is not included in the repository or application package.

## Review method

The documentation uses these review checks:

- Use approved dictionary words with their approved meanings and parts of speech.
- Identify necessary technical nouns and technical verbs.
- Use one consistent technical name for each item.
- Prefer active voice.
- Write instructions in the command form.
- Give one action in each procedural sentence.
- Keep procedural sentences within 20 words where possible.
- Keep descriptive sentences within 25 words where possible.
- Give each paragraph one topic.
- Separate explanations from procedural steps.
- Use American English spelling.
- Keep interface labels and commands exact.

Rules reviewed include 1.1–1.14, 3.6–3.7, 4.1, 5.1–5.3, 6.1–6.6, and the applicable word-count guidance.

These notes describe the review process. They do not reproduce the standard's controlled text or dictionary.

## Project terminology

The following technical nouns have defined meanings in this documentation. This list is the project's terminology record, not an ASD approval.

| Technical noun   | Meaning                                                        |
| ---------------- | -------------------------------------------------------------- |
| JARVIS           | This Linux desktop application                                 |
| Codex            | The OpenAI task engine used by JARVIS                          |
| app server       | The documented local Codex protocol process                    |
| project          | A selected filesystem folder                                   |
| workspace        | A saved project-and-layout configuration                       |
| conversation     | A JARVIS reference to a Codex thread, or an unsent local draft |
| thread           | A Codex backend conversation with a persistent identifier      |
| turn             | One agent request and its resulting activity                   |
| renderer         | The isolated Electron interface process                        |
| preload bridge   | The restricted connection between renderer and desktop process |
| IPC              | Inter-process communication                                    |
| runtime          | The packaged executable and its required supporting files      |
| sandbox          | A backend or Chromium restriction on process capabilities      |
| workspace access | The Codex workspace-scoped permission mode                     |
| Full access      | The deliberately enabled Codex unrestricted permission mode    |
| API key          | A secret credential for a service API                          |
| secret store     | An operating-system facility that protects credentials         |
| transcript       | Recognized speech text before or after review                  |
| waveform         | A bar display derived from input audio samples                 |
| SQLite           | The local database engine                                      |
| XDG              | Linux conventions for per-user data locations                  |
| PATH             | The shell's executable search path                             |
| UTF-8            | The text encoding supported by the editor                      |
| fixture          | An explicitly identified test input                            |

Software actions such as authenticate, export, archive, and transcribe are necessary field-specific technical verbs.

Interface labels, file paths, command names, protocol names, and code examples retain their exact spelling. They can differ from ordinary prose vocabulary.

## Review limitations

This is an implementation-stage self-review. A qualified independent STE reviewer has not examined every word, meaning, part of speech, and technical term.

The checks did not establish complete ASD-STE100 compliance. The documentation has no formal certification.

Future changes require another terminology and rule review. Automatic sentence counts cannot replace the dictionary and meaning review.
