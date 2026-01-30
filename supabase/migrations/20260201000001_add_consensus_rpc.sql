-- Create RPC function to calculate consensus grade from grade_votes in real-time
-- This replaces the trigger-based caching with direct calculation

CREATE OR REPLACE FUNCTION get_climbs_with_consensus(p_climb_ids UUID[])
RETURNS TABLE (
  climb_id UUID,
  consensus_grade VARCHAR(10),
  total_votes INTEGER,
  grade_tied BOOLEAN
) AS $$
DECLARE
  v_id UUID;
  v_total_votes INTEGER;
  v_max_votes INTEGER;
  v_tied_grades INTEGER;
  v_consensus_grade VARCHAR(10);
BEGIN
  FOR i IN 1..array_length(p_climb_ids, 1) LOOP
    v_id := p_climb_ids[i];

    SELECT INTO v_total_votes COUNT(*) FROM grade_votes WHERE grade_votes.climb_id = v_id;

    IF v_total_votes = 0 THEN
      consensus_grade := NULL;
      total_votes := 0;
      grade_tied := FALSE;
    ELSE
      SELECT INTO v_max_votes MAX(cnt) FROM (
        SELECT COUNT(*) as cnt FROM grade_votes WHERE grade_votes.climb_id = v_id GROUP BY grade
      ) sub;

      SELECT INTO v_tied_grades COUNT(*) FROM (
        SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE grade_votes.climb_id = v_id GROUP BY grade
      ) sub WHERE cnt = v_max_votes;

      SELECT INTO v_consensus_grade MIN(grade) FROM (
        SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE grade_votes.climb_id = v_id GROUP BY grade
      ) sub WHERE cnt = v_max_votes;

      consensus_grade := v_consensus_grade;
      total_votes := v_total_votes;
      grade_tied := v_tied_grades > 1;
    END IF;

    climb_id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
