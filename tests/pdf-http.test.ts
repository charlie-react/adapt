import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/ingestion/pdf-spike/route";
import { textPdf } from "./fixtures/pdf";
import { PDF_SPIKE_LIMITS } from "../src/lib/ingestion/pdf/contracts";

test("PDF diagnostic endpoint is opt-in and validates bytes rather than MIME declarations", async () => {
  const previous = process.env.ADAPT_PDF_SPIKE;
  try {
    delete process.env.ADAPT_PDF_SPIKE;
    assert.equal((await POST(new Request("http://localhost/probe", { method: "POST" }))).status, 404);
    process.env.ADAPT_PDF_SPIKE = "1";
    const success = await POST(new Request("http://localhost/probe", { method: "POST", body: Buffer.from(textPdf()), headers: { "content-type": "text/plain" } }));
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("cache-control"), "no-store");
    assert.equal((await success.json()).material.pages.length, 1);
    const spoof = await POST(new Request("http://localhost/probe", { method: "POST", body: "not a PDF", headers: { "content-type": "application/pdf" } }));
    assert.equal((await spoof.json()).error.code, "NOT_PDF");
    const empty = await POST(new Request("http://localhost/probe", { method: "POST" }));
    assert.equal((await empty.json()).error.code, "EMPTY_INPUT");
    const tooLarge = await POST(new Request("http://localhost/probe", { method: "POST", body: "small", headers: { "content-length": String(PDF_SPIKE_LIMITS.maxBytes + 1) } }));
    assert.equal(tooLarge.status, 413);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(PDF_SPIKE_LIMITS.maxBytes + 1)); controller.close(); } });
    const streamed = await POST(new Request("http://localhost/probe", { method: "POST", body: stream, duplex: "half" } as RequestInit));
    assert.equal(streamed.status, 413);
    const cancelled = await POST(new Request("http://localhost/probe", { method: "POST", body: "bytes", signal: AbortSignal.abort() }));
    assert.equal((await cancelled.json()).error.code, "ABORTED");
  } finally {
    if (previous === undefined) delete process.env.ADAPT_PDF_SPIKE;
    else process.env.ADAPT_PDF_SPIKE = previous;
  }
});
