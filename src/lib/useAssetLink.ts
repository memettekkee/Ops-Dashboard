import { useSearchParams } from "react-router-dom";
import { useCallback } from "react";

export function useAssetLink() {
  const [params, setParams] = useSearchParams();
  return useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      next.set("asset", id);
      setParams(next);
    },
    [params, setParams],
  );
}
