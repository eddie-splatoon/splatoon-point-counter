import {NextResponse} from 'next/server';

import {getWeaponCard, parseManualWeapon, setManualWeapon, startWeaponCard} from '../../../lib/weaponCard';

/** ブキ埋めカードの状態 */
export async function GET() {
    return NextResponse.json(getWeaponCard());
}

// 他サイトからプリフライトなしで送れる text/plain などの「単純リクエスト」を拒否する
const isJson = (request: Request) => request.headers.get('content-type')?.toLowerCase().startsWith('application/json') ?? false;
const unsupportedMediaType = () => NextResponse.json({message: 'Content-Type must be application/json.'}, {status: 415});

/** 手動で埋める / 外す: {weapon, obtained} */
export async function PATCH(request: Request) {
    if (!isJson(request)) return unsupportedMediaType();

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({message: 'Invalid JSON.'}, {status: 400});
    }

    const parsed = parseManualWeapon(body);
    if (typeof parsed === 'string') return NextResponse.json({message: parsed}, {status: 400});
    return NextResponse.json(setManualWeapon(parsed.weapon, parsed.obtained));
}

/** 新しいカードを始める */
export async function POST(request: Request) {
    if (!isJson(request)) return unsupportedMediaType();
    return NextResponse.json(startWeaponCard());
}
