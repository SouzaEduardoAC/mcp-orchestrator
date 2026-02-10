import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import Docker from 'dockerode';
import { PassThrough, Writable } from 'stream';

export class DockerContainerTransport implements Transport {
  private _container: Docker.Container;
  private _readBuffer: ReadBuffer;
  private _stdin?: NodeJS.ReadWriteStream;
  
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(container: Docker.Container) {
    this._container = container;
    this._readBuffer = new ReadBuffer();
  }

  async start(): Promise<void> {
    // Attach to the container
    // We need stream: true, stdout: true, stderr: true, stdin: true
    const stream = await this._container.attach({
      stream: true,
      stdout: true,
      stderr: true,
      stdin: true
    });

    this._stdin = stream;
    
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    // Dockerode modifies the stream in place or uses it?
    // demuxStream(stream, stdout, stderr)
    this._container.modem.demuxStream(stream, stdoutStream, stderrStream);

    // Handle stdout (Protocol)
    stdoutStream.on('data', (chunk: Buffer) => {
      this._readBuffer.append(chunk);
      this.processBuffer();
    });
    
    // Handle stderr (Logs)
    stderrStream.on('data', (chunk: Buffer) => {
       console.error(`[Container Error]: ${chunk.toString()}`);
    });
    
    stream.on('end', () => {
        this.onclose?.();
    });
    
    stream.on('error', (err: Error) => {
        this.onerror?.(err);
    });
  }

  private processBuffer() {
    while (true) {
      try {
        const message = this._readBuffer.readMessage();
        if (!message) break;
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error as Error);
      }
    }
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (!this._stdin) {
      throw new Error('Transport not started');
    }
    
    const serialized = serializeMessage(message);
    this._stdin.write(serialized);
  }

  async close(): Promise<void> {
    this._stdin?.end();
  }
}
