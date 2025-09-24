/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import axios, { AxiosError } from 'axios';
import { Quest } from '@google/quest-system';

// This would be a more complex setup in a real app, likely involving
// starting and stopping the actual api-server process.
// For this example, we'll assume the server is running at this base URL.
const API_BASE_URL = 'http://localhost:3000';

describe('Quest System API Integration Tests', () => {
  let createdQuestId: string;

  it('should create a new quest', async () => {
    const questConfig = {
      title: 'Integration Test Quest',
      description: 'A quest to test the whole API flow',
    };

    const response = await axios.post(
      `${API_BASE_URL}/api/quests`,
      questConfig,
    );

    expect(response.status).toBe(201);
    expect(response.data.id).toBeDefined();
    expect(response.data.config.title).toBe(questConfig.title);
    expect(response.data.status).toBe('pending');

    createdQuestId = response.data.id;
  });

  it('should list all quests, including the new one', async () => {
    const response = await axios.get(`${API_BASE_URL}/api/quests`);

    expect(response.status).toBe(200);
    const foundQuest = response.data.find(
      (q: Quest) => q.id === createdQuestId,
    );
    expect(foundQuest).toBeDefined();
  });

  it('should retrieve a specific quest by its ID', async () => {
    const response = await axios.get(
      `${API_BASE_URL}/api/quests/${createdQuestId}`,
    );

    expect(response.status).toBe(200);
    expect(response.data.id).toBe(createdQuestId);
  });

  it('should return a 404 for a non-existent quest ID', async () => {
    try {
      await axios.get(`${API_BASE_URL}/api/quests/non-existent-id`);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ error: string }>;
      expect(axiosError.response?.status).toBe(404);
      expect(axiosError.response?.data.error).toBe('Quest not found.');
    }
  });

  // This test is more complex as it involves mocking the GeminiClient behavior
  // during execution. For a real integration test, you might have a dedicated
  // test environment or mock server.
  it.skip('should execute a quest', async () => {
    // This requires a way to mock the GeminiClient on the running server,
    // which is out of scope for this simple test file.
    const response = await axios.post(
      `${API_BASE_URL}/api/quests/${createdQuestId}/execute`,
    );

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('completed');
  });

  it('should return a consistent error format from the centralized handler', async () => {
    // To test this, we need a route that is guaranteed to throw an error.
    // We'll simulate this by trying to execute a non-existent quest.
    try {
      await axios.post(`${API_BASE_URL}/api/quests/non-existent-id/execute`);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{
        status: string;
        message: string;
      }>;
      expect(axiosError.response?.status).toBe(500); // Or a more specific error code
      expect(axiosError.response?.data.status).toBe('error');
      expect(axiosError.response?.data.message).toContain(
        'Quest with id non-existent-id not found',
      );
    }
  });
});
