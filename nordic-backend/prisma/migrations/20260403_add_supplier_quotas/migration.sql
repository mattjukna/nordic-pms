-- CreateTable
CREATE TABLE [dbo].[SupplierQuota] (
    [id] NVARCHAR(1000) NOT NULL,
    [supplierId] NVARCHAR(1000) NOT NULL,
    [year] INT NOT NULL,
    [month] INT NOT NULL,
    [quotaKg] FLOAT(53) NOT NULL,
    [actualKg] FLOAT(53),
    CONSTRAINT [SupplierQuota_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SupplierQuota_supplierId_year_month_key] UNIQUE NONCLUSTERED ([supplierId], [year], [month])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierQuota_year_month_idx] ON [dbo].[SupplierQuota]([year], [month]);

-- AddForeignKey
ALTER TABLE [dbo].[SupplierQuota] ADD CONSTRAINT [SupplierQuota_supplierId_fkey] FOREIGN KEY ([supplierId]) REFERENCES [dbo].[Supplier]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
