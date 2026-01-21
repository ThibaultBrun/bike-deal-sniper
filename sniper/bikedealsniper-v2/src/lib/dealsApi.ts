import { supabase } from "./supabase";
import { mapDealRowToUi } from '@/lib/mappers/dealMapper'
import type { DealRow } from '@/lib/types/DealRow'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ⚠️ Mets ici tes vrais noms (exactement comme l’ancienne version)
const TABLE_NAME = "deals"; // <- à confirmer si différent
const TOKEN_HEADER_NAME = "x-deal-token"; // <- à mettre EXACTEMENT comme avant

export async function getDealFullByTokenHeader(token: string) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*`;

  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      [TOKEN_HEADER_NAME]: token,
    },
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`REST getDeal failed: ${r.status} ${r.statusText} ${txt}`);
  }

  const json = await r.json();
  if (!Array.isArray(json) || json.length < 1) return null;
  return json[0] as DealRow;
}

export async function getDealsSameCoupon(token: string) {
  const { data, error } = await supabase.rpc("get_deals_public_same_coupon", {
    p_token: token,
  });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function getAllDealsPublic() {
  const { data, error } = await supabase.rpc("get_all_deals_public");
  if (error) throw error;
  return (data ?? []) as any[];
}
