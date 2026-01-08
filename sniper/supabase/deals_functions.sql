CREATE OR REPLACE FUNCTION public.get_all_deals_public()
 RETURNS TABLE(id text, token text, title text, url text, price_current numeric, price_original numeric, prct_discount numeric, image text, category text, item_type text, stock_delay numeric, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$select
    d.id,
    d.token,
    d.title,
    d.url,
    d.price_current,
    d.price_original,
    d.prct_discount,
    d.image,
    d.category,
    d.item_type,
    d.stock_delay,
    d.available
  from public.deals d
  where (d.valid_until is not null and d.valid_until >= current_date)
  order by available desc, updated_at desc, prct_discount desc, title asc
  ;$function$


GRANT EXECUTE ON FUNCTION public.get_all_deals_public() TO "-";
GRANT EXECUTE ON FUNCTION public.get_all_deals_public() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_deals_public() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_deals_public() TO service_role;


CREATE OR REPLACE FUNCTION public.get_top3_deals_public()
 RETURNS TABLE(id text, token text, title text, url text, price_current numeric, price_original numeric, prct_discount numeric, image text, category text, item_type text, stock_delay numeric, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$select
    d.id,
    d.token,
    d.title,
    d.url,
    d.price_current,
    d.price_original,
    d.prct_discount,
    d.image,
    d.category,
    d.item_type,
    d.stock_delay,
    d.available
  from public.deals d
  where (d.valid_until is not null and d.valid_until >= current_date)
   and price_original > 300
  order by d.prct_discount desc nulls last
  limit 5;$function$

GRANT EXECUTE ON FUNCTION public.get_top3_deals_public() TO "-";
GRANT EXECUTE ON FUNCTION public.get_top3_deals_public() TO anon;
GRANT EXECUTE ON FUNCTION public.get_top3_deals_public() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top3_deals_public() TO service_role;

CREATE OR REPLACE FUNCTION public.get_top3_deals_public_stock()
 RETURNS TABLE(id text, token text, title text, url text, price_current numeric, price_original numeric, prct_discount numeric, image text, category text, item_type text, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    d.id,
    d.token,
    d.title,
    d.url,
    d.price_current,
    d.price_original,
    d.prct_discount,
    d.image,
    d.category,
    d.item_type,
    d.available
  from public.deals d
  where (d.valid_until is not null and d.valid_until >= current_date)
   and stock_delay = 0
  order by d.prct_discount desc nulls last
  limit 5;
$function$


GRANT EXECUTE ON FUNCTION public.get_top3_deals_public_stock() TO "-";
GRANT EXECUTE ON FUNCTION public.get_top3_deals_public_stock() TO anon;
GRANT EXECUTE ON FUNCTION public.get_top3_deals_public_stock() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top3_deals_public_stock() TO service_role;