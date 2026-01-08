CREATE POLICY deals_insert_bot_only ON public.deals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = 'XXX-XXX-XXX'::uuid));
CREATE POLICY deals_select_bot ON public.deals AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = 'XXX-XXX-XXX'::uuid));
CREATE POLICY deals_select_one_only ON public.deals AS PERMISSIVE FOR SELECT TO anon USING (((COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-deal-token'::text), ''::text) <> ''::text) AND (token = ((current_setting('request.headers'::text, true))::json ->> 'x-deal-token'::text))));
CREATE POLICY deals_update_bot_only ON public.deals AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = 'xxx-xxxx-xxxx'::uuid)) WITH CHECK ((auth.uid() = 'xxx-xxx-xxx'::uuid));
