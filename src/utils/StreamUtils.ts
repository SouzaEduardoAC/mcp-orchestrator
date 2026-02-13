import { Readable } from 'stream';

/**
 * Utilities for streaming large outputs to reduce memory usage.
 *
 * Phase 3 Optimization:
 * - Stream tool outputs instead of buffering entirely in memory
 * - Process data in chunks
 * - Reduce memory per user from 10-15MB to 5-8MB
 */

/**
 * Stream data in chunks to avoid buffering large outputs.
 *
 * @param stream Readable stream
 * @param chunkHandler Function to handle each chunk
 * @param maxSize Maximum total size in bytes (default: 10MB)
 */
export async function* streamData(
  stream: Readable,
  maxSize: number = 10 * 1024 * 1024
): AsyncGenerator<Buffer, void, unknown> {
  let totalSize = 0;

  for await (const chunk of stream) {
    totalSize += chunk.length;

    if (totalSize > maxSize) {
      throw new Error(`Stream exceeded maximum size of ${maxSize} bytes`);
    }

    yield chunk;
  }
}

/**
 * Process stream in chunks and emit results progressively.
 *
 * @param stream Readable stream
 * @param onChunk Callback for each chunk
 * @param onComplete Callback when stream completes
 * @param onError Callback on error
 */
export async function processStreamChunks(
  stream: Readable,
  onChunk: (chunk: string) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void
): Promise<void> {
  try {
    for await (const chunk of stream) {
      onChunk(chunk.toString());
    }

    if (onComplete) {
      onComplete();
    }
  } catch (error) {
    if (onError) {
      onError(error as Error);
    } else {
      throw error;
    }
  }
}

/**
 * Collect stream data with size limit.
 * Falls back to streaming if size exceeds limit.
 *
 * @param stream Readable stream
 * @param maxBufferSize Maximum size to buffer (default: 1MB)
 * @returns Buffered data or null if exceeds limit
 */
export async function collectOrStream(
  stream: Readable,
  maxBufferSize: number = 1024 * 1024
): Promise<{ data: string | null; streaming: boolean }> {
  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of stream) {
    totalSize += chunk.length;

    if (totalSize > maxBufferSize) {
      // Size exceeded, should use streaming instead
      return { data: null, streaming: true };
    }

    chunks.push(chunk);
  }

  // Size within limit, return buffered data
  return {
    data: Buffer.concat(chunks).toString(),
    streaming: false
  };
}

/**
 * Create a transform stream that processes data in chunks.
 *
 * @param chunkSize Size of each chunk (default: 64KB)
 */
export function createChunkTransform(
  chunkSize: number = 64 * 1024
): (stream: Readable) => AsyncGenerator<string, void, unknown> {
  return async function* (stream: Readable) {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString();

      while (buffer.length >= chunkSize) {
        yield buffer.substring(0, chunkSize);
        buffer = buffer.substring(chunkSize);
      }
    }

    // Yield remaining data
    if (buffer.length > 0) {
      yield buffer;
    }
  };
}

/**
 * Memory-efficient line reader for large outputs.
 *
 * @param stream Readable stream
 */
export async function* readLines(
  stream: Readable
): AsyncGenerator<string, void, unknown> {
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');

    // Keep the last incomplete line in buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      yield line;
    }
  }

  // Yield final line if any
  if (buffer.length > 0) {
    yield buffer;
  }
}

/**
 * Estimate memory usage of a string.
 *
 * @param str String to measure
 * @returns Size in bytes
 */
export function estimateMemoryUsage(str: string): number {
  // JavaScript strings are UTF-16, so 2 bytes per character
  return str.length * 2;
}

/**
 * Check if data should be streamed based on size.
 *
 * @param size Size in bytes
 * @param threshold Threshold in bytes (default: 1MB)
 * @returns True if should stream
 */
export function shouldStream(
  size: number,
  threshold: number = 1024 * 1024
): boolean {
  return size > threshold;
}
