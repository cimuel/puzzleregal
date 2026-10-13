import { supabase } from './supabase'
import { friendlyError } from './errors'

/** Ruft eine Datenbankfunktion auf. Fehler werden als verständlicher Text geworfen. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

export type Scope = 'solo' | 'team' | 'all'
export type AttemptKind = 'official' | 'training'

export interface PuzzleListRow {
  puzzle_id: string; title: string; brand: string | null; product_no: string | null; piece_count: number
  image_path: string | null; difficulty: number | null; copies_count: number; solvers_count: number; best_seconds: number | null
}
export interface Puzzle {
  id: string; title: string; brand: string | null; product_no: string | null; piece_count: number
  image_path: string | null; difficulty: number | null; notes: string | null; created_by: string
}
export interface LeaderRow {
  rank: number; profile_id: string; display_name: string; best_seconds: number
  pieces_per_minute: string; best_date: string; attempts_count: number
}
export interface TeamLeaderRow {
  rank: number; team_names: string; best_seconds: number; pieces_per_minute: string; best_date: string; attempts_count: number
}
export interface AttemptRow {
  attempt_id: string; solved_on: string; duration_seconds: number; kind: AttemptKind; team_size: number
  participant_names: string; participant_ids: string[]; created_by: string; notes: string | null; round_id: string | null
}
export interface SummaryRow {
  attempts_count: number; distinct_puzzles: number; avg_seconds: number | null; avg_pieces: number | null
  total_pieces: number | null; total_seconds: number | null; avg_speed_ppm: string | null; best_attempt_ppm: string | null
}
export interface PuzzleBestRow {
  puzzle_id: string; title: string; brand: string | null; piece_count: number; image_path: string | null
  best_seconds: number; best_date: string; attempts_count: number; best_ppm: string
  rank: number | null; members_count: number | null; fastest_seconds: number | null
}
export interface PlayerAttemptRow {
  attempt_id: string; solved_on: string; duration_seconds: number; piece_count: number
  puzzle_id: string; title: string; kind: AttemptKind; team_size: number; ppm: string
}
export interface ShelfRow {
  copy_id: string; puzzle_id: string; title: string; brand: string | null; product_no: string | null
  piece_count: number; image_path: string | null; owner_id: string; owner_name: string
  holder_id: string; holder_name: string; is_on_loan: boolean; is_lendable: boolean
  best_seconds: number | null; attempts_count: number
}
export interface MemberRow {
  profile_id: string; display_name: string; copies_owned: number; copies_held: number
  solved_puzzles: number; attempts_count: number
}
export interface SimilarRow {
  puzzle_id: string; title: string; brand: string | null; product_no: string | null
  piece_count: number; image_path: string | null; reason: 'same_product_no' | 'similar_title'; score: number
}
