/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv, Arguments } from 'yargs';
// (Assumindo um helper http para fazer chamadas à API)
import { apiPost, apiGet, apiPut, apiDelete } from '../utils/api.js';

export const quest: CommandModule = {
  command: 'quest <action> [args...]',
  describe: 'Manage the Quest System',
  builder: (yargs: Argv) =>
    yargs
      .command(
        'create',
        'Create a new quest',
        (yargs: Argv) =>
          yargs
            .option('title', { type: 'string', demandOption: true })
            .option('description', { type: 'string', demandOption: true }),
        async (argv: Arguments) => {
          const { title, description } = argv;
          const response = await apiPost('/quests', { title, description });
          console.log('Quest created:', response);
        },
      )
      .command('list', 'List all quests', {}, async () => {
        const quests = await apiGet('/quests');
        console.table(quests);
      })
      .command(
        'show <id>',
        'Show details for a quest',
        (yargs: Argv) =>
          yargs.positional('id', { type: 'string', demandOption: true }),
        async (argv: Arguments) => {
          const quest = await apiGet(`/quests/${argv['id']}`);
          console.log(quest);
        },
      )
      .command(
        'execute <id>',
        'Execute a quest',
        (yargs: Argv) =>
          yargs.positional('id', { type: 'string', demandOption: true }),
        async (argv: Arguments) => {
          const result = await apiPost(`/quests/${argv['id']}/execute`, {});
          console.log(result);
        },
      )
      .command(
        'update <id>',
        'Update an existing quest',
        (yargs: Argv) =>
          yargs
            .positional('id', { type: 'string', demandOption: true })
            .option('title', { type: 'string' })
            .option('description', { type: 'string' }),
        async (argv: Arguments) => {
          const { id, title, description } = argv;
          const updateData: {
            id: string;
            title?: string;
            description?: string;
          } = { id: id as string };
          if (title) updateData.title = title as string;
          if (description) updateData.description = description as string;

          const response = await apiPut(`/quests/${id}`, updateData);
          console.log('Quest updated:', response);
        },
      )
      .command(
        'delete <id>',
        'Delete a quest',
        (yargs: Argv) =>
          yargs.positional('id', { type: 'string', demandOption: true }),
        async (argv: Arguments) => {
          const { id } = argv;
          const response = await apiDelete(`/quests/${id}`);
          console.log(response);
        },
      )
      .command(
        'knowledge <kbAction> [kbArgs...]',
        'Manage the Knowledge Base',
        (yargs: Argv) =>
          yargs
            .command(
              'add',
              'Add a new knowledge item',
              (yargs: Argv) =>
                yargs
                  .option('content', { type: 'string', demandOption: true })
                  .option('tags', { type: 'array', string: true })
                  .option('source', { type: 'string' }),
              async (argv: Arguments) => {
                const { content, tags, source } = argv;
                const response = await apiPost('/knowledge', {
                  content,
                  tags,
                  source,
                });
                console.log('Knowledge item added:', response);
              },
            )
            .command(
              'retrieve',
              'Retrieve knowledge items',
              (yargs: Argv) =>
                yargs
                  .option('query', { type: 'string', demandOption: true })
                  .option('limit', { type: 'number', default: 10 }),
              async (argv: Arguments) => {
                const { query, limit } = argv;
                const response = await apiGet(
                  `/knowledge?query=${query}&limit=${limit}`,
                );
                console.table(response);
              },
            )
            .command(
              'update <id>',
              'Update a knowledge item',
              (yargs: Argv) =>
                yargs
                  .positional('id', { type: 'string', demandOption: true })
                  .option('content', { type: 'string' })
                  .option('tags', { type: 'array', string: true })
                  .option('source', { type: 'string' }),
              async (argv: Arguments) => {
                const { id, content, tags, source } = argv;
                const updateData: {
                  id: string;
                  content?: string;
                  tags?: string[];
                  source?: string;
                } = { id: id as string };
                if (content) updateData.content = content as string;
                if (tags) updateData.tags = tags as string[];
                if (source) updateData.source = source as string;

                const response = await apiPut(`/knowledge/${id}`, updateData);
                console.log('Knowledge item updated:', response);
              },
            )
            .command(
              'delete <id>',
              'Delete a knowledge item',
              (yargs: Argv) =>
                yargs.positional('id', { type: 'string', demandOption: true }),
              async (argv: Arguments) => {
                const { id } = argv;
                const response = await apiDelete(`/knowledge/${id}`);
                console.log(response);
              },
            ),
      )
      .command(
        'learning <leAction> [leArgs...]',
        'Interact with the Learning Engine',
        (yargs: Argv) =>
          yargs
            .command(
              'analyze',
              'Analyze past quest executions',
              {}, // No arguments needed
              async () => {
                const response = await apiGet('/learning/analysis');
                console.table(response);
              },
            )
            .command(
              'prompt-improvements',
              'Get suggestions for prompt improvements',
              {}, // No arguments needed
              async () => {
                const response = await apiGet('/learning/prompt-improvements');
                console.log(response);
              },
            )
            .command(
              'tool-patterns',
              'Get suggestions for tool usage patterns',
              {}, // No arguments needed
              async () => {
                const response = await apiGet('/learning/tool-patterns');
                console.log(response);
              },
            )
            .command(
              'logs <questId>',
              'Get execution logs for a specific quest',
              (yargs: Argv) =>
                yargs.positional('questId', {
                  type: 'string',
                  demandOption: true,
                }),
              async (argv: Arguments) => {
                const { questId } = argv;
                const response = await apiGet(`/quests/${questId}/logs`);
                console.table(response);
              },
            ),
      ),
  handler: () => {},
};
