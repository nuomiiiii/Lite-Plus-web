import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export default function ProtectionEmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <Stack spacing={1} sx={{ py: 5, px: 2, alignItems: "center", textAlign: "center" }}>
    <Box sx={{ display: "flex", color: "text.secondary", mb: 0.5 }}>{icon}</Box>
    <Typography variant="body2" color="text.secondary">{children}</Typography>
  </Stack>;
}
