import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ReadBuffer } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { BaseMCPTransport, TransportInfo } from './base/MCPTransport';
import { DockerClient } from '../infrastructure/docker/DockerClient';
import Docker from 'dockerode';
import { PassThrough } from 'stream';

/**
 * Stdio-Docker Transport for MCP servers
 * Spawns Docker containers and communicates via stdio
 * This is a refactored version of DockerContainerTransport
 */
export class StdioDockerTransport extends BaseMCPTransport {
  private container?: Docker.Container;
  private readBuffer: ReadBuffer;
  private stdin?: NodeJS.ReadWriteStream;
  private image: string;
  private env: Record<string, string>;
  private memory?: number;
  private cpu?: number;

  constructor(
    private dockerClient: DockerClient,
    config: {
      image: string;
      env?: Record<string, string>;
      memory?: number;
      cpu?: number;
    }
  ) {
    super();
    this.image = config.image;
    this.env = config.env || {};
    this.memory = config.memory;
    this.cpu = config.cpu;
    this.readBuffer = new ReadBuffer();
  }

  async connect(): Promise<void> {
    try {
      // Spawn container
      this.container = await this.dockerClient.spawnContainer(
        this.image,
        this.env,
        undefined,
        this.memory,
        this.cpu
      );

      // Attach to container
      const stream = await this.container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        stdin: true
      });

      this.stdin = stream;

      const stdoutStream = new PassThrough();
      const stderrStream = new PassThrough();

      // Demux Docker stream
      this.container.modem.demuxStream(stream, stdoutStream, stderrStream);

      // Handle stdout (MCP protocol)
      stdoutStream.on('data', (chunk: Buffer) => {
        this.readBuffer.append(chunk);
        this.processBuffer();
      });

      // Handle stderr (logs)
      stderrStream.on('data', (chunk: Buffer) => {
        console.error(`[Container stderr]:`, chunk.toString());
      });

      // Handle stream end
      stream.on('end', () => {
        this.emitClose();
      });

      // Handle stream error
      stream.on('error', (error: Error) => {
        this.emitError(error);
      });

      this.connected = true;
      console.log(`[StdioDockerTransport] Connected to container ${this.container.id.slice(0, 12)}`);
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to spawn container: ${(error as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.stdin) {
      this.stdin.end();
    }

    if (this.container) {
      try {
        await this.dockerClient.stopContainer(this.container.id);
      } catch (error) {
        console.error('[StdioDockerTransport] Error stopping container:', error);
      }
      this.container = undefined;
    }

    this.connected = false;
    this.emitClose();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.connected || !this.stdin) {
      throw new Error('Transport not connected');
    }

    const serialized = JSON.stringify(message) + '\n';
    this.stdin.write(serialized);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.container) {
      return false;
    }

    try {
      const inspect = await this.container.inspect();
      return inspect.State.Running;
    } catch {
      return false;
    }
  }

  getInfo(): TransportInfo {
    return {
      type: 'stdio-docker',
      containerId: this.container?.id,
      endpoint: this.image
    };
  }

  /**
   * Get the container ID (useful for session tracking)
   */
  getContainerId(): string | undefined {
    return this.container?.id;
  }

  private processBuffer(): void {
    while (true) {
      try {
        const message = this.readBuffer.readMessage();
        if (!message) break;
        this.emitMessage(message);
      } catch (error) {
        this.emitError(error as Error);
        break;
      }
    }
  }
}
