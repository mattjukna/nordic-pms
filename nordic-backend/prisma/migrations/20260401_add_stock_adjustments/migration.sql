-- CreateTable
CREATE TABLE [dbo].[StockAdjustment] (
    [id] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [adjustmentKg] FLOAT(53) NOT NULL,
    [pallets] FLOAT(53) NOT NULL CONSTRAINT [StockAdjustment_pallets_df] DEFAULT 0,
    [bigBags] FLOAT(53) NOT NULL CONSTRAINT [StockAdjustment_bigBags_df] DEFAULT 0,
    [tanks] FLOAT(53) NOT NULL CONSTRAINT [StockAdjustment_tanks_df] DEFAULT 0,
    [looseKg] FLOAT(53) NOT NULL CONSTRAINT [StockAdjustment_looseKg_df] DEFAULT 0,
    [reason] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [performedBy] NVARCHAR(1000),
    [note] NVARCHAR(1000),
    [timestamp] DATETIME2 NOT NULL CONSTRAINT [StockAdjustment_timestamp_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StockAdjustment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockAdjustment_productId_idx] ON [dbo].[StockAdjustment]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockAdjustment_timestamp_idx] ON [dbo].[StockAdjustment]([timestamp]);

-- AddForeignKey
ALTER TABLE [dbo].[StockAdjustment] ADD CONSTRAINT [StockAdjustment_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
