import test from "node:test";
import assert from "node:assert/strict";
import { fileMaterial } from "../src/lib/learning/material";
import { decodeAudio, type DecodedAudio } from "../src/lib/learning/audio";
import { wavAudio } from "./fixtures/audio";
test("validated upload decoding can be reused without adding PCM to material or changing source bytes", async () => {
  const bytes=wavAudio(); let decoded: DecodedAudio | undefined, calls=0;
  const material=await fileMaterial(bytes,"lecture.wav",undefined,audio=>{calls++;decoded=audio;});
  assert.equal(calls,1); assert.ok(decoded);
  assert.deepEqual(decoded,await decodeAudio(bytes));
  assert.deepEqual(Buffer.from(material.bytes!),Buffer.from(bytes));
  assert.equal(material.units[0].locator.duration,decoded.duration);
  assert.equal("pcm" in material,false);
  await assert.rejects(fileMaterial(new Uint8Array([1,2,3]),"bad.wav",undefined,()=>calls++));
  assert.equal(calls,1);
});
