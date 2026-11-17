import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CHALLENGES, MAX_CHALLENGE_LINES, getDefaultSidePanelSettings } from '../lib/sidePanelTypes';

import ChallengeEditorCard, { reorderChallenges } from './ChallengeEditorCard';
import { useSidePanelSettings } from './useSidePanelSettings';

import type { Challenge } from '../lib/sidePanelTypes';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const Harness = () => <ChallengeEditorCard state={useSidePanelSettings()} />;

const challenges: Challenge[] = [
  { id: 1, text: 'キケン度MAXでクリア', done: false },
  { id: 3, text: '新ブキで3クリア', done: true },
  { id: 4, text: 'オオモノ 30 体', done: false },
];

const renderLoaded = async (list: Challenge[] = challenges) => {
  mockedAxios.get.mockResolvedValue({ data: { ...getDefaultSidePanelSettings(), challenges: list }, status: 200 });
  render(<Harness />);
  await screen.findByLabelText('新しいお題');
};

const lastPosted = () => mockedAxios.post.mock.calls.at(-1)?.[1];
const shownTexts = () => within(screen.getByRole('list', { name: '本日のお題の一覧' })).getAllByRole('listitem').map((li) => li.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

describe('ChallengeEditorCard', () => {
  it('shows the challenges and the count', async () => {
    await renderLoaded();

    expect(shownTexts()).toEqual(['キケン度MAXでクリア', '新ブキで3クリア', 'オオモノ 30 体']);
    expect(screen.getByText(`3 / ${MAX_CHALLENGES}`)).toBeInTheDocument();
    // 達成のチェックは配信中の画面だけ
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('adds a challenge with the next id', async () => {
    await renderLoaded();

    fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: '  オカシラを倒す ' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '追加' })));

    await waitFor(() => expect(lastPosted()).toMatchObject({ challenges: [...challenges, { id: 5, text: 'オカシラを倒す', done: false }] }));
    expect(screen.getByLabelText('新しいお題')).toHaveValue('');
  });

  it('adds after the challenges another screen added, with an id that does not clash', async () => {
    await renderLoaded();
    const added = { id: 7, text: 'ほかの画面で足したお題', done: false };
    mockedAxios.get.mockResolvedValue({ data: { ...getDefaultSidePanelSettings(), challenges: [...challenges, added] }, status: 200 });

    fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'オカシラを倒す' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '追加' })));

    await waitFor(() => expect(lastPosted()).toMatchObject({ challenges: [...challenges, added, { id: 8, text: 'オカシラを倒す', done: false }] }));
  });

  it.each([['Ctrl', { ctrlKey: true }], ['⌘', { metaKey: true }]])('adds a challenge with %s + Enter', async (_, modifier) => {
    await renderLoaded([]);

    fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'オカシラを倒す' } });
    await act(async () => fireEvent.keyDown(screen.getByLabelText('新しいお題'), { key: 'Enter', ...modifier }));

    await waitFor(() => expect(lastPosted()).toMatchObject({ challenges: [{ id: 1, text: 'オカシラを倒す', done: false }] }));
  });

  it('does not add a challenge while the IME is composing', async () => {
    await renderLoaded([]);

    fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'オカシラ' } });
    await act(async () => fireEvent.keyDown(screen.getByLabelText('新しいお題'), { key: 'Enter', ctrlKey: true, isComposing: true }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does not add a challenge with Enter alone, which starts a new line', async () => {
    await renderLoaded([]);

    fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'オカシラを倒す' } });
    await act(async () => fireEvent.keyDown(screen.getByLabelText('新しいお題'), { key: 'Enter' }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('keeps line breaks in a new challenge', async () => {
    await renderLoaded([]);

    fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'キケン度MAXで\n 3連続クリア \n\n' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '追加' })));

    await waitFor(() => expect(lastPosted()).toMatchObject({ challenges: [{ id: 1, text: 'キケン度MAXで\n3連続クリア', done: false }] }));
  });

  it('does not add a challenge with too many lines', async () => {
    await renderLoaded([]);
    const input = screen.getByLabelText('新しいお題');

    fireEvent.change(input, { target: { value: Array.from({ length: MAX_CHALLENGE_LINES + 1 }, (_, i) => `行${i}`).join('\n') } });

    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not add an empty challenge', async () => {
    await renderLoaded([]);

    fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
  });

  it('does not add more than the maximum', async () => {
    await renderLoaded(Array.from({ length: MAX_CHALLENGES }, (_, i) => ({ id: i + 1, text: `お題${i + 1}`, done: false })));

    fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'もう1つ' } });

    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
  });

  it('deletes a challenge', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '「キケン度MAXでクリア」を消す' })));

    await waitFor(() => expect(lastPosted()).toMatchObject({ challenges: [challenges[1], challenges[2]] }));
    expect(screen.queryByText('キケン度MAXでクリア')).not.toBeInTheDocument();
  });

  it('moves a challenge with the arrow keys on its handle', async () => {
    await renderLoaded();

    await act(async () => fireEvent.keyDown(screen.getByRole('button', { name: /「オオモノ 30 体」を並べ替える/ }), { key: 'ArrowUp' }));

    expect(shownTexts()).toEqual(['キケン度MAXでクリア', 'オオモノ 30 体', '新ブキで3クリア']);
    await waitFor(() => expect(lastPosted()).toMatchObject({ challenges: [challenges[0], challenges[2], challenges[1]] }));
  });

  it('does not move the first challenge further up', async () => {
    await renderLoaded();

    await act(async () => fireEvent.keyDown(screen.getByRole('button', { name: /「キケン度MAXでクリア」を並べ替える/ }), { key: 'ArrowUp' }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('moves a challenge by dragging it onto another', async () => {
    await renderLoaded();
    const items = within(screen.getByRole('list', { name: '本日のお題の一覧' })).getAllByRole('listitem');

    fireEvent.dragStart(items[0], { dataTransfer: { effectAllowed: '' } });
    fireEvent.dragOver(items[2]);
    await act(async () => fireEvent.drop(items[2]));

    expect(shownTexts()).toEqual(['新ブキで3クリア', 'オオモノ 30 体', 'キケン度MAXでクリア']);
    await waitFor(() => expect(lastPosted()).toMatchObject({ challenges: [challenges[1], challenges[2], challenges[0]] }));
  });

  it('shows an error when loading fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<Harness />);

    expect(await screen.findByText(/読み込みに失敗しました/)).toBeInTheDocument();
  });
});

describe('reorderChallenges', () => {
  it('keeps the challenges that are not in the order at the end', () => {
    const latest = [...challenges, { id: 9, text: '新しい', done: false }];
    expect(reorderChallenges(latest, [4, 1, 3]).map((c) => c.id)).toEqual([4, 1, 3, 9]);
  });
});
