create table public.purchases (
  id uuid not null default gen_random_uuid (),
  vendor text not null default 'RCZ Bike Shop'::text,
  source text not null default 'email'::text,
  order_number text not null,
  order_date date not null,
  items_text text not null,
  subtotal numeric null,
  discount numeric null,
  vat numeric null,
  shipping numeric null,
  grand_total numeric null,
  created_at timestamp with time zone not null default now(),
  created_by uuid not null default auth.uid (),
  resale_price numeric null,
  personal_use boolean null,
  resale_date date null,
  expected_resale_price numeric null,
  constraint purchases_pkey primary key (id)
) TABLESPACE pg_default;

create unique INDEX IF not exists purchases_vendor_order_number_uq on public.purchases using btree (vendor, order_number) TABLESPACE pg_default;

create index IF not exists purchases_order_date_idx on public.purchases using btree (order_date) TABLESPACE pg_default;

create index IF not exists purchases_created_by_idx on public.purchases using btree (created_by) TABLESPACE pg_default;