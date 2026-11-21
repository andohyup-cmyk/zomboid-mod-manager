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

test("mobile Workshop input is compact, with a right-aligned clear button", () => {
  const html = renderToStaticMarkup(createElement(ImportWorkbench, { readOnly: true, queueWritable: true }));
  assert.match(html, /Workshop URL 또는 ID/);
  assert.match(html, /justify-between/);
  assert.match(html, />\s*지우기\s*</);
  assert.match(html, /rows="2"/);
  assert.doesNotMatch(html, /1\. Workshop 항목 입력/);
  assert.doesNotMatch(html, /입력 비우기/);
});

test("Steam lookup stays available while manual JSON fields are hidden", () => {
  const html = renderToStaticMarkup(createElement(ImportWorkbench, { readOnly: true, queueWritable: true }));
  assert.match(html, /GitHub에 저장되지 않은 Workshop 링크도 Steam에서 직접 조회/);
  assert.match(html, /입력한 모드 확인 \(Steam 공개 정보\)/);
  assert.match(html, /기존 AI 조사 결과 불러오기 \(선택\)/);
  assert.match(html, /영구 대기함 새로고침/);
  assert.doesNotMatch(html, /JSON 조사 결과/);
  assert.doesNotMatch(html, /수동 JSON을 영구 대기함에 저장/);
});
