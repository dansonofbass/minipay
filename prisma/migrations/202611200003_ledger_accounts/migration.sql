CREATE TABLE bnpl."LedgerAccount" (code TEXT PRIMARY KEY);
CREATE TABLE bank."BankLedgerAccount" (code TEXT PRIMARY KEY);
INSERT INTO bnpl."LedgerAccount" SELECT DISTINCT account FROM bnpl."Entry";
INSERT INTO bank."BankLedgerAccount" SELECT DISTINCT account FROM bank."BankEntry";
ALTER TABLE bnpl."Entry" ADD CONSTRAINT ledger_account_fk FOREIGN KEY (account) REFERENCES bnpl."LedgerAccount"(code);
ALTER TABLE bank."BankEntry" ADD CONSTRAINT bank_ledger_account_fk FOREIGN KEY (account) REFERENCES bank."BankLedgerAccount"(code);
ALTER TABLE bnpl."Entry" ADD CONSTRAINT ledger_account_allowed CHECK (account IN ('CUSTOMER_RECEIVABLE','MERCHANT_PAYABLE','PROVIDER_FUNDING','BANK_CASH'));
ALTER TABLE bank."BankEntry" ADD CONSTRAINT bank_ledger_account_allowed CHECK (account IN ('LOAN_RECEIVABLE','PROVIDER_FUNDING','BNPL_CLEARING','SIMULATED_TREASURY') OR account LIKE 'CUSTOMER_DEPOSITS:%');
ALTER TABLE bnpl."Installment" ADD CONSTRAINT paid_timestamp_valid CHECK ((status = 'PAID') = ("paidAt" IS NOT NULL));
ALTER TABLE bnpl."Payment" ADD CONSTRAINT payment_status_valid CHECK (status IN ('PENDING','PENDING_RECONCILIATION','SUCCEEDED','DECLINED'));
ALTER TABLE bank."BankOperation" ADD CONSTRAINT bank_operation_status_valid CHECK (status IN ('SUCCEEDED','DECLINED'));

CREATE FUNCTION bnpl.reject_late_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE created_in text;
BEGIN
 SELECT xmin::text INTO created_in FROM bnpl."Journal" WHERE id=NEW."journalId";
 IF created_in IS DISTINCT FROM pg_current_xact_id()::text THEN RAISE EXCEPTION 'Cannot append entries to a posted journal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER no_late_entry BEFORE INSERT ON bnpl."Entry" FOR EACH ROW EXECUTE FUNCTION bnpl.reject_late_entry();
CREATE FUNCTION bank.reject_late_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE created_in text;
BEGIN
 SELECT xmin::text INTO created_in FROM bank."BankJournal" WHERE id=NEW."journalId";
 IF created_in IS DISTINCT FROM pg_current_xact_id()::text THEN RAISE EXCEPTION 'Cannot append entries to a posted bank journal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER no_late_entry BEFORE INSERT ON bank."BankEntry" FOR EACH ROW EXECUTE FUNCTION bank.reject_late_entry();

CREATE FUNCTION bank.validate_credit_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; actual_used bigint; actual_reserved bigint; stored_used bigint; stored_reserved bigint;
BEGIN
 IF TG_TABLE_NAME = 'BankAccount' THEN target:=NEW.id; ELSE target:=NEW."accountId"; END IF;
 SELECT used,reserved INTO stored_used,stored_reserved FROM bank."BankAccount" WHERE id=target;
 SELECT COALESCE(SUM(CASE WHEN status='COMMITTED' THEN outstanding ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='RESERVED' THEN amount ELSE 0 END),0)
 INTO actual_used,actual_reserved FROM bank."Reservation" WHERE "accountId"=target;
 IF stored_used<>actual_used OR stored_reserved<>actual_reserved THEN RAISE EXCEPTION 'Credit totals do not match reservations'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER credit_totals AFTER INSERT OR UPDATE ON bank."BankAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bank.validate_credit_totals();
CREATE CONSTRAINT TRIGGER reservation_totals AFTER INSERT OR UPDATE ON bank."Reservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bank.validate_credit_totals();
