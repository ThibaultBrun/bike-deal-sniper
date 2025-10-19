create table public.deals (
  title text not null,
  url text not null,
  price_current numeric not null,
  price_original numeric null,
  coupon_code text null,
  category text null,
  item_type text null,
  desc_rcz text null,
  desc_ai text null,
  token text not null,
  is_available boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  id text not null,
  image text null,
  prct_discount numeric null,
  constraint deals_pkey primary key (id),
  constraint deals_duplicate_token_key unique (token)
) TABLESPACE pg_default;

create index IF not exists deals_duplicate_token_idx on public.deals using btree (token) TABLESPACE pg_default;

create index IF not exists deals_duplicate_category_item_type_idx on public.deals using btree (category, item_type) TABLESPACE pg_default;