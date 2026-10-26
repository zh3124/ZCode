import type { WebOAuthProviderId } from "./browserOAuthCredentialRepo.js";

export type WebAuthLocale = "zh-CN" | "en-US";

export interface WebTokenGateCopy {
  title: string;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  submit: string;
  checking: string;
  granted: string;
  invalidMessage: string;
  networkMessage: string;
}

interface WebAuthPageCopy {
  brand: string;
  loginTitle: string;
  loginDescription: string;
  loginAction: Record<WebOAuthProviderId, string>;
  loginRegion: Record<WebOAuthProviderId, string>;
  callbackTitle: string;
  callbackDescription: string;
  callbackErrorTitle: string;
  callbackErrorDescription: string;
  retryAction: string;
  tokenGate: WebTokenGateCopy;
}

const WEB_AUTH_COPY = {
  "zh-CN": {
    brand: "ZCode",
    loginTitle: "登录后继续使用 Web 远程控制",
    loginDescription: "请选择与电脑端相同的登录平台，并使用同一账号。",
    loginAction: { zai: "连接 Z.ai 继续使用", bigmodel: "连接 BigModel 继续使用" },
    loginRegion: { zai: "全球", bigmodel: "中国" },
    callbackTitle: "正在完成登录",
    callbackDescription: "请稍候，正在校验账号身份。",
    callbackErrorTitle: "登录失败",
    callbackErrorDescription: "授权流程未完成，请重新登录。",
    retryAction: "重新登录",
    tokenGate: {
      title: "输入访问令牌",
      description: "此服务器已开启访问认证。请输入启动时传入或打印在终端/容器日志中的访问令牌。",
      inputLabel: "访问令牌",
      inputPlaceholder: "粘贴访问令牌",
      submit: "验证并继续",
      checking: "正在验证…",
      granted: "验证通过，正在进入…",
      invalidMessage: "令牌无效，请重新输入。",
      networkMessage: "网络异常，请重试。",
    },
  },
  "en-US": {
    brand: "ZCode",
    loginTitle: "Sign In To Continue",
    loginDescription: "Choose the same sign-in provider and account as on your computer.",
    loginAction: { zai: "Connect to Z.ai", bigmodel: "Connect to BigModel" },
    loginRegion: { zai: "Global", bigmodel: "CN" },
    callbackTitle: "Finishing Sign-In",
    callbackDescription: "Verifying your account identity.",
    callbackErrorTitle: "Sign-In Failed",
    callbackErrorDescription: "The authorization flow did not complete. Sign in again.",
    retryAction: "Sign In Again",
    tokenGate: {
      title: "Enter Access Token",
      description:
        "This server requires an access token. Enter the token passed at startup or printed in the terminal/container logs.",
      inputLabel: "Access token",
      inputPlaceholder: "Paste the access token",
      submit: "Verify and Continue",
      checking: "Verifying…",
      granted: "Verified. Entering…",
      invalidMessage: "Invalid token. Try again.",
      networkMessage: "Network error. Try again.",
    },
  },
} satisfies Record<WebAuthLocale, WebAuthPageCopy>;

function resolveWebAuthLocale(language?: string): WebAuthLocale {
  const candidate =
    language ??
    document.documentElement.lang ??
    navigator.language ??
    navigator.languages?.[0] ??
    "";

  return candidate.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function getWebAuthCopy(locale: WebAuthLocale = resolveWebAuthLocale()): WebAuthPageCopy {
  return WEB_AUTH_COPY[locale];
}
