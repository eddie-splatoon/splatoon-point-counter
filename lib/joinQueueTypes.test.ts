import { describe, expect, it } from 'vitest';

import {
  JOIN_QUEUE_MAX_ENTRIES,
  JoinRating,
  estimateRoomHazard,
  formatCancelReply,
  formatHazardWithRating,
  formatJoinAnnouncement,
  formatFullReply,
  formatJoinRating,
  formatJoinReply,
  formatRoomHazard,
  isStaleRating,
  normalizeJoinText,
  parseJoinRating,
  ratingAxis,
  ratingOfHazard,
  recommendHazards,
  roundHazard,
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

const r = (tier: number, points: number | null): JoinRating => ({ tier, points, note: null });
const person = (rating: JoinRating | null, ratedAt: number | null = null) => ({ rating, ratedAt });

describe('ratingAxis', () => {
  it('adds tier*100 below でんせつ and 800 for でんせつ, approximating a missing point', () => {
    expect(ratingAxis(r(0, 0))).toBe(0);
    expect(ratingAxis(r(4, 40))).toBe(440);
    expect(ratingAxis(r(7, 99))).toBe(799);
    expect(ratingAxis(r(8, 999))).toBe(1799);
    expect(ratingAxis(r(4, null))).toBe(450);
    expect(ratingAxis(r(8, null))).toBe(1200);
  });
});

describe('roundHazard', () => {
  it('rounds to the step and keeps MAX at 333%', () => {
    expect(roundHazard(164, 10)).toBe(160);
    expect(roundHazard(166, 5)).toBe(165);
    expect(roundHazard(332, 5)).toBe(330);
    expect(roundHazard(332.6, 5)).toBe(333);
    expect(roundHazard(333, 10)).toBe(333);
  });
});

describe('ratingOfHazard / formatHazardWithRating', () => {
  it('turns a hazard level back into the equivalent grade', () => {
    expect(formatHazardWithRating(230)).toBe('230%（でんせつ 350 相当）');
    expect(formatHazardWithRating(333)).toBe('333%（でんせつ 865 相当）');
    expect(formatHazardWithRating(160)).toBe('160%（でんせつ 0 相当）');
    expect(formatHazardWithRating(88)).toBe('88%（たつじん 40 相当）');
    expect(formatHazardWithRating(155)).toBe('155%（たつじん+3 75 相当）');
    expect(ratingOfHazard(0)).toEqual({ tier: 0, points: 0, note: null });
  });

  it('round-trips with ratingAxis', () => {
    for (const axis of [0, 99, 440, 799, 800, 1150, 1665]) {
      expect(ratingAxis(ratingOfHazard(axis / 5))).toBe(axis);
    }
  });
});

describe('estimateRoomHazard', () => {
  it('reaches 333% when everyone is でんせつ 865 or more', () => {
    const room = estimateRoomHazard(person(r(8, 865)), [person(r(8, 900)), person(r(8, 999)), person(r(8, 865))], null);
    expect(room).toMatchObject({ estimate: 333, counted: 4, unknown: 0, wild: 0 });
  });

  it('averages the axes and divides by 5', () => {
    // (1620 + 440) / 2 = 1030 → 206%
    const room = estimateRoomHazard(person(r(8, 820)), [person(r(4, 40))], null);
    expect(room.estimate).toBe(206);
    expect(room.lowest).toBe(88);
  });

  it('leaves out people whose rating is unknown and counts the missing members as wild', () => {
    const room = estimateRoomHazard(person(r(8, 500)), [person(null)], null);
    expect(room).toMatchObject({ estimate: 260, counted: 1, unknown: 1, wild: 2 });
  });

  it('uses only the first three participants with the streamer', () => {
    const room = estimateRoomHazard(person(r(8, 500)), [person(r(8, 500)), person(r(8, 500)), person(r(8, 500)), person(r(0, 0))], null);
    expect(room).toMatchObject({ estimate: 260, counted: 4, wild: 0 });
  });

  it('cannot estimate without any known rating, including the streamer', () => {
    expect(estimateRoomHazard(null, [person(null)], null)).toMatchObject({ estimate: null, counted: 0, unknown: 2, wild: 2, lowest: null });
  });

  it('counts ratings from before the shift began as stale', () => {
    const room = estimateRoomHazard(person(r(8, 500), 50), [person(r(8, 500), 150), person(r(8, 500), null)], 100);
    expect(room.stale).toBe(1);
    expect(estimateRoomHazard(person(r(8, 500), 50), [], null).stale).toBe(0);
  });

  it('counts participants with a lower title than the streamer', () => {
    const room = estimateRoomHazard(person(r(8, 0)), [person(r(7, 99)), person(r(8, 999)), person(null)], null);
    expect(room.lowerTier).toBe(1);
    expect(estimateRoomHazard(null, [person(r(0, 0))], null).lowerTier).toBe(0);
  });
});

describe('isStaleRating', () => {
  it('is stale only when both times are known and the rating is older than the shift', () => {
    expect(isStaleRating(50, 100)).toBe(true);
    expect(isStaleRating(100, 100)).toBe(false);
    expect(isStaleRating(null, 100)).toBe(false);
    expect(isStaleRating(50, null)).toBe(false);
  });
});

describe('recommendHazards', () => {
  it('recommends the lowest person for practice, the estimate for normal and 333% for a challenge, every 5%', () => {
    const room = estimateRoomHazard(person(r(8, 820)), [person(r(4, 40))], null);
    expect(recommendHazards(room)).toEqual({ practice: 90, normal: 205, challenge: 333 });
    expect(recommendHazards(estimateRoomHazard(null, [], null))).toBeNull();
  });
});

describe('formatRoomHazard', () => {
  it('shows the estimate with the unknown and wild people, without names', () => {
    expect(formatRoomHazard({ value: 210, unknown: 0, wild: 0 })).toBe('この部屋の推定キケン度 約 210%（でんせつ 250 相当・自己申告からの目安）');
    expect(formatRoomHazard({ value: 260, unknown: 1, wild: 2 }))
      .toBe('この部屋の推定キケン度 約 260%（でんせつ 500 相当・自己申告からの目安）。不明 1 人を除く・野良 2 人分は含まない');
  });
});

describe('formatJoinAnnouncement', () => {
  it('builds the announcements, with the recommendation for private jobs when known', () => {
    expect(formatJoinAnnouncement('merge', 200)).toBe('ここからは通常のバイトに合流します。配信者の評価は気にしなくて大丈夫です。一緒に楽しみましょう');
    expect(formatJoinAnnouncement('private', 205)).toBe('プライベートバイトの枠です。評価は減らないので、誰でも気軽にどうぞ。今日のおすすめは 205% です');
    expect(formatJoinAnnouncement('private', null)).not.toContain('おすすめ');
  });
});
