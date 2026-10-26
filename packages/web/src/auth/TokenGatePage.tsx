import { useState } from "react";
import { ZCodeAppLogo } from "@zcode/ui/app-logo";
// 不能从 @zcode/ui barrel 入口引入：barrel 聚合了终端等浏览器组件（xterm 引用
// self），会把 Node 环境的单测与 SSR 拖崩；独立令牌门页只依赖原子组件。
import { Button } from "@zcode/ui/button";
import { getWebAuthCopy, type WebAuthLocale } from "./webAuthLocale.js";
import type { TokenGateVerifyResult } from "./tokenGate.js";

interface TokenGatePageProps {
  // 独立渲染于 IntlProvider 之外（zcode --web 引导期），沿用 auth 页自带的 locale 解析；
  // 显式传入用于测试。onVerify 只做凭证校验，cookie 由服务端在命中时下发。
  locale?: WebAuthLocale;
  onVerify: (token: string) => Promise<TokenGateVerifyResult>;
  onGranted: () => void;
}

type TokenGateStatus = "idle" | "checking" | "granted" | "invalid" | "network-error";

// zcode --web 独立模式的访问令牌输入页：/api/server-info 返回 401 时渲染，
// 替代旧版「静默降级 → WS 不透明失败」的体验。样式对齐 WebLoginPage 的独立卡片。
export function TokenGatePage({ locale, onVerify, onGranted }: TokenGatePageProps) {
  const pageCopy = getWebAuthCopy(locale);
  const copy = pageCopy.tokenGate;
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<TokenGateStatus>("idle");

  const busy = status === "checking" || status === "granted";
  const errorMessage =
    status === "invalid"
      ? copy.invalidMessage
      : status === "network-error"
        ? copy.networkMessage
        : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-sm rounded-lg border border-card-border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <ZCodeAppLogo className="size-10" />
          <div className="min-w-0">
            <div className="text-ui-xs font-medium text-foreground">{pageCopy.brand}</div>
            <h1 className="text-ui-lg font-medium text-foreground">{copy.title}</h1>
          </div>
        </div>
        <p className="mb-5 text-ui-xs leading-6 text-foreground-subtle">{copy.description}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const token = value.trim();
            if (!token || busy) {
              return;
            }
            setStatus("checking");
            onVerify(token)
              .then((result) => {
                if (result === "granted") {
                  setStatus("granted");
                  onGranted();
                  return;
                }
                setStatus(result);
              })
              .catch(() => {
                setStatus("network-error");
              });
          }}
        >
          <label htmlFor="zcode-token-gate-input" className="mb-1 block text-ui-xs text-foreground-subtle">
            {copy.inputLabel}
          </label>
          <input
            id="zcode-token-gate-input"
            type="password"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-invalid={status === "invalid" || undefined}
            aria-describedby={errorMessage ? "zcode-token-gate-error" : undefined}
            className="h-10 w-full rounded-lg border-input-border bg-input px-3 text-mobile-input-safe text-foreground placeholder:text-foreground-subtlest hover:border-input-border-hover focus-visible:border-input-border-focused focus-visible:bg-input-focused md:text-ui-base"
            placeholder={copy.inputPlaceholder}
            value={value}
            disabled={busy}
            onChange={(event) => {
              setValue(event.target.value);
              if (status === "invalid" || status === "network-error") {
                setStatus("idle");
              }
            }}
          />
          {errorMessage ? (
            <p id="zcode-token-gate-error" role="alert" className="mt-2 text-ui-xs text-destructive">
              {errorMessage}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy || !value.trim()}>
            {status === "checking"
              ? copy.checking
              : status === "granted"
                ? copy.granted
                : copy.submit}
          </Button>
        </form>
      </section>
    </main>
  );
}
