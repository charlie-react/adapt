import { test, expect } from "@playwright/test";
import { textPdf, unicodePdf, imageOnlyPdf, encryptedPdf } from "../fixtures/pdf";

test("production Next runtime extracts real page-level PDF text and provenance", async ({ request }) => {
  const bytes = Buffer.from(textPdf([["First heading", "1. Read the source."], ["Second heading", "A complete statement!"]], true));
  const first = await request.post("/api/ingestion/pdf-spike", { data: bytes, headers: { "content-type": "application/pdf" } });
  expect(first.status()).toBe(200);
  const result = await first.json();
  expect(result.ok).toBe(true);
  expect(result.material.pages).toHaveLength(2);
  expect(result.material.blocks.some((block: { kind: string; structureBasis: string }) => block.kind === "list-item" && block.structureBasis === "document-tags")).toBe(true);
  const repeated = await request.post("/api/ingestion/pdf-spike", { data: bytes });
  expect(await repeated.json()).toEqual(result);
  const unicode = await request.post("/api/ingestion/pdf-spike", { data: Buffer.from(unicodePdf()) });
  expect((await unicode.json()).material.blocks[0].text).toBe("Café — ‘complete’ sentences! Ω, β, and Ж survive.");
});

test("production Next runtime returns honest PDF failure results", async ({ request }) => {
  for (const [bytes, code] of [[Buffer.alloc(0), "EMPTY_INPUT"], [Buffer.from("HTML disguised as PDF"), "NOT_PDF"], [Buffer.from(textPdf().slice(0, 400)), "INVALID_PDF"], [Buffer.from(textPdf([[]])), "NO_READABLE_TEXT"], [Buffer.from(imageOnlyPdf()), "NO_READABLE_TEXT"], [Buffer.from(encryptedPdf()), "PASSWORD_PROTECTED"]] as const) {
    const response = await request.post("/api/ingestion/pdf-spike", { data: bytes, headers: { "content-type": "application/pdf" } });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe(code);
  }
});
