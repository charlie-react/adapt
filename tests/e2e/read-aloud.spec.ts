import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { accommodate } from "../../src/lib/engine/pipeline";
import { binaryTreeAdapter } from "../../src/lib/fixtures/binary-tree";

type SpeechSpy = { spoken: string[]; calls: string[]; finishAll(): void; fail(): void };
type TestWindow = Window & { __speechSpy: SpeechSpy };

async function setup(page: Page, supported = true) {
  await page.addInitScript((supported) => {
    if (!supported) {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
      return;
    }
    class Utterance {
      lang = "";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    let current: Utterance | undefined;
    const spy: SpeechSpy = {
      spoken: [], calls: [],
      finishAll() {
        for (let count = 0; current && count < 100; count++) {
          const utterance = current;
          current = undefined;
          utterance.onend?.();
        }
      },
      fail() { current?.onerror?.(); },
    };
    (window as unknown as TestWindow).__speechSpy = spy;
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      speak(utterance: Utterance) { current = utterance; spy.spoken.push(utterance.text); spy.calls.push("speak"); },
      pause() { spy.calls.push("pause"); },
      resume() { spy.calls.push("resume"); },
      cancel() { current = undefined; spy.calls.push("cancel"); },
    } });
  }, supported);
  const result = await accommodate(binaryTreeAdapter, { barriers: ["visual-diagram-interpretation"], representation: "structured-text" }, {
    origin: "ai-generated", explain: async () => [{ sourceId: "definitions", text: "The root has no parent." }],
  });
  await page.route("**/api/accommodation", (route) => route.fulfill({ json: result }));
  await page.goto("/demo");
}

async function tabTo(page: Page, control: Locator) {
  for (let count = 0; count < 120; count++) {
    if (await control.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Speech control unreachable by keyboard");
}


const region = (page: Page, label: string) => page.locator(`[data-reading-label="${label}"]`);
const controls = (page: Page) => page.getByRole("group", { name: "Read Aloud controls" });
async function enable(page: Page) {
  const toggle = page.getByRole("button", { name: "Read Aloud: Off", exact: true });
  await tabTo(page, toggle);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Read Aloud: On" })).toHaveAttribute("aria-pressed", "true");
}
async function adapt(page: Page) {
  await page.getByRole("checkbox", { name: "I have difficulty independently interpreting visual diagrams" }).check();
  await page.getByRole("button", { name: "Create accessible representation" }).click();
  await expect(page.getByRole("heading", { name: "Your accessible learning experience" })).toBeFocused();
}
const spoken = (page: Page) => page.evaluate(() => (window as unknown as TestWindow).__speechSpy.spoken);
const finish = (page: Page) => page.evaluate(() => (window as unknown as TestWindow).__speechSpy.finishAll());

test("global mode works before adaptation by keyboard, pauses/resumes/stops, and disables automatic reading", async ({ page }) => {
  await setup(page);
  expect(await spoken(page)).toEqual([]);
  await enable(page);
  expect(await spoken(page)).toEqual([]);
  await tabTo(page, region(page, "Learning objective"));
  await expect.poll(() => spoken(page)).toContain("Learning objective.");
  await finish(page);
  expect(await spoken(page)).toContain("Identify the root node, parent/child relationships, and leaf nodes of a binary tree.");
  await tabTo(page, region(page, "Diagram: node B"));
  await expect.poll(() => spoken(page)).toContain("This is Node B.");
  await page.getByRole("button", { name: "Pause Read Aloud", exact: true }).click();
  await expect(controls(page).getByRole("status")).toHaveText("Read Aloud paused.");
  await page.getByRole("button", { name: "Resume Read Aloud", exact: true }).click();
  await expect(controls(page).getByRole("status")).toHaveText("Reading aloud.");
  await page.getByRole("button", { name: "Stop Read Aloud", exact: true }).click();
  await expect(controls(page).getByRole("status")).toContainText("stopped");
  await page.getByRole("button", { name: "Read Aloud: On" }).click();
  const before = await spoken(page);
  await region(page, "Diagram: node C").hover();
  await page.waitForTimeout(300);
  await region(page, "Diagram: node C").focus();
  expect(await spoken(page)).toEqual(before);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("hover reads coherent source units, ignores descendants and rerenders, and replaces speech for another region", async ({ page }) => {
  await setup(page);
  await enable(page);
  const source = region(page, "Diagram: node B");
  // Split visual text across spans: explicit speech units must stay unchanged.
  await source.locator("strong").evaluate(element => { element.innerHTML = "<span>Diagram: node </span><span>B</span>"; });
  await source.hover();
  await expect.poll(() => spoken(page)).toEqual(["This is Node B."]);
  await source.locator("strong").hover();
  await source.locator("p").hover();
  await page.waitForTimeout(300);
  expect(await spoken(page)).toEqual(["This is Node B."]);
  // Updating access preferences rerenders the workspace without restarting source speech.
  await page.getByRole("checkbox", { name: "I have difficulty independently interpreting visual diagrams" }).check();
  await finish(page);
  expect(await spoken(page)).toEqual([
    "This is Node B.", "B is the left child of A.", "D is the left child of B.", "E is the right child of B.", "B is not a leaf because it has children.",
  ]);
  await region(page, "Diagram relationships").hover();
  await expect.poll(() => spoken(page)).toContain("Binary-tree diagram.");
  await finish(page);
  expect(await spoken(page)).toContain("F is the right child of C.");
  await region(page, "Diagram: node C").hover();
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe("This is Node C.");
  await region(page, "Diagram: node D").hover();
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe("This is Node D.");
  expect(await page.evaluate(() => (window as unknown as TestWindow).__speechSpy.calls)).toContain("cancel");
  expect((await spoken(page)).join(" ")).not.toContain("Node B C");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("adapted relationships, AI explanation, practice options and feedback use the same reading mode", async ({ page }) => {
  await setup(page);
  await adapt(page);
  await enable(page);
  expect(await page.locator(".reading-controls").count()).toBe(1);
  await page.getByRole("button", { name: "Node B", exact: true }).click();
  await expect.poll(() => spoken(page)).toContain("This is Node B.");
  await finish(page);
  expect(await spoken(page)).toContain("E is the right child of B.");
  await region(page, "Explanation 1").focus();
  await finish(page);
  expect(await spoken(page)).not.toContain("AI-selected explanation, grounded in the source.");
  expect(await spoken(page)).toContain("The root has no parent.");
  const practice = region(page, "Practice: Which node is the root?");
  await practice.focus();
  await finish(page);
  expect(await spoken(page)).toContain("Which node is the root?");
  expect(await spoken(page)).toContain("Answer choices: Node A. Node B. Node C. Node D. Node E. Node F.");
  const before = await spoken(page);
  await practice.getByLabel("Node A", { exact: true }).focus();
  expect(await spoken(page)).toEqual(before);
  await practice.getByLabel("Node A", { exact: true }).check();
  await practice.getByRole("button", { name: "Check my reasoning" }).click();
  const feedback = region(page, "Feedback: Which node is the root?");
  await expect(feedback).toBeVisible();
  await feedback.focus();
  await finish(page);
  expect((await spoken(page)).join(" ")).toContain("Your response is consistent with the source relationships.");
  await practice.focus();
  await page.getByRole("checkbox", { name: "I have difficulty independently interpreting visual diagrams" }).uncheck();
  await expect(controls(page).getByRole("status")).toContainText("stopped");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("unsupported browser keeps source and practice usable", async ({ page }) => {
  await setup(page, false);
  await expect(page.getByRole("button", { name: "Read Aloud: Off" })).toBeDisabled();
  await expect(controls(page).getByRole("status")).toContainText("unavailable in this browser");
  await adapt(page);
  await expect(page.getByRole("button", { name: "Node B", exact: true })).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("errors are honest, a new region retries, and pagehide cancels speech", async ({ page }) => {
  await setup(page);
  await enable(page);
  await region(page, "Learning objective").focus();
  await page.evaluate(() => (window as unknown as TestWindow).__speechSpy.fail());
  await expect(controls(page).getByRole("status")).toContainText("could not play audio");
  await region(page, "Diagram: node B").focus();
  await expect(controls(page).getByRole("status")).toHaveText("Reading aloud.");
  await page.keyboard.press("Escape");
  await expect(controls(page).getByRole("status")).toContainText("stopped");
  await region(page, "Diagram: node C").focus();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(controls(page).getByRole("status")).toContainText("stopped");
});


test("navbar is compact, exposes clear playback states, and provides keyboard-accessible help at narrow widths", async ({ page }) => {
  await setup(page);
  const header = page.locator(".site-header");
  const group = controls(page);
  const toggle = group.locator(".reading-toggle");
  const help = group.locator("summary");
  const panel = group.locator(".reading-help-panel");
  await expect(toggle).toHaveText("Read AloudOff");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(group.locator(".reading-secondary")).toBeHidden();
  await expect(panel).toBeHidden();
  await expect(header.getByText("Proof of concept")).toHaveCount(0);
  await header.screenshot({ path: "test-results/reading-navbar-off.png" });
  await tabTo(page, help);
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await expect(group.locator("details")).toHaveAttribute("open", "");
  await expect(help).toBeFocused();
  await page.keyboard.press("Space");
  await expect(panel).toBeHidden();
  await enable(page);
  await tabTo(page, region(page, "Learning objective"));
  await expect(toggle).toHaveText("ReadingOn");
  await expect(toggle).toHaveAccessibleName("Read Aloud: Reading · On");
  const pause = group.getByRole("button", { name: "Pause Read Aloud", exact: true });
  await tabTo(page, pause);
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveText("PausedOn");
  await expect(toggle).toHaveAccessibleName("Read Aloud: Paused · On");
  const resume = group.getByRole("button", { name: "Resume Read Aloud", exact: true });
  await expect(resume).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveText("ReadingOn");
  await page.keyboard.press("Tab");
  await expect(group.getByRole("button", { name: "Stop Read Aloud", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(group.getByRole("button", { name: "Stop Read Aloud", exact: true })).toBeDisabled();
  await expect(group.getByRole("button", { name: "Playback is not active" })).toBeDisabled();
  await expect(toggle).toHaveText("Read AloudOn");
  await expect(group.getByRole("status")).toContainText("stopped");
  await page.setViewportSize({ width: 320, height: 800 });
  await region(page, "Diagram: node B").focus();
  await expect(toggle).toHaveText("ReadingOn");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await header.screenshot({ path: "test-results/reading-navbar-active-narrow.png" });
  const height = (await header.boundingBox())!.height;
  await tabTo(page, help);
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  expect((await header.boundingBox())!.height).toBe(height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Space");
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveText("Read AloudOff");
  await expect(group.locator(".reading-secondary")).toBeHidden();
});
