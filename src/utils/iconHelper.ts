import type { SvgIconComponent } from "@mui/icons-material";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import AlternateEmailOutlined from "@mui/icons-material/AlternateEmailOutlined";
import AltRouteOutlined from "@mui/icons-material/AltRouteOutlined";
import ArrowCircleRightOutlined from "@mui/icons-material/ArrowCircleRightOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import DnsOutlined from "@mui/icons-material/DnsOutlined";
import GppGoodOutlined from "@mui/icons-material/GppGoodOutlined";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import HubOutlined from "@mui/icons-material/HubOutlined";
import LocalFireDepartmentOutlined from "@mui/icons-material/LocalFireDepartmentOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import MoreHoriz from "@mui/icons-material/MoreHoriz";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import PowerOffOutlined from "@mui/icons-material/PowerOffOutlined";
import PublicOutlined from "@mui/icons-material/PublicOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import ShowChartOutlined from "@mui/icons-material/ShowChartOutlined";
import SpeedOutlined from "@mui/icons-material/SpeedOutlined";
import StorageOutlined from "@mui/icons-material/StorageOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import TerminalOutlined from "@mui/icons-material/TerminalOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import WifiOffOutlined from "@mui/icons-material/WifiOffOutlined";
import { createElement, type SVGProps } from "react";

export type AdminIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

export function wrapMuiIcon(Icon: SvgIconComponent) {
  function WrappedIcon({ size, color, ...props }: AdminIconProps) {
    const fontSize = size == null || size === "" ? 18 : Number(size) || 18;
    return createElement(Icon, {
      ...props,
      sx: {
        fontSize,
        width: "1em",
        height: "1em",
        color: color || "inherit",
        display: "block",
        flexShrink: 0,
      },
    } as SvgIconProps);
  }
  WrappedIcon.displayName = Icon.name || "MuiIcon";
  return WrappedIcon;
}

export const iconMap: Record<string, ReturnType<typeof wrapMuiIcon>> = {
  Server: wrapMuiIcon(DnsOutlined),
  Bolt: wrapMuiIcon(SettingsOutlined),
  Home: wrapMuiIcon(HomeOutlined),
  BarChart2: wrapMuiIcon(BarChartOutlined),
  CircleArrowRight: wrapMuiIcon(ArrowCircleRightOutlined),
  MessageCircleMore: wrapMuiIcon(ChatOutlined),
  Ellipsis: wrapMuiIcon(MoreHoriz),
  Bell: wrapMuiIcon(NotificationsOutlined),
  BellRing: wrapMuiIcon(NotificationsActiveOutlined),
  Unplug: wrapMuiIcon(PowerOffOutlined),
  TrendingUp: wrapMuiIcon(TrendingUpOutlined),
  Users: wrapMuiIcon(GroupOutlined),
  UserCircle: wrapMuiIcon(AccountCircleOutlined),
  FileText: wrapMuiIcon(DescriptionOutlined),
  AtSign: wrapMuiIcon(AlternateEmailOutlined),
  Book: wrapMuiIcon(MenuBookOutlined),
  Activity: wrapMuiIcon(ShowChartOutlined),
  Palette: wrapMuiIcon(PaletteOutlined),
  Code: wrapMuiIcon(CodeOutlined),
  Globe: wrapMuiIcon(PublicOutlined),
  Terminal: wrapMuiIcon(TerminalOutlined),
  Hub: wrapMuiIcon(HubOutlined),
  Database: wrapMuiIcon(StorageOutlined),
  Schedule: wrapMuiIcon(ScheduleOutlined),
  WifiOff: wrapMuiIcon(WifiOffOutlined),
  Gauge: wrapMuiIcon(SpeedOutlined),
  Store: wrapMuiIcon(StorefrontOutlined),
  Route: wrapMuiIcon(AltRouteOutlined),
  LayoutDashboard: wrapMuiIcon(DashboardOutlined),
  Payments: wrapMuiIcon(AccountBalanceWalletOutlined),
  Send: wrapMuiIcon(SendOutlined),
  Shield: wrapMuiIcon(GppGoodOutlined),
  Firewall: wrapMuiIcon(LocalFireDepartmentOutlined),
};
