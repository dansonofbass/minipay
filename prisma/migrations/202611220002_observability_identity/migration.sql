CREATE FUNCTION bnpl.capture_identity_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor text; action text;
BEGIN
 IF TG_TABLE_NAME='User' THEN actor:=NEW.id; action:='USER_REGISTERED'; ELSE actor:=NEW."userId"; SELECT CASE WHEN u.role IN ('BNPL_ADMIN','BANK_ADMIN') THEN 'ADMIN_LOGGED_IN' ELSE 'USER_LOGGED_IN' END INTO action FROM identity."User" u WHERE u.id=actor; END IF;
 INSERT INTO bnpl."Audit" (id,actor,action,reference) VALUES (gen_random_uuid()::text,actor,action,actor);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION bnpl.capture_identity_event() FROM PUBLIC;
CREATE TRIGGER identity_observed AFTER INSERT ON identity."User" FOR EACH ROW EXECUTE FUNCTION bnpl.capture_identity_event();
CREATE TRIGGER login_observed AFTER INSERT ON identity."Session" FOR EACH ROW EXECUTE FUNCTION bnpl.capture_identity_event();
