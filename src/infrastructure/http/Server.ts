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
  }

  public listen(port: number, callback?: () => void) {
    this.httpServer.listen(port, callback);
  }

  public close(callback?: (err?: Error) => void) {
      this.io.close();
      this.httpServer.close(callback);
  }
}
