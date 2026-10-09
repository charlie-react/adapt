import { deflateSync } from "node:zlib";
import type { AccessPreferences, AdaptedExperience, LearningMaterial, LearningProvider, MaterialUnderstanding } from "../../src/lib/learning/types";
export const lessonText = "A binary tree has at most two children per node. The root has no parent. A leaf has no children. In this example, A is the root and B is its left child.";
export function understanding(material: LearningMaterial): MaterialUnderstanding {
  const textUnit = material.units.find(unit => !!unit.text), visual = material.units[0];
  const reference = textUnit ? { sourceId: textUnit.id, mode: "text" as const, quote: textUnit.text!.slice(0, Math.min(100, textUnit.text!.length)) } : { sourceId: visual.id, mode: "visual" as const, quote: "" };
  return { title: "Understanding relationships", summary: "The material explains a structure and the relationships between its parts.", sections: [{ id: "relationships", title: "Make the connections", kind: material.kind === "image" ? "diagram" : material.kind === "video" ? "video" : "prose", paragraphs: ["The root has no parent. A leaf has no children."], evidence: [reference] }, { id: "example", title: "Follow the example", kind: "example", paragraphs: ["In this example, A is the root and B is its left child."], evidence: [reference] }], coverage: material.units.map(unit => ({ sourceId: unit.id, status: "clear" })), limitations: material.kind === "text" ? [] : ["Visual descriptions are AI interpretations of the original source."] };
}
export function experience(material: LearningMaterial, analysis: MaterialUnderstanding, preferences: AccessPreferences): AdaptedExperience {
  return { introduction: "Explore the same relationships in complete, connected statements.", sections: analysis.sections.map(section => ({ ...section, paragraphs: preferences.needs.includes("plain-language") ? ["Start with the root: it is the node that has no parent."] : section.paragraphs, steps: preferences.needs.includes("stepwise") ? ["Find the node with no parent.", "Follow each parent-to-child relationship."] : [] })), practice: [{ id: "reflect-1", prompt: "How would you identify the root and a leaf in this material?", evidence: analysis.sections[0].evidence }], limitations: analysis.limitations };
}
export const fixtureProvider: LearningProvider = {
  adaptSource: async (material, preferences) => {
    const result = experience(material, understanding(material), preferences);
    result.sections[0].evidence = material.units.map(unit => unit.text ? { sourceId: unit.id, mode: "text", quote: unit.text.slice(0, 100) } : { sourceId: unit.id, mode: "visual", quote: "" });
    return result;
  },
  understand: async material => understanding(material), adapt: async (material, analysis, preferences) => experience(material, analysis, preferences), reflect: async (material, question) => ({ message: "Compare your explanation with the source: the root has no parent.", nextStep: "Describe a leaf using the relationship shown in your material.", evidence: question.evidence }),
};
function crc(bytes: Uint8Array) { let sum = 0xffffffff; for (const byte of bytes) { sum ^= byte; for (let bit = 0; bit < 8; bit++) sum = (sum >>> 1) ^ ((sum & 1) ? 0xedb88320 : 0); } return (sum ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Uint8Array) { const body = Buffer.concat([Buffer.from(type), data]), header = Buffer.alloc(4), tail = Buffer.alloc(4); header.writeUInt32BE(data.length); tail.writeUInt32BE(crc(body)); return Buffer.concat([header, body, tail]); }
// A real selectable PNG fixture: labeled A/B nodes with a connecting edge.
export function diagramPng(): Uint8Array {
  const width = 320, height = 240, pixels = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  function dot(x: number, y: number, color = [40, 30, 70]) { const offset = y * (width * 3 + 1) + 1 + x * 3; color.forEach((c, index) => { pixels[offset + index] = c; }); }
  for (let y = 57; y <= 166; y++) { const x = Math.round(160 - (y - 57) * 70 / 109); for (let dx = -2; dx <= 2; dx++) dot(x + dx, y); }
  for (const [cx, cy] of [[160, 55], [90, 168]]) for (let y = cy - 29; y <= cy + 29; y++) for (let x = cx - 29; x <= cx + 29; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < 29 ** 2) dot(x, y, [225, 211, 245]);
  const glyphs = ["01110/10001/10001/11111/10001/10001/10001", "11110/10001/10001/11110/10001/10001/11110"];
  for (const [index, [cx, cy]] of [[160, 55], [90, 168]].entries()) glyphs[index].split("/").forEach((line, y) => [...line].forEach((value, x) => { if (value === "1") for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) dot(cx - 7 + x * 3 + dx, cy - 10 + y * 3 + dy); }));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]));
}
export function mp4Container(duration = 2): Uint8Array {
  const box = (type: string, body: Buffer) => { const header = Buffer.alloc(8); header.writeUInt32BE(body.length + 8); header.write(type, 4); return Buffer.concat([header, body]); };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(duration * 1000, 16);
  const hdlr = Buffer.alloc(24); hdlr.write("vide", 8);
  return new Uint8Array(Buffer.concat([box("ftyp", Buffer.from("isom\0\0\0\0isom")), box("moov", Buffer.concat([box("mvhd", mvhd), box("trak", box("mdia", box("hdlr", hdlr)))])), box("mdat", Buffer.from([1]))]));
}
