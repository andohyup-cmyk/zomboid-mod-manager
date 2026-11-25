import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportWorkbench } from "../components/ImportWorkbench";

test("isolated Preview shows persistent queue refresh in action bar and keeps catalog registration blocked", () => {
  const html = renderToStaticMarkup(createElement(ImportWorkbench, { readOnly: true, queueWritable: true }));
  assert.match(html, /Steam 공개 정보는 영구 대기함에 자동 저장/);
  assert.match(html, /영구 대기함 새로고침/);
  assert.match(html, /선택 삭제/);
  assert.doesNotMatch(html, /이 배포는 읽기 전용입니다/);
});

test("read-only Preview without queue permission has no queue refresh button", () => {
  const html = renderToStaticMarkup(createElement(ImportWorkbench, { readOnly: true, queueWritable: false }));
  assert.match(html, /이 배포는 읽기 전용입니다/);
  assert.doesNotMatch(html, /영구 대기함 새로고침/);
});

test("mobile Workshop input is merged with Steam lookup and has right-aligned clear button", () => {
  const html = renderToStaticMarkup(createElement(ImportWorkbench, { readOnly: true, queueWritable: true }));
  assert.match(html, /Workshop URL 또는 ID/);
  assert.match(html, /justify-between/);
  assert.match(html, />\s*지우기\s*</);
  assert.match(html, /rows="2"/);
  assert.match(html, /입력한 모드 확인 \(Steam 공개 정보\)/);
  assert.doesNotMatch(html, /1\. Workshop 항목 입력/);
  assert.doesNotMatch(html, /2\. 모드 정보 조회/);
});

test("legacy AI inbox loader and manual JSON fields are removed from /register UI", () => {
  const html = renderToStaticMarkup(createElement(ImportWorkbench, { readOnly: true, queueWritable: true }));
  assert.doesNotMatch(html, /기존 AI 조사 결과 불러오기/);
  assert.doesNotMatch(html, /JSON 조사 결과/);
  assert.doesNotMatch(html, /수동 JSON을 영구 대기함에 저장/);
  assert.doesNotMatch(html, /B42\.22/);
});
