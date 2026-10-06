# JARVIS

A modular, voice-first personal AI agent. Phone-first, cloud/free services only, $0 baseline.

## Current milestone: V0 (Speak → AI → spoken answer)

Tap the big button, talk, JARVIS answers out loud. Nothing else yet (no wake word, no tools, no long-term memory).

## How it works

```
Tap → microphone → speech-to-text → Brain → AI provider → text → text-to-speech → speaker
      (voice.js)                    (brain.js) (providers.js)      (voice.js)
```

| File | Layer | Job |
|---|---|---|
| `index.html`, `style.css`, `app.js` | Interface | Page, button, settings screen |
| `controller.js` | Interface logic | One tap = listen → think → speak; cancel/stop |
| `voice.js` | Voice | Phone's built-in speech recognition + speech synthesis |
| `brain.js` | Brain | Conversation (short-term memory), system prompt |
| `providers.js` | Provider | Adapters: OpenAI-compatible (Groq, OpenAI, OpenRouter…) and Gemini |
| `config.js`, `errors.js` | Support | Settings in the phone's browser; friendly error messages |
| `jarvis.test.mjs` | Tests | Automated tests with fake network/mic/speaker |

Adding another AI provider later (e.g. Claude) means adding one small class in `providers.js` and one entry in `config.js`. Nothing else changes.

## Setup (phone only)

1. **Free API key.** Easiest: Groq. Open https://console.groq.com/keys, sign up (no card), tap *Create API Key*, copy it.
2. **GitHub.** Create a free account, then a **Public** repository named `JARVIS` (GitHub Pages is free only for public repos). Upload all files from this folder (*Add file → Upload files*). Create a file named `.gitignore` and paste the contents of the `.gitignore` file.
3. **Publish.** Repository → *Settings → Pages* → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save. After 1–2 minutes the page is at `https://YOUR-USERNAME.github.io/JARVIS/`.
4. **Open that address** in Chrome (Android) or Safari (iPhone), open *Settings* inside JARVIS, paste your key, Save.
5. Tap the button, allow the microphone, say "Hello JARVIS".

## Configuration

There are no environment variables: the key is typed into the app and stored only in your phone's browser storage. It is never in the repository. `.gitignore` also blocks `.env`, key files and credentials in case you add any later.

## Free-tier facts (checked 2026-10-05)

- **Groq free plan:** no card; limits per model, e.g. `openai/gpt-oss-20b` 30 requests/min, 1,000/day. Check your own limits at console.groq.com/settings/limits.
- **Gemini free tier:** no card, but Google no longer publishes fixed numbers (see your AI Studio rate-limit page), and free-tier requests may be used to improve Google products.
- **Speech:** done by the browser. On Chrome for Android the audio is processed by Google's speech service.
- **GitHub Pages:** free for public repositories, HTTPS included (needed for the microphone).

## Tests

`node --test` (needs Node.js 18+; optional, only on a computer or a free GitHub Action). Covers providers, errors, brain, speech helpers, controller flow, settings and a scan for hard-coded keys.

## Current limitations

- Real microphone/speaker behaviour depends on your phone's browser and can only be confirmed on the phone.
- One question per tap; conversation context is remembered until you reload the page or tap *New conversation*.
- iPhone: use Safari in a normal tab; speech recognition is less reliable on iOS than on Android Chrome.
- Model names change over time. If you see "model name may be wrong", edit the *Model* field in Settings.

## Roadmap

V1 continuous conversation + interruption → V1.5 wake word → V2 memory → V3 tools (email, calendar, files, web) → V4 planner → V5 specialist agents → V6 browser/mobile control → V7 safety (permissions, confirmations, logs, emergency stop).
