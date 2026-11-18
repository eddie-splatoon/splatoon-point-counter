import { act, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceSettings, getDefaultVoiceSettings } from '../lib/voiceTypes';

import VoiceCreditOverlay from './VoiceCreditOverlay';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const zundamon: VoiceSettings = { ...getDefaultVoiceSettings(), enabled: true, speakerId: 3, speakerName: 'ずんだもん' };

const mockSettings = (settings: VoiceSettings, fontFamily = 'FOT-Kurokane Std') => {
  mockedAxios.get.mockImplementation(async (url: string) =>
    url === '/api/voice' ? { data: settings, status: 200 } : { data: { fontFamily }, status: 200 });
};

describe('VoiceCreditOverlay', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    vi.spyOn(global, 'setInterval').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the credit of the selected character', async () => {
    mockSettings(zundamon);
    render(<VoiceCreditOverlay layout="landscape" />);

    expect(await screen.findByTestId('voice-credit')).toHaveTextContent('VOICEVOX:ずんだもん');
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/voice', expect.anything());
    await waitFor(() => expect(screen.getByTestId('voice-credit')).toHaveStyle({ fontFamily: 'FOT-Kurokane Std' }));
  });

  it('uses the notation required by the character', async () => {
    mockSettings({ ...zundamon, speakerName: 'もち子さん' });
    render(<VoiceCreditOverlay layout="portrait" />);

    expect(await screen.findByTestId('voice-credit')).toHaveTextContent('VOICEVOX:もち子(cv 明日葉よもぎ)');
  });

  it('shows nothing when the credit is turned off', async () => {
    mockSettings({ ...zundamon, showCredit: false });
    render(<VoiceCreditOverlay layout="landscape" />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    expect(screen.queryByTestId('voice-credit')).not.toBeInTheDocument();
  });

  it('shows nothing without a speaker', async () => {
    mockSettings(getDefaultVoiceSettings());
    render(<VoiceCreditOverlay layout="landscape" />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    expect(screen.queryByTestId('voice-credit')).not.toBeInTheDocument();
  });

  it('keeps showing nothing when the settings cannot be fetched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedAxios.get.mockRejectedValue(new Error('network'));
    await act(async () => {
      render(<VoiceCreditOverlay layout="landscape" />);
    });

    expect(console.error).toHaveBeenCalled();
    expect(screen.getByTestId('voice-credit-area')).toBeInTheDocument();
    expect(screen.queryByTestId('voice-credit')).not.toBeInTheDocument();
  });
});
