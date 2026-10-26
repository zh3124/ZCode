export type TokenGateVerifyResult = "granted" | "invalid" | "network-error";

export type TokenGateFetch = (input: string, init: { cache: "no-store" }) => Promise<Response>;

// zcode --web 令牌门：复用 /api/server-info?token= 的「校验并种 cookie」契约，
// 不新增后端接口。命中时服务端顺带下发持久 cookie（HttpOnly，浏览器自动保存），
// 这里只报告校验结果，不读写任何存储。
export async function verifyLiteTokenViaServerInfo(
  fetchImpl: TokenGateFetch,
  token: string,
): Promise<TokenGateVerifyResult> {
  try {
    const response = await fetchImpl(`/api/server-info?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    return response.ok ? "granted" : "invalid";
  } catch {
    return "network-error";
  }
}

// 验证通过后用于清理地址栏：只移除 ?token=（用户可能带着失效 token 链接进来，
// 避免令牌长期留在历史记录），其余参数原样保留。纯字符串处理便于单测，
// History API 的调用留在调用方。
export function stripTokenQuery(href: string): string {
  try {
    const url = new URL(href);
    if (!url.searchParams.has("token")) {
      return href;
    }
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return href;
  }
}
