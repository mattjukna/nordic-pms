ALTER TABLE [dbo].[IntakeEntry]
ADD [effectiveQuantityKg] FLOAT NULL,
    [labCoefficient] FLOAT NULL,
    [pricingMode] NVARCHAR(191) NULL,
    [unitPricePerKg] FLOAT NULL,
    [unitPriceBasis] NVARCHAR(191) NULL,
    [invoiceNumber] NVARCHAR(191) NULL;

UPDATE [dbo].[IntakeEntry]
SET [effectiveQuantityKg] = [quantityKg]
WHERE [effectiveQuantityKg] IS NULL;

UPDATE [dbo].[IntakeEntry]
SET [labCoefficient] = 1
WHERE [labCoefficient] IS NULL;