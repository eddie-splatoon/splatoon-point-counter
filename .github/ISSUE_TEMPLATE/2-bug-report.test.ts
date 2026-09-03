import fs from 'fs';
import path from 'path';

import * as yaml from 'js-yaml';
import { describe, it, expect } from 'vitest';

describe('2-bug-report.yml', () => {
  const bugReportFilePath = path.resolve(__dirname, '2-bug-report.yml');
  const featureRequestFilePath = path.resolve(__dirname, '1-feature_request.yml');

  it('should exist and be a valid YAML file', () => {
    expect(fs.existsSync(bugReportFilePath)).toBe(true);
    let parsedYaml;
    try {
      parsedYaml = yaml.load(fs.readFileSync(bugReportFilePath, 'utf8'));
    } catch (e) {
      expect.fail(`Failed to parse 2-bug-report.yml as YAML: ${e}`);
    }
    expect(parsedYaml).toBeDefined();
    expect(typeof parsedYaml).toBe('object');
  });

  it('should have correct metadata and structure', () => {
    const bugReport = yaml.load(fs.readFileSync(bugReportFilePath, 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const featureRequest = yaml.load(fs.readFileSync(featureRequestFilePath, 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Verify top-level fields
    expect(bugReport.name).toBe('🐛 バグ報告 (Bug Report)');
    expect(bugReport.description).toBe('期待通りに動作しない問題やエラーを報告します。');
    expect(bugReport.title).toBe('[Bug]: ');
    expect(bugReport.labels).toEqual(['bug']);
    expect(bugReport.assignees).toEqual(['eddie-splatoon']);

    // Verify body structure
    expect(bugReport.body).toBeInstanceOf(Array);
    expect(bugReport.body.length).toBe(6); // assumptions, overview, details, expected-behavior, actual-behavior, additional_notes

    // Verify 'assumptions' block (should be identical to feature request)
    const bugReportAssumptions = bugReport.body.find((item: any) => item.id === 'assumptions'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const featureRequestAssumptions = featureRequest.body.find((item: any) => item.id === 'assumptions'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(bugReportAssumptions).toBeDefined();
    expect(bugReportAssumptions.attributes.label).toBe(featureRequestAssumptions.attributes.label);
    expect(bugReportAssumptions.attributes.description).toBe(featureRequestAssumptions.attributes.description);
    expect(bugReportAssumptions.attributes.value).toBe(featureRequestAssumptions.attributes.value);
    expect(bugReportAssumptions.validations.required).toBe(true);

    // Verify 'overview' block
    const overview = bugReport.body.find((item: any) => item.id === 'overview'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(overview).toBeDefined();
    expect(overview.attributes.label).toBe('🐛 概要 (Overview)');
    expect(overview.attributes.description).toBe('発生しているバグの概要を簡潔に記述してください。');
    expect(overview.validations.required).toBe(true);

    // Verify 'details' (再現手順) block
    const details = bugReport.body.find((item: any) => item.id === 'details'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(details).toBeDefined();
    expect(details.attributes.label).toBe('再現手順 (Steps to Reproduce)');
    expect(details.attributes.description).toBe('バグを再現させるための具体的な手順を記述してください。');
    expect(details.validations.required).toBe(true);

    // Verify 'expected-behavior' block
    const expectedBehavior = bugReport.body.find((item: any) => item.id === 'expected-behavior'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(expectedBehavior).toBeDefined();
    expect(expectedBehavior.attributes.label).toBe('期待される動作 (Expected Behavior)');
    expect(expectedBehavior.attributes.description).toBe('本来であれば、どのような動作になるべきかを記述してください。');
    expect(expectedBehavior.validations.required).toBe(true);

    // Verify 'actual-behavior' block
    const actualBehavior = bugReport.body.find((item: any) => item.id === 'actual-behavior'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(actualBehavior).toBeDefined();
    expect(actualBehavior.attributes.label).toBe('実際の動作 (Actual Behavior)');
    expect(actualBehavior.attributes.description).toBe('実際にどのような動作になっているかを記述してください。');
    expect(actualBehavior.validations.required).toBe(true);

    // Verify 'additional_notes' block
    const additionalNotes = bugReport.body.find((item: any) => item.id === 'additional_notes'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(additionalNotes).toBeDefined();
    expect(additionalNotes.attributes.label).toBe('📝 その他特記事項 (Additional Notes)');
    expect(additionalNotes.attributes.description).toBe('その他、関連情報やスクリーンショット、エラーログなどがあれば記述してください。');
    expect(additionalNotes.validations.required).toBe(false);
  });
});