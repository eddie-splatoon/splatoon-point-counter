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

describe('ci.yml', () => {
  const workflowFilePath = path.resolve(__dirname, 'ci.yml');
  const workflow = yaml.load(fs.readFileSync(workflowFilePath, 'utf8')) as Workflow;

  it('should exist and be a valid YAML file', () => {
    expect(fs.existsSync(workflowFilePath)).toBe(true);
    expect(workflow).toBeDefined();
    expect(workflow.jobs).toBeDefined();
  });

  // 依存関係のインストールを行うジョブ。Docker のビルドジョブは Dockerfile 側で完結するため対象外。
  describe.each(['lint', 'test'])('%s job', (jobName) => {
    const steps = () => workflow.jobs[jobName].steps;

    it('should set up pnpm before actions/setup-node so that the cache path can be resolved', () => {
      const pnpmIndex = steps().findIndex((step) => step.uses?.startsWith('pnpm/action-setup@'));
      const setupNodeIndex = steps().findIndex((step) => step.uses?.startsWith('actions/setup-node@'));

      expect(pnpmIndex).toBeGreaterThanOrEqual(0);
      expect(setupNodeIndex).toBeGreaterThanOrEqual(0);
      expect(pnpmIndex).toBeLessThan(setupNodeIndex);
    });

    it('should cache the pnpm store', () => {
      const setupNode = steps().find((step) => step.uses?.startsWith('actions/setup-node@'));

      expect(setupNode?.with?.cache).toBe('pnpm');
    });

    it('should install dependencies from the lockfile with pnpm', () => {
      const runCommands = steps()
        .map((step) => step.run)
        .filter((run): run is string => typeof run === 'string');

      expect(runCommands).toContain('pnpm install --frozen-lockfile');
    });

    it('should not run any npm command', () => {
      const runCommands = steps()
        .map((step) => step.run)
        .filter((run): run is string => typeof run === 'string');

      runCommands.forEach((command) => {
        expect(command).not.toMatch(/\bnpm\b/);
      });
    });
  });
});
