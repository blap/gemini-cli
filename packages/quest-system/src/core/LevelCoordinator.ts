/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskPyramid } from './TaskPyramid.js';
import type { AtomicResult, ExecutionLog, OperationalTask } from '../index.js';
import type { LearningEngineService } from '../learning/LearningEngineService.js';

enum QuestState {
  STRATEGIC,
  TACTICAL,
  OPERATIONAL,
  ATOMIC,
  DONE,
}

export class LevelCoordinator {
  private currentState: QuestState = QuestState.STRATEGIC;

  constructor(private learningEngineService: LearningEngineService) {}

  async coordinate(taskPyramid: TaskPyramid): Promise<unknown> {
    let strategicPlan: string | undefined;
    let tacticalPlan: string | undefined;
    let operationalTasks: unknown[] | undefined;
    let atomicResults: AtomicResult[] | undefined;

    const questId = taskPyramid.quest.id; // Access questId from TaskPyramid

    while (this.currentState !== QuestState.DONE) {
      const startTime = Date.now();
      let status: 'success' | 'failure' = 'success';
      let error: string | undefined;
      let output = '';

      try {
        switch (this.currentState) {
          case QuestState.STRATEGIC:
            strategicPlan = await taskPyramid.executeStrategicLevel();
            output = strategicPlan;
            console.log('Strategic Plan:', strategicPlan);
            this.currentState = QuestState.TACTICAL;
            break;
          case QuestState.TACTICAL:
            tacticalPlan = await taskPyramid.executeTacticalLevel(
              strategicPlan!,
            );
            output = tacticalPlan;
            console.log('Tactical Plan:', tacticalPlan);
            this.currentState = QuestState.OPERATIONAL;
            break;
          case QuestState.OPERATIONAL:
            operationalTasks = await taskPyramid.executeOperationalLevel(
              tacticalPlan!,
            );
            output = JSON.stringify(operationalTasks);
            console.log('Operational Tasks:', operationalTasks);
            this.currentState = QuestState.ATOMIC;
            break;
          case QuestState.ATOMIC:
            atomicResults = await taskPyramid.executeAtomicLevel(
              operationalTasks! as OperationalTask[],
            );
            output = JSON.stringify(atomicResults);
            console.log('Atomic Results:', atomicResults);
            // Determine next state based on the last atomic result
            if (atomicResults.length > 0) {
              const lastResult = atomicResults[atomicResults.length - 1];
              if (lastResult.nextState === 'done') {
                this.currentState = QuestState.DONE;
              } else if (lastResult.nextState === 'operational') {
                this.currentState = QuestState.OPERATIONAL;
              } else {
                this.currentState = QuestState.DONE; // Default to done if no clear next state
              }
            } else {
              this.currentState = QuestState.DONE; // No atomic results, so done
            }
            break;
          default:
            this.currentState = QuestState.DONE; // Should not happen
            break;
        }
      } catch (e: unknown) {
        status = 'failure';
        error = (e as Error).message;
        output = `Error: ${(e as Error).message}`;
        this.currentState = QuestState.DONE; // Terminate on error
      } finally {
        const durationMs = Date.now() - startTime;
        const logEntry: Omit<ExecutionLog, 'id' | 'timestamp'> = {
          questId,
          level: QuestState[
            this.currentState
          ].toLowerCase() as ExecutionLog['level'],
          input: this.getLogInput(
            this.currentState,
            strategicPlan,
            tacticalPlan,
            operationalTasks,
          ),
          output,
          durationMs,
          status,
          error,
        };
        await this.learningEngineService.logExecution(logEntry);
      }
    }

    return atomicResults;
  }

  private getLogInput(
    state: QuestState,
    strategicPlan?: string,
    tacticalPlan?: string,
    operationalTasks?: unknown[],
  ): string {
    switch (state) {
      case QuestState.STRATEGIC:
        return 'Initial quest description'; // Or actual quest description
      case QuestState.TACTICAL:
        return strategicPlan || '';
      case QuestState.OPERATIONAL:
        return tacticalPlan || '';
      case QuestState.ATOMIC:
        return JSON.stringify(operationalTasks || []);
      default:
        return '';
    }
  }
}
