import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { accommodate } from "../../src/lib/engine/pipeline";
import { binaryTreeAdapter } from "../../src/lib/fixtures/binary-tree";

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 100; index++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Control was not reachable by keyboard");
}
async function openAccommodation(page: Page) {
  await page.goto("/demo");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("checkbox", { name: "I have difficulty independently interpreting visual diagrams" }));
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create accessible representation" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Your accessible learning experience" })).toBeFocused();
}

test("real server workflow works by keyboard through exploration, all competencies, and retry", async ({ page }) => {
  await openAccommodation(page);
  await expect(page.getByText(/No AI explanation has been substituted/)).toHaveCount(0);
  await tabTo(page, page.getByRole("button", { name: "Node C", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Node C relationships" })).toBeFocused();
  await expect(page.locator(".item-details")).toContainText("Left child: none.");
  await expect(page.locator(".item-details")).toContainText("Right child: F.");
  await tabTo(page, page.getByRole("button", { name: "Explore right child F" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Node F relationships" })).toBeFocused();
  const cases = [
    { prompt: "Which node is the root?", answers: ["A"] },
    { prompt: "Which node is the parent of E?", answers: ["B"] },
    { prompt: "Which nodes are the children of B? Select all that apply.", answers: ["D", "E"] },
    { prompt: "Which nodes are leaves? Select all that apply.", answers: ["D", "E", "F"] },
  ];
  for (const item of cases) {
    const group = page.getByRole("group", { name: item.prompt, exact: true });
    for (const answer of item.answers) {
      const target = group.getByLabel(`Node ${answer}`, { exact: true });
      // Native radio groups enter at their selected/first radio; arrow keys select later options.
      if (await target.getAttribute("type") === "radio") {
        await tabTo(page, group.getByLabel("Node A", { exact: true }));
        for (let i = 0; i < answer.charCodeAt(0) - 65; i++) await page.keyboard.press("ArrowRight");
      } else await tabTo(page, target);
      await page.keyboard.press("Space");
    }
    await tabTo(page, group.getByRole("button", { name: "Check my reasoning" }));
    await page.keyboard.press("Enter");
    await expect(group.locator("xpath=ancestor::form").getByRole("status", { name: `Practice feedback: ${item.prompt}` })).toContainText("consistent with the source");
  }
  const root = page.getByRole("group", { name: "Which node is the root?", exact: true });
  await tabTo(page, root.getByLabel("Node A", { exact: true }));
  await page.keyboard.press("ArrowRight");
  await tabTo(page, root.getByRole("button", { name: "Check my reasoning" }));
  await page.keyboard.press("Enter");
  await expect(root.locator("xpath=ancestor::form").getByRole("status", { name: "Practice feedback: Which node is the root?" })).toContainText("try again");
  await expect(page.getByText("Your learning goal:")).toBeVisible();
});

test("initial and accommodated pages pass automated accessibility checks and narrow-screen layout", async ({ page }) => {
  await page.goto("/demo");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await openAccommodation(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/adapt-narrow.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/adapt-desktop.png", fullPage: true });
});

test("sample explanation keeps lesson content without technical labels or source links", async ({ page }) => {
  const result = await accommodate(binaryTreeAdapter, { barriers: ["visual-diagram-interpretation"], representation: "structured-text" }, { origin: "ai-generated", explain: async () => [{ sourceId: "definitions", text: "The root has no parent." }, { sourceId: "node-A", text: "A is the root and has no parent." }] });
  // Mock only the network boundary in this presentation test, never in the application.
  await page.route("**/api/accommodation", (route) => route.fulfill({ json: result }));
  await openAccommodation(page);
  await expect(page.getByText("AI-selected explanation · live Amazon Bedrock")).toHaveCount(0);
  const explanation = page.getByRole("region", { name: "Explore the ideas" });
  await expect(explanation).toContainText("The root has no parent.");
  await expect(explanation.getByRole("link")).toHaveCount(0);

});

test("request errors are announced and retry remains available", async ({ page }) => {
  await page.route("**/api/accommodation", (route) => route.fulfill({ status: 500, json: { error: "Unavailable" } }));
  await page.goto("/demo");
  await page.getByRole("checkbox", { name: "I have difficulty independently interpreting visual diagrams" }).check();
  await page.getByRole("button", { name: "Create accessible representation" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Please try again");
  await expect(page.getByRole("button", { name: "Create accessible representation" })).toBeEnabled();
});
