/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { v4 as uuidv4 } from 'uuid';
import {
  type LSTool,
  type ReadFileTool,
  type EditTool,
  type GlobTool,
  type RipGrepTool,
  type WriteFileTool,
  type ShellTool,
  type WebSearchTool,
  type WebFetchTool,
  type GeminiClient,
  Logger,
  GeminiEventType,
  AuthType,
  Config,
  type ConfigParameters,
  uiTelemetryService,
  ClearcutLogger,
  IdeClient,
  ideContextStore,
} from '@google/gemini-cli-core';
import {
  loadServerHierarchicalMemory,
  DEFAULT_GEMINI_MODEL,
  getAllMCPServerStatuses,
} from '@google/gemini-cli-core';
import { logs } from '@opentelemetry/api-logs';
import {
  QuestManager,
  type QuestConfig,
  type KnowledgeItem,
  type Quest,
} from '@google/quest-system';
import * as fs from 'node:fs/promises';

const app = express();
const port = process.env['PORT'] || 3000;
app.use(express.json());

// State Management
const chatSessions = new Map<string, GeminiClient>();
const runningCommands = new Map<string, AbortController>();

// Global Tools - Initialized once
let lsTool: LSTool;
let readFileTool: ReadFileTool;
let editTool: EditTool;
let globTool: GlobTool;
let ripGrepTool: RipGrepTool;
let writeFileTool: WriteFileTool;
let shellTool: ShellTool;
let webSearchTool: WebSearchTool;
let webFetchTool: WebFetchTool;
let logger: Logger;
let mainConfig: Config;
let questManager: QuestManager;

async function initializeServer() {
  // Utility for handling async route errors
  const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  const sessionId = uuidv4(); // Session ID for the server itself
  const configParams: ConfigParameters = {
    sessionId,
    targetDir: process.cwd(),
    debugMode: false,
    cwd: process.cwd(),
    model: DEFAULT_GEMINI_MODEL,
  };

  mainConfig = new Config(configParams);
  await mainConfig.initialize();
  await mainConfig.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);

  questManager = new QuestManager(mainConfig.getGeminiClient());
  const toolRegistry = mainConfig.getToolRegistry();
  lsTool = toolRegistry.getTool('list_directory') as LSTool;
  readFileTool = toolRegistry.getTool('read_file') as ReadFileTool;
  editTool = toolRegistry.getTool('replace') as EditTool;
  globTool = toolRegistry.getTool('glob') as GlobTool;
  ripGrepTool = toolRegistry.getTool('search_file_content') as RipGrepTool;
  writeFileTool = toolRegistry.getTool('write_file') as WriteFileTool;
  shellTool = toolRegistry.getTool('run_shell_command') as ShellTool;
  webSearchTool = toolRegistry.getTool('google_web_search') as WebSearchTool;
  webFetchTool = toolRegistry.getTool('web_fetch') as WebFetchTool;
  logger = new Logger(mainConfig.getSessionId(), mainConfig.storage);

  // --- API Route Definitions ---

  app.get('/api/config', (req: Request, res: Response) => {
    const configData = {
      model: mainConfig.getModel(),
      userMemory: mainConfig.getUserMemory(),
      debugMode: mainConfig.getDebugMode(),
      proxy: mainConfig.getProxy(),
      telemetryEnabled: mainConfig.getTelemetryEnabled(),
    };
    return res.json(configData);
  });

  app.put('/api/config', (req: Request, res: Response) => {
    const { model, userMemory } = req.body;
    if (model) mainConfig.setModel(model);
    if (userMemory) mainConfig.setUserMemory(userMemory);
    return res.json({ message: 'Configuration updated successfully.' });
  });

  app.post(
    '/api/auth/login',
    asyncHandler(async (req: Request, res: Response) => {
      const { authMethod } = req.body;
      if (
        !authMethod ||
        !Object.values(AuthType).includes(authMethod as AuthType)
      ) {
        return res.status(400).json({ error: 'Invalid authMethod provided.' });
      }
      await mainConfig.refreshAuth(authMethod as AuthType);
      return res.json({ message: 'Authentication process initiated.' });
    }),
  );

  app.get('/api/auth/status', (req: Request, res: Response) => {
    const userTier = mainConfig.getUserTier();
    const isAuthenticated = !!mainConfig.getContentGenerator();
    return res.json({ isAuthenticated, userTier });
  });

  // AI/Chat APIs with Session Management
  app.post(
    '/api/chat',
    asyncHandler(async (req: Request, res: Response) => {
      const newSessionId = uuidv4();
      const newConfigParams: ConfigParameters = {
        sessionId: newSessionId,
        targetDir: mainConfig.getTargetDir(),
        debugMode: mainConfig.getDebugMode(),
        cwd: mainConfig.getWorkingDir(),
        model: mainConfig.getModel(),
      };
      const newConfig = new Config(newConfigParams);
      await newConfig.initialize();
      await newConfig.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
      const newGeminiClient = newConfig.getGeminiClient();
      chatSessions.set(newSessionId, newGeminiClient);
      return res.status(201).json({ sessionId: newSessionId });
    }),
  );

  app.post(
    '/api/chat/:sessionId/message',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const client = chatSessions.get(sessionId);
      if (!client) {
        return res.status(404).json({ error: 'Chat session not found.' });
      }
      const { message } = req.body;
      const stream = client.sendMessageStream(
        message as string,
        new AbortController().signal,
        sessionId,
      );
      let fullResponse = '';
      for await (const chunk of stream) {
        if (chunk.type === GeminiEventType.Content) {
          fullResponse += chunk.value;
        }
      }
      return res.json({ response: fullResponse });
    }),
  );

  app.get(
    '/api/chat/:sessionId',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const client = chatSessions.get(sessionId);
      if (!client) {
        return res.status(404).json({ error: 'Chat session not found.' });
      }
      const history = client.getHistory();
      return res.json({ sessionId, history });
    }),
  );

  app.delete(
    '/api/chat/:sessionId',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      if (!chatSessions.has(sessionId)) {
        return res.status(404).json({ error: 'Chat session not found.' });
      }
      chatSessions.delete(sessionId);
      return res.json({ message: `Session ${sessionId} terminated.` });
    }),
  );

  app.post(
    '/api/chat/:sessionId/checkpoint',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const client = chatSessions.get(sessionId);
      if (!client) {
        return res.status(404).json({ error: 'Chat session not found.' });
      }
      const { tag } = req.body;
      const history = client.getHistory();
      await logger.saveCheckpoint(history, tag as string);
      return res.json({
        message: `Checkpoint ${tag as string} saved for session ${sessionId}.`,
      });
    }),
  );

  // Shell/Command APIs with Process Management
  app.post(
    '/api/shell/execute',
    asyncHandler(async (req: Request, res: Response) => {
      const { command, description, directory } = req.body;
      const commandId = uuidv4();
      const controller = new AbortController();
      runningCommands.set(commandId, controller);

      const params = { command, description, directory };
      const result = await (shellTool as any).call(params, controller.signal);

      runningCommands.delete(commandId); // Clean up after command finishes

      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json({ commandId, result: result.llmContent });
    }),
  );

  app.get('/api/shell/running', (req: Request, res: Response) =>
    res.json(Array.from(runningCommands.keys())),
  );

  app.delete('/api/shell/:commandId', (req: Request, res: Response) => {
    const { commandId } = req.params;
    const controller = runningCommands.get(commandId);
    if (controller) {
      controller.abort();
      runningCommands.delete(commandId);
      return res.json({ message: `Command ${commandId} terminated.` });
    } else {
      return res
        .status(404)
        .json({ error: 'Command not found or already completed.' });
    }
  });

  // Other APIs (File System, Web, etc.)
  // ... (inserting all other routes here, ensuring they use the globally initialized tools)

  app.get(
    '/api/files',
    asyncHandler(async (req: Request, res: Response) => {
      const { path, ignore } = req.query;
      const params = {
        path: path as string,
        ignore: ignore ? (ignore as string).split(',') : undefined,
      };
      const result = await (lsTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.llmContent);
    }),
  );

  app.get(
    '/api/files/*',
    asyncHandler(async (req: Request, res: Response) => {
      const absolute_path = (req.params as { [key: string]: string })[0];
      const { offset, limit } = req.query;
      const params = {
        absolute_path,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      };
      const result = await (readFileTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.llmContent);
    }),
  );

  app.put(
    '/api/files/*',
    asyncHandler(async (req: Request, res: Response) => {
      const file_path = (req.params as { [key: string]: string })[0];
      const { content } = req.body;
      const params = {
        file_path,
        content,
      };
      const result = await (writeFileTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.llmContent);
    }),
  );

  app.patch(
    '/api/files/*',
    asyncHandler(async (req: Request, res: Response) => {
      const file_path = (req.params as { [key: string]: string })[0];
      const { instruction, old_string, new_string } = req.body;
      const params = {
        file_path,
        instruction,
        old_string,
        new_string,
      };
      const result = await (editTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.llmContent);
    }),
  );

  app.post(
    '/api/files/search',
    asyncHandler(async (req: Request, res: Response) => {
      const { pattern, path, include } = req.body;
      const params = {
        pattern,
        path,
        include,
      };
      const result = await (ripGrepTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.llmContent);
    }),
  );

  app.post(
    '/api/files/glob',
    asyncHandler(async (req: Request, res: Response) => {
      const {
        pattern,
        path,
        case_sensitive,
        respect_git_ignore,
        respect_gemini_ignore,
      } = req.body;
      const params = {
        pattern,
        path,
        case_sensitive,
        respect_git_ignore,
        respect_gemini_ignore,
      };
      const result = await (globTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.llmContent);
    }),
  );

  app.post(
    '/api/web/search',
    asyncHandler(async (req: Request, res: Response) => {
      const { query } = req.body;
      const params = {
        query,
      };
      const result = await (webSearchTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.llmContent);
    }),
  );

  app.post(
    '/api/web/fetch',
    asyncHandler(async (req: Request, res: Response) => {
      const { prompt } = req.body;
      const params = {
        prompt,
      };
      const result = await (webFetchTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.llmContent);
    }),
  );

  app.get(
    '/api/memory',
    asyncHandler(async (req: Request, res: Response) => {
      const { memoryContent } = await loadServerHierarchicalMemory(
        process.cwd(),
        [],
        mainConfig.getDebugMode(),
        mainConfig.getFileService(),
        [],
        true,
      );
      const userMemory = mainConfig.getUserMemory();
      return res.json({ hierarchicalMemory: memoryContent, userMemory });
    }),
  );

  app.put(
    '/api/memory',
    asyncHandler(async (req: Request, res: Response) => {
      const { content: _content } = req.body; // Renamed to _content
      const filePath = './GEMINI.md';
      const params = {
        file_path: filePath,
        content: _content,
      };
      const result = await (writeFileTool as any).call(
        params,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json({ message: 'Memory updated successfully.' });
    }),
  );

  app.post(
    '/api/memory/discover',
    asyncHandler(async (req: Request, res: Response) => {
      const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
        process.cwd(),
        [],
        mainConfig.getDebugMode(),
        mainConfig.getFileService(),
        [],
        true,
      );
      return res.json({
        discoveredMemory: memoryContent,
        filesFound: fileCount,
      });
    }),
  );

  // MCP APIs
  app.get('/api/mcp/servers', (req: Request, res: Response) => {
    const servers = mainConfig.getMcpServers() || {};
    const statuses = getAllMCPServerStatuses();
    const serverList = Object.entries(servers).map(([name, config]) => ({
      name,
      config,
      status: statuses.get(name) || 'DISCONNECTED',
    }));
    return res.json(serverList);
  });

  app.post(
    '/api/mcp/servers/:serverName/connect',
    asyncHandler(async (req: Request, res: Response) => {
      const { serverName } = req.params;
      const toolRegistry = mainConfig.getToolRegistry();
      await toolRegistry.discoverToolsForServer(serverName);
      return res.json({
        message: `Successfully connected and discovered tools for ${serverName}.`,
      });
    }),
  );

  app.get(
    '/api/mcp/servers/:serverName/tools',
    (req: Request, res: Response) => {
      const { serverName } = req.params;
      const toolRegistry = mainConfig.getToolRegistry();
      const tools = toolRegistry.getToolsByServer(serverName);
      const toolData = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
      }));
      return res.json(toolData);
    },
  );

  app.post(
    '/api/mcp/tools/:toolName/invoke',
    asyncHandler(async (req: Request, res: Response) => {
      const { toolName } = req.params;
      const { args } = req.body;
      const toolRegistry = mainConfig.getToolRegistry();
      const tool = toolRegistry.getTool(toolName);

      if (!tool) {
        return res.status(404).json({ error: `Tool '${toolName}' not found.` });
      }

      const result = await (tool as any).call(
        args,
        new AbortController().signal,
      );
      if (result.error) {
        return res.status(500).json({
          error: result.error.message,
        });
      }
      return res.json(result.llmContent);
    }),
  );

  // Quest System APIs
  app.post(
    '/api/quests',
    asyncHandler(async (req: Request, res: Response) => {
      const config = req.body as QuestConfig;
      const newQuest = await questManager.createQuest(config);
      return res.status(201).json(newQuest);
    }),
  );

  app.get(
    '/api/quests',
    asyncHandler(async (req: Request, res: Response) => {
      const quests = await questManager.listQuests();
      return res.json(quests);
    }),
  );

  app.get(
    '/api/quests/:questId',
    asyncHandler(async (req: Request, res: Response) => {
      const quest = await questManager.getQuest(req.params['questId']);
      if (!quest) {
        return res.status(404).json({ error: 'Quest not found.' });
      }
      return res.json(quest);
    }),
  );

  app.put(
    '/api/quests/:questId',
    asyncHandler(async (req: Request, res: Response) => {
      const { questId } = req.params;
      const updatedQuestData = req.body as Quest; // Expecting a full Quest object
      if (updatedQuestData.id !== questId) {
        return res
          .status(400)
          .json({ error: 'Quest ID in body does not match ID in path.' });
      }
      try {
        const updatedQuest = await questManager.updateQuest(updatedQuestData);
        return res.json(updatedQuest);
      } catch (error) {
        return res.status(404).json({ error: (error as Error).message });
      }
    }),
  );

  app.delete(
    '/api/quests/:questId',
    asyncHandler(async (req: Request, res: Response) => {
      const { questId } = req.params;
      try {
        await questManager.deleteQuest(questId);
        return res.json({ message: `Quest ${questId} deleted successfully.` });
      } catch (error) {
        return res.status(404).json({ error: (error as Error).message });
      }
    }),
  );

  app.post(
    '/api/quests/:questId/execute',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await questManager.executeQuest(req.params['questId']);
      return res.json(result);
    }),
  );

  // Knowledge Base APIs
  app.post(
    '/api/knowledge',
    asyncHandler(async (req: Request, res: Response) => {
      const item = req.body as Omit<KnowledgeItem, 'id' | 'timestamp'>;
      const newKnowledgeItem = await questManager.addKnowledgeItem(item);
      return res.status(201).json(newKnowledgeItem);
    }),
  );

  app.get(
    '/api/knowledge',
    asyncHandler(async (req: Request, res: Response) => {
      const { query, limit } = req.query;
      // Assuming QuestManager has a retrieveKnowledge method
      const knowledgeItems =
        await questManager.knowledgeBaseService.retrieveKnowledge(
          query as string,
          parseInt(limit as string, 10),
        );
      return res.json(knowledgeItems);
    }),
  );

  app.put(
    '/api/knowledge/:knowledgeItemId',
    asyncHandler(async (req: Request, res: Response) => {
      const { knowledgeItemId } = req.params;
      const item = { ...req.body, id: knowledgeItemId } as KnowledgeItem;
      // Assuming QuestManager has an updateKnowledgeItem method
      await questManager.knowledgeBaseService.updateKnowledge(item);
      return res.json({
        message: `Knowledge item ${knowledgeItemId} updated.`,
      });
    }),
  );

  app.delete(
    '/api/knowledge/:knowledgeItemId',
    asyncHandler(async (req: Request, res: Response) => {
      const { knowledgeItemId } = req.params;
      // Assuming QuestManager has a deleteKnowledgeItem method
      await questManager.knowledgeBaseService.deleteKnowledge(knowledgeItemId);
      return res.json({
        message: `Knowledge item ${knowledgeItemId} deleted.`,
      });
    }),
  );

  // Learning Engine APIs
  app.get(
    '/api/learning/analysis',
    asyncHandler(async (req: Request, res: Response) => {
      const analysis =
        await questManager.learningEngineService.analyzePastExecutions();
      return res.json(analysis);
    }),
  );

  app.get(
    '/api/learning/prompt-improvements',
    asyncHandler(async (req: Request, res: Response) => {
      const improvements =
        await questManager.learningEngineService.generatePromptImprovements();
      return res.json(improvements);
    }),
  );

  app.get(
    '/api/learning/tool-patterns',
    asyncHandler(async (req: Request, res: Response) => {
      const patterns =
        await questManager.learningEngineService.suggestToolUsagePatterns();
      return res.json(patterns);
    }),
  );

  app.get(
    '/api/quests/:questId/logs',
    asyncHandler(async (req: Request, res: Response) => {
      const { questId } = req.params;
      // Assuming LearningEngineService has a method to get logs by questId
      const logs =
        await questManager.learningEngineService.getLogsByQuestId(questId);
      return res.json(logs);
    }),
  );

  // Telemetry APIs
  app.get('/api/telemetry/metrics', (req: Request, res: Response) => {
    const metrics = uiTelemetryService.getMetrics();
    return res.json(metrics);
  });

  app.get(
    '/api/telemetry/events',
    asyncHandler(async (req: Request, res: Response) => {
      const telemetryOutfile = mainConfig.getTelemetryOutfile();
      if (telemetryOutfile) {
        try {
          const events = await fs.readFile(telemetryOutfile, 'utf-8');
          // Attempt to parse as JSON, but return as text if it fails
          try {
            return res.json(JSON.parse(events));
          } catch {
            return res.type('text/plain').send(events);
          }
        } catch (fileError: unknown) {
          if ((fileError as { code: string }).code === 'ENOENT') {
            return res
              .status(404)
              .json({ error: 'Telemetry outfile not found.' });
          }
          throw fileError;
        }
      } else {
        // Fallback to in-memory logger if outfile is not configured
        const logger = ClearcutLogger.getInstance();
        // Accessing private `events` queue for demonstration. A real implementation might need a public getter.
        const events = (
          logger as unknown as { events: { toArray: () => unknown[] } }
        ).events.toArray();
        return res.json(events);
      }
    }),
  );

  app.post('/api/telemetry/log', (req: Request, res: Response) => {
    const { level, message, attributes } = req.body;
    const logger = logs.getLogger('api-server-custom-event');
    logger.emit({
      severityNumber: level as number, // Assumes OTel severity numbers
      body: message as string,
      attributes: attributes as any,
    });
    return res.status(202).json({ message: 'Log event accepted.' });
  });

  // VSCode IDE Companion APIs
  app.post(
    '/api/ide/connect',
    asyncHandler(async (req: Request, res: Response) => {
      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();
      return res.json(ideClient.getConnectionStatus());
    }),
  );

  app.get('/api/ide/files', (req: Request, res: Response) => {
    const ideContext = ideContextStore.get();
    return res.json(ideContext?.workspaceState?.openFiles || []);
  });

  app.post(
    '/api/ide/diff',
    asyncHandler(async (req: Request, res: Response) => {
      const { filePath, newContent } = req.body;
      const ideClient = await IdeClient.getInstance();
      if (!ideClient.isDiffingEnabled()) {
        return res.status(503).json({ error: 'IDE diffing is not available.' });
      }
      const result = await ideClient.openDiff(
        filePath as string,
        newContent as string,
      );
      return res.json(result);
    }),
  );

  app.post(
    '/api/ide/execute',
    asyncHandler(async (req: Request, res: Response) => {
      const { command, args } = req.body;
      const ideClient = await IdeClient.getInstance();
      // Using a type assertion to access the private client and its request method.
      // This is not ideal but necessary without a public executeCommand method.
      const client = (
        ideClient as unknown as {
          client: { request: (args: unknown) => Promise<unknown> };
        }
      ).client;
      if (!client) {
        return res.status(503).json({ error: 'IDE is not connected.' });
      }
      const result = await client.request({
        method: 'tools/call',
        params: {
          name: command,
          arguments: args,
        },
      });
      return res.json(result);
    }),
  );

  app.get('/', (req: Request, res: Response) => {
    res.send('Gemini CLI API Server is running!');
  });

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

initializeServer().catch((err) => {
  console.error('Failed to initialize server:', err);
  process.exit(1);
});
