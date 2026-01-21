import type { DealRow } from '@/lib/types/DealRow'

export interface DealUi {
  id: string
  token: string
  title: string
  url: string
  price: number
  oldPrice?: number
  discountPercent?: number
  coupon_code?: string | null
  category?: string | null
  item_type?: string | null
  imageUrl?: string | null
  desc_rcz?: string | null
  desc_ai_fr?: string | null
  desc_ai_en?: string | null
  desc_ai_es?: string | null
  desc_ai_de?: string | null
  desc_ai_it?: string | null
  desc_ai_ru?: string | null
  desc_ai_pt?: string | null
  compatible_ai?: string | null
  valid_until?: string | null
  stock_delay?: number | null
  available: boolean
  is_available: boolean
  created_at: string
  updated_at: string
}

export function mapDealRowToUi(r: DealRow): DealUi {
  return {
    id: r.id,
    token: r.token,
    title: r.title,
    url: r.url,
    price: Number(r.price_current),
    oldPrice: r.price_original != null ? Number(r.price_original) : undefined,
    discountPercent: r.prct_discount != null ? Number(r.prct_discount) : undefined,
    coupon_code: r.coupon_code,
    category: r.category,
    item_type: r.item_type,
    imageUrl: r.image,
    desc_rcz: r.desc_rcz,
    desc_ai_fr: r.desc_ai_fr,
    desc_ai_en: r.desc_ai_en,
    desc_ai_es: r.desc_ai_es,
    desc_ai_de: r.desc_ai_de,
    desc_ai_it: r.desc_ai_it,
    desc_ai_ru: r.desc_ai_ru,
    desc_ai_pt: r.desc_ai_pt,
    compatible_ai: r.compatible_ai,
    valid_until: r.valid_until,
    stock_delay: r.stock_delay,
    available: r.available ?? true,
    is_available: r.is_available ?? true,
    created_at: r.created_at,
    updated_at: r.updated_at
  }
}
