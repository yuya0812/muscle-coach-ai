/**
 * LIFF Access Token 検証
 * LINE API を使ってトークンを検証し、userId が一致するか確認する
 */

interface VerifyResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

interface LineVerifyResponse {
  scope: string;
  client_id: string;
  expires_in: number;
}

interface LineProfileResponse {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

/**
 * LIFF Access Token を検証し、対応する LINE userId を返す
 */
export async function verifyLiffAccessToken(
  authHeader: string | undefined
): Promise<VerifyResult> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }

  const accessToken = authHeader.slice(7);

  try {
    // 1. トークンの有効性を検証
    const verifyRes = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
    );

    if (!verifyRes.ok) {
      return { valid: false, error: "Invalid access token" };
    }

    const verifyData = (await verifyRes.json()) as LineVerifyResponse;

    // チャネルIDの検証（必須）。未設定なら fail-closed で deny する。
    const expectedChannelId = process.env.LIFF_CHANNEL_ID;
    if (!expectedChannelId) {
      console.error("LIFF_CHANNEL_ID is not configured");
      return { valid: false, error: "Server misconfiguration" };
    }
    if (verifyData.client_id !== expectedChannelId) {
      return { valid: false, error: "Token channel mismatch" };
    }
    // トークンの有効期限を確認
    if (typeof verifyData.expires_in !== "number" || verifyData.expires_in <= 0) {
      return { valid: false, error: "Token expired" };
    }

    // 2. トークンからユーザープロフィールを取得して userId を確認
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return { valid: false, error: "Failed to get user profile" };
    }

    const profile = (await profileRes.json()) as LineProfileResponse;

    return { valid: true, userId: profile.userId };
  } catch (error) {
    console.error("Token verification error:", error);
    return { valid: false, error: "Token verification failed" };
  }
}

/**
 * リクエストの userId とトークンの userId が一致するか確認
 */
export async function authenticateRequest(
  authHeader: string | undefined,
  requestedUserId: string
): Promise<{ authenticated: boolean; error?: string }> {
  const result = await verifyLiffAccessToken(authHeader);

  if (!result.valid) {
    return { authenticated: false, error: result.error };
  }

  if (result.userId !== requestedUserId) {
    return {
      authenticated: false,
      error: "User ID mismatch: you can only access your own data",
    };
  }

  return { authenticated: true };
}
