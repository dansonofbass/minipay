-- Durable events are written by triggers in the same transaction as their authoritative record.
CREATE TABLE bnpl."OperationEvent" (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 type text NOT NULL, severity text NOT NULL CHECK (severity IN ('DEBUG','INFO','WARN','ERROR','CRITICAL')),
 service text NOT NULL, "correlationId" text NOT NULL, "operationId" text NOT NULL,
 "actorId" text, "customerId" text, "purchaseId" text, "paymentId" text,
 "requestId" text, "traceId" text, status text, metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE bank."OperationEvent" (LIKE bnpl."OperationEvent" INCLUDING ALL);
CREATE TABLE bnpl."TechnicalLog" (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 type text NOT NULL, severity text NOT NULL, "correlationId" text NOT NULL,
 "requestId" text, "traceId" text, code text, metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE bank."TechnicalLog" (LIKE bnpl."TechnicalLog" INCLUDING ALL);
CREATE TABLE bnpl."ErrorReview" (
 id text PRIMARY KEY, status text NOT NULL CHECK (status IN ('ACKNOWLEDGED','RESOLVED')),
 note text NOT NULL CHECK (length(note) BETWEEN 4 AND 1000), actor text NOT NULL,
 "updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON bnpl."OperationEvent" ("correlationId", "createdAt", id);
CREATE INDEX ON bnpl."OperationEvent" ("operationId", "createdAt");
CREATE INDEX ON bnpl."OperationEvent" ("purchaseId", "createdAt");
CREATE INDEX ON bnpl."OperationEvent" (type, "createdAt");
CREATE INDEX ON bnpl."OperationEvent" (severity, "createdAt");
CREATE INDEX ON bnpl."OperationEvent" ("actorId", "createdAt");
CREATE INDEX ON bnpl."OperationEvent" ("createdAt", id);
CREATE INDEX ON bank."OperationEvent" ("correlationId", "createdAt", id);
CREATE INDEX ON bank."OperationEvent" ("operationId", "createdAt");
CREATE INDEX ON bank."OperationEvent" ("createdAt", id);
CREATE INDEX ON bnpl."TechnicalLog" ("createdAt", id);
CREATE INDEX ON bank."TechnicalLog" ("createdAt", id);
CREATE INDEX ON bnpl."TechnicalLog" ("correlationId", "createdAt");
CREATE INDEX ON bank."TechnicalLog" ("correlationId", "createdAt");
CREATE INDEX ON bnpl."TechnicalLog" (code, "createdAt");
CREATE INDEX ON bank."TechnicalLog" (code, "createdAt");

CREATE FUNCTION bnpl.capture_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE d jsonb := to_jsonb(NEW); previous jsonb := '{}'; op text; purchase text; payment text; customer text; actor text; state text; event_type text; level text := 'INFO'; meta jsonb := '{}'; correlation text;
BEGIN
 IF TG_OP='UPDATE' THEN previous := to_jsonb(OLD); END IF;
 op := COALESCE(d->>'reference',d->>'operationId',d->>'jobId',d->>'id');
 state := COALESCE(d->>'status',TG_OP);
 event_type := TG_TABLE_NAME || '_' || CASE WHEN TG_OP='INSERT' THEN 'CREATED' ELSE state END;
 actor := COALESCE(d->>'actor',NULLIF(current_setting('crediflow.actor',true),''));
 IF TG_TABLE_NAME='Purchase' THEN purchase:=d->>'id'; customer:=d->>'customerId'; END IF;
 IF TG_TABLE_NAME='Payment' THEN payment:=d->>'id'; SELECT i."purchaseId" INTO purchase FROM bnpl."Installment" i WHERE i.id=d->>'installmentId'; END IF;
 IF TG_TABLE_NAME='Installment' THEN purchase:=d->>'purchaseId'; END IF;
 IF TG_TABLE_NAME='Audit' THEN event_type:=d->>'action'; purchase:=d->>'reference'; payment:=d->'detail'->>'paymentId'; END IF;
 IF TG_TABLE_NAME='Inbox' THEN op:=d->'payload'->>'operationId'; event_type:=CASE WHEN TG_OP='INSERT' THEN 'WEBHOOK_ACCEPTED' WHEN NEW."deliveries">OLD."deliveries" THEN 'DUPLICATE_WEBHOOK_DETECTED' ELSE 'WEBHOOK_PROCESSED' END; meta:=jsonb_build_object('webhookEventId',d->>'id','verification','VERIFIED','deliveries',d->'deliveries'); END IF;
 IF TG_TABLE_NAME='Job' THEN op:=d->>'reference'; meta:=jsonb_build_object('jobId',d->>'id','attempt',d->'attempts','retryPolicy','8 automatic attempts; exponential backoff and jitter'); END IF;
 IF TG_TABLE_NAME='JobAttempt' THEN SELECT j.reference INTO op FROM bnpl."Job" j WHERE j.id=d->>'jobId'; meta:=jsonb_build_object('jobId',d->>'jobId','attempt',d->'attempt','result',state); END IF;
 IF TG_TABLE_NAME='Journal' THEN event_type:='LEDGER_POSTING_CREATED'; END IF;
 IF purchase IS NULL THEN
   SELECT i."purchaseId",p.id INTO purchase,payment FROM bnpl."Payment" p JOIN bnpl."Installment" i ON i.id=p."installmentId" WHERE p.id=op;
 END IF;
 IF purchase IS NULL AND op LIKE 'approve:%' THEN purchase:=substring(op FROM 9); END IF;
 IF purchase IS NULL AND EXISTS (SELECT 1 FROM bnpl."Purchase" p WHERE p.id=op) THEN purchase:=op; END IF;
 IF purchase IS NOT NULL THEN SELECT p."customerId" INTO customer FROM bnpl."Purchase" p WHERE p.id=purchase; END IF;
 IF state IN ('RETRY','PENDING_RECONCILIATION','INTERRUPTED') THEN level:='WARN'; END IF;
 IF state IN ('DEAD','FAILED') AND TG_TABLE_NAME IN ('Job','JobAttempt') THEN level:='ERROR'; END IF;
 IF TG_TABLE_NAME='Reconciliation' AND state='NEEDS_REVIEW' THEN level:='CRITICAL'; END IF;
 IF TG_OP='UPDATE' AND previous->>'status' IS NOT DISTINCT FROM d->>'status' AND TG_TABLE_NAME NOT IN ('Inbox','Job','Installment') THEN RETURN NEW; END IF;
 correlation:=COALESCE(purchase,op,NULLIF(current_setting('crediflow.correlation',true),''));
 INSERT INTO bnpl."OperationEvent" (type,severity,service,"correlationId","operationId","actorId","customerId","purchaseId","paymentId","requestId","traceId",status,metadata)
 VALUES(event_type,level,'bnpl',correlation,op,actor,customer,purchase,payment,NULLIF(current_setting('crediflow.request',true),''),NULLIF(current_setting('crediflow.trace',true),''),state,meta || jsonb_build_object('previousStatus',previous->>'status','status',state));
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Purchase','Payment','Installment','Audit','Inbox','Job','JobAttempt','Journal','Reconciliation'] LOOP
 EXECUTE format('CREATE TRIGGER operation_event AFTER INSERT OR UPDATE ON bnpl.%I FOR EACH ROW EXECUTE FUNCTION bnpl.capture_operation()',t);
 END LOOP;
END $$;

CREATE TABLE bank."Audit" (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, actor text NOT NULL, action text NOT NULL, reference text NOT NULL, detail jsonb, "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX ON bank."Audit" (reference,"createdAt");
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON bank."Audit" FOR EACH ROW EXECUTE FUNCTION bank.reject_mutation();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crediflow_bank') THEN
 GRANT SELECT,INSERT ON bank."Audit" TO crediflow_bank;
END IF; END $$;
CREATE FUNCTION bank.capture_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE d jsonb:=to_jsonb(NEW); old_data jsonb:='{}'; op text; correlation text; state text; meta jsonb:='{}'; event_type text; level text:='INFO';
BEGIN
 IF TG_OP='UPDATE' THEN old_data:=to_jsonb(OLD); END IF;
 op:=COALESCE(d->>'operationId',d->>'reference',d->>'eventId',d->>'id');
 state:=COALESCE(d->>'status',TG_OP);
 event_type:=TG_TABLE_NAME || '_' || CASE WHEN TG_OP='INSERT' THEN 'CREATED' ELSE state END;
 IF TG_TABLE_NAME='Delivery' THEN SELECT e."operationId" INTO op FROM bank."BankEvent" e WHERE e.id=d->>'eventId'; meta:=jsonb_build_object('webhookEventId',d->>'eventId','httpStatus',d->'status'); IF (d->>'status')::int NOT BETWEEN 200 AND 299 THEN level:='ERROR'; END IF; END IF;
 IF TG_TABLE_NAME='SimulationLog' THEN meta:=jsonb_build_object('scenario',d->'scenario','configVersion',d->'configVersion','latencyMs',d->'latencyMs','durationMs',d->'durationMs','httpStatus',d->'httpStatus','committed',EXISTS(SELECT 1 FROM bank."BankOperation" b WHERE b.id=op)); IF (d->>'httpStatus')::int>=500 THEN level:='ERROR'; END IF; END IF;
 IF TG_TABLE_NAME='Audit' THEN event_type:=d->>'action'; END IF;
 IF TG_TABLE_NAME='Simulator' THEN op:='configuration'; meta:=jsonb_build_object('previousVersion',old_data->'version','version',d->'version','before',old_data->'config','after',d->'config'); END IF;
 correlation:=COALESCE(NULLIF(current_setting('crediflow.correlation',true),''),NULLIF(d->>'correlationId',''),op);
 INSERT INTO bank."OperationEvent"(type,severity,service,"correlationId","operationId","actorId","requestId","traceId",status,metadata)
 VALUES(event_type,level,'bank',correlation,op,COALESCE(d->>'actor',NULLIF(current_setting('crediflow.actor',true),'')),NULLIF(current_setting('crediflow.request',true),''),NULLIF(current_setting('crediflow.trace',true),''),state,meta);
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Audit','BankOperation','Reservation','BankEvent','Delivery','BankJournal','SimulationLog','Simulator'] LOOP
 EXECUTE format('CREATE TRIGGER operation_event AFTER INSERT OR UPDATE ON bank.%I FOR EACH ROW EXECUTE FUNCTION bank.capture_operation()',t);
 END LOOP;
END $$;
CREATE TRIGGER immutable_event BEFORE UPDATE OR DELETE ON bnpl."OperationEvent" FOR EACH ROW EXECUTE FUNCTION bnpl.reject_mutation();
CREATE TRIGGER immutable_event BEFORE UPDATE OR DELETE ON bank."OperationEvent" FOR EACH ROW EXECUTE FUNCTION bank.reject_mutation();
REVOKE ALL ON FUNCTION bnpl.capture_operation(), bank.capture_operation() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crediflow_bnpl') THEN
 GRANT SELECT ON bnpl."OperationEvent" TO crediflow_bnpl;
 GRANT SELECT,INSERT,DELETE ON bnpl."TechnicalLog" TO crediflow_bnpl;
 GRANT SELECT,INSERT,UPDATE ON bnpl."ErrorReview" TO crediflow_bnpl;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crediflow_bank') THEN
 GRANT SELECT ON bank."OperationEvent" TO crediflow_bank;
 GRANT SELECT,INSERT,DELETE ON bank."TechnicalLog" TO crediflow_bank;
 END IF;
END $$;
