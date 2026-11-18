import type { CSSProperties, ReactNode } from "react";

type RadixThemeRootProps = {
  appearance: "light" | "dark";
  scaling?: "100%" | "110%";
  plain?: boolean;
  style?: CSSProperties;
  children: ReactNode;
};

const rootStyle: CSSProperties = {
  backgroundColor: "transparent",
  minHeight: "var(--app-viewport-height, 100vh)",
};

export default function RadixThemeRoot({
  appearance,
  scaling = "110%",
  plain = false,
  style = rootStyle,
  children,
}: RadixThemeRootProps) {
  return (
    <div
      data-appearance={plain ? undefined : appearance}
      data-scaling={plain ? undefined : scaling}
      className="theme-root"
      style={style}
    >
      {children}
    </div>
  );
}
