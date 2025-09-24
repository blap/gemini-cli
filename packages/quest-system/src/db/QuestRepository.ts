/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { dbRun, dbGet, dbAll } from './database.js';
import type { Quest } from '../shared/types.js';

interface DbQuestRow {
  id: string;
  config: string;
  status: string;
  current_level: string;
  created_at: string;
  updated_at: string;
  error?: string;
}

export class QuestRepository {
  async save(quest: Quest): Promise<void> {
    const sql = `
      INSERT INTO quests (id, config, status, current_level, created_at, updated_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        config = excluded.config,
        status = excluded.status,
        current_level = excluded.current_level,
        updated_at = excluded.updated_at,
        error = excluded.error;
    `;
    await dbRun(sql, [
      quest.id,
      JSON.stringify(quest.config),
      quest.status,
      quest.currentLevel,
      quest.createdAt,
      quest.updatedAt,
      quest.error,
    ]);
  }

  async findById(id: string): Promise<Quest | null> {
    const row = (await dbGet('SELECT * FROM quests WHERE id = ?', [
      id,
    ])) as DbQuestRow;
    if (!row) return null;
    return {
      id: row.id,
      config: JSON.parse(row.config),
      status: row.status,
      currentLevel: row.current_level,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      error: row.error,
    } as Quest;
  }

  async findAll(): Promise<Quest[]> {
    const rows = (await dbAll(
      'SELECT * FROM quests ORDER BY created_at DESC',
    )) as DbQuestRow[];
    return rows.map((row) => ({
      id: row.id,
      config: JSON.parse(row.config),
      status: row.status,
      currentLevel: row.current_level,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      error: row.error,
    })) as Quest[];
  }

  async delete(id: string): Promise<void> {
    await dbRun('DELETE FROM quests WHERE id = ?', [id]);
  }
}
