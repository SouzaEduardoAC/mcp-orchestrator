import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';

export class AppServer {
  public app: express.Application;
  public httpServer: HttpServer;
  public io: SocketIOServer;

  constructor() {
    this.app = express();
    this.configureMiddleware();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*', // Allow all for prototype
        methods: ['GET', 'POST']
      }
    });
  }

  private configureMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../../public')));

    // Diagnostic endpoint to check available models
    this.app.get('/api/models/check', async (req, res) => {
      const provider = process.env.LLM_PROVIDER || 'gemini';
      const results: any = { provider, models: {} };

      try {
        if (provider === 'claude') {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            return res.json({ error: 'ANTHROPIC_API_KEY not set' });
          }
          const client = new Anthropic({ apiKey });

          const modelsToTest = [
            'claude-sonnet-4-5-20250929',
            'claude-opus-4-6',
            'claude-opus-4-6-1m',
            'claude-haiku-4-5-20251001',
            'claude-3-5-sonnet-20240620',
            'claude-3-5-sonnet-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
          ];

          for (const model of modelsToTest) {
            try {
              await client.messages.create({
                model,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
              });
              results.models[model] = 'available';
            } catch (error: any) {
              results.models[model] = error.status === 404 ? 'not_found' : `error: ${error.message}`;
            }
          }
        } else if (provider === 'openai') {
          const OpenAI = (await import('openai')).default;
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            return res.json({ error: 'OPENAI_API_KEY not set' });
          }
          const client = new OpenAI({ apiKey });
          const modelsList = await client.models.list();
          results.models = modelsList.data.map(m => m.id);
        } else if (provider === 'gemini') {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            return res.json({ error: 'GEMINI_API_KEY not set' });
          }
          const genAI = new GoogleGenerativeAI(apiKey);

          const modelsToTest = [
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-pro'
          ];

          for (const model of modelsToTest) {
            try {
              const geminiModel = genAI.getGenerativeModel({ model });
              await geminiModel.generateContent('Hi');
              results.models[model] = 'available';
            } catch (error: any) {
              results.models[model] = `error: ${error.message}`;
            }
          }
        }

        res.json(results);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Endpoint to get available models for current provider (dynamically checked)
    this.app.get('/api/models/available', async (req, res) => {
      const provider = process.env.LLM_PROVIDER || 'gemini';

      try {
        const availableModels: Array<{id: string, name: string}> = [];

        if (provider === 'claude') {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            return res.json({ error: 'ANTHROPIC_API_KEY not set', models: [] });
          }
          const client = new Anthropic({ apiKey });

          // Define known Claude models with their display names
          const knownModels = [
            { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
            { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Oct 2024)' },
            { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (June 2024)' },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
          ];

          // Test each model
          for (const model of knownModels) {
            try {
              await client.messages.create({
                model: model.id,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'test' }]
              });
              availableModels.push(model);
            } catch (error: any) {
              // Skip models that return 404 (not found)
              if (error.status !== 404) {
                console.error(`Error testing model ${model.id}:`, error.message);
              }
            }
          }
        } else if (provider === 'openai') {
          const OpenAI = (await import('openai')).default;
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            return res.json({ error: 'OPENAI_API_KEY not set', models: [] });
          }
          const client = new OpenAI({ apiKey });

          // OpenAI has a proper list models endpoint
          const modelsList = await client.models.list();
          const chatModels = modelsList.data
            .filter(m => m.id.startsWith('gpt-'))
            .map(m => ({
              id: m.id,
              name: m.id.toUpperCase().replace(/-/g, ' ')
            }));

          availableModels.push(...chatModels);
        } else if (provider === 'gemini') {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            return res.json({ error: 'GEMINI_API_KEY not set', models: [] });
          }
          const genAI = new GoogleGenerativeAI(apiKey);

          // Gemini doesn't have a reliable list endpoint, so test known models
          const knownModels = [
            { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
          ];

          for (const model of knownModels) {
            try {
              const geminiModel = genAI.getGenerativeModel({ model: model.id });
              await geminiModel.generateContent('test');
              availableModels.push(model);
            } catch (error: any) {
              console.error(`Error testing model ${model.id}:`, error.message);
            }
          }
        }

        res.json({
          provider,
          models: availableModels
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message, models: [] });
      }
    });

    // MCP health status endpoint
    this.app.get('/api/mcp/health', async (req, res) => {
      try {
        const { MCPConnectionManager } = await import('../../services/MCPConnectionManager');
        const { MCPHealthMonitor } = await import('../../services/MCPHealthMonitor');
        const { ConfigStore } = await import('../../registry/ConfigStore');
        const { MCPRegistry } = await import('../../registry/MCPRegistry');
        const { DockerClient } = await import('../docker/DockerClient');

        const configStore = new ConfigStore();
        const registry = new MCPRegistry(configStore);
        await registry.initialize();

        const dockerClient = new DockerClient();
        const connectionManager = new MCPConnectionManager(dockerClient);
        await connectionManager.initialize();

        const healthMonitor = new MCPHealthMonitor(connectionManager, 60000);

        const connectedMCPs = connectionManager.getConnectedMCPs();

        // Run health checks
        const healthChecks = await Promise.allSettled(
          connectedMCPs.map(name => healthMonitor.triggerHealthCheck(name))
        );

        const healthResults = connectedMCPs.map((name, i) => {
          const check = healthChecks[i];
          if (check.status === 'fulfilled' && check.value) {
            return check.value;
          }
          return {
            name,
            status: 'unknown',
            lastCheck: Date.now(),
            lastSuccess: 0,
            consecutiveFailures: 0,
            error: 'Health check failed'
          };
        });

        const summary = healthMonitor.getHealthSummary();

        // Cleanup
        healthMonitor.stop();
        await connectionManager.cleanup();

        res.json({
          summary,
          mcps: healthResults
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Add MCP server endpoint
    this.app.post('/api/mcp/add', async (req, res) => {
      try {
        const { name, config } = req.body;

        // Validate request body
        if (!name || typeof name !== 'string') {
          return res.status(400).json({ error: 'Name is required and must be a string' });
        }

        if (!config || typeof config !== 'object') {
          return res.status(400).json({ error: 'Config is required and must be an object' });
        }

        // Validate name format
        if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
          return res.status(400).json({ error: 'Name can only contain letters, numbers, hyphens, and underscores' });
        }

        // Validate transport type
        const validTransports = ['http', 'sse', 'stdio', 'stdio-docker'];
        if (!config.transport || !validTransports.includes(config.transport)) {
          return res.status(400).json({ error: 'Valid transport type is required (http, sse, stdio, stdio-docker)' });
        }

        // Validate transport-specific required fields
        if (config.transport === 'http' || config.transport === 'sse') {
          if (!config.url || typeof config.url !== 'string') {
            return res.status(400).json({ error: 'URL is required for HTTP/SSE transport' });
          }
          if (!config.url.startsWith('http://') && !config.url.startsWith('https://')) {
            return res.status(400).json({ error: 'URL must start with http:// or https://' });
          }
        } else if (config.transport === 'stdio') {
          if (!config.command || typeof config.command !== 'string') {
            return res.status(400).json({ error: 'Command is required for stdio transport' });
          }
        } else if (config.transport === 'stdio-docker') {
          if (!config.containerImage || typeof config.containerImage !== 'string') {
            return res.status(400).json({ error: 'Container image is required for stdio-docker transport' });
          }
        }

        // Import and initialize registry
        const { ConfigStore } = await import('../../registry/ConfigStore');
        const { MCPRegistry } = await import('../../registry/MCPRegistry');

        const configStore = new ConfigStore();
        const registry = new MCPRegistry(configStore);
        await registry.initialize();

        // Add the MCP (this will throw if duplicate)
        await registry.addMCP(name, config);

        res.status(201).json({ message: 'MCP server added successfully', name });
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
      }
    });

    // Remove MCP server endpoint
    this.app.delete('/api/mcp/:name', async (req, res) => {
      try {
        const { name } = req.params;

        // Validate name format
        if (!name || !/^[a-zA-Z0-9-_]+$/.test(name)) {
          return res.status(400).json({ error: 'Invalid MCP name' });
        }

        // Import and initialize registry
        const { ConfigStore } = await import('../../registry/ConfigStore');
        const { MCPRegistry } = await import('../../registry/MCPRegistry');

        const configStore = new ConfigStore();
        const registry = new MCPRegistry(configStore);
        await registry.initialize();

        // Remove the MCP (this will throw if not found)
        await registry.removeMCP(name);

        res.status(200).json({ message: 'MCP server removed successfully', name });
      } catch (error: any) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
      }
    });
  }

  public listen(port: number, callback?: () => void) {
    this.httpServer.listen(port, callback);
  }

  public close(callback?: (err?: Error) => void) {
      this.io.close();
      this.httpServer.close(callback);
  }
}
