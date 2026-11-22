CREATE INDEX ON bank."OperationEvent" (type,"createdAt");
CREATE INDEX ON bank."OperationEvent" (severity,"createdAt");
CREATE INDEX ON bank."OperationEvent" ("actorId","createdAt");
CREATE INDEX ON bnpl."TechnicalLog" (type,"createdAt");
CREATE INDEX ON bank."TechnicalLog" (type,"createdAt");
