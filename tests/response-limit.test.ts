import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedResponseText, ResponseTooLargeError } from "../lib/response-limit";

test("reads a small streamed Steam response", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) { ctrl.enqueue(new TextEncoder().encode('{"ok":')); ctrl.enqueue(new TextEncoder().encode("true}")); ctrl.close(); }
  });
  assert.equal(await readBoundedResponseText(new Response(stream), 50), '{"ok":true}');
});
test("rejects a too-large declared response before body download", async () => {
  const response = new Response("a", { headers: { "content-length": "200" } });
  await assert.rejects(() => readBoundedResponseText(response, 50), ResponseTooLargeError);
});
test("rejects a chunked response exceeding byte limit", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) { ctrl.enqueue(new TextEncoder().encode("a".repeat(8))); ctrl.enqueue(new TextEncoder().encode("b".repeat(8))); ctrl.close(); }
  });
  await assert.rejects(() => readBoundedResponseText(new Response(stream), 10), ResponseTooLargeError);
});
test("multibyte UTF-8 limits count bytes, not JS characters", async () => {
  const body = "가나";
  await assert.rejects(() => readBoundedResponseText(new Response(body), 5), ResponseTooLargeError);
  assert.equal(await readBoundedResponseText(new Response(body), 6), body);
});
