CREATE TABLE bnpl."CartItem" (
  "userId" TEXT NOT NULL REFERENCES identity."User"(id),
  "productId" TEXT NOT NULL REFERENCES bnpl."Product"(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  PRIMARY KEY ("userId","productId")
);
