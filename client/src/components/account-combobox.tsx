import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface AccountOption {
  id: number;
  code: string;
  name?: string;
  nameTh?: string;
  isHeader?: boolean;
}

interface AccountComboboxProps {
  accounts: AccountOption[];
  value?: string | number;
  onSelect: (acc: AccountOption) => void;
  testId?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  topOption?: { value: string; label: string };
  className?: string;
  label?: string;
}

export function AccountCombobox({
  accounts,
  value,
  onSelect,
  testId,
  placeholder = "พิมพ์เพื่อค้นหาบัญชี...",
  disabled = false,
  size = "default",
  topOption,
  className,
  label,
}: AccountComboboxProps) {
  const [open, setOpen] = useState(false);
  const { acctName } = useLanguage();

  const sorted = [...accounts]
    .filter((a) => !a.isHeader)
    .sort((a, b) => a.code.localeCompare(b.code));

  const selected =
    typeof value === "number"
      ? accounts.find((a) => a.id === value)
      : typeof value === "string" && value !== "" && value !== topOption?.value
      ? accounts.find((a) => a.code === value)
      : undefined;

  const isTopOption = topOption !== undefined && value === topOption.value;

  const displayText = isTopOption
    ? topOption.label
    : selected
    ? `${selected.code} - ${acctName(selected)}`
    : placeholder;

  const isValueSelected = isTopOption || !!selected;

  const popover = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          data-testid={testId}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between rounded-md border border-input bg-background ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            size === "sm"
              ? "h-8 px-2 py-1 text-xs"
              : "h-9 px-3 py-2 text-sm",
            !isValueSelected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="ค้นหารหัสหรือชื่อบัญชี..."
            className="h-8 text-xs"
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              ไม่พบบัญชี
            </CommandEmpty>
            <CommandGroup className="max-h-[240px] overflow-auto">
              {topOption && (
                <CommandItem
                  key={`__top__${topOption.value}`}
                  value={`__top__ ${topOption.label}`}
                  onSelect={() => {
                    onSelect({
                      id: -1,
                      code: topOption.value,
                      name: topOption.label,
                      nameTh: topOption.label,
                    });
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-1.5 h-3 w-3",
                      isTopOption ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="text-slate-600">{topOption.label}</span>
                </CommandItem>
              )}
              {sorted.map((acc) => {
                const isSelected =
                  typeof value === "number"
                    ? acc.id === value
                    : acc.code === value;
                return (
                  <CommandItem
                    key={acc.id}
                    value={`${acc.code} ${acctName(acc)}`}
                    onSelect={() => {
                      onSelect(acc);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-1.5 h-3 w-3",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {acc.code}
                    </span>
                    <span className="ml-1.5 text-slate-500 dark:text-slate-400">
                      {acctName(acc)}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  if (label) {
    return (
      <div>
        <Label className="mb-1 block">{label}</Label>
        {popover}
      </div>
    );
  }
  return popover;
}
