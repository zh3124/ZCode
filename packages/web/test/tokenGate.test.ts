import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TokenGatePage } from "../src/auth/TokenGatePage.js";
import {
  stripTokenQuery,
  verifyLiteTokenViaServerInfo,
  type TokenGateFetch,
} from "../src/auth/tokenGate.js";

function createFetchMock(status: number) {
  return vi.fn<TokenGateFetch>(async () => new Response("{}", { status }));
}

describe("verifyLiteTokenViaServerInfo", () => {
  it("requests the encoded token and maps 2xx to granted", async () => {
    const fetchImpl = createFetchMock(200);
    await expect(verifyLiteTokenViaServerInfo(fetchImpl, "a+b")).resolves.toBe("granted");
    // + 必须编码为 %2B：未编码时服务端会把 + 解析成空格导致合法令牌被拒。
    expect(fetchImpl).toHaveBeenCalledWith("/api/server-info?token=a%2Bb", { cache: "no-store" });
  });

  it("maps non-2xx to invalid", async () => {
    const fetchImpl = createFetchMock(401);
    await expect(verifyLiteTokenViaServerInfo(fetchImpl, "x")).resolves.toBe("invalid");
  });

  it("maps fetch failure to network-error", async () => {
    const fetchImpl = vi.fn<TokenGateFetch>(async () => {
      throw new Error("offline");
    });
    await expect(verifyLiteTokenViaServerInfo(fetchImpl, "x")).resolves.toBe("network-error");
  });
});

describe("stripTokenQuery", () => {
  it("removes only the token param", () => {
    expect(stripTokenQuery("http://host:3030/?token=abc&remote=dev")).toBe(
      "http://host:3030/?remote=dev",
    );
  });

  it("drops the search when token is the only param", () => {
    expect(stripTokenQuery("http://host:3030/?token=abc")).toBe("http://host:3030/");
  });

  it("keeps href unchanged without a token param and on invalid input", () => {
    expect(stripTokenQuery("http://host:3030/?remote=dev")).toBe("http://host:3030/?remote=dev");
    expect(stripTokenQuery("not-a-url")).toBe("not-a-url");
  });
});

describe("TokenGatePage", () => {
  const renderGate = (locale: "zh-CN" | "en-US") =>
    renderToStaticMarkup(
      createElement(TokenGatePage, {
        locale,
        onVerify: async () => "granted",
        onGranted: () => {},
      }),
    );

  it("renders zh copy with a masked input", () => {
    const html = renderGate("zh-CN");
    expect(html).toContain("输入访问令牌");
    expect(html).toContain("验证并继续");
    expect(html).toContain('type="password"');
    expect(html).toContain('id="zcode-token-gate-input"');
  });

  it("renders en copy", () => {
    const html = renderGate("en-US");
    expect(html).toContain("Enter Access Token");
    expect(html).toContain("Verify and Continue");
  });
});
