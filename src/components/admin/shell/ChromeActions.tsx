import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Translate from "@mui/icons-material/Translate";
import { Check, Moon, Sun } from "@/components/admin/muiIcons";
import { useContext, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useOptionalAccount } from "@/contexts/AccountContext";
import { ThemeContext } from "@/contexts/ThemeContext";
import { useSystemTheme } from "@/hooks/useSystemTheme";
import { changeUiLanguage, preloadUiLocales } from "@/i18n/config";
import { ADMIN_UI_LANGUAGES } from "@/utils/language";

const languages = ADMIN_UI_LANGUAGES;

const menuPaper = {
  elevation: 0,
  sx: {
    mt: 1,
    minWidth: 180,
    maxWidth: "calc(100vw - 24px)",
    py: 0.75,
    borderRadius: "8px",
    overflow: "visible",
    boxShadow:
      "0 0 2px 0 rgba(145, 158, 171, 0.24), 0 12px 24px -4px rgba(145, 158, 171, 0.16)",
  },
} as const;

type ChromeIconButtonProps = {
  label: string;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  children: ReactNode;
  testId?: string;
};

export function ChromeIconButton({
  label,
  onClick,
  children,
  testId,
}: ChromeIconButtonProps) {
  return (
    <IconButton
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      sx={{
        width: 40,
        height: 40,
        minWidth: 40,
        padding: 0,
        position: "relative",
        borderRadius: "50%",
        "& svg": { width: 20, height: 20, flexShrink: 0 },
      }}
    >
      {children}
    </IconButton>
  );
}

function ChromeMenu({
  anchor,
  onClose,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      disableAutoFocusItem
      marginThreshold={12}
      slotProps={{ paper: menuPaper }}
      transformOrigin={{ horizontal: "right", vertical: "top" }}
      anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
    >
      {children}
    </Menu>
  );
}

function ChromeMenuItem({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <MenuItem
      selected={selected}
      onClick={onClick}
      sx={{
        mx: 0.75,
        my: 0.25,
        px: 1.5,
        borderRadius: "8px",
        minHeight: 40,
        fontSize: 14,
        fontWeight: selected ? 700 : 500,
      }}
    >
      {children}
    </MenuItem>
  );
}

export function LanguageMenu() {
  const { i18n, t } = useTranslation();
  const accountContext = useOptionalAccount();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <ChromeIconButton
        label={t("navigation.language", "Language")}
        onClick={(event) => {
          void preloadUiLocales();
          setAnchor(event.currentTarget);
        }}
      >
        <Translate />
      </ChromeIconButton>
      <ChromeMenu anchor={anchor} onClose={() => setAnchor(null)}>
        {languages.map((lang) => (
          <ChromeMenuItem
            key={lang.code}
            selected={i18n.language === lang.code}
            onClick={() => {
              void changeUiLanguage(lang.code);
              if (accountContext?.account?.logged_in) {
                void accountContext
                  .updatePreferences({ language: lang.code })
                  .catch((error) => {
                    console.warn("Failed to save language preference:", error);
                  });
              }
              setAnchor(null);
            }}
          >
            {lang.name}
          </ChromeMenuItem>
        ))}
      </ChromeMenu>
    </>
  );
}

function AutoThemeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      data-testid="AutoThemeIcon"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 16.5 12 7.5l4 9" />
      <path d="M9.4 13.4h5.2" />
    </svg>
  );
}

export function AppearanceSegment() {
  const { t } = useTranslation();
  const { appearance, setAppearance } = useContext(ThemeContext);
  const resolved = useSystemTheme(appearance);

  return (
    <div className="remote-theme-segment" role="group" aria-label={t("terminal.session.appearance")}>
      <button
        type="button"
        className={resolved === "light" ? "is-active" : undefined}
        aria-label={t("theme.light", "浅色")}
        aria-pressed={resolved === "light"}
        onClick={() => setAppearance("light")}
      >
        <Sun />
      </button>
      <button
        type="button"
        className={resolved === "dark" ? "is-active" : undefined}
        aria-label={t("theme.dark", "深色")}
        aria-pressed={resolved === "dark"}
        onClick={() => setAppearance("dark")}
      >
        <Moon />
      </button>
    </div>
  );
}

export function ThemeMenu({
  trigger = "icon",
}: {
  trigger?: "icon" | "label";
} = {}) {
  const { t } = useTranslation();
  const { appearance, setAppearance } = useContext(ThemeContext);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const options: Array<{
    value: "light" | "dark" | "system";
    label: string;
    icon: ComponentType<{ className?: string }>;
  }> = [
    { value: "light", label: t("theme.light", "浅色"), icon: Sun },
    { value: "dark", label: t("theme.dark", "深色"), icon: Moon },
    { value: "system", label: t("theme.system", "跟随系统"), icon: AutoThemeIcon },
  ];

  const openMenu = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);

  return (
    <>
      {trigger === "label" ? (
        <button
          type="button"
          className="remote-theme-label"
          aria-label={t("changeTheme", "切换外观")}
          onClick={openMenu}
        >
          {t("terminal.session.appearance")}
        </button>
      ) : (
        <ChromeIconButton
          label={t("changeTheme", "切换外观")}
          onClick={openMenu}
        >
          <Sun className="size-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </ChromeIconButton>
      )}
      <ChromeMenu anchor={anchor} onClose={() => setAnchor(null)}>
        {options.map((option) => {
          const Icon = option.icon;
          const selected = appearance === option.value;
          return (
            <ChromeMenuItem
              key={option.value}
              selected={selected}
              onClick={() => {
                setAppearance(option.value);
                setAnchor(null);
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>
                <Icon className="size-4" />
              </ListItemIcon>
              <ListItemText
                sx={{
                  my: 0,
                  "& .MuiListItemText-primary": {
                    fontSize: "inherit",
                    fontWeight: "inherit",
                  },
                }}
              >
                {option.label}
              </ListItemText>
              {selected ? (
                <ListItemIcon sx={{ minWidth: 0, ml: 2, color: "inherit" }}>
                  <Check className="size-4" />
                </ListItemIcon>
              ) : null}
            </ChromeMenuItem>
          );
        })}
      </ChromeMenu>
    </>
  );
}
