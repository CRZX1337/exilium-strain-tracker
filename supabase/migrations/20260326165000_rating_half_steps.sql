-- ==========================================
-- Migration: Change rating column to numeric(3,1)
-- Description: Support 0.5-increment star ratings (0.5 to 5.0)
-- ==========================================

-- Cast existing integer values to numeric(3,1). No data loss — integers become X.0.
ALTER TABLE public.strains
  ALTER COLUMN rating TYPE numeric(3,1) USING rating::numeric(3,1);

-- Add constraint allowing only valid 0.5-step values (including NULL)
ALTER TABLE public.strains
  DROP CONSTRAINT IF EXISTS rating_half_steps;

ALTER TABLE public.strains
  ADD CONSTRAINT rating_half_steps CHECK (
    rating IS NULL
    OR (
      rating >= 0.5
      AND rating <= 5.0
      AND (rating * 2) = FLOOR(rating * 2)
    )
  );

COMMENT ON COLUMN public.strains.rating IS 'Star rating in 0.5 increments from 0.5 to 5.0';
