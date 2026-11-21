ALTER TABLE bank."BankAccount" ADD CONSTRAINT bank_balances_valid CHECK (cash >= 0 AND "creditLimit" >= 0 AND used >= 0 AND reserved >= 0 AND used + reserved <= "creditLimit");
ALTER TABLE bank."BankAccount" ADD CONSTRAINT bank_status_valid CHECK (status IN ('ACTIVE','FROZEN'));
ALTER TABLE bank."Reservation" ADD CONSTRAINT reservation_amounts_valid CHECK (amount > 0 AND outstanding >= 0 AND outstanding <= amount);
ALTER TABLE bank."Reservation" ADD CONSTRAINT reservation_status_valid CHECK (status IN ('RESERVED','COMMITTED','RELEASED'));
ALTER TABLE bnpl."Product" ADD CONSTRAINT stock_price_valid CHECK (stock >= 0 AND price > 0);
ALTER TABLE bnpl."Purchase" ADD CONSTRAINT purchase_amount_plan_valid CHECK (total > 0 AND count IN (4,6));
ALTER TABLE bnpl."Purchase" ADD CONSTRAINT purchase_status_valid CHECK (status IN ('PENDING_REVIEW','AWAITING_BANK_CONFIRMATION','APPROVED_AWAITING_PAYMENT','PAYMENT_PENDING','PENDING_RECONCILIATION','ACTIVE','REJECTED','FAILED','CANCELLED'));
ALTER TABLE bnpl."PurchaseItem" ADD CONSTRAINT snapshot_valid CHECK ("unitPrice" > 0 AND quantity > 0);
ALTER TABLE bnpl."Installment" ADD CONSTRAINT installment_amount_valid CHECK (amount > 0 AND number BETWEEN 1 AND 6);
ALTER TABLE bnpl."Payment" ADD CONSTRAINT payment_amount_valid CHECK (amount > 0 AND attempt > 0);
ALTER TABLE identity."User" ADD CONSTRAINT user_role_valid CHECK (role IN ('CUSTOMER','BNPL_ADMIN','BANK_ADMIN'));
ALTER TABLE bank."BankOperation" ADD CONSTRAINT bank_operation_amount_valid CHECK (amount >= 0);
ALTER TABLE bnpl."Entry" ADD CONSTRAINT entry_valid CHECK (debit >= 0 AND credit >= 0 AND ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)));
ALTER TABLE bank."BankEntry" ADD CONSTRAINT bank_entry_valid CHECK (debit >= 0 AND credit >= 0 AND ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)));
CREATE UNIQUE INDEX one_live_payment_per_installment ON bnpl."Payment" ("installmentId") WHERE status <> 'DECLINED';

CREATE FUNCTION bnpl.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Posted financial records and audit history are immutable'; END $$;
CREATE TRIGGER immutable_journal BEFORE UPDATE OR DELETE ON bnpl."Journal" FOR EACH ROW EXECUTE FUNCTION bnpl.reject_mutation();
CREATE TRIGGER immutable_entry BEFORE UPDATE OR DELETE ON bnpl."Entry" FOR EACH ROW EXECUTE FUNCTION bnpl.reject_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON bnpl."Audit" FOR EACH ROW EXECUTE FUNCTION bnpl.reject_mutation();
CREATE FUNCTION bank.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Bank financial records and operation history are immutable'; END $$;
CREATE TRIGGER immutable_journal BEFORE UPDATE OR DELETE ON bank."BankJournal" FOR EACH ROW EXECUTE FUNCTION bank.reject_mutation();
CREATE TRIGGER immutable_entry BEFORE UPDATE OR DELETE ON bank."BankEntry" FOR EACH ROW EXECUTE FUNCTION bank.reject_mutation();
CREATE TRIGGER immutable_operation BEFORE UPDATE OR DELETE ON bank."BankOperation" FOR EACH ROW EXECUTE FUNCTION bank.reject_mutation();
CREATE TRIGGER immutable_simulation_log BEFORE UPDATE OR DELETE ON bank."SimulationLog" FOR EACH ROW EXECUTE FUNCTION bank.reject_mutation();

CREATE FUNCTION bnpl.validate_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; total bigint; lines bigint;
BEGIN
  IF TG_TABLE_NAME = 'Journal' THEN target := NEW.id; ELSE target := NEW."journalId"; END IF;
  SELECT COALESCE(SUM(debit-credit),0),COUNT(*) INTO total,lines FROM bnpl."Entry" WHERE "journalId"=target;
  IF total <> 0 OR lines < 2 THEN RAISE EXCEPTION 'Unbalanced or empty journal %',target; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON bnpl."Journal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bnpl.validate_journal();
CREATE CONSTRAINT TRIGGER entries_balanced AFTER INSERT ON bnpl."Entry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bnpl.validate_journal();
CREATE FUNCTION bank.validate_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; total bigint; lines bigint;
BEGIN
  IF TG_TABLE_NAME = 'BankJournal' THEN target := NEW.id; ELSE target := NEW."journalId"; END IF;
  SELECT COALESCE(SUM(debit-credit),0),COUNT(*) INTO total,lines FROM bank."BankEntry" WHERE "journalId"=target;
  IF total <> 0 OR lines < 2 THEN RAISE EXCEPTION 'Unbalanced or empty bank journal %',target; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON bank."BankJournal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bank.validate_journal();
CREATE CONSTRAINT TRIGGER entries_balanced AFTER INSERT ON bank."BankEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bank.validate_journal();
