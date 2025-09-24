/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { Database } from 'sqlite3';
import type { CacheEntry } from '../index.js';
import type { GeminiClient } from '@google/gemini-cli-core';

interface GeminiClientWithEmbed extends GeminiClient {
  embedContent(query: string): Promise<number[] | undefined>;
}

export class SemanticCacheService {
  private db: Database;

  constructor(
    private geminiClient: GeminiClientWithEmbed,
    dbPath: string = ':memory:',
  ) {
    this.db = new Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening cache database', err.message);
      } else {
        this.db.run(
          `CREATE TABLE IF NOT EXISTS semantic_cache (
            queryHash TEXT PRIMARY KEY,
            semanticVector BLOB,
            response TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            ttl INTEGER
          )`,
          (createErr) => {
            if (createErr) {
              console.error('Error creating cache table', createErr.message);
            }
          },
        );
      }
    });
  }

  private generateHash(query: string): string {
    return createHash('sha256').update(query).digest('hex');
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (magnitude1 * magnitude2);
  }

  async get(
    query: string,
    similarityThreshold: number = 0.8,
  ): Promise<string | null> {
    const queryEmbedding = await this.geminiClient.embedContent(query);
    if (!queryEmbedding) return null;

    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT response, timestamp, ttl, semanticVector FROM semantic_cache',
        (err, rows: CacheEntry[]) => {
          if (err) {
            reject(err);
          } else {
            let bestMatch: string | null = null;
            let highestSimilarity = similarityThreshold;

            for (const row of rows) {
              const now = new Date().getTime();
              const entryTime = new Date(row.timestamp).getTime();
              if (row.ttl && now - entryTime > row.ttl) {
                this.db.run(
                  'DELETE FROM semantic_cache WHERE queryHash = ?',
                  row.queryHash,
                );
                continue;
              }

              if (row.semanticVector) {
                const cachedEmbedding = JSON.parse(
                  row.semanticVector as unknown as string,
                );
                const similarity = this.cosineSimilarity(
                  queryEmbedding,
                  cachedEmbedding,
                );
                if (similarity > highestSimilarity) {
                  highestSimilarity = similarity;
                  bestMatch = row.response;
                }
              }
            }
            resolve(bestMatch);
          }
        },
      );
    });
  }

  async set(query: string, response: string, _ttl?: number): Promise<void> {
    const queryHash = this.generateHash(query);
    const timestamp = new Date().toISOString();
    const queryEmbedding = await this.geminiClient.embedContent(query);
    const semanticVector = queryEmbedding
      ? JSON.stringify(queryEmbedding)
      : null;

    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO semantic_cache (queryHash, semanticVector, response, timestamp, ttl) VALUES (?, ?, ?, ?, ?)',
        queryHash,
        semanticVector,
        response,
        timestamp,
        (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  async invalidate(query: string): Promise<void> {
    const queryHash = this.generateHash(query);
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM semantic_cache WHERE queryHash = ?',
        queryHash,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing cache database', err.message);
      }
    });
  }
}
