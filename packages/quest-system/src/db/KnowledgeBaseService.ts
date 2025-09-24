/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import type { KnowledgeItem } from '../index.js';
import { Database } from 'sqlite3';

export class KnowledgeBaseService {
  private db: Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database', err.message);
      } else {
        this.db.run(
          `CREATE TABLE IF NOT EXISTS knowledge_items (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            tags TEXT,
            source TEXT,
            timestamp TEXT NOT NULL
          )`,
          (createErr) => {
            if (createErr) {
              console.error('Error creating table', createErr.message);
            }
          },
        );
      }
    });
  }

  async addKnowledge(
    item: Omit<KnowledgeItem, 'id' | 'timestamp'>,
  ): Promise<KnowledgeItem> {
    const newItem: KnowledgeItem = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...item,
    };
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO knowledge_items (id, content, tags, source, timestamp) VALUES (?, ?, ?, ?, ?)',
        newItem.id,
        newItem.content,
        newItem.tags ? JSON.stringify(newItem.tags) : null,
        (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve(newItem);
          }
        },
      );
    });
  }

  async retrieveKnowledge(
    query: string,
    limit: number = 10,
  ): Promise<KnowledgeItem[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM knowledge_items WHERE content LIKE ? OR tags LIKE ? LIMIT ?`,
        `%${query}%`,
        `%${query}%`,
        limit,
        (err: Error | null, rows: KnowledgeItem[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(
              rows.map((row: KnowledgeItem) => ({
                ...row,
                tags: row.tags
                  ? JSON.parse(row.tags as unknown as string)
                  : undefined,
              })) as KnowledgeItem[],
            );
          }
        },
      );
    });
  }

  async updateKnowledge(item: KnowledgeItem): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE knowledge_items SET content = ?, tags = ?, source = ?, timestamp = ? WHERE id = ?',
        item.content,
        item.tags ? JSON.stringify(item.tags) : null,
        item.source || null,
        new Date().toISOString(),
        item.id,
        (err: Error | null) => {
          if (err) {
            reject(err);
          }
          resolve();
        },
      );
    });
  }

  async deleteKnowledge(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM knowledge_items WHERE id = ?',
        id,
        (err: Error | null) => {
          if (err) {
            reject(err);
          }
          resolve();
        },
      );
    });
  }

  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing database', err.message);
      }
    });
  }
}
