import { describe, expect, it } from 'vitest';

import { MAX_ROTATE_SECONDS, MIN_ROTATE_SECONDS, getDefaultSidePanelSettings, parseSidePanelSettings, pickSlot } from './sidePanelTypes';

const valid = { activeSlot: 'burndown', autoRotate: true, rotateSeconds: 30, enabledSlots: ['salmon', 'burndown'] };

describe('parseSidePanelSettings', () => {
  it('accepts valid settings', () => {
    expect(parseSidePanelSettings(valid)).toEqual(valid);
  });

  it('accepts the default settings', () => {
    expect(parseSidePanelSettings(getDefaultSidePanelSettings())).toEqual(getDefaultSidePanelSettings());
  });

  it('orders enabled slots and drops duplicates', () => {
    expect(parseSidePanelSettings({ ...valid, enabledSlots: ['burndown', 'salmon', 'burndown'] })).toMatchObject({
      enabledSlots: ['salmon', 'burndown'],
    });
  });

  it('accepts the rotation bounds', () => {
    expect(parseSidePanelSettings({ ...valid, rotateSeconds: MIN_ROTATE_SECONDS })).not.toBeTypeOf('string');
    expect(parseSidePanelSettings({ ...valid, rotateSeconds: MAX_ROTATE_SECONDS })).not.toBeTypeOf('string');
  });

  it.each([
    ['null', null],
    ['an unknown active slot', { ...valid, activeSlot: 'challenges' }],
    ['a non-boolean autoRotate', { ...valid, autoRotate: 'yes' }],
    ['too short a rotation', { ...valid, rotateSeconds: MIN_ROTATE_SECONDS - 1 }],
    ['too long a rotation', { ...valid, rotateSeconds: MAX_ROTATE_SECONDS + 1 }],
    ['a fractional rotation', { ...valid, rotateSeconds: 10.5 }],
    ['no enabled slots', { ...valid, enabledSlots: [] }],
    ['an unknown enabled slot', { ...valid, enabledSlots: ['salmon', 'schedule'] }],
    ['non-array enabled slots', { ...valid, enabledSlots: 'salmon' }],
  ])('rejects %s', (_, input) => {
    expect(parseSidePanelSettings(input)).toBeTypeOf('string');
  });
});

describe('pickSlot', () => {
  it('shows the active slot when not rotating', () => {
    expect(pickSlot({ ...getDefaultSidePanelSettings(), activeSlot: 'burndown', autoRotate: false }, 5)).toBe('burndown');
  });

  it('cycles through the enabled slots when rotating', () => {
    const settings = { ...getDefaultSidePanelSettings(), autoRotate: true };
    expect([0, 1, 2, 3].map((i) => pickSlot(settings, i))).toEqual(['salmon', 'burndown', 'salmon', 'burndown']);
  });
});
