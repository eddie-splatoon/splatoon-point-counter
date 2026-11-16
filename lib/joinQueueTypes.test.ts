import { describe, expect, it } from 'vitest';

import {
  JOIN_QUEUE_MAX_ENTRIES,
  formatCancelReply,
  formatFullReply,
  formatJoinRating,
  formatJoinReply,
  normalizeJoinText,
  parseJoinRating,
  sanitizeDisplayName,
} from './joinQueueTypes';

const rating = (args: string) => parseJoinRating(args).rating;
const readAs = (args: string) => formatJoinRating(rating(args));

describe('normalizeJoinText', () => {
  it('unifies width, case and kana, and removes invisible characters', () => {
    expect(normalizeJoinText('　デンセツ８２０ ')).toBe('でんせつ820');
    expect(normalizeJoinText('Ｌｅｇｅｎｄ​ ９９９')).toBe('legend 999');
    expect(normalizeJoinText('た‮つじん　＋１')).toBe('たつじん +1');
  });
});

describe('parseJoinRating', () => {
  // 仕様の別名表（正規化先 ← 受け付ける表記）
  it.each([
    ['かけだし 10', 'かけだし 10'], ['駆け出し10', 'かけだし 10'], ['駆出し 10', 'かけだし 10'], ['kakedashi 10', 'かけだし 10'], ['Apprentice 10', 'かけだし 10'],
    ['はんにんまえ 20', 'はんにんまえ 20'], ['半人前20', 'はんにんまえ 20'], ['hanninmae 20', 'はんにんまえ 20'], ['Part-Timer 20', 'はんにんまえ 20'],
    ['いちにんまえ 30', 'いちにんまえ 30'], ['一人前30', 'いちにんまえ 30'], ['ichininmae 30', 'いちにんまえ 30'], ['Go-Getter 30', 'いちにんまえ 30'],
    ['じゅくれん 40', 'じゅくれん 40'], ['熟練40', 'じゅくれん 40'], ['jukuren 40', 'じゅくれん 40'], ['Overachiever 40', 'じゅくれん 40'],
    ['たつじん 50', 'たつじん 50'], ['達人50', 'たつじん 50'], ['tatsujin 50', 'たつじん 50'], ['Profreshional 50', 'たつじん 50'],
    ['pro 50', 'たつじん 50'],
    ['でんせつ820', 'でんせつ 820'], ['伝説 820', 'でんせつ 820'], ['densetsu 820', 'でんせつ 820'], ['Legend 820', 'でんせつ 820'],
    ['レジェンド820', 'でんせつ 820'], ['Eggsecutive VP 820', 'でんせつ 820'], ['eggsecutive 820', 'でんせつ 820'], ['EVP 820', 'でんせつ 820'], ['VP820', 'でんせつ 820'],
    ['デンセツ８２０', 'でんせつ 820'], ['ｄｅｎｓｅｔｓｕ　８２０', 'でんせつ 820'],
  ])('reads %s as %s', (args, expected) => {
    expect(readAs(args)).toBe(expected);
  });

  it.each([
    ['たつじん+1', 'たつじん+1（評価値なし・近似）'],
    ['たつじん+2 40', 'たつじん+2 40'],
    ['たつじん＋３ ４０', 'たつじん+3 40'],
    ['たつじんぷらす1 40', 'たつじん+1 40'],
    ['たつじんプラス2', 'たつじん+2（評価値なし・近似）'],
    ['tatsujin plus3 99', 'たつじん+3 99'],
    ['pro+1 10', 'たつじん+1 10'],
  ])('reads the +N of たつじん: %s', (args, expected) => {
    expect(readAs(args)).toBe(expected);
  });

  it.each(['かんすと', 'カンスト', 'counter stop', 'MAX', 'かんすと999'])('reads %s as でんせつ 999', (args) => {
    expect(readAs(args)).toBe('でんせつ 999');
  });

  it('reads intern as かけだし 0 and notes it', () => {
    expect(rating('Intern')).toEqual({ tier: 0, points: 0, note: 'intern は かけだし 0 とみなしました' });
  });

  it('reads a number without + after たつじん as points and notes it', () => {
    expect(rating('たつじん3')).toEqual({ tier: 4, points: 3, note: 'たつじん+3 ではなく、たつじん 3 として読みました' });
    expect(rating('たつじん 40')?.note).toBeNull();
  });

  it('reads 100 to 999 alone as でんせつ', () => {
    expect(rating('820')).toEqual({ tier: 8, points: 820, note: '数字だけなので、でんせつとみなしました' });
    expect(readAs('１００')).toBe('でんせつ 100');
  });

  it('keeps a title without points as an approximation', () => {
    expect(rating('でんせつ')).toEqual({ tier: 8, points: null, note: null });
    expect(readAs('じゅくれん')).toBe('じゅくれん（評価値なし・近似）');
  });

  it('has no rating but is readable when nothing is written', () => {
    expect(parseJoinRating('')).toEqual({ rating: null, unreadable: false });
    expect(parseJoinRating('　​')).toEqual({ rating: null, unreadable: false });
  });

  it.each([
    ['50', '0〜99 の数字だけは称号がわからない'],
    ['1000', '1000 以上'],
    ['でんせつ1000', 'でんせつでも 1000 以上'],
    ['たつじん+1 999', 'たつじん以下で 100 以上'],
    ['じゅくれん 100', 'たつじん以下で 100 以上'],
    ['たつじん+4', '+N は 1〜3'],
    ['でんせつ+1', '+N はたつじんだけ'],
    ['+1', '称号のない +N'],
    ['かんすと 820', 'カンストは 999 だけ'],
    ['あいうえお', '表に無い称号'],
    ['<script>alert(1)</script>', '文法に合わない'],
    ['でんせつ 820 よろしくお願いします', '20 文字を超える'],
    // 別名表にはあるが、引数の 20 文字の上限を優先する（英語版の正式名は長い）
    ['Profreshional Part-Timer 50', '20 文字を超える'],
    ['でんせつ 8 2 0', '数字が分かれている'],
  ])('cannot read %s (%s)', (args) => {
    expect(parseJoinRating(args)).toEqual({ rating: null, unreadable: true });
  });
});

describe('formatJoinRating', () => {
  it('shows unknown when there is no rating', () => {
    expect(formatJoinRating(null)).toBe('不明');
  });
});

describe('sanitizeDisplayName', () => {
  it('removes control and format characters and truncates by code points', () => {
    expect(sanitizeDisplayName('Viewer‮A\n')).toBe('ViewerA');
    expect(sanitizeDisplayName('😀'.repeat(30))).toBe('😀'.repeat(25));
    // 重ねた結合文字（Zalgo）は 2 つまで（NFKC は結合文字の順を並べ替えるので、数だけ見る）
    const zalgo = sanitizeDisplayName('x\u0333\u0334\u0335\u0336a');
    expect(zalgo.match(/\p{M}/gu)).toHaveLength(2);
    expect(zalgo.replace(/\p{M}/gu, '')).toBe('xa');
  });
});

describe('replies', () => {
  it('does not repeat the rating and adds how to write when it could not be read', () => {
    expect(formatJoinReply('ViewerA', 2, false)).toBe('ViewerA さん、受付しました（2 番目）。評価は気にせず気軽にどうぞ。※ !参加 だけでも OK');
    expect(formatJoinReply('ViewerA', 1, true)).toBe('ViewerA さん、受付しました（1 番目）。書き方: !参加 でんせつ820 / !参加 たつじん+1（!参加 だけでも OK）');
    expect(formatCancelReply('ViewerA')).toBe('ViewerA さん、受付を取り消しました。');
    expect(formatFullReply('ViewerA')).toBe(`ViewerA さん、ごめんなさい。受付がいっぱいです（${JOIN_QUEUE_MAX_ENTRIES} 人まで）。`);
  });
});
