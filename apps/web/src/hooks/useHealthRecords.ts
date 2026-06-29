import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createHealthRecord, deleteHealthRecord, listHealthRecords } from '../api/health';

export function useHealthRecords() {
  const queryClient = useQueryClient();
  const records = useQuery({ queryKey: ['health-records'], queryFn: () => listHealthRecords() });
  const create = useMutation({
    mutationFn: createHealthRecord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health-records'] }),
  });
  const remove = useMutation({
    mutationFn: deleteHealthRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-records'] });
      queryClient.invalidateQueries({ queryKey: ['snapshot-latest'] });
    },
  });

  return { records, create, remove };
}
