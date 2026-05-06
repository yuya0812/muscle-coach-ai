import { TwitterApi } from "twitter-api-v2";

let _client: TwitterApi | null = null;

export function getXClient(): TwitterApi {
  if (_client) return _client;

  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    throw new Error("X API credentials are not set in environment variables");
  }

  _client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret: accessTokenSecret,
  });

  return _client;
}

export function getXReadClient(): TwitterApi {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error("X_BEARER_TOKEN is not set");
  }
  // Bearer Tokenはデコードして使用
  const decoded = decodeURIComponent(bearerToken);
  return new TwitterApi(decoded);
}
