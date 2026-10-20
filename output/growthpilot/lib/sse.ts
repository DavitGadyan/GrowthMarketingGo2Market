import type { StreamEnvelope } from "./types";

function parseChunk(chunk: string): StreamEnvelope | null {
  const data = chunk
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("\n");
  if (!data) return null;
  try {
    return JSON.parse(data) as StreamEnvelope;
  } catch {
    return null;
  }
}

/**
 * Async iterator over `data: {...}` envelopes on a fetch() body.
 *
 * The server (sse-starlette) terminates lines with CRLF, so every chunk is
 * normalised to LF before frames are split on a blank line. A chunk that ends
 * in a lone `\r` is held back until the next chunk arrives, so a CRLF split
 * across two reads cannot be mistaken for two line endings.
 */
export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamEnvelope> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let held = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      let text = held + decoder.decode(value, { stream: true });
      held = "";
      if (text.endsWith("\r")) {
        held = "\r";
        text = text.slice(0, -1);
      }
      buf += text.replace(/\r\n/g, "\n");
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const env = parseChunk(chunk);
        if (env) yield env;
      }
    }
    buf += (held + decoder.decode()).replace(/\r\n?/g, "\n");
    for (const chunk of buf.split("\n\n")) {
      if (!chunk.trim()) continue;
      const env = parseChunk(chunk);
      if (env) yield env;
    }
  } finally {
    reader.releaseLock();
  }
}

/** EventSource wrapper. Closes itself on a `done` envelope so the browser does not reconnect forever. */
export function openEventSource(
  url: string,
  onEnvelope: (env: StreamEnvelope) => void,
  onError?: (ev: globalThis.Event) => void,
): () => void {
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try {
      const env = JSON.parse(e.data) as StreamEnvelope;
      onEnvelope(env);
      if (env.type === "done") es.close();
    } catch {
      /* ignore malformed frames */
    }
  };
  es.onerror = (ev) => onError?.(ev);
  return () => es.close();
}
