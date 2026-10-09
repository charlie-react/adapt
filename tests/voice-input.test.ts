import assert from "node:assert/strict";
import { test } from "node:test";
import { appendDictation, VoiceInput, type BrowserRecognition } from "../src/lib/accessibility/voice-input";
class Recognition implements BrowserRecognition {
  lang = ""; continuous = true; interimResults = true; starts = 0; stops = 0; aborts = 0;
  onresult: BrowserRecognition["onresult"] = null; onerror: BrowserRecognition["onerror"] = null; onend: BrowserRecognition["onend"] = null;
  start() { this.starts++; } stop() { this.stops++; } abort() { this.aborts++; }
  result(text: string, final = true) { this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: final, 0: { transcript: text } } } }); }
}
test("voice requires explicit activation, preserves editable text and delivers final phrases once", () => {
  const voice = new VoiceInput(), recognition = new Recognition(), phrases: string[] = [];
  voice.connect(() => recognition); assert.equal(recognition.starts, 0); assert.equal(voice.getSnapshot(), "ready");
  voice.start("en-NG", text => phrases.push(text)); assert.equal(recognition.starts, 1); assert.equal(recognition.interimResults, false);
  recognition.result("unfinished", false); recognition.result("A complete statement."); recognition.result("A complete statement.");
  assert.deepEqual(phrases, ["A complete statement."]); voice.stop(); assert.equal(recognition.stops, 1); assert.equal(voice.getSnapshot(), "stopped"); voice.dispose();
  assert.equal(appendDictation("Existing idea.", "A new thought.", 100), "Existing idea. A new thought.");
  assert.equal(appendDictation("12345", "678", 7), "12345 6");
});
test("only one microphone session owns recognition; dispose ignores late callbacks", () => {
  const first = new VoiceInput(), second = new VoiceInput(), a = new Recognition(), b = new Recognition(), phrases: string[] = [];
  first.connect(() => a); second.connect(() => b); first.start("en", text => phrases.push(text)); const late = a.onresult!;
  second.start("en", text => phrases.push(text)); assert.equal(a.aborts, 1); assert.equal(first.getSnapshot(), "stopped");
  late({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: "stale" } } } }); assert.deepEqual(phrases, []);
  second.stop(); b.result("final after stop"); assert.deepEqual(phrases, ["final after stop"]); second.dispose(); assert.equal(b.onresult, null);
});
test("unsupported and permission failures degrade honestly without blocking typing", () => {
  const voice = new VoiceInput(); voice.connect(); voice.start("en", () => {}); assert.equal(voice.getSnapshot(), "unsupported");
  const recognition = new Recognition(); voice.connect(() => recognition); voice.start("en", () => {});
  recognition.onerror?.({ error: "not-allowed" }); assert.equal(voice.getSnapshot(), "denied");
  voice.start("en", () => {}); assert.equal(voice.getSnapshot(), "listening"); recognition.onerror?.({ error: "network" }); assert.equal(voice.getSnapshot(), "error"); voice.dispose();
});
