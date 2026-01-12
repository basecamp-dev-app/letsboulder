-- Migration: Seed global regions and crags
-- Purpose: Add popular climbing regions and crags worldwide for launch
-- Created: 2026-01-20

ALTER TABLE regions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE crags ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE crags ADD COLUMN IF NOT EXISTS access_notes TEXT;

INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260120000000_verification_system')
ON CONFLICT (version) DO NOTHING;

DROP POLICY IF EXISTS "Public read verifications" ON climb_verifications;
DROP POLICY IF EXISTS "Authenticated create verification" ON climb_verifications;
DROP POLICY IF EXISTS "Authenticated delete own verification" ON climb_verifications;
DROP POLICY IF EXISTS "Public read grade votes" ON grade_votes;
DROP POLICY IF EXISTS "Authenticated create grade vote" ON grade_votes;
DROP POLICY IF EXISTS "Authenticated update own grade vote" ON grade_votes;
DROP POLICY IF EXISTS "Authenticated delete own grade vote" ON grade_votes;
DROP POLICY IF EXISTS "Public read corrections" ON climb_corrections;
DROP POLICY IF EXISTS "Authenticated create correction" ON climb_corrections;
DROP POLICY IF EXISTS "Authenticated update own correction" ON climb_corrections;
DROP POLICY IF EXISTS "Public read correction votes" ON correction_votes;
DROP POLICY IF EXISTS "Authenticated create correction vote" ON correction_votes;
DROP POLICY IF EXISTS "Authenticated delete own correction vote" ON correction_votes;

CREATE POLICY "Public read verifications" ON climb_verifications FOR SELECT USING (true);
CREATE POLICY "Authenticated create verification" ON climb_verifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete own verification" ON climb_verifications FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public read grade votes" ON grade_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated create grade vote" ON grade_votes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update own grade vote" ON grade_votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated delete own grade vote" ON grade_votes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public read corrections" ON climb_corrections FOR SELECT USING (true);
CREATE POLICY "Authenticated create correction" ON climb_corrections FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update own correction" ON climb_corrections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Public read correction votes" ON correction_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated create correction vote" ON correction_votes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete own correction vote" ON correction_votes FOR DELETE USING (auth.uid() = user_id);

INSERT INTO regions (id, name, country_code, center_lat, center_lon, description) VALUES
('d00d1601-1f48-4fd8-9441-9ad3b60be4b1', 'Fontainebleau', 'FR', 48.4165, 2.702, 'World-famous sandstone bouldering forest near Paris.'),
('8ef71105-64ee-417c-98cf-0a790d84d73c', 'Grasse', 'FR', 43.7102, 6.934, 'Sandstone bouldering near Nice.'),
('c22b8193-088d-48be-8b8f-0568e32a71ad', 'Verdon', 'FR', 43.7568, 5.764, 'Limestone sport climbing in the stunning Verdon Gorge.'),
('ffe0e34c-93f4-4feb-9196-20523704ee61', 'Calanques', 'FR', 43.2167, 5.45, 'Limestone sport climbing and bouldering near Marseille.'),
('0b060f77-3a6f-4de4-a745-f21890e656e9', 'Albert', 'FR', 50.2865, 2.774, 'Sandstone bouldering in northern France.'),
('506ca344-b714-4af6-a730-4da55a92628c', 'Buoux', 'FR', 43.8233, 5.3933, 'Historic limestone sport climbing area in Provence.'),
('3f43b7b6-db85-4b4e-a9c2-304a218596ed', 'Céüse', 'FR', 44.2833, 5.8333, 'Limestone sport climbing with classic long routes.'),
('96f6d71d-9fef-4806-a3bb-aa54e4b66fd1', 'Chamonix', 'FR', 45.9237, 6.8694, 'Alpine climbing capital.'),
('582fd7dc-17d6-46c9-aeb7-13b696984847', 'Annecy', 'FR', 45.8992, 6.1293, 'Limestone and granite climbing near Lake Annecy.'),
('93ef1c65-93a0-4385-9993-875cfc5e3933', 'Magic Wood', 'CH', 46.8667, 9.0333, 'World-class sandstone bouldering in the Swiss Alps.'),
('84a0095e-71e5-4276-8b7f-e2efb7528a7e', 'Chironico', 'CH', 46.45, 8.8, 'Sandstone bouldering in Ticino.'),
('ba15cedd-3eeb-46e8-aa5c-2a0847fc5c35', 'Cresciano', 'CH', 46.3167, 8.8333, 'Sandstone bouldering in Ticino.'),
('971e53e4-535b-4b95-be84-0de3b942eacb', 'Finale Ligure', 'IT', 44.17, 8.34, 'Limestone sport climbing paradise on the Italian Riviera.'),
('7322e708-7cbf-4037-bd19-c2fb1ccd1b49', 'Arco', 'IT', 45.9167, 10.8833, 'Limestone sport climbing in the Italian Alps.'),
('da2901eb-0149-4ed0-a89a-71f5aa2373d2', 'Sardinia', 'IT', 40.5, 9.0, 'Limestone sport climbing and deep water soloing on the island.'),
('eb408c34-a6e9-48b1-a41f-869d72667829', 'Siurana', 'ES', 41.2667, 0.9667, 'Limestone sport climbing in Catalonia.'),
('9bcc9fd3-25a4-4ee1-9270-94f5ff478100', 'Margalef', 'ES', 41.4833, 0.75, 'Limestone sport climbing in Montserrat area.'),
('780414a2-1b4b-4eeb-b69f-d5ae8cc94190', 'Rodellar', 'ES', 42.3333, -0.0667, 'Limestone sport climbing in the Sierra de Guara.'),
('13a1a858-8aaa-44d4-b1fd-17bca4795a9e', 'Albarracín', 'ES', 40.4, -1.45, 'Sandstone sport climbing in central Spain.'),
('83cb124f-ce37-4b66-b9f1-176239a934fb', 'Cádiz', 'ES', 36.5, -6.25, 'Coastal limestone and sandstone.'),
('db6b8558-a1d8-43af-9d4e-a238f8019bd6', 'Mallorca', 'ES', 39.6167, 3.0, 'Limestone sport climbing on the Balearic Islands.'),
('fd77c1f0-d316-450d-b425-80ca06c4c292', 'Arrábida', 'PT', 38.4667, -9.0, 'Limestone sport climbing near Lisbon.'),
('10ba4de6-f6af-4110-978d-96387234df6b', 'Bertrix', 'BE', 49.85, 5.25, 'Sandstone bouldering in the Ardennes.'),
('81e0ffce-5bf5-4cb9-9f00-a1864d566de1', 'Rochehaut', 'BE', 49.8333, 5.2833, 'Sandstone bouldering near the Ourthe River.'),
('c512a71e-0b43-4f12-8d88-be76cf04107e', 'Portland', 'GB', 50.5667, -2.45, 'Portland limestone in Dorset.'),
('9ce14517-cfaa-4bde-9cb5-4569885e0127', 'Peak District', 'GB', 53.25, -1.5, 'Sandstone trad climbing.'),
('8b73700f-7d47-4b6e-87d8-60bace4cbc98', 'Yorkshire', 'GB', 54.0, -1.5, 'Gritstone and limestone.'),
('c4241ea6-bdaa-4765-bff5-2ed6cb8ffea8', 'Lake District', 'GB', 54.5, -3.0, 'Mountain rock and slate.'),
('900ad305-e6df-47fa-bc89-1d7fa5f53cf1', 'Cornwall', 'GB', 50.2667, -5.05, 'Coastal granite and serpentinite.'),
('350100db-930b-440a-b70e-5a334d3813b0', 'Scotland', 'GB', 56.0, -4.0, 'Highland granite and schist.'),
('7c731ece-cb43-4753-b833-1c803e72799c', 'Devon', 'GB', 50.75, -3.75, 'Limestone and sandstone.'),
('7e8da1db-5405-404a-8e94-90bced5544e1', 'Bishop', 'CA', 37.3861, -118.3868, 'Limestone bouldering at Happythought and The Buttermilks.'),
('d7eb80ce-9089-42a7-86dd-b981084cbc9b', 'Hueco Tanks', 'TX', 31.9, -105.9667, 'Desert boulders with holds like "the Moon".'),
('cfafe4c1-2d8a-4254-a6cf-31cda83eedda', 'Red River Gorge', 'KY', 37.8, -83.0, 'Limestone sport climbing paradise.'),
('5363e58a-1d56-4a3a-95a6-c63511d2af0f', 'Joe''s Valley', 'UT', 39.5, -111.0, 'Sandstone bouldering in Utah canyon.'),
('beef2777-d4a6-4791-b46d-954b99b5e5e5', 'Indian Creek', 'UT', 38.0333, -109.5, 'Sandstone splitter cracks.'),
('9f3f4dda-f736-4e42-bdf5-2aa0aa9ec724', 'Yosemite', 'CA', 37.745, -119.5936, 'Granite big walls and sport.'),
('3d0e91f0-66c3-4b89-b4df-295eb33e2b57', 'Red Rocks', 'NV', 36.1333, -115.4333, 'Desert sandstone sport and trad.'),
('9b6c84c9-0628-417a-ae90-24b8ad480310', 'Boulder Canyon', 'CO', 40.0, -105.5, 'Granite and gneiss sport.'),
('82c91e57-d519-4aab-a5df-7c1d070e8ca0', 'Fort Collins', 'CO', 40.55, -105.07, 'Horsetooth and Greyrock areas.'),
('761f4cfb-607c-4d7c-8689-97e889aaf87b', 'Lake Tahoe', 'CA', 38.95, -119.95, 'Granite bouldering and sport.'),
('51d6f36d-0c25-435d-aef3-568d526b2eaa', 'Little Cottonwood', 'UT', 40.5667, -111.8, 'Granite sport at Gate Buttress.'),
('c52116ff-1e4c-4f9c-88ed-d845ee84afae', 'Flagstaff', 'AZ', 35.2, -111.65, 'Volcanic rock.'),
('d16f3ec8-4227-44c3-b59d-54e16ce5516f', 'Joshua Tree', 'CA', 33.9, -115.9, 'Desert granite.'),
('ebb13272-5d82-4aee-8de6-ab22deb4aa72', 'Owens River Gorge', 'CA', 37.8, -118.9, 'Limestone sport climbing.'),
('f211367b-bb5f-469f-bf31-c0428558a885', 'Maple Canyon', 'UT', 39.85, -111.75, 'Conglomerate sport climbing.'),
('abe2b690-393b-4ac2-963e-9807b3233921', 'Smith Rocks', 'OR', 44.3667, -121.15, 'Limestone sport climbing.'),
('3b3da8c8-5263-4938-b26a-422717122f62', 'Linville Gorge', 'NC', 35.95, -81.95, 'Limestone and gneiss.'),
('73884dad-8e60-49ea-84f6-63b5d209d465', 'New River Gorge', 'WV', 38.0, -81.0, 'Limestone sport climbing.'),
('18ecd6c2-a40f-4323-a56e-b2e6fd02cdcd', 'Rumney', 'NH', 43.8, -71.8, 'Limestone sport climbing.'),
('2437e2b5-7e61-40aa-9690-aa9bbf4cc53b', 'Shawangunks', 'NY', 41.7, -74.3, 'Historic American climbing.'),
('3faa8c8d-1b74-4677-9256-f741248bbe78', 'Squamish', 'BC', 49.7, -123.15, 'Granite. The Chief, Smoke Bluffs.'),
('67aa15e6-a042-497f-a9d6-018fd6e0164e', 'Canmore', 'AB', 51.0833, -115.35, 'Limestone and granite.'),
('ca2806c7-86e0-4a7b-abaf-5e119e3a303e', 'Montreal', 'QC', 45.5, -73.6, 'Urban climbing.'),
('46dd6679-1e73-40fe-9ea9-fdb6ba0a7545', 'Ottawa', 'ON', 45.4167, -75.7, 'Gneiss boulders.'),
('1d4f87c4-de54-4bfa-be90-b74c8f63582a', 'Jasper', 'AB', 52.8833, -118.05, 'Alpine granite.'),
('f313715b-898e-49cc-93c4-7b85106ff210', 'Rocklands', 'ZA', -32.4833, 19.0333, 'World-famous sandstone bouldering.'),
('39827b3a-5568-4b7b-9902-141932145ffa', 'Cederberg', 'ZA', -32.5, 19.0, 'Sandstone boulders.'),
('67a73691-f7de-4219-9179-4a124b94efbf', 'Montagne d''Or', 'RE', -21.1, 55.6, 'Bouldering on Réunion Island.'),
('09fa8192-5aa6-4009-9eba-044d9dc23f55', 'Sydney', 'AU', -33.87, 151.21, 'Sandstone at Nowra, Mount York.'),
('9cf7649d-1117-4405-a67e-961c7351ebd7', 'Wanaka', 'NZ', -44.7, 169.15, 'Granite bouldering at Matrix.'),
('91427529-14ba-4b3f-af2a-ad7389975818', 'Queenstown', 'NZ', -45.03, 168.66, 'Alpine setting.'),
('7a325beb-9538-421b-9e11-48208fb58c55', 'Brisbane', 'AU', -27.5, 153.0, 'Sandstone.'),
('4a6eb3af-e4db-49f9-ac11-c31bc1dfcea0', 'Yangshuo', 'CN', 24.7833, 110.5, 'Limestone karst.'),
('b84cfeea-01c1-4aed-9653-348b4c3c3b30', 'Narita', 'JP', 35.7833, 140.3, 'Bouldering near Tokyo.'),
('25012d4e-417e-4765-8d74-d43d28ce7bd5', 'Longdong', 'TW', 24.15, 121.65, 'Coastal climbing.'),
('73cc93b1-b2e4-4095-b8aa-868ce69e080a', 'Kalymnos', 'GR', 36.95, 26.9833, 'World-famous limestone island.'),
('98cd4f88-5e20-46cd-8559-f425161005fe', 'Meteora', 'GR', 39.7167, 21.6333, 'Limestone pillars with monasteries.'),
('c3861c06-23dc-4f3f-a418-49bb1fec062e', 'Mendoza', 'AR', -32.8833, -68.8333, 'Granite and limestone.'),
('7c9b4ecd-9ec9-4e86-bf35-752012bb5a5f', 'Sierra de la Ventana', 'AR', -38.0, -62.0, 'Sandstone climbing.'),
('b93249a9-04af-4697-8251-30a838fd2e9a', 'El Potrero Chico', 'MX', 25.95, -100.5, 'Limestone sport climbing.'),
('e511b0a7-9e86-4639-89ad-4d9476cde3c0', 'Yucatán', 'MX', 20.98, -89.5, 'Cenotes and limestone.'),
('ce168e68-061e-4126-9800-785a5f53f15a', 'Costa Rica', 'CR', 9.75, -83.75, 'Limestone near Caribbean.'),
('9d5a077b-bcc9-456e-b314-eefb4d130d46', 'Guernsey', 'GG', 49.45, -2.58, 'Granite boulders and cliffs.'),
('e15c7b80-67f5-4245-b04d-5888f0a16304', 'Jersey', 'JE', 49.2, -2.1, 'Granite bouldering and sea cliffs.'),
('d0f80657-a7f9-430f-a5f7-1a1d6ebb95df', 'Frankenjura', 'DE', 49.65, 11.35, 'Limestone sport climbing.'),
('6731e891-1182-4d40-8817-06767eda5b70', 'Saxon Switzerland', 'DE', 50.9167, 14.2, 'Sandstone pillars.'),
('728f5a49-1c42-450b-8ad3-82f3f808d2aa', 'Norway', 'NO', 61.0, 8.0, 'Granite and gneiss.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO crags (id, name, region_id, latitude, longitude, type, description, access_notes, rock_type) VALUES
('84186445-0106-473a-9650-010eede151ee', '95', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.4165, 2.702, 'boulder', 'Iconic sector with classic problems from 5+ to 8C+.', 'Park at 95 parking, 15 min walk into forest.', 'sandstone'),
('201d5892-50b2-4d0d-b56a-df0717e6eec6', '96', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.42, 2.705, 'boulder', 'Adjacent to 95, similar grade range.', 'Shared parking with 95.', 'sandstone'),
('0147c66f-3a17-4b91-850f-c0a0ab6127f4', '97', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.425, 2.71, 'boulder', 'Higher grade sector.', '20 min walk from 95 parking.', 'sandstone'),
('95ebd728-e06a-45ea-bbba-2d0788e566ec', 'Cuvier', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.4, 2.68, 'boulder', 'Large forest area.', 'Main parking for Cuvier.', 'sandstone'),
('df6bb8c1-f32c-4af1-bb93-0b0f3785974c', 'Roche aux Sabots', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.39, 2.67, 'boulder', 'Popular sector.', 'Parking at Franchard.', 'sandstone'),
('98a5d940-8ca3-4f10-943b-08b974d009f0', 'Apremont', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.43, 2.73, 'boulder', 'Remote sector.', 'Longer walk required.', 'sandstone'),
('cd9afe35-9acb-44bb-920e-b0db7932b5da', 'Magic Wood', '93ef1c65-93a0-4385-9993-875cfc5e3933', 46.8667, 9.0333, 'boulder', 'World-class sandstone.', 'Parking near Valzeina.', 'sandstone'),
('e2844d2b-1b37-4acc-865c-10a382f0dc9d', 'Chironico', '84a0095e-71e5-4276-8b7f-e2efb7528a7e', 46.45, 8.8, 'boulder', 'Powerful problems.', 'Parking in village.', 'sandstone'),
('5b88f2a8-567b-4521-a025-fa284c56e290', 'Cresciano', 'ba15cedd-3eeb-46e8-aa5c-2a0847fc5c35', 46.3167, 8.8333, 'boulder', 'Powerful boulders.', 'Parking at lot.', 'sandstone'),
('f980409d-ad57-45aa-93b2-1b7151ea765a', 'Finale Ligure', '971e53e4-535b-4b95-be84-0de3b942eacb', 44.17, 8.34, 'sport', 'Sport climbing paradise.', 'Many campgrounds.', 'limestone'),
('b1f3d7f0-9d88-4f0e-ab30-a8b8f3b82345', 'Arco', '7322e708-7cbf-4037-bd19-c2fb1ccd1b49', 45.9167, 10.8833, 'sport', 'World Cup venue.', 'Camping at Lake Garda.', 'limestone'),
('06eb53f9-1de6-48ab-a76e-55d1f25f287d', 'Siurana', 'eb408c34-a6e9-48b1-a41f-869d72667829', 41.2667, 0.9667, 'sport', 'Steep terrain.', 'Parking at crag.', 'limestone'),
('044f203e-1f0c-4f7e-9cfc-b8c8ddd0a586', 'Margalef', '9bcc9fd3-25a4-4ee1-9270-94f5ff478100', 41.4833, 0.75, 'sport', 'Technical climbing.', 'Parking at village.', 'limestone'),
('b595d3cd-2a87-4ae4-8621-2bf3773e3044', 'Rodellar', '780414a2-1b4b-4eeb-b69f-d5ae8cc94190', 42.3333, -0.0667, 'sport', 'Steep and pumpy.', 'Campground.', 'limestone'),
('3894a820-ab30-415d-b48c-c0f8236f6627', 'Portland', 'c512a71e-0b43-4f12-8d88-be76cf04107e', 50.5667, -2.45, 'sport', 'Sea cliffs.', 'Portland quarries.', 'limestone'),
('62b6e6b7-dca0-405c-a025-5fbe474a2d55', 'Stanage', '8b73700f-7d47-4b6e-87d8-60bace4cbc98', 53.35, -1.6, 'trad', 'Gritstone edge.', 'Robin Hood pub.', 'gritstone'),
('edf818e8-8ecc-4867-ae77-65f24debd61c', 'Gordale Scar', '8b73700f-7d47-4b6e-87d8-60bace4cbc98', 54.0667, -2.15, 'trad', 'Classic gritstone.', 'National Trust.', 'gritstone'),
('8c27b043-f63e-42ed-b3e4-1ba650ece6bb', 'Happythought', '7e8da1db-5405-404a-8e94-90bced5544e1', 37.3861, -118.3868, 'boulder', 'Limestone bouldering.', 'Pine Creek Lodge.', 'limestone'),
('377dc643-d86c-48d9-b829-daa92d23cb35', 'The Buttermilks', '7e8da1db-5405-404a-8e94-90bced5544e1', 37.37, -118.4, 'boulder', 'Granite boulders.', 'Buttermilk Rd.', 'granite'),
('3ce32906-189c-44fb-b032-8eaf1610d747', 'Hueco Tanks', 'd7eb80ce-9089-42a7-86dd-b981084cbc9b', 31.9, -105.9667, 'boulder', 'Desert boulders.', 'Park entry fee.', 'sandstone'),
('27b33107-c383-4aad-a6a4-131e419bf9ea', 'PMRP', 'cfafe4c1-2d8a-4254-a6cf-31cda83eedda', 37.8, -83.0, 'sport', '500+ routes.', 'Miguel''s Pizza.', 'limestone'),
('0ff2a2b5-0f19-4f8c-ae74-388781f872fb', 'Left Fork', '5363e58a-1d56-4a3a-95a6-c63511d2af0f', 39.5, -111.0, 'boulder', 'Circuit problems.', 'Forest camping.', 'sandstone'),
('d2247a2f-6086-40f5-9fda-cd6dac3b5d27', 'Right Fork', '5363e58a-1d56-4a3a-95a6-c63511d2af0f', 39.48, -110.98, 'boulder', 'Classic circuits.', 'Shared parking.', 'sandstone'),
('03201fce-5582-48ac-965d-788a8aad0ca3', 'Indian Creek', 'beef2777-d4a6-4791-b46d-954b99b5e5e5', 38.0333, -109.5, 'trad', 'Splitter cracks.', 'BLM camping.', 'sandstone'),
('8b3220c9-bb23-47e9-b747-5a1afa785af0', 'Camp 4', '9f3f4dda-f736-4e42-bdf5-2aa0aa9ec724', 37.745, -119.5936, 'sport', 'Yosemite granite.', 'National Park.', 'granite'),
('e73a07dc-fc36-4572-812e-405d7f532062', 'Red Rocks', '3d0e91f0-66c3-4b89-b4df-295eb33e2b57', 36.1333, -115.4333, 'sport', 'Desert sandstone.', 'Red Rock Canyon.', 'sandstone'),
('4fd733cf-4e00-4609-86aa-681d791c3299', 'Rumney', '18ecd6c2-a40f-4323-a56e-b2e6fd02cdcd', 43.8, -71.8, 'sport', '200+ routes.', 'Parking fee.', 'limestone'),
('2bd21adb-3e72-412f-bded-9d32be4b10a1', 'The Chief', '3faa8c8d-1b74-4677-9256-f741248bbe78', 49.7, -123.15, 'trad', 'Grand Wall.', 'Sea to Sky.', 'granite'),
('a90ac6ca-4c6f-42bb-b075-c54f12a50464', 'Smoke Bluffs', '3faa8c8d-1b74-4677-9256-f741248bbe78', 49.72, -123.1, 'sport', 'Urban Squamish.', 'Mamquam Road.', 'granite'),
('d3a44fd8-5228-4dbb-bb5e-d598b65bbc87', 'Northern', 'f313715b-898e-49cc-93c4-7b85106ff210', -32.4833, 19.0333, 'boulder', 'Main area.', 'Conservancy entry.', 'sandstone'),
('aa47b098-8ef3-4e9c-b8a6-862787144cc2', 'Playground', '39827b3a-5568-4b7b-9902-141932145ffa', -32.5, 19.0, 'boulder', 'Classic circuit.', 'Cederberg.', 'sandstone'),
('be49c3b4-28e2-42c0-a988-2a8464f982f3', 'Torque Boulder', '9d5a077b-bcc9-456e-b314-eefb4d130d46', 49.5091, -2.518, 'boulder', 'Headland boulder.', 'Coastal path.', 'granite'),
('8b4a6cc0-b3cd-423a-b536-f477e99bcb51', 'Jerbourg', '9d5a077b-bcc9-456e-b314-eefb4d130d46', 49.45, -2.53, 'boulder', 'Sea cliffs.', 'Coastguard.', 'granite'),
('495e115e-fc48-40c8-b24a-56aaa804b331', 'Nowra', '09fa8192-5aa6-4009-9eba-044d9dc23f55', -34.85, 150.6, 'boulder', 'Classic circuit.', 'Nowra Park.', 'sandstone'),
('2441fe89-0fa8-46c9-a549-ef8d6b64dda7', 'Mount York', '09fa8192-5aa6-4009-9eba-044d9dc23f55', -33.75, 150.25, 'boulder', 'Historic boulders.', 'Mount York Rd.', 'sandstone'),
('64023ebf-b7c4-48e2-9a51-31d10194226c', 'Matrix', '9cf7649d-1117-4405-a67e-961c7351ebd7', -44.7, 169.15, 'boulder', 'Granite boulders.', 'Matrix area.', 'granite'),
('ac3e07e6-01b9-42ef-ad80-9a1d3833e269', 'Yangshuo', '4a6eb3af-e4db-49f9-ac11-c31bc1dfcea0', 24.7833, 110.5, 'sport', 'Limestone karst.', 'Guesthouses.', 'limestone'),
('481552b3-7808-46d5-b9ac-f3ade0adedb2', 'Kalymnos', '73cc93b1-b2e4-4095-b8aa-868ce69e080a', 36.95, 26.9833, 'sport', 'Island paradise.', 'Ferry.', 'limestone'),
('a690321c-3c46-4e29-b0c3-68ad7a8a05ec', 'El Potrero Chico', 'b93249a9-04af-4697-8251-30a838fd2e9a', 25.95, -100.5, 'sport', '600m+ walls.', 'Campground.', 'limestone'),
('81d549a9-9d3b-4819-9aa4-49c9fc7b224c', 'Frankenjura', 'd0f80657-a7f9-430f-a5f7-1a1d6ebb95df', 49.65, 11.35, 'sport', '5000+ routes.', 'Beer culture.', 'limestone'),
('a5e0042b-6a26-46f8-a1dc-b824a3cd32e9', 'Saxon Switzerland', '6731e891-1182-4d40-8817-06767eda5b70', 50.9167, 14.2, 'trad', 'Sandstone pillars.', 'Bastei.', 'sandstone')
ON CONFLICT (id) DO NOTHING;
