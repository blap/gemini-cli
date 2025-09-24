/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuestManager } from './QuestManager.js';
import { LevelCoordinator } from './LevelCoordinator.js';
import type { GeminiClient } from '@google/gemini-cli-core';
import type { Quest, QuestConfig } from '../shared/types.js';

// Mock dependencies
const mockSave = vi.fn();
const mockFindById = vi.fn();
const mockFindAll = vi.fn();

vi.mock('../db/QuestRepository.js', () => ({
  QuestRepository: vi.fn().mockImplementation(() => ({
    save: mockSave,
    findById: mockFindById,
    findAll: mockFindAll,
  })),
}));

vi.mock('./LevelCoordinator.js');

describe('QuestManager', () => {
  let questManager: QuestManager;
  let mockGeminiClient: GeminiClient;

  beforeEach(() => {
    mockGeminiClient = {} as GeminiClient; // Mock GeminiClient
    questManager = new QuestManager(mockGeminiClient);
    vi.clearAllMocks();
  });

  describe('createQuest', () => {
    it('should create a new quest and save it', async () => {
      const config: QuestConfig = {
        title: 'Test Quest',
        description: 'A quest for testing',
      };

      const newQuest = await questManager.createQuest(config);

      expect(newQuest.config.title).toBe('Test Quest');
      expect(newQuest.status).toBe('pending');
      expect(mockSave).toHaveBeenCalledWith(newQuest);
    });
  });

  describe('getQuest', () => {
    it('should retrieve a quest by its ID', async () => {
      const questId = 'test-id';
      const mockQuest: Quest = {
        id: questId,
        config: { title: 'Test', description: '...' },
        status: 'pending',
        currentLevel: 'none',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindById.mockResolvedValue(mockQuest);

      const foundQuest = await questManager.getQuest(questId);

      expect(foundQuest).toEqual(mockQuest);
      expect(mockFindById).toHaveBeenCalledWith(questId);
    });

    it('should return null if quest is not found', async () => {
      const questId = 'not-found';
      mockFindById.mockResolvedValue(null);

      const foundQuest = await questManager.getQuest(questId);

      expect(foundQuest).toBeNull();
      expect(mockFindById).toHaveBeenCalledWith(questId);
    });
  });

  describe('listQuests', () => {
    it('should return a list of all quests', async () => {
      const mockQuests: Quest[] = [
        {
          id: 'q1',
          config: { title: 'Q1', description: '...' },
          status: 'pending',
          currentLevel: 'none',
          createdAt: 'date',
          updatedAt: 'date',
        },
      ];
      mockFindAll.mockResolvedValue(mockQuests);

      const quests = await questManager.listQuests();

      expect(quests).toEqual(mockQuests);
      expect(mockFindAll).toHaveBeenCalled();
    });
  });

  describe('executeQuest', () => {
    it('should execute a quest and update its status', async () => {
      const questId = 'test-id';
      const mockQuest: Quest = {
        id: questId,
        config: { title: 'Test', description: '...' },
        status: 'pending',
        currentLevel: 'none',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindById.mockResolvedValue(mockQuest);
      const mockCoordinate = vi
        .spyOn(LevelCoordinator.prototype, 'coordinate')
        .mockResolvedValue('Success');

      const result = await questManager.executeQuest(questId);

      expect(mockFindById).toHaveBeenCalledWith(questId);
      expect(LevelCoordinator).toHaveBeenCalledOnce();
      expect(mockCoordinate).toHaveBeenCalledOnce();
      expect(result).toEqual('Success');
    });

    it('should throw an error if the quest is not found', async () => {
      const questId = 'not-found';
      mockFindById.mockResolvedValue(null);

      await expect(questManager.executeQuest(questId)).rejects.toThrow(
        'Quest not found',
      );
    });

    it('should handle execution failure and update status to failed', async () => {
      const questId = 'test-id';
      const mockQuest: Quest = {
        id: questId,
        config: { title: 'Test', description: '...' },
        status: 'pending',
        currentLevel: 'none',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockFindById.mockResolvedValue(mockQuest);
      const error = new Error('Execution failed');
      vi.spyOn(LevelCoordinator.prototype, 'coordinate').mockRejectedValue(
        error,
      );

      await expect(questManager.executeQuest(questId)).rejects.toThrow(error);
    });
  });
});
