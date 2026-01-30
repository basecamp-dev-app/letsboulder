-- Create RPC function to calculate average grade from grade_votes in real-time
-- Uses grades table to convert grades to points, calculates mean, then converts back

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
  v_avg_points NUMERIC;
  v_nearest_grade VARCHAR(10);
BEGIN
  FOR i IN 1..array_length(p_climb_ids, 1) LOOP
    v_id := p_climb_ids[i];

    SELECT INTO v_total_votes COUNT(*) FROM grade_votes WHERE grade_votes.climb_id = v_id;

    IF v_total_votes = 0 THEN
      consensus_grade := NULL;
      total_votes := 0;
      grade_tied := FALSE;
    ELSE
      SELECT INTO v_avg_points AVG(g.points)
      FROM grade_votes gv
      JOIN grades g ON gv.grade = g.grade
      WHERE gv.climb_id = v_id;

      SELECT INTO v_nearest_grade grade
      FROM grades
      ORDER BY ABS(points - v_avg_points)
      LIMIT 1;

      consensus_grade := v_nearest_grade;
      total_votes := v_total_votes;
      grade_tied := FALSE;
    END IF;

    climb_id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
