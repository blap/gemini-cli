/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiClient } from '@google/gemini-cli-core';
import type { OperationalTask, Quest, AtomicResult } from '../index.js';
import type { KnowledgeBaseService } from '../index.js';
import type { SemanticCacheService } from '../index.js';

export class GeminiDispatcher {
  constructor(
    private quest: Quest,
    private geminiClient: GeminiClient,
    private knowledgeBaseService: KnowledgeBaseService,
    private semanticCacheService: SemanticCacheService,
  ) {}

  async dispatchStrategic(description: string): Promise<string> {
    const relevantKnowledge = await this.knowledgeBaseService.retrieveKnowledge(
      description,
      5,
    );
    const knowledgeContext = relevantKnowledge
      .map((item) => item.content)
      .join('\n\n');
    const prompt = `Design the architecture for: ${description}\n\nRelevant Knowledge:\n${knowledgeContext}`;
    return this.sendMessage(prompt);
  }

  async dispatchTactical(strategicPlan: string): Promise<string> {
    const prompt = `Based on the following strategic plan, break it down into detailed tactical milestones and sub-tasks. For each milestone, list the key objectives. Format the output as a markdown list.\n\nStrategic Plan:\n"${strategicPlan}"`;
    return this.sendMessage(prompt);
  }

  async dispatchOperational(tacticalPlan: string): Promise<OperationalTask[]> {
    const prompt = `Based on the following tactical plan, break it down into concrete, actionable operational tasks. For each task, suggest a command-line tool that could be used to execute it (e.g., 'writeFile', 'runShellCommand', 'replace'). Format each task as a JSON object with 'task' and 'suggestedTool' keys, and return a JSON array of these objects.\n\nTactical Plan:\n"${tacticalPlan}"`;
    const response = await this.sendMessage(prompt);
    try {
      return JSON.parse(response) as OperationalTask[];
    } catch (error) {
      console.error('Failed to parse operational tasks JSON:', error);
      return [];
    }
  }

  async dispatchAtomic(task: OperationalTask): Promise<AtomicResult> {
    const prompt = `For the following operational task, generate the specific command to be executed. If the task is to write code, generate the code. If it is a shell command, generate the command. Only output the raw command or code, nothing else.\n\nOperational Task:\n"${task.task}"`;
    const outcome = await this.sendMessage(prompt);
    const nextState = outcome.toLowerCase().includes('success')
      ? 'done'
      : 'operational';
    return { task, outcome, nextState };
  }

  private async sendMessage(prompt: string): Promise<string> {
    const cachedResponse = await this.semanticCacheService.get(prompt);
    if (cachedResponse) {
      return cachedResponse;
    }

    const result = this.geminiClient.sendMessageStream(
      prompt,
      new AbortController().signal,
      this.quest.id,
    );
    let fullResponse = '';
    for await (const chunk of result) {
      if (chunk.type === 'content') {
        fullResponse += chunk.value;
      }
    }
    await this.semanticCacheService.set(prompt, fullResponse);
    return fullResponse;
  }
}
