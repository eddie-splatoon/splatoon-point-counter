import fs from 'fs';
import path from 'path';

import * as yaml from 'js-yaml';
import { describe, it, expect } from 'vitest';

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Workflow {
  jobs: Record<string, { steps: WorkflowStep[] }>;
}

const workflowFilePath = path.resolve(__dirname, 'ci.yml');

// パースは各テスト内で行う。describe直下で読み込むと、ファイル欠損やYAML構文エラーが
// 収集時の例外になり、どのテストも登録されないまま握りつぶされてしまうため。
const loadWorkflow = (): Workflow => yaml.load(fs.readFileSync(workflowFilePath, 'utf8')) as Workflow;

const runCommandsOf = (job: { steps: WorkflowStep[] }): string[] =>
  job.steps.map((step) => step.run).filter((run): run is string => typeof run === 'string');

describe('ci.yml', () => {
  it('should exist and be a valid YAML file', () => {
    expect(fs.existsSync(workflowFilePath)).toBe(true);

    let workflow;
    try {
      workflow = loadWorkflow();
    } catch (e) {
      expect.fail(`Failed to parse ci.yml as YAML: ${e}`);
    }
    expect(workflow).toBeDefined();
    expect(workflow.jobs).toBeDefined();
  });

  // 依存関係のインストールを行うジョブ。Docker のビルドジョブは Dockerfile 側で完結するため対象外。
  describe.each(['lint', 'test'])('%s job', (jobName) => {
    it('should set up pnpm before actions/setup-node so that the cache path can be resolved', () => {
      const { steps } = loadWorkflow().jobs[jobName];
      const pnpmIndex = steps.findIndex((step) => step.uses?.startsWith('pnpm/action-setup@'));
      const setupNodeIndex = steps.findIndex((step) => step.uses?.startsWith('actions/setup-node@'));

      expect(pnpmIndex).toBeGreaterThanOrEqual(0);
      expect(setupNodeIndex).toBeGreaterThanOrEqual(0);
      expect(pnpmIndex).toBeLessThan(setupNodeIndex);
    });

    it('should cache the pnpm store', () => {
      const { steps } = loadWorkflow().jobs[jobName];
      const setupNode = steps.find((step) => step.uses?.startsWith('actions/setup-node@'));

      expect(setupNode?.with?.cache).toBe('pnpm');
    });

    it('should install dependencies from the lockfile with pnpm', () => {
      const runCommands = runCommandsOf(loadWorkflow().jobs[jobName]);

      expect(runCommands.some((command) => /\bpnpm install\b.*--frozen-lockfile/.test(command))).toBe(true);
    });

    it('should not run any npm command', () => {
      const runCommands = runCommandsOf(loadWorkflow().jobs[jobName]);

      runCommands.forEach((command) => {
        expect(command).not.toMatch(/\bnpm\b/);
      });
    });
  });
});
