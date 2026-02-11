import { spawn, ChildProcess } from 'child_process';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { BaseMCPTransport, TransportInfo } from './base/MCPTransport';
import { ReadBuffer } from '@modelcontextprotocol/sdk/shared/stdio.js';

/**
 * Stdio Transport for MCP servers
 * Spawns and communicates with local MCP server processes via stdin/stdout
 */
export class StdioTransport extends BaseMCPTransport {
  private process?: ChildProcess;
  private command: string;
  private args: string[];
  private env: Record<string, string>;
  private cwd?: string;
  private readBuffer: ReadBuffer;

  constructor(config: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }) {
    super();
    this.command = config.command;
    this.args = config.args || [];
    this.env = { ...process.env, ...config.env } as Record<string, string>;
    this.cwd = config.cwd;
    this.readBuffer = new ReadBuffer();
  }

  async connect(): Promise<void> {
    try {
      this.process = spawn(this.command, this.args, {
        env: this.env,
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle stdout (MCP protocol messages)
      this.process.stdout?.on('data', (chunk: Buffer) => {
        this.readBuffer.append(chunk);
        this.processBuffer();
      });

      // Handle stderr (logs)
      this.process.stderr?.on('data', (chunk: Buffer) => {
        console.error(`[MCP stderr]:`, chunk.toString());
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[StdioTransport] Process exited with code ${code}, signal ${signal}`);
        this.emitClose();
      });

      // Handle errors
      this.process.on('error', (error) => {
        this.emitError(error);
      });

      // Wait for process to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Process startup timeout'));
        }, 5000);

        this.process!.once('spawn', () => {
          clearTimeout(timeout);
          this.connected = true;
          resolve(undefined);
        });

        this.process!.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      console.log(`[StdioTransport] Connected to process ${this.process.pid}`);
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to spawn process: ${(error as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    this.connected = false;
    this.emitClose();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.connected || !this.process?.stdin) {
      throw new Error('Transport not connected');
    }

    const serialized = JSON.stringify(message) + '\n';
    this.process.stdin.write(serialized);
  }

  async healthCheck(): Promise<boolean> {
    return this.connected && this.process !== undefined && !this.process.killed;
  }

  getInfo(): TransportInfo {
    return {
      type: 'stdio',
      pid: this.process?.pid,
      endpoint: `${this.command} ${this.args.join(' ')}`
    };
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
