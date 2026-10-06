// Run with:  node --test
// Uses only fake network / fake microphone / fake speaker: no key, no internet, no phone needed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JarvisError, friendlyMessage, ERROR_CODES } from "./errors.js";
import { OpenAICompatibleProvider, GeminiProvider, createProvider } from "./providers.js";
import { Brain } from "./brain.js";
import { cleanForSpeech, splitForSpeech, Listener, Speaker } from "./voice.js";
import { Controller } from "./controller.js";
import { loadSettings, saveSettings, getProviderSettings, defaultSettings } from "./config.js";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status });
const fakeFetch = (res, calls = []) => async (url, init) => { calls.push({ url, init }); if (res instanceof Error) throw res; return res; };
const openai = (fetchImpl, over = {}) => new OpenAICompatibleProvider({ apiKey: "test-key", model: "m", baseUrl: "https://x.test/v1/", fetchImpl, ...over });
const codeOf = async (p) => { try { await p; return "none"; } catch (e) { return e.code; } };
const MSGS = [{ role: "system", content: "S" }, { role: "user", content: "hi" }];

test("OpenAI-compatible: success + request shape", async () => {
  const calls = [];
  const p = openai(fakeFetch(json({ choices: [{ message: { content: " Hello. " } }] }), calls));
  assert.equal(await p.chat(MSGS), "Hello.");
  assert.equal(calls[0].url, "https://x.test/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(calls[0].init.body), { model: "m", messages: MSGS });
});

test("OpenAI-compatible: error classification", async () => {
  assert.equal(await codeOf(openai(fakeFetch(json({}, 401))).chat(MSGS)), "auth");
  assert.equal(await codeOf(openai(fakeFetch(json({}, 429))).chat(MSGS)), "quota");
  assert.equal(await codeOf(openai(fakeFetch(json({}, 503))).chat(MSGS)), "unavailable");
  assert.equal(await codeOf(openai(fakeFetch(json({}, 400))).chat(MSGS)), "bad_request");
  assert.equal(await codeOf(openai(fakeFetch(json({ choices: [] }))).chat(MSGS)), "bad_response");
  assert.equal(await codeOf(openai(fakeFetch(new Response("<html>", { status: 200 }))).chat(MSGS)), "bad_response");
  assert.equal(await codeOf(openai(fakeFetch(new TypeError("Failed to fetch"))).chat(MSGS)), "network");
  const abort = Object.assign(new Error("x"), { name: "AbortError" });
  assert.equal(await codeOf(openai(fakeFetch(abort)).chat(MSGS)), "aborted");
  assert.equal(await codeOf(openai(fakeFetch(json({})), { apiKey: "" }).chat(MSGS)), "no_key");
  assert.equal(await codeOf(openai(fakeFetch(json({})), { model: "" }).chat(MSGS)), "bad_settings");
});

test("Gemini: request shape, key in header (not URL), reply parsing", async () => {
  const calls = [];
  const reply = json({ candidates: [{ content: { parts: [{ text: "Four" }, { text: " hundred" }] } }] });
  const p = new GeminiProvider({ apiKey: "g-test", model: "gem", baseUrl: "https://g.test/v1beta", fetchImpl: fakeFetch(reply, calls) });
  const out = await p.chat([...MSGS, { role: "assistant", content: "a" }, { role: "user", content: "b" }]);
  assert.equal(out, "Four hundred");
  assert.equal(calls[0].url, "https://g.test/v1beta/models/gem:generateContent");
  assert.ok(!calls[0].url.includes("g-test"));
  assert.equal(calls[0].init.headers["x-goog-api-key"], "g-test");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.systemInstruction.parts[0].text, "S");
  assert.deepEqual(body.contents.map((c) => c.role), ["user", "model", "user"]);
  const blocked = new GeminiProvider({ apiKey: "k", model: "m", baseUrl: "https://g.test", fetchImpl: fakeFetch(json({ promptFeedback: { blockReason: "SAFETY" } })) });
  assert.equal(await codeOf(blocked.chat(MSGS)), "bad_response");
});

test("createProvider picks the right adapter", () => {
  assert.ok(createProvider({ type: "gemini", apiKey: "k", model: "m", baseUrl: "u" }) instanceof GeminiProvider);
  assert.ok(createProvider({ type: "openai", apiKey: "k", model: "m", baseUrl: "u" }) instanceof OpenAICompatibleProvider);
});

test("Brain: history, trimming, no pollution on failure, abort, empty input", async () => {
  const seen = [];
  let fail = false;
  const provider = { chat: async (m) => { seen.push(m); if (fail) throw new JarvisError("network"); return "ok" + seen.length; } };
  const brain = new Brain(provider, { maxTurns: 2 });
  assert.equal(await brain.respond("one"), "ok1");
  assert.equal(seen[0][0].role, "system");
  await brain.respond("two");
  assert.equal(seen[1].length, 4); // system + user + assistant + user
  fail = true;
  assert.equal(await codeOf(brain.respond("bad")), "network");
  assert.equal(brain.history.length, 4); // failed turn not remembered
  fail = false;
  await brain.respond("three");
  assert.equal(brain.history.length, 4); // trimmed to maxTurns*2
  assert.equal(brain.history[0].content, "two");
  assert.equal(await codeOf(brain.respond("   ")), "no_speech");
  const ctl = new AbortController();
  const slow = new Brain({ chat: async () => { ctl.abort(); return "late"; } });
  assert.equal(await codeOf(slow.respond("x", { signal: ctl.signal })), "aborted");
  brain.reset();
  assert.equal(brain.history.length, 0);
});

test("speech text helpers", () => {
  assert.equal(cleanForSpeech("**25** times *4* is `100`. [Link](http://a.b)"), "25 times 4 is 100. Link");
  assert.equal(cleanForSpeech("a ```code``` b"), "a b");
  assert.deepEqual(splitForSpeech("Hi there. How are you? Fine!"), ["Hi there. How are you? Fine!"]);
  const long = "Sentence number one is here. ".repeat(20);
  const parts = splitForSpeech(long, 100);
  assert.ok(parts.length > 3 && parts.every((p) => p.length <= 200));
  assert.equal(parts.join(" ").replace(/\s+/g, " "), long.trim());
  assert.ok(splitForSpeech("x".repeat(1000), 100).every((p) => p.length <= 200));
});

// ---- fake browser speech objects ----
function fakeSynth() {
  const s = { spoken: [], cancelled: 0, failWith: null, auto: true, last: null };
  s.speechSynthesis = { speak(u) { s.spoken.push(u.text); s.last = u; if (!u.text) return; if (s.auto) setTimeout(() => (s.failWith ? u.onerror({ error: s.failWith }) : u.onend()), 0); }, cancel() { s.cancelled++; } };
  s.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  return s;
}
function fakeRecognizer(script) {
  const w = {};
  w.SpeechRecognition = class {
    start() { w.inst = this; setTimeout(() => script(this), 0); }
    stop() { setTimeout(() => this.onend(), 0); }
    abort() { setTimeout(() => this.onend(), 0); }
  };
  return w;
}
const result = (text, isFinal) => ({ results: [Object.assign([{ transcript: text }], { isFinal })] });

test("Speaker: speaks chunks in order, stop() ends early, errors map", async () => {
  const w = fakeSynth();
  const sp = new Speaker({ win: w });
  await sp.speak("One. Two.");
  assert.deepEqual(w.spoken, ["One. Two."]);
  const w2 = fakeSynth(); w2.auto = false;
  const sp2 = new Speaker({ win: w2 });
  const pending = sp2.speak("x".repeat(500));
  sp2.stop();
  await pending; // resolves instead of hanging
  assert.ok(w2.cancelled >= 1);
  const w3 = fakeSynth(); w3.failWith = "synthesis-failed";
  assert.equal(await codeOf(new Speaker({ win: w3 }).speak("hi")), "tts_failed");
  assert.equal(await codeOf(new Speaker({ win: {} }).speak("hi")), "tts_unsupported");
});

test("Listener: transcript, interim updates, error mapping, abort", async () => {
  const interim = [];
  const ok = new Listener({ win: fakeRecognizer((r) => { r.onresult(result("hello", false)); r.onresult(result("hello jarvis", true)); r.onend(); }) });
  assert.equal(await ok.listen({ onInterim: (t) => interim.push(t) }), "hello jarvis");
  assert.deepEqual(interim, ["hello", "hello jarvis"]);
  for (const [err, code] of [["not-allowed", "mic_denied"], ["audio-capture", "audio_capture"], ["no-speech", "no_speech"], ["network", "stt_network"], ["weird", "stt_failed"]]) {
    const l = new Listener({ win: fakeRecognizer((r) => { r.onerror({ error: err }); r.onend(); }) });
    assert.equal(await codeOf(l.listen()), code);
  }
  assert.equal(await codeOf(new Listener({ win: fakeRecognizer((r) => r.onend()) }).listen()), "no_speech");
  const l = new Listener({ win: fakeRecognizer(() => {}) });
  const p = l.listen();
  l.abort();
  assert.equal(await codeOf(p), "aborted");
  assert.equal(await codeOf(new Listener({ win: {} }).listen()), "stt_unsupported");
});

// ---- controller (the whole tap -> listen -> think -> speak turn) ----
function harness({ heard = "hello", reply = "Hello. How can I help?", listenErr, brainErr, speakErr, hangBrain } = {}) {
  const events = [];
  const ui = { setState: (s, t, e) => events.push([s, t, e]), showYou: (t) => events.push(["you", t]), showJarvis: (t) => events.push(["jarvis", t]) };
  const listener = { listen: async () => { if (listenErr) throw new JarvisError(listenErr); return heard; }, stop() { events.push("stop-listen"); } };
  const speaker = { unlock() {}, speak: async (t) => { if (speakErr) throw new JarvisError(speakErr); events.push(["said", t]); }, stop() { events.push("stop-speak"); } };
  const brain = { respond: (t, { signal }) => hangBrain
    ? new Promise((_, rej) => signal.addEventListener("abort", () => rej(new JarvisError("aborted"))))
    : brainErr ? Promise.reject(new JarvisError(brainErr)) : Promise.resolve(reply) };
  const c = new Controller({ listener, speaker, getBrain: () => brain, ui, log: { error() {} } });
  return { c, events, states: () => events.filter((e) => ["idle", "listening", "thinking", "speaking"].includes(e[0])) };
}

test("Controller: happy path hello -> reply spoken", async () => {
  const h = harness();
  await h.c.press();
  assert.deepEqual(h.states().map((e) => e[0]), ["listening", "thinking", "speaking", "idle"]);
  assert.deepEqual(h.events.find((e) => e[0] === "said"), ["said", "Hello. How can I help?"]);
});

test("Controller: failures give friendly messages and return to idle", async () => {
  for (const opt of [{ listenErr: "mic_denied" }, { brainErr: "network" }, { brainErr: "quota" }, { speakErr: "tts_failed" }]) {
    const h = harness(opt);
    await h.c.press();
    const last = h.states().at(-1);
    assert.equal(last[0], "idle");
    assert.equal(last[2], true);
    assert.ok(last[1].length > 10 && !/HTTP|Error:/.test(last[1]));
    assert.equal(h.c.state, "idle");
  }
});

test("Controller: tap while thinking cancels; tap while speaking/listening stops", async () => {
  const h = harness({ hangBrain: true });
  const turn = h.c.press();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.c.state, "thinking");
  await h.c.press();
  await turn;
  assert.deepEqual(h.states().at(-1).slice(0, 2), ["idle", "Cancelled."]);
  const h2 = harness(); h2.c.state = "speaking"; await h2.c.press(); assert.ok(h2.events.includes("stop-speak"));
  const h3 = harness(); h3.c.state = "listening"; await h3.c.press(); assert.ok(h3.events.includes("stop-listen"));
});

test("Settings: defaults, corrupt storage, saving, keys isolated per provider", () => {
  const mem = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; } }; };
  assert.deepEqual(loadSettings(mem()), defaultSettings());
  const bad = mem(); bad.setItem("jarvis.settings.v1", "{not json"); assert.deepEqual(loadSettings(bad), defaultSettings());
  const st = mem(); const s = defaultSettings();
  s.providers.groq = { apiKey: "groq-secret", model: "", baseUrl: "" };
  assert.ok(saveSettings(s, st));
  const back = loadSettings(st);
  assert.equal(getProviderSettings(back, "groq").apiKey, "groq-secret");
  assert.equal(getProviderSettings(back, "groq").model, "openai/gpt-oss-20b");
  assert.equal(getProviderSettings(back, "gemini").apiKey, "");
  assert.equal(saveSettings(s, null), false);
});

test("Every error code has a friendly message", () => {
  for (const code of ERROR_CODES) assert.ok(friendlyMessage({ code }).length > 5);
  assert.ok(friendlyMessage(new Error("boom")).includes("Something went wrong"));
});

test("No API keys are hard-coded in any project file", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const pattern = /gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}/;
  for (const f of fs.readdirSync(dir).filter((n) => /\.(js|mjs|html|css|md)$/.test(n))) {
    assert.ok(!pattern.test(fs.readFileSync(path.join(dir, f), "utf8")), `possible secret in ${f}`);
  }
});
