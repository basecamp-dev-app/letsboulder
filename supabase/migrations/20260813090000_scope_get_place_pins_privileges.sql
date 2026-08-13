ALTER FUNCTION public.get_place_pins(boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_place_pins(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_place_pins(boolean) TO anon, authenticated, service_role;
