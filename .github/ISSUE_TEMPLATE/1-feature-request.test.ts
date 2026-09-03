import fs from 'fs';
import path from 'path';

import * as yaml from 'js-yaml';
import { describe, it, expect } from 'vitest';

describe('1-feature_request.yml', () => {
  const featureRequestFilePath = path.resolve(__dirname, '1-feature_request.yml');

  it('should exist and be a valid YAML file', () => {
    expect(fs.existsSync(featureRequestFilePath)).toBe(true);
    let parsedYaml;
    try {
      parsedYaml = yaml.load(fs.readFileSync(featureRequestFilePath, 'utf8'));
    } catch (e) {
      expect.fail(`Failed to parse 1-feature_request.yml as YAML: ${e}`);
    }
    expect(parsedYaml).toBeDefined();
    expect(typeof parsedYaml).toBe('object');
  });

  it('should have correct metadata and structure', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const featureRequest = yaml.load(fs.readFileSync(featureRequestFilePath, 'utf8')) as any;

    // Verify top-level fields
    expect(featureRequest.name).toBe('🚀 機能追加・改善 (Feature Request)');
    expect(featureRequest.description).toBe('新しい機能の追加や既存機能の改善を提案します。');
    expect(featureRequest.title).toBe('[Feature]: ');
    expect(featureRequest.labels).toEqual(['enhancement', 'feature']);
    expect(featureRequest.assignees).toEqual(['eddie-splatoon']);

    // Verify body structure
    expect(featureRequest.body).toBeInstanceOf(Array);
    expect(featureRequest.body.length).toBe(4); // assumptions, overview, details, additional_notes

    // Verify 'assumptions' block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assumptions = featureRequest.body.find((item: any) => item.id === 'assumptions');
    expect(assumptions).toBeDefined();
    expect(assumptions.attributes.label).toBe('📘 前提 (Assumptions)');
    expect(assumptions.validations.required).toBe(true);

    // Verify 'overview' block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overview = featureRequest.body.find((item: any) => item.id === 'overview');
    expect(overview).toBeDefined();
    expect(overview.attributes.label).toBe('🚀 概要 (Overview)');
    expect(overview.validations.required).toBe(true);

    // Verify 'details' block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = featureRequest.body.find((item: any) => item.id === 'details');
    expect(details).toBeDefined();
    expect(details.attributes.label).toBe('💡 詳細 (Details)');
    expect(details.validations.required).toBe(true);
    
    // Verify 'additional_notes' block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const additionalNotes = featureRequest.body.find((item: any) => item.id === 'additional_notes');
    expect(additionalNotes).toBeDefined();
    expect(additionalNotes.attributes.label).toBe('📝 その他特記事項 (Additional Notes)');
    expect(additionalNotes.validations.required).toBe(false);
  });
});
