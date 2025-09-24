/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import { QuestRepository } from '../db/QuestRepository.js';
import { KnowledgeBaseService } from '../db/KnowledgeBaseService.js';
import { SemanticCacheService } from '../cache/SemanticCacheService.js';
import { LearningEngineService } from '../learning/LearningEngineService.js';
import type {
  Quest,
  QuestConfig,
  KnowledgeItem,
  ExecutionLog,
} from '../index.js';
import { TaskPyramid } from './TaskPyramid.js';
import type { GeminiClient } from '@google/gemini-cli-core';
import { LevelCoordinator } from './LevelCoordinator.js';

export class QuestManager {
  private repository: QuestRepository;
  knowledgeBaseService: KnowledgeBaseService;
  semanticCacheService: SemanticCacheService;
  learningEngineService: LearningEngineService;

  constructor(private geminiClient: GeminiClient) {
    this.repository = new QuestRepository();
    this.knowledgeBaseService = new KnowledgeBaseService();
    this.semanticCacheService = new SemanticCacheService(this.geminiClient);
    this.learningEngineService = new LearningEngineService();
  }

  async createQuest(config: QuestConfig): Promise<Quest> {
    const now = new Date().toISOString();
    const quest: Quest = {
      id: uuidv4(),
      config,
      status: 'pending',
      currentLevel: 'none',
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(quest);
    return quest;
  }

  async getQuest(id: string): Promise<Quest | null> {
    return this.repository.findById(id);
  }

  async listQuests(): Promise<Quest[]> {
    return this.repository.findAll();
  }

  async addKnowledgeItem(
    item: Omit<KnowledgeItem, 'id' | 'timestamp'>,
  ): Promise<KnowledgeItem> {
    return this.knowledgeBaseService.addKnowledge(item);
  }

  async logExecution(
    log: Omit<ExecutionLog, 'id' | 'timestamp'>,
  ): Promise<ExecutionLog> {
    return this.learningEngineService.logExecution(log);
  }

  async executeQuest(questId: string): Promise<unknown> {
    const quest = await this.getQuest(questId);
    if (!quest) {
      throw new Error('Quest not found');
    }
    const taskPyramid = new TaskPyramid(
      quest,
      this.geminiClient,
      this.knowledgeBaseService,
      this.semanticCacheService,
    );
    const coordinator = new LevelCoordinator(this.learningEngineService);
    return coordinator.coordinate(taskPyramid);
  }

  async updateQuest(quest: Quest): Promise<Quest> {
    const existingQuest = await this.repository.findById(quest.id);
    if (!existingQuest) {
      throw new Error(`Quest with ID ${quest.id} not found.`);
    }
    const updatedQuest = {
      ...existingQuest,
      ...quest,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.save(updatedQuest);
    return updatedQuest;
  }

  async deleteQuest(questId: string): Promise<void> {
    const existingQuest = await this.repository.findById(questId);
    if (!existingQuest) {
      throw new Error(`Quest with ID ${questId} not found.`);
    }
    await this.repository.delete(questId);
  }
}
