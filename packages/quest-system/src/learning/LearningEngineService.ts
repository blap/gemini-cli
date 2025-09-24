/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import { Database } from 'sqlite3';
import type { ExecutionLog } from '../index.js';

type DbExecutionLog = Omit<ExecutionLog, 'toolCalls'> & {
  toolCalls?: string;
};

export class LearningEngineService {
  private db: Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening learning database', err.message);
      } else {
        this.db.run(
          `CREATE TABLE IF NOT EXISTS execution_logs (
            id TEXT PRIMARY KEY,
            questId TEXT NOT NULL,
            level TEXT NOT NULL,
            input TEXT NOT NULL,
            output TEXT NOT NULL,
            durationMs INTEGER NOT NULL,
            status TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            toolCalls TEXT,
            error TEXT
          )`,
          (createErr) => {
            if (createErr) {
              console.error(
                'Error creating execution_logs table',
                createErr.message,
              );
            }
          },
        );
      }
    });
  }

  async logExecution(
    log: Omit<ExecutionLog, 'id' | 'timestamp'>,
  ): Promise<ExecutionLog> {
    const newLog: ExecutionLog = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...log,
    };
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO execution_logs (id, questId, level, input, output, durationMs, status, timestamp, toolCalls, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        newLog.id,
        newLog.questId,
        newLog.level,
        newLog.input,
        newLog.output,
        newLog.durationMs,
        newLog.status,
        newLog.timestamp,
        newLog.toolCalls ? JSON.stringify(newLog.toolCalls) : null,
        newLog.error || null,
        (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve(newLog);
          }
        },
      );
    });
  }

  async analyzePastExecutions(): Promise<ExecutionLog[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM execution_logs',
        (err: Error | null, rows: DbExecutionLog[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(
              rows.map((row: DbExecutionLog) => ({
                ...row,
                toolCalls: row.toolCalls
                  ? JSON.parse(row.toolCalls)
                  : undefined,
              })),
            );
          }
        },
      );
    });
  }

  async generatePromptImprovements(): Promise<string[]> {
    const failures = await new Promise<ExecutionLog[]>((resolve, reject) => {
      this.db.all(
        "SELECT * FROM execution_logs WHERE status = 'failure'",
        (err: Error | null, rows: DbExecutionLog[]) => {
          if (err) reject(err);
          else
            resolve(
              rows.map((row) => ({
                ...row,
                toolCalls: row.toolCalls
                  ? JSON.parse(row.toolCalls)
                  : undefined,
              })),
            );
        },
      );
    });

    if (failures.length === 0) {
      return ['No failures recorded.'];
    }

    const failurePatterns = new Map<string, number>();
    for (const failure of failures) {
      const key = `Level '${failure.level}' failed with error: ${failure.error}`;
      failurePatterns.set(key, (failurePatterns.get(key) || 0) + 1);
    }

    const suggestions = Array.from(failurePatterns.entries()).map(
      ([pattern, count]) =>
        `Pattern detected: ${pattern} (${count} times). Consider refining the prompt or logic for this level.`,
    );

    return suggestions;
  }

  async suggestToolUsagePatterns(): Promise<string[]> {
    const successfulTasks = await new Promise<ExecutionLog[]>(
      (resolve, reject) => {
        this.db.all(
          "SELECT * FROM execution_logs WHERE status = 'success' AND toolCalls IS NOT NULL",
          (err: Error | null, rows: DbExecutionLog[]) => {
            if (err) reject(err);
            else
              resolve(
                rows.map((row) => ({
                  ...row,
                  toolCalls: row.toolCalls
                    ? JSON.parse(row.toolCalls)
                    : undefined,
                })),
              );
          },
        );
      },
    );

    if (successfulTasks.length === 0) {
      return ['No successful tool usage recorded yet.'];
    }

    const toolUsage = new Map<string, number>();
    for (const task of successfulTasks) {
      if (task.toolCalls) {
        for (const call of task.toolCalls) {
          toolUsage.set(call.tool, (toolUsage.get(call.tool) || 0) + 1);
        }
      }
    }

    const sortedTools = Array.from(toolUsage.entries()).sort(
      (a, b) => b[1] - a[1],
    );

    const suggestions = sortedTools.map(
      ([tool, count]) => `Tool '${tool}' was used successfully ${count} times.`,
    );

    return suggestions;
  }

  async getLogsByQuestId(_questId: string): Promise<ExecutionLog[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM execution_logs WHERE questId = ?',
        (err: Error | null, rows: DbExecutionLog[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(
              rows.map((row) => ({
                ...row,
                toolCalls: row.toolCalls
                  ? JSON.parse(row.toolCalls)
                  : undefined,
              })),
            );
          }
        },
      );
    });
  }

  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing learning database', err.message);
      }
    });
  }
}
