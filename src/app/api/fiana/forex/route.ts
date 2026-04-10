import { NextResponse } from "next/server";

// Alpha Vantage USD/JPY リアルレート取得API
// 無料枠: 25リクエスト/日
// キャッシュ: 5分間

let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分

export async function GET() {
  try {
    // キャッシュチェック
    if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
      return NextResponse.json({
        rate: cachedRate.rate,
        cached: true,
        timestamp: cachedRate.timestamp,
      });
    }

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

    if (!apiKey) {
      // APIキー未設定時はフォールバックレート
      return NextResponse.json({
        rate: 149.5,
        cached: false,
        fallback: true,
        timestamp: Date.now(),
      });
    }

    const res = await fetch(
      `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=JPY&apikey=${apiKey}`
    );

    if (!res.ok) {
      throw new Error(`Alpha Vantage API error: ${res.status}`);
    }

    const data = await res.json();

    const rateStr =
      data?.["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"];

    if (!rateStr) {
      // レート取得失敗時はフォールバック
      return NextResponse.json({
        rate: cachedRate?.rate || 149.5,
        cached: false,
        fallback: true,
        timestamp: Date.now(),
      });
    }

    const rate = parseFloat(rateStr);

    // キャッシュ更新
    cachedRate = { rate, timestamp: Date.now() };

    return NextResponse.json({
      rate,
      cached: false,
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({
      rate: cachedRate?.rate || 149.5,
      cached: false,
      fallback: true,
      timestamp: Date.now(),
    });
  }
}
