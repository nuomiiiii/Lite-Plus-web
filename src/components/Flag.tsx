import * as React from "react";
import { getRegionCode } from "@/utils/regionHelper";
import { getAppAssetUrl } from "@/utils/assetUrl";

interface FlagProps {
  flag?: string | null; // 地区代码 (例如 "SG", "US") 或旗帜 emoji (例如 "🇸🇬", "🇺🇳")
  size?: string; // 可选的尺寸 prop，用于未来扩展
  compact?: boolean;
  width?: number;
  height?: number;
}

/**
 * 算法：将由两个区域指示符符号组成的 emoji 转换为对应的两字母国家\地区代码。
 * 例如：🇸🇬 (由两个区域指示符组成) -> SG
 * @param emoji 输入的 emoji 字符串
 * @returns 转换后的两字母国家\地区代码（例如 "SG"），如果不是有效的旗帜 emoji 则返回 null。
 */
const getCountryCodeFromFlagEmoji = (emoji?: string | null): string | null => {
  // 使用 Array.from() 来正确处理 Unicode 代理对，将 emoji 字符串拆分为逻辑上的字符数组。
  // 对于一个国家\地区旗帜 emoji，chars 数组的长度将是 2 (每个元素是一个区域指示符字符)。
  const chars = Array.from(emoji ?? "");

  // 国家\地区旗帜 emoji 应该由且仅由两个区域指示符字符组成
  if (chars.length !== 2) {
    return null;
  }

  // 获取两个区域指示符字符的 Unicode 码点
  const codePoint1 = chars[0].codePointAt(0)!;
  const codePoint2 = chars[1].codePointAt(0)!;

  // 区域指示符符号的 Unicode 范围是从 U+1F1E6 (🇦) 到 U+1F1FF (🇿)
  const REGIONAL_INDICATOR_START = 0x1F1E6; // 🇦 的 Unicode 码点
  const ASCII_ALPHA_START = 0x41; // A 的 ASCII 码点

  // 检查两个码点是否都在区域指示符范围内
  if (
    codePoint1 >= REGIONAL_INDICATOR_START && codePoint1 <= 0x1F1FF &&
    codePoint2 >= REGIONAL_INDICATOR_START && codePoint2 <= 0x1F1FF
  ) {
    // 算法转换：通过计算与 'A' 对应的区域指示符的偏移量，将区域指示符码点转换回对应的 ASCII 字母码点
    const letter1 = String.fromCodePoint(codePoint1 - REGIONAL_INDICATOR_START + ASCII_ALPHA_START);
    const letter2 = String.fromCodePoint(codePoint2 - REGIONAL_INDICATOR_START + ASCII_ALPHA_START);
    return `${letter1}${letter2}`;
  }

  return null;
};

const prefetchedFlagSrc = new Set<string>();

function flagAssetUrl(flag?: string | null): string {
  const resolvedFlagFileName = getCountryCodeFromFlagEmoji(flag) ?? getRegionCode(flag);
  return getAppAssetUrl(`assets/flags/${resolvedFlagFileName}.svg`);
}

export function prefetchFlag(flag?: string | null) {
  const src = flagAssetUrl(flag);
  if (!src || prefetchedFlagSrc.has(src)) return;
  prefetchedFlagSrc.add(src);
  if (typeof Image === "undefined") return;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
}

export function prefetchNodeFlags(
  nodes: Array<{ region?: string | null; region_override?: string | null }>,
) {
  for (const node of nodes) {
    prefetchFlag(node.region_override?.trim() || node.region?.trim() || "UN");
  }
}

const Flag = React.memo(({ flag, size, compact = false, width, height }: FlagProps) => {
  const imgSrc = flagAssetUrl(flag);
  const resolvedFlagFileName = getCountryCodeFromFlagEmoji(flag) ?? getRegionCode(flag);
  const altText = `地区旗帜: ${resolvedFlagFileName}`;
  const frameWidth = width ?? (compact ? 20 : undefined);
  const frameHeight = height ?? (compact ? 15 : undefined);
  const framed = Boolean(frameWidth && frameHeight);

  return (
    <span
      className={
        framed || compact
          ? "shrink-0 self-center"
          : `m-2 self-center ${size ? `w-${size} h-${size}` : "w-6 h-6"}`
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        ...(framed ? { width: frameWidth, height: frameHeight } : {}),
      }}
      aria-label={altText}
    >
      <img
        src={imgSrc}
        alt={altText}
        width={frameWidth}
        height={frameHeight}
        decoding="async"
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </span>
  );
});

// 确保 displayName 以便在 React DevTools 中识别
Flag.displayName = "Flag";

export default Flag;
