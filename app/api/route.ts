// app/api/route.ts
export const runtime = "nodejs";

const SOURCE =
  "https://api-v2.zealy.io/api/communities/somniatradingcompetition/trading-competition/0b50bebd-51ee-43cf-b66c-6988509c981d/leaderboard?page=1&pageSize=20";

// Fixed campaign info
const PRIZE_POOL = "36K SOMI";
const ENDS_AT_ISO = "2025-11-30T00:00:00Z";

type ZealyItem = {
  userId: string;
  name: string | null;
  avatar: string | null;
  rank: number;
  volume: number;
  expectedReward: number;
};
type ZealyResponse = {
  status: string;
  page: number;
  totalPages: number;
  totalRecords: number;
  totalVolume: number;
  data: ZealyItem[];
};

// Helpers to match the UI style
const compactCurrency = (n: number, digits = 2) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  })
    .format(n)
    .replace("k", "K")
    .replace("m", "M");

const compactNumber = (n: number, digits = 1) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  })
    .format(n)
    .replace("k", "K")
    .replace("m", "M");

const formatTotalVolume = (usd: number) => compactCurrency(usd, 1);
const formatRowVolume = (usd: number) => compactCurrency(usd, 2);
const formatReward = (somi: number) => `${compactNumber(somi, 1)} SOMI`;

// Live UTC countdown
function utcCountdown(toIso: string) {
  const now = new Date();
  const end = new Date(toIso);
  let ms = Math.max(0, end.getTime() - now.getTime());

  const d = Math.floor(ms / 86400000);
  ms -= d * 86400000;
  const h = Math.floor(ms / 3600000);
  ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  ms -= m * 60000;
  const s = Math.floor(ms / 1000);

  return {
    days: d,
    hours: h,
    minutes: m,
    seconds: s,
    label: `Payout in ${d}d ${h}h ${m}m ${s}s`
  };
}

export async function GET() {
  try {
    const r = await fetch(SOURCE, {
      // use no-store while validating header tweaks; you can swap to revalidate later
      cache: "no-store",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        origin: "https://zealy.io",
        referer: "https://zealy.io/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty"
      }
    });

    if (!r.ok) {
      return Response.json(
        { error: "Upstream request failed", status: r.status },
        { status: 502, headers: cors() }
      );
    }

    const raw = (await r.json()) as ZealyResponse;

    const top10 = [...(raw.data || [])]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10)
      .map((x) => ({
        rank: x.rank,
        name: x.name ?? "Anonymous",
        volume: formatRowVolume(x.volume),
        expectedReward: formatReward(x.expectedReward)
      }));

    const payload = {
      prizePool: PRIZE_POOL,
      totalTraders: raw.totalRecords,
      totalVolume: formatTotalVolume(raw.totalVolume),
      top10,
      endsAtUTC: ENDS_AT_ISO,
      countdownUTC: utcCountdown(ENDS_AT_ISO)
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        ...cors(),
        "content-type": "application/json; charset=utf-8",
        "cache-control": "s-maxage=60, stale-while-revalidate=600"
      },
      status: 200
    });
  } catch (err: any) {
    return Response.json(
      { error: "Proxy error", message: err?.message ?? String(err) },
      { status: 500, headers: cors() }
    );
  }
}

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS"
  };
}
