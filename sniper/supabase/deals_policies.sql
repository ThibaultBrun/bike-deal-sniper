Use options above to edit


alter policy "deals_select_one_only"


on "public"."deals"


to anon


using (

  ((COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-deal-token'::text), ''::text) <> ''::text) AND (token = ((current_setting('request.headers'::text, true))::json ->> 'x-deal-token'::text)))

);


