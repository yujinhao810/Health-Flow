import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createHealthRecord, deleteHealthRecord, listHealthRecords } from '../api/health';

type UseHealthRecordsOptions = {
  enabled?: boolean;
};

export function useHealthRecords(options: UseHealthRecordsOptions = {}) {
  const queryClient = useQueryClient();
  const records = useQuery({
    queryKey: ['health-records'],
    queryFn: () => listHealthRecords(),
    enabled: options.enabled ?? true,
  });
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
