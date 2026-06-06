-- CreateIndex
CREATE INDEX "idx_sales_date" ON "Sale"("soldDate");

-- CreateIndex
CREATE INDEX "idx_sales_product" ON "Sale"("productId");
