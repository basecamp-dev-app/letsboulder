-- Add consensus grade columns to climbs table for efficient grade display on route buttons
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS consensus_grade VARCHAR(10);
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS total_votes INTEGER DEFAULT 0;
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS grade_tied BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_climbs_consensus_grade ON climbs(consensus_grade) WHERE consensus_grade IS NOT NULL;

CREATE OR REPLACE FUNCTION update_climb_consensus()
RETURNS TRIGGER AS $$
DECLARE
  v_climb_id UUID;
  v_consensus_grade VARCHAR(10);
  v_total_votes INTEGER;
  v_max_votes INTEGER;
  v_tied_grades INTEGER;
BEGIN
  v_climb_id := COALESCE(NEW.climb_id, OLD.climb_id);

  IF v_climb_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT INTO v_max_votes MAX(vote_count)
  FROM (
    SELECT grade, COUNT(*) as vote_count
    FROM grade_votes
    WHERE climb_id = v_climb_id
    GROUP BY grade
  ) sub;

  SELECT INTO v_tied_grades COUNT(*)
  FROM (
    SELECT grade, COUNT(*) as vote_count
    FROM grade_votes
    WHERE climb_id = v_climb_id
    GROUP BY grade
  ) sub
  WHERE vote_count = v_max_votes;

  SELECT INTO v_consensus_grade MIN(grade)
  FROM (
    SELECT grade, COUNT(*) as vote_count
    FROM grade_votes
    WHERE climb_id = v_climb_id
    GROUP BY grade
  ) sub
  WHERE vote_count = v_max_votes;

  SELECT INTO v_total_votes COUNT(*)
  FROM grade_votes
  WHERE climb_id = v_climb_id;

  UPDATE climbs
  SET
    consensus_grade = v_consensus_grade,
    total_votes = COALESCE(v_total_votes, 0),
    grade_tied = v_tied_grades > 1,
    updated_at = NOW()
  WHERE id = v_climb_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_climb_consensus_on_vote ON grade_votes;
CREATE TRIGGER trg_update_climb_consensus_on_vote
AFTER INSERT OR UPDATE OR DELETE ON grade_votes
FOR EACH ROW
EXECUTE FUNCTION update_climb_consensus();

CREATE OR REPLACE FUNCTION initialize_climb_consensus()
RETURNS VOID AS $$
DECLARE
  v_climb_id UUID;
  v_consensus_grade VARCHAR(10);
  v_total_votes INTEGER;
  v_max_votes INTEGER;
  v_tied_grades INTEGER;
BEGIN
  FOR v_climb_id IN SELECT id FROM climbs LOOP
    SELECT INTO v_max_votes MAX(vote_count)
    FROM (
      SELECT grade, COUNT(*) as vote_count
      FROM grade_votes
      WHERE climb_id = v_climb_id
      GROUP BY grade
    ) sub;

    SELECT INTO v_tied_grades COUNT(*)
    FROM (
      SELECT grade, COUNT(*) as vote_count
      FROM grade_votes
      WHERE climb_id = v_climb_id
      GROUP BY grade
    ) sub
    WHERE vote_count = v_max_votes;

    SELECT INTO v_consensus_grade MIN(grade)
    FROM (
      SELECT grade, COUNT(*) as vote_count
      FROM grade_votes
      WHERE climb_id = v_climb_id
      GROUP BY grade
    ) sub
    WHERE vote_count = v_max_votes;

    SELECT INTO v_total_votes COUNT(*)
    FROM grade_votes
    WHERE climb_id = v_climb_id;

    UPDATE climbs
    SET
      consensus_grade = v_consensus_grade,
      total_votes = COALESCE(v_total_votes, 0),
      grade_tied = v_tied_grades > 1,
      updated_at = NOW()
    WHERE id = v_climb_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT initialize_climb_consensus();
