import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { diagramPng, experience, lessonText, mp4Container, understanding } from "../fixtures/learning";
import { encryptedPdf, textPdf } from "../fixtures/pdf";
import type { LearningMaterial, LearningSnapshot } from "../../src/lib/learning/types";
async function tabTo(page: Page, target: Locator) { for (let i = 0; i < 100; i++) { if (await target.evaluate(element => element === document.activeElement)) return; await page.keyboard.press("Tab"); } throw new Error("Control is not keyboard reachable"); }
async function noViolations(page: Page) { expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); }
async function textInput(page: Page) { await page.getByRole("button", { name: "Paste or dictate text" }).click(); await page.getByLabel("Your learning material", { exact: true }).fill(lessonText); }
// Presentation-only model responses. The actual HTTP pipeline is independently
// exercised with an injected provider in learning.test.ts; no production mocks.
async function modelPresentation(page: Page, unreadable = false) {
  let snapshot: LearningSnapshot;
  let material: LearningMaterial;
  await page.route("**/api/learning", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); if (!response.ok()) return route.fulfill({ response });
    snapshot = await response.json();
    material = { ...snapshot.material, units: snapshot.material.units.map(unit => ({ ...unit, ...(unit.locator.kind === "text" || unit.locator.kind === "transcript" || unit.locator.kind === "pdf" ? { text: lessonText } : {}) })) };
    if (unreadable) snapshot.analysis = { status: "unusable", message: "Some of this material could not be understood reliably. Try a clearer source." };
    else snapshot.analysis = { status: "source-ready" };
    await route.fulfill({ response, json: snapshot });
  });
  await page.route("**/api/learning/adapt", async route => {
    const body = route.request().postDataJSON(); if (snapshot.analysis.status !== "source-ready") throw new Error("Source unavailable");
    snapshot = { ...snapshot, preferences: body.preferences, revision: snapshot.revision + 1, experience: experience(material, understanding(material), body.preferences) };
    await route.fulfill({ json: snapshot });
  });
  await page.route("**/api/learning/practice", async route => {
    const section = snapshot.experience!.sections[0];
    await route.fulfill({ json: { questions: ["How would you identify the root?", "What makes a node a leaf?", "How can you describe these relationships?"].map((prompt, index) => ({ id: `check-${index}`, prompt, sectionId: section.id, answerQuote: section.paragraphs[0], evidence: section.evidence })) } });
  });
  await page.route("**/api/learning/reflect", async route => {
    await route.fulfill({ json: { message: "Compare your explanation with the source: the root has no parent.", nextStep: "Describe a leaf using the relationships in the material.", evidence: snapshot.experience!.practice[0].evidence } });
  });
}
async function learn(page: Page) { await textInput(page); await page.getByRole("button", { name: /Continue with my material/ }).click(); await page.getByRole("button", { name: /Create my learning experience/ }).click(); }
test.afterEach(async ({ page }) => { await page.request.delete("/api/learning"); });
test("home presents the approved hero and hides video from the learner upload flow", async ({ page }) => {
  let uploads = 0;
  page.on("request", request => { if (request.url().endsWith("/api/learning") && request.method() === "POST") uploads++; });
  await page.goto("/");
  const hero = page.locator(".adapt-hero");
  await expect(hero).toContainText("DIFFERENT WAYS IN. THE SAME DEPTH OF LEARNING.");
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText(/Learning that\s*meets you where you are\./);
  await expect(hero).toContainText("Your learning material, adapted to the way you learn best.");
  await expect(hero).toContainText("Bring a lecture, diagram, or recording. Get clearer explanations, step-by-step guidance, and accessible descriptions shaped around your needs.");
  await expect(page.getByRole("main")).not.toContainText(/video|MP4/i);
  expect(await page.locator("#learning-file").getAttribute("accept")).not.toContain(".mp4");
  await page.locator("#learning-file").setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from(mp4Container()) });
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose a PDF, image, audio or text file.");
  await expect(page.getByLabel("Video transcript", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Continue with my material/ })).toBeDisabled();
  expect(uploads).toBe(0);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await noViolations(page);
});
test("all support choices use the same source-first experience, without technical panels", async ({ page }) => {
  for (const label of ["Guide me step by step", "Simplify the explanation", "Describe visual information", "Make it comfortable to listen", "Make spoken content readable"]) {
    let understandingCalls = 0;
    page.on("request", request => { if (request.url().endsWith("/api/learning/analyze")) understandingCalls++; });
    await modelPresentation(page); await page.goto("/"); await textInput(page);
    await page.getByRole("button", { name: /Continue with my material/ }).click();
    await expect(page.getByRole("checkbox")).toHaveCount(5);
    await page.getByRole("checkbox", { name: /Guide me step by step/ }).uncheck();
    await page.getByRole("checkbox", { name: new RegExp(label) }).check();
    await page.getByRole("button", { name: /Create my learning experience/ }).click();
    await expect(page.locator(".preference-tags")).toContainText(label);
    await expect(page.locator(".adapt-lesson")).toContainText(label === "Simplify the explanation" ? "Start with the root" : "The root has no parent");
    await expect(page.locator(".adapt-lesson")).toContainText("Your learning experience");
    await expect(page.locator(".adapt-hero, .adapt-journey")).toHaveCount(0);
    await expect(page.locator("#experience-title")).toHaveJSProperty("tagName", "H1");
    await expect(page.locator(".evidence-links, .original-material, .learning-limitations, .source-preview")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Read Aloud: Off" })).toBeVisible();
    expect(understandingCalls).toBe(0);
    await noViolations(page); await page.unroute("**/api/learning"); await page.unroute("**/api/learning/adapt"); await page.unroute("**/api/learning/reflect");
  }
});
test("keyboard journey keeps focus, useful lesson content and desktop/narrow accessibility", async ({ page }) => {
  await modelPresentation(page); await page.goto("/"); await noViolations(page);
  await page.screenshot({ path: "test-results/adapt-home-desktop.png", fullPage: true });
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused(); await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Paste or dictate text" })); await page.keyboard.press("Enter");
  await tabTo(page, page.getByLabel("Your learning material", { exact: true })); await page.keyboard.type(lessonText);
  await tabTo(page, page.getByRole("button", { name: /Continue with my material/ })); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "What would make learning more comfortable?" })).toBeFocused(); await noViolations(page);
  await page.getByRole("checkbox", { name: /Describe visual information/ }).check();
  await page.getByText("Something particular you want to learn? (optional)", { exact: true }).click();
  await page.getByLabel("Your learning focus (optional)", { exact: true }).fill("Identify relationships, keeping the source concepts");
  await tabTo(page, page.getByRole("button", { name: /Create my learning experience/ })); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Make the connections", exact: true })).toBeVisible(); await expect(page.locator(".learning-focus")).toContainText("Identify relationships, keeping the source concepts");
  await expect(page.locator(".semantic-steps")).toContainText("Find the node with no parent.");
  await expect(page.locator(".evidence-links, [data-source-reference]")).toHaveCount(0);
  await page.getByRole("button", { name: "Next section", exact: true }).click(); await expect(page.getByRole("heading", { name: "Follow the example", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Check my understanding" }).click();
  await page.getByLabel("Your response", { exact: true }).fill("The root is the node with no parent."); await page.getByRole("button", { name: "Explore my response" }).click();
  await expect(page.getByText("Keep exploring", { exact: true })).toBeVisible(); await noViolations(page);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: "test-results/adapt-learning-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await noViolations(page);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: "test-results/adapt-learning-narrow.png", fullPage: true });
});
test("production AI unavailability is honest and preserves original source without fabricated adaptation", async ({ page }) => {
  await page.goto("/"); await textInput(page); await page.getByRole("button", { name: /Continue with my material/ }).click();
  await expect(page.getByRole("heading", { name: "What would make learning more comfortable?" })).toBeVisible();
  await page.getByRole("button", { name: /Create my learning experience/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn’t finish that. Please try again.");
  await expect(page.locator(".adapt-experience")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Create my learning experience/ })).toBeEnabled(); await noViolations(page);
});
test("PDF and image share the clean needs/learning experience", async ({ page }) => {
  for (const [name, bytes] of [["lesson.pdf", textPdf([[lessonText], [lessonText]]), "Page 1 · original label i"], ["diagram.png", diagramPng(), "Original image"]] as const) {
    await modelPresentation(page); await page.goto("/");
    await page.locator("#learning-file").setInputFiles({ name, mimeType: "application/octet-stream", buffer: Buffer.from(bytes) });
    await page.getByRole("button", { name: /Continue with my material/ }).click(); await expect(page.getByRole("heading", { name: "What would make learning more comfortable?" })).toBeVisible();
    await page.getByRole("button", { name: /Create my learning experience/ }).click(); await expect(page.locator(".adapt-lesson")).toContainText("The root has no parent");
    await expect(page.locator(".evidence-links, .learning-limitations, .visible-scope-note")).toHaveCount(0);
    await noViolations(page); await page.unroute("**/api/learning"); await page.unroute("**/api/learning/adapt"); await page.unroute("**/api/learning/reflect");
  }
});
test("unavailable source cannot enter adaptation; malformed, encrypted, and oversized uploads recover", async ({ page }) => {
  await modelPresentation(page, true); await page.goto("/"); await textInput(page); await page.getByRole("button", { name: /Continue with my material/ }).click();
  await expect(page.getByRole("heading", { name: "This material isn’t available yet." })).toBeVisible(); await expect(page.getByRole("button", { name: /Create my learning experience/ })).toHaveCount(0);
  await page.unroute("**/api/learning"); await page.getByRole("button", { name: "Upload a file", exact: true }).click();
  for (const [buffer, message] of [[new TextEncoder().encode("fake"), "Choose a PDF"], [encryptedPdf(), "opens without a password"], [textPdf().slice(0, -20), "couldn’t open this PDF"], [Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(4 * 1024 * 1024)]), "smaller file"]] as const) {
    await page.locator("#learning-file").setInputFiles({ name: "lesson.pdf", mimeType: "application/pdf", buffer: Buffer.from(buffer) }); await page.getByRole("button", { name: /Continue with my material/ }).click(); await expect(page.getByRole("main").getByRole("alert")).toContainText(message);
  }
  await noViolations(page);
});
test("Read Aloud continues across initial material, adapted statements and practice with focus and hover", async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = []; const qa = { spoken }; (window as unknown as { qaSpeech: typeof qa }).qaSpeech = qa;
    class Utterance { onend?: () => void; constructor(public text: string) {} }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak(value: Utterance) { spoken.push(value.text); queueMicrotask(() => value.onend?.()); }, cancel() {}, pause() {}, resume() {} } });
  });
  await modelPresentation(page); await page.goto("/"); await page.getByRole("button", { name: "Read Aloud: Off" }).click(); await page.locator('[data-reading-label="ADAPT introduction"]').hover();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qaSpeech: { spoken: string[] } }).qaSpeech.spoken.join(" "))).toContain("Learning that meets you");
  await learn(page); await page.locator('[data-reading-label="Make the connections"]').focus();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qaSpeech: { spoken: string[] } }).qaSpeech.spoken.join(" "))).toContain("Make the connections");
  await page.locator('[data-reading-label="Key point 1"]').hover();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qaSpeech: { spoken: string[] } }).qaSpeech.spoken.at(-1))).toBe("Find the node with no parent.");
  await page.locator('[data-reading-label="Key point 2"]').focus();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qaSpeech: { spoken: string[] } }).qaSpeech.spoken.at(-1))).toBe("Follow each parent-to-child relationship.");
  await page.getByRole("button", { name: "Next section", exact: true }).click();
  await page.getByRole("button", { name: "Check my understanding" }).click();
  await page.locator('[data-reading-label="Practice question"]').focus();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qaSpeech: { spoken: string[] } }).qaSpeech.spoken.join(" "))).toContain("How would you identify the root");
  await page.setViewportSize({ width: 320, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("Read Aloud help", { exact: true }).click(); await noViolations(page); await page.getByLabel("Read Aloud help", { exact: true }).click();
  await page.getByRole("button", { name: /^Read Aloud: (Reading|On)/ }).click(); const count = await page.evaluate(() => (window as unknown as { qaSpeech: { spoken: string[] } }).qaSpeech.spoken.length);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.locator('[data-reading-label="Make the connections"]').focus(); await page.waitForTimeout(400); expect(await page.evaluate(() => (window as unknown as { qaSpeech: { spoken: string[] } }).qaSpeech.spoken.length)).toBe(count);
});
test("browser voice input is explicit, editable, reusable for preferences/focus/practice, and stops when leaving a step", async ({ page }) => {
  await page.addInitScript(() => {
    type Result = { resultIndex: number; results: { length: number; 0: { isFinal: boolean; 0: { transcript: string } } } };
    class Recognition {
      onresult?: (event: Result) => void; onerror?: (event: { error: string }) => void; onend?: () => void;
      start() { qa.starts++; qa.current = this; } stop() { qa.stops++; this.onend?.(); } abort() { qa.aborts++; }
    }
    const qa = { starts: 0, stops: 0, aborts: 0, current: undefined as Recognition | undefined, result(text: string) { this.current?.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } } }); }, deny() { this.current?.onerror?.({ error: "not-allowed" }); } };
    (window as unknown as { qaVoice: typeof qa }).qaVoice = qa; Object.defineProperty(window, "SpeechRecognition", { value: Recognition, configurable: true });
  });
  await modelPresentation(page); await page.goto("/"); await page.getByRole("button", { name: "Paste or dictate text" }).click();
  expect(await page.evaluate(() => (window as unknown as { qaVoice: { starts: number } }).qaVoice.starts)).toBe(0);
  await page.getByRole("button", { name: "Dictate Your learning material", exact: true }).click();
  await page.evaluate(text => (window as unknown as { qaVoice: { result(text: string): void } }).qaVoice.result(text), lessonText);
  await expect(page.getByLabel("Your learning material", { exact: true })).toHaveValue(lessonText); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Continue with my material/ }).click();
  await page.getByRole("button", { name: "Dictate Anything else that helps? (optional)", exact: true }).click();
  await page.evaluate(() => (window as unknown as { qaVoice: { result(text: string): void } }).qaVoice.result("Keep each idea connected.")); await page.keyboard.press("Escape");
  await page.getByText("Something particular you want to learn? (optional)", { exact: true }).click();
  await page.getByRole("button", { name: "Dictate Your learning focus (optional)", exact: true }).click(); await page.evaluate(() => (window as unknown as { qaVoice: { result(text: string): void } }).qaVoice.result("Explore relationships."));
  await page.getByRole("button", { name: /Create my learning experience/ }).click(); expect(await page.evaluate(() => (window as unknown as { qaVoice: { aborts: number } }).qaVoice.aborts)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Next section", exact: true }).click();
  await page.getByRole("button", { name: "Check my understanding" }).click();
  await page.getByRole("button", { name: "Dictate Your response", exact: true }).click(); await page.evaluate(() => (window as unknown as { qaVoice: { deny(): void } }).qaVoice.deny());
  await expect(page.getByText("Microphone access is unavailable. Check browser permissions, or type instead.", { exact: true })).toBeVisible();
  await page.getByLabel("Your response", { exact: true }).fill("I can still type."); await noViolations(page);
});
test("unsupported browser voice offers a clear fallback and mobile material entry stays accessible", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true }); Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true }); });
  await page.setViewportSize({ width: 320, height: 800 }); await page.goto("/"); await page.getByRole("button", { name: "Paste or dictate text" }).click();
  await expect(page.getByRole("button", { name: "Dictate Your learning material", exact: true })).toBeDisabled(); await expect(page.getByText("Voice input is unavailable in this browser. You can still type or paste.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await noViolations(page); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: "test-results/adapt-home-narrow.png", fullPage: true });
});



test("technical diagnostics stay out of the learner journey and errors remain actionable", async ({ page }) => {
  await modelPresentation(page); await page.goto("/"); await textInput(page);
  await page.getByRole("button", { name: /Continue with my material/ }).click();
  await page.route("**/api/learning/adapt", async route => {
    await route.fulfill({ status: 503, json: { code: "AI_UNAVAILABLE", error: "AWS Bedrock HTTP 403 provider validation schema grounding failed" } });
  });
  await page.getByRole("button", { name: /Create my learning experience/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("We couldn’t finish that. Please try again.");
  await expect(page.getByRole("main")).not.toContainText(/AWS|Bedrock|HTTP|schema|grounding|validation/);
  await expect(page.getByRole("button", { name: /Create my learning experience/ })).toBeEnabled();
  await page.unroute("**/api/learning/adapt"); await modelPresentation(page); await page.goto("/"); await learn(page);
  await expect(page.locator(".adapt-lesson")).toBeVisible();
  await expect(page.locator(".evidence-links, .original-material, .source-preview, .learning-limitations, .visible-scope-note")).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/AI-adapted|provenance|source excerpt|What to keep in mind|canonical|validation/);
  await noViolations(page);
});


test("production learner upload accepts 100 pages and rejects 101 without omitting pages", async ({ page }) => {
  for (const pages of [100, 101]) {
    await page.goto("/");
    await page.locator("#learning-file").setInputFiles({ name: "lecture.pdf", mimeType: "application/pdf", buffer: Buffer.from(textPdf(Array.from({ length: pages }, () => [lessonText]))) });
    await page.getByRole("button", { name: /Continue with my material/ }).focus();
    const response = page.waitForResponse(result => result.url().endsWith("/api/learning") && result.request().method() === "POST");
    await page.keyboard.press("Enter");
    const result = await response;
    if (pages === 100) {
      expect(result.status()).toBe(200); const snapshot = await result.json(); expect(snapshot.material.units).toHaveLength(100); expect(snapshot.material.units[99].locator.page).toBe(100);
      await expect(page.getByRole("button", { name: /Create my learning experience/ })).toBeVisible();
    } else {
      expect(result.status()).toBe(413);
      await expect(page.getByRole("main").getByRole("alert")).toContainText("up to 100 pages");
      await expect(page.getByRole("button", { name: /Create my learning experience/ })).toHaveCount(0);
    }
    await noViolations(page);
  }
});

test("optional self-check offers supportive immediate feedback, keyboard navigation, and a quiet finish", async ({ page }) => {
  let calls = 0;
  page.on("request", request => { if (request.url().endsWith("/api/learning/practice")) calls++; });
  await modelPresentation(page); await page.goto("/"); await learn(page);
  await expect(page.getByRole("button", { name: "Check my understanding" })).toBeHidden();
  await expect(page.getByLabel("Your response", { exact: true })).toHaveCount(0); expect(calls).toBe(0);
  await page.getByRole("button", { name: "Next section", exact: true }).click();
  const start = page.getByRole("button", { name: "Check my understanding" });
  await tabTo(page, start); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "A moment to reflect" })).toBeFocused(); expect(calls).toBe(1);
  for (let index = 0; index < 3; index++) {
    await expect(page.locator('[data-reading-label="Practice question"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Explore my response" })).toBeDisabled();
    await page.getByLabel("Your response", { exact: true }).fill(index === 0 ? "I’m still exploring this idea." : "My explanation in my own words.");
    await tabTo(page, page.getByRole("button", { name: "Explore my response" })); await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Explore my response" })).toBeFocused();
    await expect(page.locator(".reflection-response")).toContainText("The root has no parent. A leaf has no children.");
    await expect(page.locator(".reflection-response")).not.toContainText(/correct|wrong|score|grade/i);
    await noViolations(page);
    const next = page.getByRole("button", { name: index < 2 ? "Next question" : "Finish practice", exact: true });
    await tabTo(page, next); await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { name: "Keep learning at your pace" })).toBeFocused();
  await expect(page.getByLabel("Your response", { exact: true })).toHaveCount(0); expect(calls).toBe(1);
  await page.setViewportSize({ width: 320, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await noViolations(page);
});
test("practice failure keeps the lesson usable and supports retry or an early finish", async ({ page }) => {
  await modelPresentation(page); await page.goto("/"); await learn(page);
  await page.getByRole("button", { name: "Next section", exact: true }).click();
  const failure = async (route: import("@playwright/test").Route) => route.fulfill({ status: 503, json: { error: "internal provider details" } });
  await page.route("**/api/learning/practice", failure);
  await page.getByRole("button", { name: "Check my understanding" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn’t prepare the questions");
  await expect(page.getByRole("main")).not.toContainText("internal provider details");
  await expect(page.locator(".adapt-lesson")).toContainText("Follow the example");
  await page.unroute("**/api/learning/practice", failure);
  await page.getByRole("button", { name: "Check my understanding" }).click();
  await page.getByRole("button", { name: "Finish for now" }).click();
  await expect(page.getByRole("heading", { name: "Keep learning at your pace" })).toBeFocused(); await noViolations(page);
});
