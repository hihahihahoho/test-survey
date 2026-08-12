import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import type { LibrarySettings } from "../types/api";
import type { LibraryItem } from "../types/api";
import { qk } from "./keys";

export function useUserLibrary() {
  return useQuery({ queryKey: qk.library(), queryFn: () => api.library.get(), staleTime: 10_000 });
}

export function useAddLibraryItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.library.add,
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.library() }),
  });
}

export function usePatchLibraryItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; description?: string; group?: string; poses?: string[]; cell?: string; skel?: Record<string, unknown> }) => api.library.patch(id, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.library() }),
  });
}

export function useRemoveLibraryItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.library.remove,
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.library() }),
  });
}

export function usePatchLibrarySettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<LibrarySettings>) => api.library.patchSettings(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.library() }),
  });
}

export function useLibraryImage(id: string | null) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!id) return;
    let alive = true;
    let objectUrl: string | null = null;
    api.library.blob(id).then((blob) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => setUrl(null));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url;
}

/** Đưa một ảnh dùng chung vào luồng upload ref của dự án mà không lộ đường dẫn đĩa. */
export function useLibraryFile() {
  return useMutation({
    mutationFn: async (item: LibraryItem) => {
      const blob = await api.library.blob(item.id);
      return new File([blob], item.filename, { type: blob.type || "image/png" });
    },
  });
}

export function useAddBrandProfile() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.library.addBrand, onSuccess: () => void client.invalidateQueries({ queryKey: qk.library() }) });
}
export function usePatchBrandProfile() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: { id: string; name?: string; description?: string; colors?: string[]; assetIds?: string[] }) => api.library.patchBrand(id, input), onSuccess: () => void client.invalidateQueries({ queryKey: qk.library() }) });
}
export function useRemoveBrandProfile() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.library.removeBrand, onSuccess: () => void client.invalidateQueries({ queryKey: qk.library() }) });
}
