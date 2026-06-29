import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { generateSnapshot, getLatestSnapshot } from '../api/snapshots';

export function useSnapshots() {
  const queryClient = useQueryClient();
  const latest = useQuery({ queryKey: ['snapshot-latest'], queryFn: getLatestSnapshot });
  const generate = useMutation({
    mutationFn: generateSnapshot,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['snapshot-latest'] }),
  });
  return { latest, generate };
}
