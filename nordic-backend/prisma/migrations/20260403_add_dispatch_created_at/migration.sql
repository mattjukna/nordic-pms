-- Add createdAt column to DispatchEntry (defaults to current timestamp for existing rows)
ALTER TABLE [dbo].[DispatchEntry] ADD [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_DispatchEntry_createdAt] DEFAULT GETDATE();
