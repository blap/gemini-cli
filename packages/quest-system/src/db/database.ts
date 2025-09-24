/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./quest_system.db');

export async function initializeDatabase(): Promise<void> {
  const createQuestsTable = `
    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      current_level TEXT DEFAULT 'none',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error TEXT
    );
  `;
  return new Promise<void>((resolve, reject) => {
    db.run(createQuestsTable, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function dbRun(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function dbGet(sql: string, params: unknown[] = []): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

export function dbAll(sql: string, params: unknown[] = []): Promise<unknown[]> {
  return new Promise<unknown[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

export { db };
