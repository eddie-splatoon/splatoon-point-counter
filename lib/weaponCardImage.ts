// ブキ埋めカードの SNS 投稿用の画像（PNG）。ブラウザの Canvas で描くので、クライアントからだけ使う

import {SALMON_WEAPONS, SalmonWeapon, WeaponCard, weaponImageUrl} from './salmonWeapons';

const INK_COLOR = '#FF40A0';
const COMPLETE_COLOR = '#32E675';
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';

// 71 種が 12 列 × 6 行に収まる横長（SNS のタイムラインで見やすい比率）
export const IMAGE_COLUMNS = 12;
const CELL = 88;
const GAP = 8;
const PADDING = 40;
const HEADER = 72;
const BAR = 12;
const FOOTER = 48;

export const IMAGE_WIDTH = PADDING * 2 + IMAGE_COLUMNS * CELL + (IMAGE_COLUMNS - 1) * GAP;
const ROWS = Math.ceil(SALMON_WEAPONS.length / IMAGE_COLUMNS);
const GRID_TOP = PADDING + HEADER + BAR + 24;
export const IMAGE_HEIGHT = GRID_TOP + ROWS * CELL + (ROWS - 1) * GAP + FOOTER + PADDING / 2;

/** マスの左上の座標（カテゴリ順に左上から詰める） */
export const cellPosition = (index: number) => ({
    x: PADDING + (index % IMAGE_COLUMNS) * (CELL + GAP),
    y: GRID_TOP + Math.floor(index / IMAGE_COLUMNS) * (CELL + GAP),
});

const pad2 = (n: number) => String(n).padStart(2, '0');

export const weaponCardImageFileName = (date: Date) =>
    `weapon-card-${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}.png`;

const formatDate = (date: Date) => `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;

/** 読み込めなければ null（リンク切れ・CORS で読めないときは、ブキ名を文字で描く）。crossOrigin を付けて Canvas を汚さない */
const loadImage = (weapon: SalmonWeapon) => new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = weaponImageUrl(weapon);
});

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
};

/** 文字を幅に収まるよう 1 文字ずつ折り返す（ブキ名の代わりの表示用） */
const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const lines: string[] = [];
    let line = '';
    for (const char of text) {
        if (line && ctx.measureText(line + char).width > maxWidth) {
            lines.push(line);
            line = char;
        } else {
            line += char;
        }
    }
    if (line) lines.push(line);
    return lines;
};

/** ブキ埋めカードの画像を描いて PNG にする。オーバーレイのカードと同じ見た目（埋まったマスはインクのスタンプとカラー） */
export const renderWeaponCardImage = async (card: WeaponCard, now: Date = new Date()): Promise<Blob> => {
    const images = await Promise.all(SALMON_WEAPONS.map(loadImage));
    const obtained = new Set(card.obtained.map((w) => w.key));
    const count = obtained.size;
    const complete = count >= card.total;

    const canvas = document.createElement('canvas');
    canvas.width = IMAGE_WIDTH;
    canvas.height = IMAGE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas を使えません');

    ctx.fillStyle = '#16161c';
    ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK_COLOR;
    ctx.font = `bold 44px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('オールランダム ブキ埋め', PADDING, PADDING + HEADER / 2);
    ctx.fillStyle = complete ? COMPLETE_COLOR : '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(`${count} / ${card.total}`, IMAGE_WIDTH - PADDING, PADDING + HEADER / 2);

    const barY = PADDING + HEADER;
    const barWidth = IMAGE_WIDTH - PADDING * 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    roundRect(ctx, PADDING, barY, barWidth, BAR, BAR / 2);
    ctx.fill();
    if (count > 0) {
        ctx.fillStyle = complete ? COMPLETE_COLOR : INK_COLOR;
        roundRect(ctx, PADDING, barY, barWidth * Math.min(1, count / card.total), BAR, BAR / 2);
        ctx.fill();
    }

    SALMON_WEAPONS.forEach((weapon, index) => {
        const {x, y} = cellPosition(index);
        const has = obtained.has(weapon.key);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        roundRect(ctx, x, y, CELL, CELL, 14);
        ctx.fill();
        if (has) {
            ctx.fillStyle = INK_COLOR;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, CELL / 2 - 6, 0, Math.PI * 2);
            ctx.fill();
        }
        // 埋まっていないブキは、オーバーレイと同じく白黒で薄く
        ctx.globalAlpha = has ? 1 : 0.3;
        ctx.filter = has ? 'none' : 'grayscale(1)';
        const img = images[index];
        if (img) {
            ctx.drawImage(img, x + 6, y + 6, CELL - 12, CELL - 12);
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold 13px ${FONT}`;
            ctx.textAlign = 'center';
            const lines = wrapText(ctx, weapon.name, CELL - 10);
            lines.forEach((line, i) => ctx.fillText(line, x + CELL / 2, y + CELL / 2 + (i - (lines.length - 1) / 2) * 16));
        }
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
    });

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'left';
    const footerY = IMAGE_HEIGHT - PADDING / 2 - FOOTER / 2;
    ctx.fillText(card.startedAt > 0 ? `${formatDate(new Date(card.startedAt))} 〜 ${formatDate(now)}` : formatDate(now), PADDING, footerY);
    ctx.textAlign = 'right';
    ctx.fillText('#サーモンラン #オールランダム', IMAGE_WIDTH - PADDING, footerY);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画像を作れませんでした'))), 'image/png');
    });
};

/** Blob をファイルとしてダウンロードさせる */
export const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    // すぐに破棄するとダウンロードが始まらないブラウザがあるので、少し待つ
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
