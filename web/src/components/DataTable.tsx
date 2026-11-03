import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'

/**
 * One sortable / searchable / paginated table for every dataset,
 * built on TanStack Table.
 */
export function DataTable<T extends object>({
  data,
  columns,
  pageSize = 12,
  searchable = false,
  searchPlaceholder = 'Search…',
}: {
  data: T[]
  columns: ColumnDef<T, any>[]
  pageSize?: number
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const cols = useMemo(() => columns, [columns])

  const table = useReactTable({
    data,
    columns: cols,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const pageCount = table.getPageCount()
  const pageIndex = table.getState().pagination.pageIndex

  return (
    <div>
      {searchable && (
        <div className="mb-3 flex items-center gap-3">
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="num w-full max-w-xs rounded-lg border border-[#1b2831] bg-black/40 px-3 py-2 text-sm text-white placeholder:text-[#5d7180] focus:border-emerald-300/50 focus:outline-none"
          />
          <span className="num text-xs text-[#8fa3b0]">
            {table.getFilteredRowModel().rows.length.toLocaleString()} rows
          </span>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-[#1b2831]">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-white/[0.03]">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className={`num px-3 py-2.5 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-[#8fa3b0] uppercase ${
                      h.column.getCanSort() ? 'cursor-pointer select-none hover:text-emerald-200' : ''
                    }`}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' && ' ↑'}
                    {h.column.getIsSorted() === 'desc' && ' ↓'}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-white/[0.04] transition-colors hover:bg-emerald-300/[0.04]">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-8 text-center text-[#8fa3b0]">
                  No rows match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <div className="num text-xs text-[#8fa3b0]">
            Page {pageIndex + 1} / {pageCount}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="num rounded-lg border border-[#1b2831] px-3 py-1.5 text-xs text-white transition hover:border-emerald-300/40 disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="num rounded-lg border border-[#1b2831] px-3 py-1.5 text-xs text-white transition hover:border-emerald-300/40 disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
