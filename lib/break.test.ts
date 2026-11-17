// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_resetBreak, endBreak, getBreakState, heardVoice, startBreak } from './break';
import { BREAK_REMINDER_COOLDOWN_MS, BREAK_REMINDER_TEXT, BREAK_VOICE_GRACE_MS } from './breakTypes';
import { __TEST_ONLY_setDb, openDb, setAppState } from './db';
import { VOICE_STATE_KEY, __TEST_ONLY_resetSpeechQueue, listSpeech } from './speech';
import { getDefaultVoiceSettings } from './voiceTypes';

const START = 1_700_000_000_000;
const afterGrace = START + BREAK_VOICE_GRACE_MS;

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_resetSpeechQueue();
  __TEST_ONLY_resetBreak();
  setAppState(VOICE_STATE_KEY, { ...getDefaultVoiceSettings(), enabled: true, speakerId: 3, speakerName: 'ずんだもん' });
});

const spoken = () => listSpeech(afterGrace).map((item) => item.text);

describe('break state', () => {
  it('starts and ends a break', () => {
    expect(getBreakState(START)).toEqual({ active: false, startedAt: null, voiceHeardAt: null, serverTime: START });
    expect(startBreak(START)).toEqual({ active: true, startedAt: START, voiceHeardAt: null, serverTime: START });
    expect(endBreak(START + 1000)).toEqual({ active: false, startedAt: null, voiceHeardAt: null, serverTime: START + 1000 });
  });

  it('keeps the start time when started again', () => {
    startBreak(START);
    expect(startBreak(START + 5000).startedAt).toBe(START);
  });
});

describe('heardVoice', () => {
  it('does nothing when not on a break', () => {
    expect(heardVoice(true, START).result).toBe('idle');
    expect(heardVoice(false, START).result).toBe('idle');
    expect(spoken()).toEqual([]);
  });

  it('ends the break on a resume phrase, even right after starting', () => {
    startBreak(START);
    const { result, state } = heardVoice(true, START + 1000);
    expect(result).toBe('ended');
    expect(state.active).toBe(false);
  });

  it('ignores speech right after starting the break', () => {
    startBreak(START);
    const { result, state } = heardVoice(false, afterGrace - 1);
    expect(result).toBe('grace');
    expect(state.voiceHeardAt).toBeNull();
    expect(spoken()).toEqual([]);
  });

  it('reminds by speech once per cooldown and records when the voice was heard', () => {
    startBreak(START);
    expect(heardVoice(false, afterGrace).result).toBe('reminded');
    expect(spoken()).toEqual([BREAK_REMINDER_TEXT]);

    const { result, state } = heardVoice(false, afterGrace + 1000);
    expect(result).toBe('noted');
    expect(state.voiceHeardAt).toBe(afterGrace + 1000);
    expect(spoken()).toHaveLength(1);

    expect(heardVoice(false, afterGrace + BREAK_REMINDER_COOLDOWN_MS).result).toBe('reminded');
  });

  it('clears the warning when the break ends', () => {
    startBreak(START);
    heardVoice(false, afterGrace);
    endBreak(afterGrace);
    expect(startBreak(afterGrace + 1000).voiceHeardAt).toBeNull();
  });
});
