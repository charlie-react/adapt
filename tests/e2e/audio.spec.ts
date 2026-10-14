import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { wavAudio, mp3Audio } from "../fixtures/audio";
import type { LearningSnapshot, SourceUnit } from "../../src/lib/learning/types";

const phrases = ["A parent node connects to its children.", "A leaf node has no children."];
type AudioSpeechWindow = Window & { __audioSpeech: string[] };
async function silentReading(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = []; (window as unknown as AudioSpeechWindow).__audioSpeech = spoken;
    class Utterance { lang = ""; onend: (() => void) | null = null; onerror = null; constructor(public text: string) {} }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak: (utterance: Utterance) => { spoken.push(utterance.text); queueMicrotask(() => utterance.onend?.()); }, cancel() {}, pause() {}, resume() {} } });
  });
}
async function mockedSpeechServices(page: Page, title: string) {
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>(resolve => { releaseUpload = resolve; });
  const fingerprint = "a".repeat(64), original = "b".repeat(64);
  const units: SourceUnit[] = [{ id: "audio-1", locator: { kind: "audio", duration: 1 } }, ...phrases.map((text, index) => ({ id: `transcript-${index + 1}`, text, locator: { kind: "transcript" as const, startSeconds: index * 0.5, endSeconds: index * 0.5 + 0.4 }, transcription: { service: "gemini-transcribe" as const, model: "gemini-3.5-transcribe", language: "und" as const, sourceId: "audio-1", sourceFingerprint: original } }))];
  let snapshot: LearningSnapshot = { fingerprint, expiresAt: Date.now() + 900000, revision: 0, material: { id: `audio:${original}:transcript:${fingerprint}`, title, kind: "audio", fingerprint, limitations: ["Machine transcription may mishear details."], units: units.map(({ text: _text, ...unit }) => { void _text; return unit; }) }, analysis: { status: "source-ready" } };
  await page.route("**/api/learning", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await uploadGate; await route.fulfill({ json: snapshot });
  });
  await page.route("**/api/learning/source?*", async route => { const id = new URL(route.request().url()).searchParams.get("id"); await route.fulfill({ json: units.find(unit => unit.id === id) }); });
  await page.route("**/api/learning/adapt", async route => {
    snapshot = { ...snapshot, revision: 1, preferences: route.request().postDataJSON().preferences, experience: { introduction: "Read the recorded lesson in clear sections.", sections: phrases.map((phrase, index) => ({ id: `source-${index + 1}`, title: index ? "Leaf nodes" : "Parent nodes", kind: "prose", paragraphs: [phrase], steps: [phrase], evidence: [{ sourceId: `transcript-${index + 1}`, mode: "text", quote: phrase }] })), practice: [], limitations: [] } };
    await route.fulfill({ json: snapshot });
  });
  return releaseUpload;
}
test("MP3/WAV share the support journey and readable lesson without source panels", async ({ page }) => {
  for (const [name, bytes] of [["lecture.mp3", mp3Audio()], ["lecture.wav", wavAudio()]] as const) {
    await silentReading(page); const releaseUpload = await mockedSpeechServices(page, name); await page.goto("/");
    await expect(page.locator("#learning-file")).toHaveAttribute("accept", /\.mp3,\.wav/);
    await page.locator("#learning-file").setInputFiles({ name, mimeType: "application/octet-stream", buffer: bytes });
    await expect(page.getByText(/will transcribe/)).toHaveCount(0);
    await page.getByRole("button", { name: /Continue with my material/ }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Preparing your learning experience. Please wait." })).toBeVisible();
    releaseUpload();
    await expect(page.getByRole("checkbox", { name: /Make spoken content readable/ })).toBeChecked();
    await page.getByRole("button", { name: /Create my learning experience/ }).focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".adapt-lesson .reading-region").first()).toHaveText(phrases[0]);
    await expect(page.getByRole("button", { name: "Read Aloud: Off" })).toBeVisible();
    await page.getByRole("button", { name: "Next section", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.locator(".adapt-lesson .reading-region").first()).toHaveText(phrases[1]);
    expect(await page.evaluate(() => (window as unknown as AudioSpeechWindow).__audioSpeech)).toEqual([]);
    await page.getByRole("button", { name: "Read Aloud: Off" }).click(); await page.locator(".adapt-lesson .reading-region").first().focus();
    await expect.poll(() => page.evaluate(() => (window as unknown as AudioSpeechWindow).__audioSpeech)).toContain(phrases[1]);
    await page.getByRole("button", { name: /^Read Aloud:.*On$/ }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 320, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.unroute("**/api/learning"); await page.unroute("**/api/learning/source?*"); await page.unroute("**/api/learning/adapt");
  }
});
test("real production audio decoding reports transcription unavailability honestly; no false ready state", async ({ page }) => {
  for (const [name, bytes] of [["lecture.wav", wavAudio()], ["lecture.mp3", mp3Audio()], ["broken.mp3", Buffer.from("not audio")]] as const) {
    await page.goto("/"); await page.locator("#learning-file").setInputFiles({ name, mimeType: "application/octet-stream", buffer: bytes });
    await page.getByRole("button", { name: /Continue with my material/ }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(name === "broken.mp3" ? "We couldn’t open this recording" : "We couldn’t use this recording right now");
    await expect(page.getByRole("button", { name: /Create my learning experience/ })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});


test("30-minute recordings reach transcription; overlong recordings show a simple limit message", async ({ page }) => {
  for (const seconds of [1800, 1801]) {
    await page.goto("/");
    await expect(page.locator("#material-budget")).toHaveCount(0);
    await page.locator("#learning-file").setInputFiles({ name: "lecture.wav", mimeType: "audio/wav", buffer: wavAudio(seconds, 1, 8000, 8) });
    await page.getByRole("button", { name: /Continue with my material/ }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(seconds === 1800 ? "We couldn’t use this recording right now" : "up to 30 minutes");
    await expect(page.getByRole("button", { name: /Create my learning experience/ })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
