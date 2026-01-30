-- Fix grade_votes RLS policy to use auth.uid() = user_id for INSERT
-- This ensures the server-side insert from route submission works correctly

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Authenticated create grade vote" ON grade_votes;

-- Create new INSERT policy that checks auth.uid() matches user_id
CREATE POLICY "Authenticated create grade vote" ON grade_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create RPC function to insert grade vote as authenticated user (fallback if RLS still fails)
CREATE OR REPLACE FUNCTION insert_grade_vote(climb_id UUID, vote_grade VARCHAR(10))
RETURNS VOID AS $$
BEGIN
  INSERT INTO grade_votes (climb_id, user_id, grade)
  VALUES (climb_id, auth.uid(), vote_grade)
  ON CONFLICT (climb_id, user_id) 
  DO UPDATE SET grade = EXCLUDED.grade, created_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RPC function to initialize grade vote for new climb submission
-- This bypasses RLS entirely and is called from the submission API
-- Also updates the climbs table consensus columns directly
CREATE OR REPLACE FUNCTION initialize_climb_grade_vote(p_climb_id UUID, p_user_id UUID, p_grade VARCHAR(10))
RETURNS VOID AS $$
DECLARE
  v_count INTEGER;
  v_consensus_grade VARCHAR(10);
  v_tied_grades INTEGER;
BEGIN
  INSERT INTO grade_votes (climb_id, user_id, grade)
  VALUES (p_climb_id, p_user_id, p_grade)
  ON CONFLICT (climb_id, user_id) 
  DO UPDATE SET grade = EXCLUDED.grade, created_at = NOW();

  -- Update the climbs consensus columns directly
  SELECT INTO v_count COUNT(*) FROM grade_votes WHERE climb_id = p_climb_id;
  
  IF v_count = 0 THEN
    UPDATE climbs SET consensus_grade = NULL, total_votes = 0, grade_tied = FALSE WHERE id = p_climb_id;
  ELSE
    SELECT INTO v_tied_grades COUNT(*) FROM (
      SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE climb_id = p_climb_id GROUP BY grade
    ) sub WHERE cnt = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM grade_votes WHERE climb_id = p_climb_id GROUP BY grade) sub2);
    
    SELECT INTO v_consensus_grade MIN(grade) FROM (
      SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE climb_id = p_climb_id GROUP BY grade
    ) sub WHERE cnt = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM grade_votes WHERE climb_id = p_climb_id GROUP BY grade) sub2);
    
    UPDATE climbs SET 
      consensus_grade = v_consensus_grade, 
      total_votes = v_count, 
      grade_tied = v_tied_grades > 1 
    WHERE id = p_climb_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate the trigger with NULL-safe logic
DROP TRIGGER IF EXISTS trg_update_climb_consensus_on_vote ON grade_votes;

CREATE OR REPLACE FUNCTION update_climb_consensus_safe()
RETURNS TRIGGER AS $$
DECLARE
  v_climb_id UUID;
  v_total_votes INTEGER;
  v_consensus_grade VARCHAR(10);
  v_tied_grades INTEGER;
BEGIN
  v_climb_id := COALESCE(NEW.climb_id, OLD.climb_id);
  
  IF v_climb_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT INTO v_total_votes COUNT(*) FROM grade_votes WHERE climb_id = v_climb_id;
  
  IF v_total_votes = 0 THEN
    UPDATE climbs SET consensus_grade = NULL, total_votes = 0, grade_tied = FALSE WHERE id = v_climb_id;
  ELSE
    SELECT INTO v_tied_grades COUNT(*) FROM (
      SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE climb_id = v_climb_id GROUP BY grade
    ) sub WHERE cnt = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM grade_votes WHERE climb_id = v_climb_id GROUP BY grade) sub2);
    
    SELECT INTO v_consensus_grade MIN(grade) FROM (
      SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE climb_id = v_climb_id GROUP BY grade
    ) sub WHERE cnt = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM grade_votes WHERE climb_id = v_climb_id GROUP BY grade) sub2);
    
    UPDATE climbs SET 
      consensus_grade = v_consensus_grade, 
      total_votes = v_total_votes, 
      grade_tied = v_tied_grades > 1 
    WHERE id = v_climb_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_climb_consensus_on_vote
AFTER INSERT OR UPDATE OR DELETE ON grade_votes
FOR EACH ROW
EXECUTE FUNCTION update_climb_consensus_safe();
