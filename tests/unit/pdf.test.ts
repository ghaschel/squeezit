import { describe, expect, test } from "vitest";

import { classifyPdfJson } from "../../src/core/pdf";

function document(dictionary: Record<string, unknown> = {}) {
  return {
    version: 2,
    encrypt: { encrypted: false },
    acroform: { fields: [], hasacroform: false, needappearances: false },
    pages: [{ object: "3 0 R", contents: [], images: [] }],
    qpdf: [
      {
        jsonversion: 2,
        pdfversion: "1.4",
        calledgetallpages: true,
        maxobjectid: 9,
      },
      {
        "obj:1 0 R": { value: { "/Type": "/Catalog", "/Pages": "2 0 R" } },
        "obj:2 0 R": {
          value: { "/Type": "/Pages", "/Kids": ["3 0 R"], "/Count": 1 },
        },
        "obj:3 0 R": { value: { "/Type": "/Page" } },
        "obj:4 0 R": { value: dictionary },
        trailer: { value: { "/Root": "1 0 R" } },
      },
    ],
  };
}

describe("PDF dictionary protection policy", () => {
  test("accepts ordinary documents and treats literal signature text as content", () => {
    expect(
      classifyPdfJson(document({ "/Title": "u:/Type /Sig /ByteRange [0 10]" }))
    ).toEqual({ eligible: true, pdfVersion: "1.4", pageCount: 1 });
  });
  test.each([
    [{ "/FT": "/Sig" }, "pdf-signature-field"],
    [{ "/Kids": [{ "/FT": "/Sig" }] }, "pdf-signature-field"],
    [{ "/Type": "/Sig" }, "pdf-signature"],
    [{ "/Type": "/DocTimeStamp" }, "pdf-signature"],
    [{ "/ByteRange": [0, 1, 2, 3] }, "pdf-signature"],
    [{ "/SigFlags": 3 }, "pdf-signature-field"],
    [{ "/Perms": {} }, "pdf-signature"],
    [{ "/XFA": [] }, "pdf-unsupported-structure"],
  ])("skips signing dictionaries %j", (dictionary, reason) => {
    expect(
      classifyPdfJson(document(dictionary as Record<string, unknown>))
    ).toMatchObject({ eligible: false, reason });
  });
  test("resolves indirect signature types", () => {
    const json = document({ "/FT": "5 0 R" });
    Object.assign(json.qpdf[1]!, { "obj:5 0 R": { value: "/Sig" } });
    expect(classifyPdfJson(json)).toMatchObject({
      reason: "pdf-signature-field",
    });
  });
  test("rejects unresolved signature types", () => {
    expect(classifyPdfJson(document({ "/FT": "999 0 R" }))).toMatchObject({
      reason: "pdf-inspection-inconclusive",
    });
  });
  test("rejects revision history even with no current signature objects", () => {
    const json = document();
    Object.assign(
      (json.qpdf[1] as { trailer: { value: object } }).trailer.value,
      { "/Prev": 123 }
    );
    expect(classifyPdfJson(json)).toMatchObject({
      reason: "pdf-unsupported-structure",
    });
  });
  test.each([
    null,
    {},
    { version: 1 },
    { ...document(), pages: [null] },
    { ...document(), acroform: {} },
  ])("rejects incomplete JSON %j", (value) => {
    expect(classifyPdfJson(value)).toMatchObject({
      reason: "pdf-inspection-inconclusive",
    });
  });
  test("rejects missing required object wrappers", () => {
    const json = document();
    Object.assign(json.qpdf[1]!, { "obj:8 0 R": {} });
    expect(classifyPdfJson(json)).toMatchObject({
      reason: "pdf-inspection-inconclusive",
    });
  });
});

test("rejects missing page trees even with an empty page summary", () => {
  const json = document();
  json.pages = [];
  Object.assign(json.qpdf[1]!, {
    "obj:1 0 R": { value: { "/Type": "/Catalog", "/Pages": "999 0 R" } },
  });
  expect(classifyPdfJson(json)).toMatchObject({
    reason: "pdf-inspection-inconclusive",
  });
});
