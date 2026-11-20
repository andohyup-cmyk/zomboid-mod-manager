import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportWorkbench } from "../components/ImportWorkbench";

test("isolated Preview distinguishes persistent queue from catalog approval", () => {
  const html = renderToStaticMarkup(createElement(ImportWorkbench, { readOnly: true, queueWritable: true }));
  assert.match(html, /Steam 공개 정보는 영구 대기함에 자동 저장/);
  assert.match(html, /영구 대기함 · 정식 등록 전 보관/);
  assert.match(html, /영구 대기함 새로고침/);
  assert.match(html, /정식 카탈로그 등록용/);
  assert.doesNotMatch(html, /이 배포는 읽기 전용입니다/);
});

test("read-only Preview without queue permission has no queue management UI", () => {
  const html = renderToStaticMarkup(createElement(ImportWorkbench, { readOnly: true, queueWritable: false }));
  assert.match(html, /이 배포는 읽기 전용입니다/);
  assert.doesNotMatch(html, /영구 대기함 새로고침/);
  assert.doesNotMatch(html, /대기함에서 숨기기/);
});
