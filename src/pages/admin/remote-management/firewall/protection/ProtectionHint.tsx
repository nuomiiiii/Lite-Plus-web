import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Shield } from "@/components/admin/muiIcons";

export default function ProtectionHint({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "flex-start", color: "text.secondary" }}>
      <Box component="span" sx={{ display: "inline-flex", flexShrink: 0, mt: "2px", lineHeight: 0 }}>{icon ?? <Shield size={16} />}</Box>
      <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{children}</Typography>
    </Stack>
  );
}
