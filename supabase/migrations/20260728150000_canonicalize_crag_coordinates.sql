ALTER TABLE public.crags
  ADD CONSTRAINT crags_latitude_check
    CHECK (latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT crags_longitude_check
    CHECK (longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT crags_coordinate_pair_check
    CHECK ((latitude IS NULL) = (longitude IS NULL));

DROP INDEX public.idx_crags_location;

ALTER TABLE public.crags
  DROP COLUMN location,
  ADD COLUMN location extensions.geography(Point, 4326)
    GENERATED ALWAYS AS (
      CASE
        WHEN latitude IS NULL THEN NULL
        ELSE extensions.ST_SetSRID(
          extensions.ST_MakePoint(
            longitude::double precision,
            latitude::double precision
          ),
          4326
        )::extensions.geography
      END
    ) STORED;

CREATE INDEX idx_crags_location
  ON public.crags
  USING gist (location);
