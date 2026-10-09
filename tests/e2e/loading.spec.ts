import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { diagramPng, lessonText } from "../fixtures/learning";
import { textPdf } from "../fixtures/pdf";
import { mp3Audio } from "../fixtures/audio";
import type { LearningSnapshot } from "../../src/lib/learning/types";

function snapshot(kind: "text" | "pdf" | "image" | "audio"): LearningSnapshot {
  const fingerprint = "a".repeat(64);
  return { fingerprint, expiresAt: Date.now() + 900000, revision: 0, material: { id: "source", title: "Your lesson", kind, fingerprint, limitations: [], units: [{ id: "p1", locator: { kind, ...(kind === "pdf" ? { page: 1 } : {}) } }] }, analysis: { status: "source-ready" } };
}

test("all material types share a stable loading panel, gentle messages and a quiet accessible status", async ({ page }) => {
  await page.clock.install();
  for (const kind of ["text", "pdf", "image", "audio"] as const) {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/learning", async route => { await gate; await route.fulfill({ json: snapshot(kind) }); });
    await page.goto("/");
    if (kind === "text") { await page.getByRole("button", { name: "Paste or dictate text" }).click(); await page.getByLabel("Your learning material", { exact: true }).fill(lessonText); }
    else {
      const input = kind === "pdf" ? { name: "lesson.pdf", buffer: Buffer.from(textPdf([[lessonText]])) } : kind === "image" ? { name: "lesson.png", buffer: Buffer.from(diagramPng()) } : { name: "lecture.mp3", buffer: Buffer.from(mp3Audio()) };
      await page.locator("#learning-file").setInputFiles({ ...input, mimeType: "application/octet-stream" });
    }
    const studio = page.locator(".material-studio");
    const before = await studio.boundingBox();
    await page.getByRole("button", { name: /Continue with my material/ }).click();
    const loading = studio.locator(".loading-experience");
    await expect(loading).toHaveAttribute("data-active", "true");
    await expect(loading.getByRole("status")).toHaveText("Preparing your learning experience. Please wait.");
    await expect(loading.locator(".loading-message")).toHaveText("Loading your experience…");
    await expect(studio.locator(".loading-underlay")).toHaveAttribute("inert", "");
    const during = await studio.boundingBox();
    expect(during?.height).toBe(before?.height);
    await page.clock.fastForward(6000);
    await expect(loading.locator(".loading-message")).toHaveText("Making space for your way of learning…");
    await expect(loading.getByRole("status")).toHaveText("Preparing your learning experience. Please wait.");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (kind === "text") { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: "test-results/loading-desktop.png", fullPage: true }); }
    release();
    await expect(page.getByRole("heading", { name: "What would make learning more comfortable?" })).toBeFocused();
    await expect(page.locator('.loading-experience[data-active="true"]')).toHaveCount(0);
    await page.unroute("**/api/learning");
  }
});

test("adaptation loading respects reduced motion, fits narrow screens and can be cancelled by keyboard", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route("**/api/learning", route => route.fulfill({ json: snapshot("text") }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/learning/adapt", async route => { await gate; await route.abort(); });
  await page.goto("/"); await page.getByRole("button", { name: "Paste or dictate text" }).click();
  await page.getByLabel("Your learning material", { exact: true }).fill(lessonText);
  await page.getByRole("button", { name: /Continue with my material/ }).click();
  await page.getByRole("button", { name: /Create my learning experience/ }).click();
  const loading = page.locator('.loading-experience[data-active="true"]');
  await expect(loading).toBeVisible();
  expect(await loading.locator(".learning-motif span").first().evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await loading.locator(".loading-content").scrollIntoViewIfNeeded(); await page.screenshot({ path: "test-results/loading-narrow.png" });
  await expect(loading.getByRole("button", { name: "Cancel" })).toBeInViewport();
  await loading.getByRole("button", { name: "Cancel" }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator('.loading-experience[data-active="true"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "What would make learning more comfortable?" })).toBeFocused();
  await expect(page.getByRole("button", { name: /Create my learning experience/ })).toBeEnabled();
  release();
});

test("loading hands over to the finished lesson and the same treatment supports optional practice", async ({ page }) => {
  const source = snapshot("text");
  await page.route("**/api/learning", route => route.fulfill({ json: source }));
  let finishLesson!: () => void;
  const lessonGate = new Promise<void>(resolve => { finishLesson = resolve; });
  await page.route("**/api/learning/adapt", async route => {
    await lessonGate;
    await route.fulfill({ json: { ...source, revision: 1, preferences: route.request().postDataJSON().preferences, experience: { introduction: "Explore the original ideas at your pace.", sections: [{ id: "topic", title: "A new way in", kind: "prose", paragraphs: [lessonText], steps: [], evidence: [{ sourceId: "p1", mode: "text", quote: lessonText }] }], practice: [{ id: "practice", prompt: "Describe a leaf node.", evidence: [{ sourceId: "p1", mode: "text", quote: lessonText }] }], limitations: [] } } });
  });
  let finishFeedback!: () => void;
  const feedbackGate = new Promise<void>(resolve => { finishFeedback = resolve; });
  await page.route("**/api/learning/practice", async route => { await feedbackGate; await route.fulfill({ json: { questions: ["Describe a leaf node.", "Describe the root.", "Describe a child."].map((prompt, index) => ({ id: `q${index}`, prompt, sectionId: "topic", answerQuote: "A leaf has no children.", evidence: [] })) } }); });
  await page.goto("/"); await page.getByRole("button", { name: "Paste or dictate text" }).click();
  await page.getByLabel("Your learning material", { exact: true }).fill(lessonText);
  await page.getByRole("button", { name: /Continue with my material/ }).click();
  await page.getByRole("button", { name: /Create my learning experience/ }).click();
  await expect(page.locator('.support-studio .loading-experience[data-active="true"]')).toBeVisible();
  finishLesson();
  await expect(page.getByRole("heading", { name: "Your lesson", exact: true })).toBeFocused();
  await expect(page.locator('.loading-experience[data-active="true"]')).toHaveCount(0);
  await expect(page.getByLabel("Your response", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Check my understanding" }).click();
  await expect(page.locator('.understanding-practice .loading-experience.compact[data-active="true"]')).toBeVisible();
  finishFeedback();
  await page.getByLabel("Your response", { exact: true }).fill("A leaf has no children.");
  await page.getByRole("button", { name: "Explore my response" }).click();
  await expect(page.locator(".reflection-response")).toContainText("A leaf has no children.");
  await expect(page.locator('.understanding-practice .loading-experience[data-active="true"]')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
