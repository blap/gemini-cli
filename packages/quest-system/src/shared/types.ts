/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type QuestConfig = {
  title: string;
  description: string;
};

export type Quest = {
  id: string;
  config: QuestConfig;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  currentLevel: 'none' | 'strategic' | 'tactical' | 'operational' | 'atomic';
  createdAt: string;
  updatedAt: string;
  error?: string;
};

export type OperationalTask = {
  task: string;
  suggestedTool: string;
};

export type AtomicResult = {
  task: OperationalTask;
  outcome: string;
  // New field to suggest the next state
  nextState?: 'operational' | 'done';
};

export type KnowledgeItem = {
  id: string;
  content: string;
  tags?: string[];
  source?: string;
  timestamp: string;
};

export type CacheEntry = {
  queryHash: string;
  semanticVector?: number[]; // New field for semantic vector
  response: string;
  timestamp: string;
  ttl?: number; // Time to live in milliseconds
};

export type ExecutionLog = {
  id: string;
  questId: string;
  level: 'strategic' | 'tactical' | 'operational' | 'atomic';
  input: string;
  output: string;
  durationMs: number;
  status: 'success' | 'failure';
  timestamp: string;
  toolCalls?: Array<{ tool: string; args: unknown }>;
  error?: string;
};
