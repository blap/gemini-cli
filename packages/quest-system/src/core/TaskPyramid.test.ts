/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskPyramid } from './TaskPyramid.js';
import type { GeminiClient } from '@google/gemini-cli-core';
import type { Quest, OperationalTask, KnowledgeItem } from '../index.js';
import { KnowledgeBaseService } from '../db/KnowledgeBaseService.js';
import { SemanticCacheService } from '../cache/SemanticCacheService.js';

// Mock GeminiClient
const mockSendMessageStream = vi.fn();

// Mock KnowledgeBaseService
const mockRetrieveKnowledge = vi.fn();

vi.mock('../db/KnowledgeBaseService.js', () => ({
  KnowledgeBaseService: vi.fn().mockImplementation(() => ({
    retrieveKnowledge: mockRetrieveKnowledge.mockResolvedValue([]),
  })),
}));

vi.mock('./GeminiDispatcher.js', () => ({
  GeminiDispatcher: vi
    .fn()
    .mockImplementation((quest, geminiClient, knowledgeBaseService) => ({
      dispatchStrategic: vi.fn(async (description) => {
        const relevantKnowledge = await knowledgeBaseService.retrieveKnowledge(
          description,
          5,
        );
        const knowledgeContext = relevantKnowledge
          .map((item: KnowledgeItem) => item.content)
          .join('\n\n');
        const prompt = `Design the architecture for: ${description}\n\nRelevant Knowledge:\n${knowledgeContext}`;
        let fullResponse = '';
        for await (const chunk of mockSendMessageStream(
          prompt,
          expect.anything(),
          quest.id,
        )) {
          if (chunk.type === 'content') {
            fullResponse += chunk.value;
          }
        }
        return fullResponse;
      }),
      dispatchTactical: vi.fn(async (strategicPlan) => {
        const prompt = `Based on the following strategic plan, break it down into detailed tactical milestones and sub-tasks. For each milestone, list the key objectives. Format the output as a markdown list.\n\nStrategic Plan:\n"${strategicPlan}"`;
        let fullResponse = '';
        for await (const chunk of mockSendMessageStream(
          prompt,
          expect.anything(),
          quest.id,
        )) {
          if (chunk.type === 'content') {
            fullResponse += chunk.value;
          }
        }
        return fullResponse;
      }),
      dispatchOperational: vi.fn(async (tacticalPlan) => {
        const prompt = `Based on the following tactical plan, break it down into concrete, actionable operational tasks. For each task, suggest a command-line tool that could be used to execute it (e.g., 'writeFile', 'runShellCommand', 'replace'). Format each task as a JSON object with 'task' and 'suggestedTool' keys, and return a JSON array of these objects.\n\nTactical Plan:\n"${tacticalPlan}"`;
        let fullResponse = '';
        for await (const chunk of mockSendMessageStream(
          prompt,
          expect.anything(),
          quest.id,
        )) {
          if (chunk.type === 'content') {
            fullResponse += chunk.value;
          }
        }
        try {
          return JSON.parse(fullResponse) as OperationalTask[];
        } catch (error) {
          console.error('Failed to parse operational tasks JSON:', error);
          return [];
        }
      }),
      dispatchAtomic: vi.fn(async (task) => {
        const prompt = `For the following operational task, generate the specific command to be executed. If the task is to write code, generate the code. If it is a shell command, generate the command. Only output the raw command or code, nothing else.\n\nOperational Task:\n"${task.task}"`;
        let fullResponse = '';
        for await (const chunk of mockSendMessageStream(
          prompt,
          expect.anything(),
          quest.id,
        )) {
          if (chunk.type === 'content') {
            fullResponse += chunk.value;
          }
        }
        const nextState = fullResponse.toLowerCase().includes('success')
          ? 'done'
          : 'operational';
        return { task, outcome: fullResponse, nextState };
      }),
    })),
}));

describe('TaskPyramid', () => {
  let taskPyramid: TaskPyramid;
  let mockQuest: Quest;
  let mockGeminiClient: GeminiClient;

  beforeEach(() => {
    mockQuest = {
      id: 'test-quest',
      config: {
        title: 'Test Quest',
        description: 'A quest to test the pyramid',
      },
      status: 'executing',
      currentLevel: 'strategic',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockGeminiClient = {
      sendMessageStream: mockSendMessageStream,
      embedContent: vi.fn(),
    } as unknown as GeminiClient;

    taskPyramid = new TaskPyramid(
      mockQuest,
      mockGeminiClient,
      new KnowledgeBaseService(),
      new SemanticCacheService(mockGeminiClient),
    );
    vi.clearAllMocks();
  });

  async function* createAsyncGenerator(value: string) {
    yield { type: 'content', value };
  }

  describe('executeStrategicLevel', () => {
    it('should generate a strategic plan', async () => {
      const expectedPlan = 'This is the strategic plan.';
      mockSendMessageStream.mockReturnValue(createAsyncGenerator(expectedPlan));

      // Access private method for testing
      const result = await (
        taskPyramid as unknown as {
          executeStrategicLevel: () => Promise<string>;
        }
      ).executeStrategicLevel();

      expect(mockSendMessageStream).toHaveBeenCalledWith(
        `Design the architecture for: ${mockQuest.config.description}\n\nRelevant Knowledge:\n`,
        expect.anything(),
        mockQuest.id,
      );
      expect(result).toBe(expectedPlan);
    });
  });

  describe('executeTacticalLevel', () => {
    it('should generate a tactical plan from a strategic plan', async () => {
      const strategicPlan = 'High-level strategy';
      const expectedPlan = 'Detailed tactical plan.';
      mockSendMessageStream.mockReturnValue(createAsyncGenerator(expectedPlan));

      const result = await (
        taskPyramid as unknown as {
          executeTacticalLevel: (strategicPlan: string) => Promise<string>;
        }
      ).executeTacticalLevel(strategicPlan);

      expect(mockSendMessageStream).toHaveBeenCalledWith(
        `Based on the following strategic plan, break it down into detailed tactical milestones and sub-tasks. For each milestone, list the key objectives. Format the output as a markdown list.\n\nStrategic Plan:\n"${strategicPlan}"`,
        expect.anything(),
        mockQuest.id,
      );
      expect(result).toBe(expectedPlan);
    });
  });

  describe('executeOperationalLevel', () => {
    it('should generate operational tasks from a tactical plan', async () => {
      const tacticalPlan = 'Tactical milestones';
      const mockResponse: OperationalTask[] = [
        { task: 'task 1', suggestedTool: 'tool_1' },
        { task: 'task 2', suggestedTool: 'tool_2' },
      ];
      mockSendMessageStream.mockReturnValue(
        createAsyncGenerator(JSON.stringify(mockResponse)),
      );

      const result = await (
        taskPyramid as unknown as {
          executeOperationalLevel: (
            tacticalPlan: string,
          ) => Promise<OperationalTask[]>;
        }
      ).executeOperationalLevel(tacticalPlan);

      expect(mockSendMessageStream).toHaveBeenCalledWith(
        `Based on the following tactical plan, break it down into concrete, actionable operational tasks. For each task, suggest a command-line tool that could be used to execute it (e.g., 'writeFile', 'runShellCommand', 'replace'). Format each task as a JSON object with 'task' and 'suggestedTool' keys, and return a JSON array of these objects.\n\nTactical Plan:\n"${tacticalPlan}"`,
        expect.anything(),
        mockQuest.id,
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle JSON parsing errors gracefully', async () => {
      const tacticalPlan = 'Tactical milestones';
      const invalidJsonResponse = 'not a json string';
      mockSendMessageStream.mockReturnValue(
        createAsyncGenerator(invalidJsonResponse),
      );

      await expect(
        (
          taskPyramid as unknown as {
            executeOperationalLevel: (
              tacticalPlan: string,
            ) => Promise<OperationalTask[]>;
          }
        ).executeOperationalLevel(tacticalPlan),
      ).resolves.toEqual([]);
    });
  });

  describe('executeAtomicLevel', () => {
    it('should execute operational tasks and return results', async () => {
      const operationalTasks: OperationalTask[] = [
        { task: 'First task', suggestedTool: 'tool_1' },
        { task: 'Second task', suggestedTool: 'tool_2' },
      ];
      const outcomes = ['Outcome 1', 'Outcome 2'];
      mockSendMessageStream
        .mockReturnValueOnce(createAsyncGenerator(outcomes[0]))
        .mockReturnValueOnce(createAsyncGenerator(outcomes[1]));

      const results = await (
        taskPyramid as unknown as {
          executeAtomicLevel: (
            operationalTasks: OperationalTask[],
          ) => Promise<unknown>;
        }
      ).executeAtomicLevel(operationalTasks);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        `For the following operational task, generate the specific command to be executed. If the task is to write code, generate the code. If it is a shell command, generate the command. Only output the raw command or code, nothing else.\n\nOperational Task:\n"${operationalTasks[0].task}"`,
        expect.anything(),
        mockQuest.id,
      );
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        `For the following operational task, generate the specific command to be executed. If the task is to write code, generate the code. If it is a shell command, generate the command. Only output the raw command or code, nothing else.\n\nOperational Task:\n"${operationalTasks[1].task}"`,
        expect.anything(),
        mockQuest.id,
      );
      expect(results).toEqual([
        {
          task: operationalTasks[0],
          outcome: outcomes[0],
          nextState: 'operational',
        },
        {
          task: operationalTasks[1],
          outcome: outcomes[1],
          nextState: 'operational',
        },
      ]);
    });
  });
});
