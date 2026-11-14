# Sources and licenses

## Application assets

The JARVIS icon and procedural visualization are original project assets. They use the project's MIT License.

No proprietary reference screenshots are embedded or redistributed. The written reference descriptions informed the interface.

The ASD-STE100 publication remains the property of ASD. It is not included in the package or committed to the repository.

## Main third-party components

| Component                     | License                                            | Source                                                                                                             |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Electron                      | MIT; bundled Chromium and other notices also apply | [Electron](https://www.electronjs.org/)                                                                            |
| React and React DOM           | MIT                                                | [React](https://github.com/facebook/react)                                                                         |
| Vite                          | MIT                                                | [Vite](https://github.com/vitejs/vite)                                                                             |
| TypeScript                    | Apache-2.0                                         | [TypeScript](https://github.com/microsoft/TypeScript)                                                              |
| Three.js                      | MIT                                                | [Three.js](https://github.com/mrdoob/three.js)                                                                     |
| Lucide                        | ISC                                                | [Lucide](https://github.com/lucide-icons/lucide)                                                                   |
| react-markdown and remark-gfm | MIT                                                | [react-markdown](https://github.com/remarkjs/react-markdown), [remark-gfm](https://github.com/remarkjs/remark-gfm) |
| ws                            | MIT                                                | [ws](https://github.com/websockets/ws)                                                                             |
| Zod                           | MIT                                                | [Zod](https://github.com/colinhacks/zod)                                                                           |
| SQLite                        | Public domain                                      | [SQLite](https://sqlite.org/copyright.html)                                                                        |
| esbuild                       | MIT                                                | [esbuild](https://github.com/evanw/esbuild)                                                                        |
| Vitest                        | MIT                                                | [Vitest](https://github.com/vitest-dev/vitest)                                                                     |
| Playwright                    | Apache-2.0                                         | [Playwright](https://github.com/microsoft/playwright)                                                              |
| Prettier                      | MIT                                                | [Prettier](https://github.com/prettier/prettier)                                                                   |

The lockfile records direct and transitive npm packages. Their package directories contain the applicable license texts.

The packaged runtime retains Electron's `LICENSE` and `LICENSES.chromium.html`. Bundled application dependency notices are in `resources/app/THIRD_PARTY_LICENSES/`.

OpenAI services and the existing Codex installation have separate terms. The JARVIS source license does not grant service access.

## Documentation consulted

- [Codex app server](https://developers.openai.com/codex/app-server/)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Electron application packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Microphone capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [OpenAI audio documentation](https://developers.openai.com/api/docs/guides/audio)
- [OpenAI Realtime API](https://developers.openai.com/api/docs/guides/realtime)
- [Official ASD-STE100 standard](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf)

The documented interfaces and installed protocol types are the implementation references. The installed versions control compatibility.
