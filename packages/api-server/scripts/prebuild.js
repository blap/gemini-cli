/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-env node */

import * as fs from 'node:fs/promises';

const filePath = './src/index.ts';

async function applyFixes() {
  // eslint-disable-next-line no-undef
  console.log('Running prebuild.js...');
  let content = await fs.readFile(filePath, 'utf-8');
  // eslint-disable-next-line no-undef
  console.log('Original index.ts content length:', content.length);

  // Fix 1: Remove 'type' keyword from imports that are used as values.
  const oldContent1 = content;
  content = content.replace(
    /import type {\s*\n\s*(LSTool,\s*\n\s*ReadFileTool,\s*\n\s*EditTool,\s*\n\s*GlobTool,\s*\n\s*RipGrepTool,\s*\n\s*WriteFileTool,\s*\n\s*ShellTool,\s*\n\s*WebSearchTool,\s*\n\s*WebFetchTool,\s*\n\s*GeminiClient,\s*\n\s*Logger,\s*\n\s*GeminiEventType,\s*\n\s*AuthType,\s*\n\s*Config,\s*\n\s*ConfigParameters,\s*\n\s*uiTelemetryService,\s*\n\s*ClearcutLogger,\s*\n\s*IdeClient,\s*\n\s*ideContextStore,\s*\n)} from '@google\/gemini-cli-core';/g,
    "import {\n  LSTool,\n  ReadFileTool,\n  EditTool,\n  GlobTool,\n  RipGrepTool,\n  WriteFileTool,\n  ShellTool,\n  WebSearchTool,\n  WebFetchTool,\n  GeminiClient,\n  Logger,\n  GeminiEventType,\n  AuthType,\n  Config,\n  ConfigParameters,\n  uiTelemetryService,\n  ClearcutLogger,\n  IdeClient,\n  ideContextStore,\n} from '@google/gemini-cli-core';",
  );
  // eslint-disable-next-line no-undef
  if (oldContent1 !== content) console.log('Fix 1 applied.');

  // Fix 1.1: Change ConfigParameters import to type ConfigParameters
  const oldContent1_1 = content;
  content = content.replace(/ConfigParameters,/g, 'type ConfigParameters,');
  // eslint-disable-next-line no-undef
  if (oldContent1_1 !== content) console.log('Fix 1.1 applied.');

  // Fix 2: Correct `tool.call` typing (replace `as ToolType` with `as any`)
  const oldContent2 = content;
  content = content.replace(
    /\(shellTool as ShellTool\)\.call/g,
    '(shellTool as any).call',
  );
  content = content.replace(
    /\(lsTool as LSTool\)\.call/g,
    '(lsTool as any).call',
  );
  content = content.replace(
    /\(readFileTool as ReadFileTool\)\.call/g,
    '(readFileTool as any).call',
  );
  content = content.replace(
    /\(writeFileTool as WriteFileTool\)\.call/g,
    '(writeFileTool as any).call',
  );
  content = content.replace(
    /\(editTool as EditTool\)\.call/g,
    '(editTool as any).call',
  );
  content = content.replace(
    /\(ripGrepTool as RipGrepTool\)\.call/g,
    '(ripGrepTool as any).call',
  );
  content = content.replace(
    /\(globTool as GlobTool\)\.call/g,
    '(globTool as any).call',
  );
  content = content.replace(
    /\(webSearchTool as WebSearchTool\)\.call/g,
    '(webSearchTool as any).call',
  );
  content = content.replace(
    /\(webFetchTool as WebFetchTool\)\.call/g,
    '(webFetchTool as any).call',
  );
  // eslint-disable-next-line no-undef
  if (oldContent2 !== content) console.log('Fix 2 applied.');

  // Fix 5: Fix `attributes` type
  const oldContent5 = content;
  content = content.replace(
    /attributes: attributes as Record<string, unknown>,/g,
    'attributes: attributes as any,',
  );
  // eslint-disable-next-line no-undef
  if (oldContent5 !== content) console.log('Fix 5 applied.');

  await fs.writeFile(filePath, content, 'utf-8');
  // eslint-disable-next-line no-undef
  console.log('Finished prebuild.js.');
}

applyFixes().catch((err) => {
  // eslint-disable-next-line no-undef
  console.error('Error applying fixes:', err);
  // eslint-disable-next-line no-undef
  process.exit(1);
});
