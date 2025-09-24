/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiClient } from '@google/gemini-cli-core';
import type { Quest, OperationalTask, AtomicResult } from '../index.js';
import { GeminiDispatcher } from './GeminiDispatcher.js';
import type { KnowledgeBaseService } from '../db/KnowledgeBaseService.js';
import type { SemanticCacheService } from '../cache/SemanticCacheService.js';

export class TaskPyramid {
  private dispatcher: GeminiDispatcher;

  constructor(
    public quest: Quest,
    geminiClient: GeminiClient,
    knowledgeBaseService: KnowledgeBaseService,
    semanticCacheService: SemanticCacheService,
  ) {
    this.dispatcher = new GeminiDispatcher(
      quest,
      geminiClient,
      knowledgeBaseService,
      semanticCacheService,
    );
  }

  async executeStrategicLevel(): Promise<string> {
    return this.dispatcher.dispatchStrategic(this.quest.config.description);
  }

  async executeTacticalLevel(strategicPlan: string): Promise<string> {
    return this.dispatcher.dispatchTactical(strategicPlan);
  }

  async executeOperationalLevel(
    tacticalPlan: string,
  ): Promise<OperationalTask[]> {
    return this.dispatcher.dispatchOperational(tacticalPlan);
  }

  async executeAtomicLevel(
    operationalTasks: OperationalTask[],
  ): Promise<AtomicResult[]> {
    const results: AtomicResult[] = [];
    for (const task of operationalTasks) {
      const atomicResult = await this.dispatcher.dispatchAtomic(task);
      results.push(atomicResult);
    }
    return results;
  }
}
