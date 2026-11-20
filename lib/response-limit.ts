export class ResponseTooLargeError extends Error {
  constructor() { super("Response exceeded the configured byte limit"); }
}

/** Read at most maxBytes of untrusted network data, even for chunked responses. */
export async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("invalid response limit");
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw new ResponseTooLargeError();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new ResponseTooLargeError();
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let index = 0;
  for (const chunk of chunks) { bytes.set(chunk, index); index += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
