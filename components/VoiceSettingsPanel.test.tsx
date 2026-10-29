import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceSettings, getDefaultVoiceSettings } from '../lib/voiceTypes';

import VoiceSettingsPanel from './VoiceSettingsPanel';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const speakers = [
  { name: 'ずんだもん', styles: [{ id: 3, name: 'ノーマル' }, { id: 1, name: 'あまあま' }] },
  { name: '四国めたん', styles: [{ id: 2, name: 'ノーマル' }] },
];

const enabled: VoiceSettings = { ...getDefaultVoiceSettings(), enabled: true, speakerId: 3, speakerName: 'ずんだもん' };

const renderLoaded = async (settings: VoiceSettings = getDefaultVoiceSettings(), speakersAvailable = true) => {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url === '/api/voice') return { data: settings, status: 200 };
    if (speakersAvailable) return { data: speakers, status: 200 };
    throw new Error('502');
  });
  await act(async () => {
    render(<VoiceSettingsPanel />);
  });
};

const lastSaved = () => mockedAxios.post.mock.calls.filter(([url]) => url === '/api/voice').at(-1)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

describe('VoiceSettingsPanel', () => {
  it('enables reading aloud', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByLabelText('読み上げを有効にする')));

    expect(lastSaved()).toMatchObject({ enabled: true });
  });

  it('selects a speaker and shows its credit', async () => {
    await renderLoaded();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '話者' }));
    await act(async () => fireEvent.click(within(screen.getByRole('listbox')).getByText('四国めたん（ノーマル）')));

    expect(lastSaved()).toMatchObject({ speakerId: 2, speakerName: '四国めたん' });
    expect(screen.getByText('VOICEVOX:四国めたん')).toBeInTheDocument();
  });

  it('warns when VOICEVOX is not running and keeps the saved speaker', async () => {
    await renderLoaded(enabled, false);

    expect(screen.getByText(/VOICEVOX に接続できません/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '話者' })).toHaveTextContent('ずんだもん');
    expect(screen.getByText('VOICEVOX:ずんだもん')).toBeInTheDocument();
  });

  it('queues a test speech', async () => {
    await renderLoaded(enabled);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'テスト再生' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/speech', { text: expect.any(String) });
    expect(screen.getByText(/読み上げキューに追加しました/)).toBeInTheDocument();
  });

  it('disables the test until a speaker is selected', async () => {
    await renderLoaded({ ...enabled, speakerId: null, speakerName: '' });

    expect(screen.getByRole('button', { name: 'テスト再生' })).toBeDisabled();
  });

  it('reloads the settings when saving fails', async () => {
    await renderLoaded();
    mockedAxios.post.mockRejectedValueOnce(new Error('network'));

    await act(async () => fireEvent.click(screen.getByLabelText('読み上げを有効にする')));

    expect(screen.getByText('読み上げの設定の保存に失敗しました。')).toBeInTheDocument();
    expect(screen.getByLabelText('読み上げを有効にする')).not.toBeChecked();
  });
});
