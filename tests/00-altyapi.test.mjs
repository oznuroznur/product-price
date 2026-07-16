import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("jsdom kurulu ve çalışıyor", () => {
  const dom = new JSDOM("<h1>merhaba</h1>");
  assert.equal(dom.window.document.querySelector("h1").textContent, "merhaba");
});
