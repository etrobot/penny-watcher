import { useQuery } from '@tanstack/react-query'
import { fetchData } from './data'

export function useData() {
  return useQuery({ queryKey: ['penny-watcher-data'], queryFn: fetchData, staleTime: Infinity })
}
