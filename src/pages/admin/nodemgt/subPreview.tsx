import Accordion from "@mui/material/Accordion";
import Alert from "@mui/material/Alert";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { toast } from "sonner";
import { writeClipboardText } from "@/utils/clipboard";
import { ArrowDown, Copy, Image } from "@/components/admin/muiIcons";
import { nodemgtWarningMessage } from "./inboundToOutbound";
import { parseShareLink } from "./shareLink";

export type SubPreview = {
  name: string;
  url: string;
  links: string[];
  subscriptionID?: string;
  target?: string;
  body?: string;
  client?: string;
  warnings?: string[];
};

function copyValue(value: string, ok: string, fail: string) {
  if (!value) return;
  void writeClipboardText(value).then(
    () => toast.success(ok),
    () => toast.error(fail),
  );
}

function downloadDataUrl(src: string, filename: string) {
  const a = document.createElement("a");
  a.href = src;
  a.download = filename;
  a.click();
}

function fileStem(raw: string) {
  const name = raw.trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
  return name || "qr";
}

function protoLabel(protocol: string) {
  const value = protocol.toLowerCase();
  if (value === "shadowsocks" || value === "ss") return "SS";
  if (value === "vless") return "Vless";
  if (value === "vmess") return "Vmess";
  if (value === "http" || value === "https") return "HTTP";
  if (value === "anytls") return "AnyTLS";
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function linkMeta(raw: string) {
  const parsed = parseShareLink(raw);
  if (parsed) {
    return {
      protocol: protoLabel(parsed.protocol || ""),
      transport: (parsed.transport || "").toUpperCase(),
      security: (parsed.security || "").toUpperCase(),
      name: (parsed.name || parsed.address || raw).trim(),
    };
  }
  try {
    const url = new URL(raw);
    return {
      protocol: protoLabel(url.protocol.replace(":", "")),
      transport: "",
      security: "",
      name: (decodeURIComponent(url.hash.replace(/^#/, "")) || url.host || raw).trim(),
    };
  } catch {
    return { protocol: "", transport: "", security: "", name: raw.trim() };
  }
}

function QrPanel({
  value,
  label,
  chip,
}: {
  value: string;
  label: string;
  chip?: string;
}) {
  const { t } = useTranslation();
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!value) {
      setSrc("");
      return;
    }
    let live = true;
    void QRCode.toDataURL(value, { width: 280, margin: 1, errorCorrectionLevel: "M" }).then(
      (next) => {
        if (live) setSrc(next);
      },
      () => {
        if (live) setSrc("");
      },
    );
    return () => {
      live = false;
    };
  }, [value]);
  const copied = t("nodemgt.copied");
  const copyFailed = t("nodemgt.copy_failed");
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        p: 1.25,
      }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0, mb: 1.25 }}>
        {chip ? (
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(34, 197, 94, 0.16)" : "#E8F8EE"),
              color: (theme) => (theme.palette.mode === "dark" ? "#86EFAC" : "#15803D"),
              fontSize: 12,
              fontWeight: 600,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chip}
          </Box>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" aria-label={t("nodemgt.copy_link")} title={t("nodemgt.copy_link")} onClick={() => copyValue(value, copied, copyFailed)}>
          <Copy size={16} />
        </IconButton>
        <IconButton
          size="small"
          aria-label={t("nodemgt.preview_download")}
          title={t("nodemgt.preview_download")}
          disabled={!src}
          onClick={() => src && downloadDataUrl(src, `${fileStem(label)}.png`)}
        >
          <Image size={16} />
        </IconButton>
      </Stack>
      {src ? (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Box sx={{ bgcolor: "#fff", p: 0.75, borderRadius: 1 }}>
            <Box component="img" src={src} alt={label} sx={{ width: 220, height: 220, display: "block" }} />
          </Box>
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ fontSize: 13, py: 3, textAlign: "center" }}>
          {t("nodemgt.preview_empty")}
        </Typography>
      )}
    </Box>
  );
}

function MetaChips({ protocol, transport, security, name }: { protocol: string; transport: string; security: string; name: string }) {
  const chipSx = {
    height: 22,
    fontSize: 11,
    fontWeight: 700,
    "& .MuiChip-label": { px: 0.75 },
  };
  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: "center", minWidth: 0, overflow: "hidden" }}>
      {protocol ? (
        <Chip
          size="small"
          label={protocol}
          sx={{
            ...chipSx,
            bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(59, 130, 246, 0.18)" : "#E8F4FD"),
            color: (theme) => (theme.palette.mode === "dark" ? "#93C5FD" : "#1565C0"),
          }}
        />
      ) : null}
      {transport ? (
        <Chip
          size="small"
          label={transport}
          sx={{
            ...chipSx,
            bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(245, 158, 11, 0.18)" : "#FFF6D8"),
            color: (theme) => (theme.palette.mode === "dark" ? "#FCD34D" : "#B45309"),
          }}
        />
      ) : null}
      {security && security !== "NONE" ? (
        <Chip
          size="small"
          label={security}
          sx={{
            ...chipSx,
            bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(139, 92, 246, 0.2)" : "#F3E8FF"),
            color: (theme) => (theme.palette.mode === "dark" ? "#C4B5FD" : "#7C3AED"),
          }}
        />
      ) : null}
      {name ? (
        <Typography color="text.secondary" sx={{ fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ({name})
        </Typography>
      ) : null}
    </Stack>
  );
}

export function SubPreviewBody({ preview }: { preview: SubPreview }) {
  const { t } = useTranslation();
  const items = [
    preview.url
      ? {
          key: "sub",
          title: t("nodemgt.preview_sub_info"),
          value: preview.url,
          label: `${preview.name} — ${t("nodemgt.preview_sub_info")}`,
          chip: `${preview.name} — ${t("nodemgt.preview_sub_info")}`,
          meta: null as ReturnType<typeof linkMeta> | null,
          defaultExpanded: true,
        }
      : null,
    ...preview.links.map((link, index) => {
      const meta = linkMeta(link);
      return {
        key: `${meta.name}-${index}`,
        title: "",
        value: link,
        label: meta.name,
        chip: meta.name,
        meta,
        defaultExpanded: false,
      };
    }),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (items.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.7 }}>
        {t("nodemgt.preview_empty")}
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {preview.warnings?.map((warning, index) => <Alert key={index} severity="warning">{nodemgtWarningMessage(warning, t)}</Alert>)}
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      {items.map((item, index) => (
        <Accordion
          key={item.key}
          defaultExpanded={item.defaultExpanded}
          disableGutters
          elevation={0}
          square
          sx={{
            boxShadow: "none",
            bgcolor: "transparent",
            "&:before": { display: "none" },
            borderTop: index === 0 ? "none" : "1px solid",
            borderColor: "divider",
          }}
        >
          <AccordionSummary
            expandIcon={<ArrowDown size={16} />}
            sx={{
              minHeight: 44,
              px: 1.5,
              flexDirection: "row-reverse",
              "& .MuiAccordionSummary-content": { my: 1, ml: 1, minWidth: 0, overflow: "hidden" },
              "& .MuiAccordionSummary-expandIconWrapper": { mr: 0 },
            }}
          >
            {item.meta ? (
              <MetaChips protocol={item.meta.protocol} transport={item.meta.transport} security={item.meta.security} name={item.meta.name} />
            ) : (
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{item.title}</Typography>
            )}
          </AccordionSummary>
          <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
            <QrPanel value={item.value} label={item.label} chip={item.chip || undefined} />
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
    </Stack>
  );
}

export function previewCopyText(preview: SubPreview) {
  if (preview.url) return preview.url;
  return preview.links.join("\n");
}
