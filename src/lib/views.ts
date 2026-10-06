import type { Database } from '@/lib/database.types'

// Postgres reports every view column as nullable. These are the real shapes of the staff-only views
// (see migration 20261006000008_field_security.sql): key columns are never null.
type View<N extends keyof Database['public']['Views']> = Database['public']['Views'][N]['Row']
type Required<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> }

export type DirectoryRow = Required<View<'directory'>, 'id' | 'full_name' | 'email' | 'kind' | 'can_view_invoices' | 'created_at'>
export type CustomerInternalRow = Required<View<'customers_internal'>, 'id' | 'name' | 'org_id' | 'created_at'>
export type ProjectInternalRow = Required<View<'projects_internal'>, 'id' | 'customer_id'>

