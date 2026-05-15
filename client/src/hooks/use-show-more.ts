import { useState, useMemo, useEffect, useRef } from "react";

const PAGE_SIZE = 50;

export function useShowMore<T>(items: T[], pageSize = PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const prevLenRef = useRef(items.length);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize]);

  useEffect(() => {
    if (items.length !== prevLenRef.current) {
      setVisibleCount(pageSize);
      prevLenRef.current = items.length;
    }
  }, [items.length, pageSize]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = items.length > visibleCount;
  const remainingCount = Math.max(0, items.length - visibleCount);
  const totalCount = items.length;

  const showMore = () => setVisibleCount(prev => prev + pageSize);
  const reset = () => setVisibleCount(pageSize);

  return { visibleItems, hasMore, remainingCount, totalCount, showMore, reset };
}
