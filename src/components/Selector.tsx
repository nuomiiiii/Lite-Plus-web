import React from "react";
import { TextField } from "@/components/admin/ui";
import { Search } from "@/components/admin/muiIcons";
import { useTranslation } from "react-i18next";
import { Checkbox } from "./ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

/**
 * 通用多选列表组件：提供搜索、全选、半选（indeterminate）和孤立值渲染能力。
 * 通过传入任意 items，并提供 getId / getLabel 来定义唯一标识与显示内容。
 */
export interface SelectorProps<T> {
  className?: string;
  hiddenDescription?: boolean;
  /** 已选择的 id 列表 */
  value: string[];
  /** 选择变化回调 */
  onChange: (ids: string[]) => void;
  /** 数据源 */
  items: T[];
  /** 获取唯一 id */
  getId: (item: T) => string;
  /** 获取显示标签（单元格内容） */
  getLabel: (item: T) => React.ReactNode;
  /** 自定义排序（可选） */
  sortItems?: (a: T, b: T) => number;
  /** 自定义搜索过滤；返回 true 表示保留 */
  filterItem?: (item: T, keyword: string) => boolean;
  /** 搜索占位符 */
  searchPlaceholder?: string;
  /** 表头标题（第二列） */
  headerLabel?: React.ReactNode;
  /** 是否在标题行显示全选框 */
  showHeaderSelectAll?: boolean;
  /** 最多可选数量；达到上限后不能再勾选新项 */
  maxCount?: number;
  /** 试图超过上限时回调 */
  onMaxReached?: () => void;
}

function SelectorInner<T>(props: SelectorProps<T>) {
  const {
    className = "",
    hiddenDescription = false,
    value: externalValue,
    onChange,
    items,
    getId,
    getLabel,
    sortItems,
    filterItem,
    searchPlaceholder,
    headerLabel,
    showHeaderSelectAll = true,
    maxCount,
    onMaxReached,
  } = props;
  const { t } = useTranslation();

  const value = externalValue ?? [];
  const [search, setSearch] = React.useState("");

  // 排序 & 搜索
  const processed = React.useMemo(() => {
    let arr = [...items];
    if (sortItems) arr.sort(sortItems);
    if (search.trim()) {
      const kw = search.toLowerCase();
      arr = arr.filter((it) =>
        filterItem
          ? filterItem(it, search)
          : String(getLabel(it)).toLowerCase().includes(kw)
      );
    }
    return arr;
  }, [items, sortItems, filterItem, search, getLabel]);

  const allIds = processed.map(getId);

  // 半选逻辑
  const allChecked =
    allIds.length > 0 && allIds.every((id) => value.includes(id));
  const isIndeterminate =
    value.length > 0 && value.some((id) => allIds.includes(id)) && !allChecked;
  const checkAllState = allChecked ? true : isIndeterminate ? "indeterminate" : false;

  // 孤立（value 中但 items 不再存在）
  const orphanIds = value.filter((id) => !items.some((it) => getId(it) === id));

  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("common.search");
  const resolvedHeaderLabel = headerLabel ?? t("common.content");

  const handleCheckAll = (checked: boolean) => {
    if (maxCount && maxCount > 0) return;
    if (checked) {
      onChange(Array.from(new Set([...value, ...allIds])));
    } else {
      onChange(value.filter((id) => !allIds.includes(id)));
    }
  };

  const handleCheck = (id: string, checked: boolean) => {
    if (checked) {
      if (value.includes(id)) return;
      if (maxCount && maxCount > 0 && value.length >= maxCount) {
        onMaxReached?.();
        return;
      }
      onChange([...value, id]);
      return;
    }
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="km-search-before-content">
        <TextField.Root
          className="flex items-center gap-1"
          placeholder={resolvedSearchPlaceholder}
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearch(e.target.value)
          }
        >
          <TextField.Slot>
            <Search size="16" />
          </TextField.Slot>
        </TextField.Root>
      </div>
      <div className="selector overflow-hidden rounded-md border border-[var(--gray-a5)]">
        <Table container={false}>
          <TableHeader>
            <TableRow>
              <TableHead>
                {showHeaderSelectAll && !maxCount ? (
                  <Checkbox
                    checked={checkAllState}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(checked) => handleCheckAll(checked === true)}
                    aria-label={t("common.select_all")}
                  />
                ) : null}
              </TableHead>
              <TableHead>{resolvedHeaderLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.map((it) => {
              const id = getId(it);
              return (
                <TableRow
                  key={id}
                  onClick={() => {
                    handleCheck(id, !value.includes(id));
                  }}
                >
                  <TableCell>
                    <Checkbox
                      checked={value.includes(id)}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={(checked) => handleCheck(id, checked === true)}
                      aria-label={`${t("common.select")} ${id}`}
                    />
                  </TableCell>
                  <TableCell>{getLabel(it)}</TableCell>
                </TableRow>
              );
            })}
            {orphanIds.map((id) => (
              <TableRow
                key={id}
                onClick={() => {
                  handleCheck(id, !value.includes(id));
                }}
              >
                <TableCell>
                  <Checkbox
                    checked={value.includes(id)}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(checked) => handleCheck(id, checked === true)}
                    aria-label={`${t("common.select")} ${id}`}
                  />
                </TableCell>
                <TableCell>{id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!hiddenDescription && (
        <label className="text-sm text-gray-500">
          {t("common.selected", { count: value.length })}
        </label>
      )}
    </div>
  );
}

/** 泛型组件导出 */
export function Selector<T>(props: SelectorProps<T>) {
  return <SelectorInner {...props} />;
}

export default Selector;
