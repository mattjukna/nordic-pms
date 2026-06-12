ALTER TABLE [dbo].[StockAdjustment]
ADD [loosePalletKg] FLOAT(53) NOT NULL CONSTRAINT [StockAdjustment_loosePalletKg_df] DEFAULT 0;

ALTER TABLE [dbo].[StockAdjustment]
ADD [looseBigBagKg] FLOAT(53) NOT NULL CONSTRAINT [StockAdjustment_looseBigBagKg_df] DEFAULT 0;
