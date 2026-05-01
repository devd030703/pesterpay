export type StarlingMoney = {
  currency: string;
  minorUnits: number;
};

export type StarlingFeedItem = {
  feedItemUid: string;
  amount: StarlingMoney;
  direction: "IN" | "OUT";
  reference?: string;
  paymentReference?: string;
  narrative?: string;
  counterPartyName?: string;
  transactionTime?: string;
  settlementTime?: string;
};

type StarlingSettledFeedResponse = {
  feedItems?: StarlingFeedItem[];
};

export type FetchStarlingSettledTransactionsInput = {
  accessToken?: string;
  accountUid?: string;
  minTransactionTimestamp: string;
  maxTransactionTimestamp: string;
  baseUrl?: string;
};

export type StarlingPaymentCandidate = {
  id: string;
  reference: string;
  amountCents: number;
  currency: "GBP" | "USD";
  direction: "incoming" | "outgoing";
  createdAt: string;
  raw: StarlingFeedItem;
};

const DEFAULT_STARLING_BASE_URL = "https://api.starlingbank.com";

export async function fetchStarlingSettledTransactionsBetween(
  input: FetchStarlingSettledTransactionsInput,
): Promise<StarlingFeedItem[]> {
  const accessToken = input.accessToken ?? process.env.STARLING_ACCESS_TOKEN;
  const accountUid = input.accountUid ?? process.env.STARLING_ACCOUNT_UID;

  if (!accessToken || !accountUid) {
    throw new Error("Starling access token and account UID are required.");
  }

  const baseUrl = input.baseUrl ?? process.env.STARLING_BASE_URL ?? DEFAULT_STARLING_BASE_URL;
  const url = new URL(`/api/v2/feed/account/${accountUid}/settled-transactions-between`, baseUrl);
  url.searchParams.set("minTransactionTimestamp", input.minTransactionTimestamp);
  url.searchParams.set("maxTransactionTimestamp", input.maxTransactionTimestamp);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Starling settled feed request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as StarlingSettledFeedResponse;
  return Array.isArray(payload.feedItems) ? payload.feedItems : [];
}

export function normalizeStarlingFeedItem(item: StarlingFeedItem): StarlingPaymentCandidate | null {
  const currency = item.amount.currency;

  if (currency !== "GBP" && currency !== "USD") {
    return null;
  }

  const reference = [item.paymentReference, item.reference, item.narrative, item.counterPartyName]
    .find((value) => typeof value === "string" && value.trim().length > 0)
    ?.trim();

  if (!reference) {
    return null;
  }

  return {
    id: item.feedItemUid,
    reference,
    amountCents: item.amount.minorUnits,
    currency,
    direction: item.direction === "IN" ? "incoming" : "outgoing",
    createdAt: item.settlementTime ?? item.transactionTime ?? new Date().toISOString(),
    raw: item,
  };
}

export function summarizeIncomingSettledFeedItems(feedItems: StarlingFeedItem[], currency: "GBP" | "USD" = "GBP") {
  const incomingItems = feedItems.filter((item) => item.direction === "IN" && item.amount.currency === currency);
  const totalIncomingCents = incomingItems.reduce((sum, item) => sum + item.amount.minorUnits, 0);

  return {
    currency,
    incomingCount: incomingItems.length,
    totalIncomingCents,
  };
}
