// src/lib/types/DealRow.ts

export interface DealRow {
  id: string
  token: string

  title: string
  url: string

  price_current: number
  price_original: number | null
  prct_discount: number | null

  coupon_code: string | null

  category: string | null
  item_type: string | null

  desc_rcz: string | null
  desc_ai_fr: string | null
  desc_ai_en: string | null
  desc_ai_es: string | null
  desc_ai_de: string | null
  desc_ai_it: string | null
  desc_ai_ru: string | null
  desc_ai_pt: string | null
  compatible_ai: string | null

  image: string | null

  valid_until: string | null   // Supabase renvoie date en string ISO
  stock_delay: number | null

  is_available: boolean | null
  available: boolean | null

  created_at: string
  updated_at: string
}
