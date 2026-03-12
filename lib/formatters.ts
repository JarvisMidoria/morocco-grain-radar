import { formatDistanceToNowStrict, format } from "date-fns";

export function formatEta(isoDate: string) {
  const date = new Date(isoDate);
  return format(date, "dd MMM yyyy, HH:mm");
}

export function formatRelativeTime(isoDate: string) {
  return `${formatDistanceToNowStrict(new Date(isoDate), { addSuffix: true })}`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
