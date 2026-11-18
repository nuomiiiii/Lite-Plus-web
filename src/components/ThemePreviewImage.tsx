import React from "react";
import { Box, Flex, Text } from "@/components/admin/ui";
import { Image as ImageIcon } from "@/components/admin/muiIcons";
import { resolveThemePreviewStatus } from "@/utils/themePreviewImage";

type ThemePreviewImageProps = {
  src?: string | null;
  alt: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
  containerClassName?: string;
  imageClassName?: string;
  fit?: "cover" | "contain";
  fallbackLabel?: React.ReactNode;
  iconSize?: number;
};

const joinClassName = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(" ");

export default function ThemePreviewImage({
  src,
  alt,
  loading = "lazy",
  fetchPriority,
  referrerPolicy,
  containerClassName,
  imageClassName,
  fit = "cover",
  fallbackLabel,
  iconSize = 40,
}: ThemePreviewImageProps) {
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = React.useState<"loading" | "loaded" | "error">(
    src ? "loading" : "error",
  );

  const syncStatus = React.useCallback(() => {
    setStatus(resolveThemePreviewStatus(src, imageRef.current));
  }, [src]);

  React.useLayoutEffect(() => {
    syncStatus();
  }, [syncStatus]);

  return (
    <Box
      className={joinClassName("km-theme-preview", containerClassName)}
      data-image-fit={fit}
      data-image-status={status}
    >
      {src ? (
        <img
          ref={imageRef}
          key={src}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          referrerPolicy={referrerPolicy}
          className={joinClassName("km-theme-preview-image", imageClassName)}
          data-loaded={status === "loaded" ? "true" : "false"}
          onLoad={syncStatus}
          onError={syncStatus}
        />
      ) : null}
      <Box className="km-theme-preview-skeleton" aria-hidden="true" />
      <Flex
        align="center"
        justify="center"
        direction="column"
        gap="2"
        className="km-theme-preview-fallback"
        data-visible={status === "error" ? "true" : "false"}
      >
        <ImageIcon size={iconSize} className="text-gray-400" />
        {fallbackLabel ? (
          <Text size="1" color="gray" align="center">
            {fallbackLabel}
          </Text>
        ) : null}
      </Flex>
    </Box>
  );
}
