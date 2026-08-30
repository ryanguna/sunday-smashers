/**
 * Placeholder database types.
 *
 * The `db-schema` agent owns the real table/enum/view definitions. Once the
 * schema is designed and pushed to a linked Supabase project, regenerate
 * this file with:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 *
 * Until then this is a deliberately loose, permissive stand-in so the
 * `createClient()` factories can be generic over `Database` without any
 * other code needing to change once real types land.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
