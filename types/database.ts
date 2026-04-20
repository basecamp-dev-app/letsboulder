export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          target_id: string
          target_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id: string
          target_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string
          target_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      climb_corrections: {
        Row: {
          approval_count: number | null
          climb_id: string
          correction_type: string
          created_at: string | null
          id: string
          original_value: Json | null
          reason: string | null
          rejection_count: number | null
          resolved_at: string | null
          status: string | null
          suggested_value: Json
          user_id: string
        }
        Insert: {
          approval_count?: number | null
          climb_id: string
          correction_type: string
          created_at?: string | null
          id?: string
          original_value?: Json | null
          reason?: string | null
          rejection_count?: number | null
          resolved_at?: string | null
          status?: string | null
          suggested_value: Json
          user_id: string
        }
        Update: {
          approval_count?: number | null
          climb_id?: string
          correction_type?: string
          created_at?: string | null
          id?: string
          original_value?: Json | null
          reason?: string | null
          rejection_count?: number | null
          resolved_at?: string | null
          status?: string | null
          suggested_value?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "climb_corrections_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
      climb_flags: {
        Row: {
          action_taken: string | null
          climb_id: string | null
          comment: string
          crag_id: string | null
          created_at: string | null
          flag_type: string
          flagger_id: string | null
          id: string
          image_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
        }
        Insert: {
          action_taken?: string | null
          climb_id?: string | null
          comment: string
          crag_id?: string | null
          created_at?: string | null
          flag_type: string
          flagger_id?: string | null
          id?: string
          image_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Update: {
          action_taken?: string | null
          climb_id?: string | null
          comment?: string
          crag_id?: string | null
          created_at?: string | null
          flag_type?: string
          flagger_id?: string | null
          id?: string
          image_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "climb_flags_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "climb_flags_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "climb_flags_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      climb_verifications: {
        Row: {
          climb_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          climb_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          climb_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "climb_verifications_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
      climb_video_betas: {
        Row: {
          climb_id: string
          created_at: string
          id: string
          notes: string | null
          platform: string
          title: string | null
          uploader_gender: string | null
          uploader_height_cm: number | null
          uploader_reach_cm: number | null
          url: string
          user_id: string
        }
        Insert: {
          climb_id: string
          created_at?: string
          id?: string
          notes?: string | null
          platform?: string
          title?: string | null
          uploader_gender?: string | null
          uploader_height_cm?: number | null
          uploader_reach_cm?: number | null
          url: string
          user_id: string
        }
        Update: {
          climb_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          platform?: string
          title?: string | null
          uploader_gender?: string | null
          uploader_height_cm?: number | null
          uploader_reach_cm?: number | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "climb_video_betas_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
      climbs: {
        Row: {
          crag_id: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          grade: string
          grade_index: number | null
          id: string
          is_verified: boolean | null
          latitude: number | null
          longitude: number | null
          name: string | null
          original_grade_string: string | null
          place_id: string | null
          route_type: string | null
          sector_id: string | null
          shared_climb_id: string | null
          slug: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          verification_count: number | null
        }
        Insert: {
          crag_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          grade: string
          grade_index?: number | null
          id?: string
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          original_grade_string?: string | null
          place_id?: string | null
          route_type?: string | null
          sector_id?: string | null
          shared_climb_id?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_count?: number | null
        }
        Update: {
          crag_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          grade?: string
          grade_index?: number | null
          id?: string
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          original_grade_string?: string | null
          place_id?: string | null
          route_type?: string | null
          sector_id?: string | null
          shared_climb_id?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "climbs_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "climbs_grade_index_fkey"
            columns: ["grade_index"]
            isOneToOne: false
            referencedRelation: "grade_mappings"
            referencedColumns: ["grade_index"]
          },
          {
            foreignKeyName: "climbs_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "climbs_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "climbs_shared_climb_id_fkey"
            columns: ["shared_climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          category: string
          created_at: string
          deleted_at: string | null
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          author_id?: string | null
          body: string
          category?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          author_id?: string | null
          body?: string
          category?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      community_place_follows: {
        Row: {
          created_at: string
          notification_level: string
          place_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notification_level?: string
          place_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notification_level?: string
          place_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_place_follows_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_rsvps: {
        Row: {
          created_at: string
          post_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_rsvps_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_climbs: {
        Row: {
          climb_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          climb_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          climb_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_climbs_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_crags: {
        Row: {
          crag_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          crag_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          crag_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_crags_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          discipline: string | null
          end_at: string | null
          grade_max: string | null
          grade_min: string | null
          id: string
          place_id: string
          start_at: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          discipline?: string | null
          end_at?: string | null
          grade_max?: string | null
          grade_min?: string | null
          id?: string
          place_id: string
          start_at?: string | null
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          discipline?: string | null
          end_at?: string | null
          grade_max?: string | null
          grade_min?: string | null
          id?: string
          place_id?: string
          start_at?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      continents: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      correction_votes: {
        Row: {
          correction_id: string
          created_at: string | null
          id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          correction_id: string
          created_at?: string | null
          id?: string
          user_id: string
          vote_type: string
        }
        Update: {
          correction_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_votes_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "climb_corrections"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          abbrev: string | null
          admin_type: string | null
          boundary: unknown
          created_at: string
          formal_name: string | null
          id: string
          iso_a2: string
          iso_a3: string
          label_rank: number | null
          map_color: number | null
          name: string
          name_long: string | null
          region_id: string | null
          scale_rank: number | null
        }
        Insert: {
          abbrev?: string | null
          admin_type?: string | null
          boundary?: unknown
          created_at?: string
          formal_name?: string | null
          id?: string
          iso_a2: string
          iso_a3: string
          label_rank?: number | null
          map_color?: number | null
          name: string
          name_long?: string | null
          region_id?: string | null
          scale_rank?: number | null
        }
        Update: {
          abbrev?: string | null
          admin_type?: string | null
          boundary?: unknown
          created_at?: string
          formal_name?: string | null
          id?: string
          iso_a2?: string
          iso_a3?: string
          label_rank?: number | null
          map_color?: number | null
          name?: string
          name_long?: string | null
          region_id?: string | null
          scale_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "countries_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      crag_images: {
        Row: {
          crag_id: string
          created_at: string
          face_directions: string[] | null
          height: number | null
          id: string
          latitude: number | null
          linked_image_id: string | null
          longitude: number | null
          sector_id: string | null
          source_image_id: string | null
          url: string
          width: number | null
        }
        Insert: {
          crag_id: string
          created_at?: string
          face_directions?: string[] | null
          height?: number | null
          id?: string
          latitude?: number | null
          linked_image_id?: string | null
          longitude?: number | null
          sector_id?: string | null
          source_image_id?: string | null
          url: string
          width?: number | null
        }
        Update: {
          crag_id?: string
          created_at?: string
          face_directions?: string[] | null
          height?: number | null
          id?: string
          latitude?: number | null
          linked_image_id?: string | null
          longitude?: number | null
          sector_id?: string | null
          source_image_id?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crag_images_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crag_images_linked_image_id_fkey"
            columns: ["linked_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crag_images_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crag_images_source_image_id_fkey"
            columns: ["source_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      crag_location_tags: {
        Row: {
          crag_id: string
          created_at: string
          is_primary_region: boolean
          tag_id: string
        }
        Insert: {
          crag_id: string
          created_at?: string
          is_primary_region?: boolean
          tag_id: string
        }
        Update: {
          crag_id?: string
          created_at?: string
          is_primary_region?: boolean
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crag_location_tags_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crag_location_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "location_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      crag_reports: {
        Row: {
          crag_id: string
          created_at: string | null
          details: string | null
          id: string
          moderator_id: string | null
          moderator_note: string | null
          reason: string
          reporter_id: string | null
          resolved_at: string | null
          status: string | null
        }
        Insert: {
          crag_id: string
          created_at?: string | null
          details?: string | null
          id?: string
          moderator_id?: string | null
          moderator_note?: string | null
          reason: string
          reporter_id?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Update: {
          crag_id?: string
          created_at?: string | null
          details?: string | null
          id?: string
          moderator_id?: string | null
          moderator_note?: string | null
          reason?: string
          reporter_id?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crag_reports_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
        ]
      }
      crags: {
        Row: {
          access_notes: string | null
          country: string | null
          country_code: string | null
          country_id: string | null
          created_at: string | null
          description: string | null
          id: string
          image_count: number | null
          is_flagged: boolean | null
          last_edited_by: string | null
          latitude: number | null
          location: unknown
          longitude: number | null
          name: string
          region_id: string | null
          region_name: string | null
          report_count: number | null
          rock_type: string | null
          route_count: number | null
          slug: string | null
          sub_area: string | null
          synced_at: string | null
          tide_dependency: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          access_notes?: string | null
          country?: string | null
          country_code?: string | null
          country_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_count?: number | null
          is_flagged?: boolean | null
          last_edited_by?: string | null
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          name: string
          region_id?: string | null
          region_name?: string | null
          report_count?: number | null
          rock_type?: string | null
          route_count?: number | null
          slug?: string | null
          sub_area?: string | null
          synced_at?: string | null
          tide_dependency?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          access_notes?: string | null
          country?: string | null
          country_code?: string | null
          country_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_count?: number | null
          is_flagged?: boolean | null
          last_edited_by?: string | null
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          name?: string
          region_id?: string | null
          region_name?: string | null
          report_count?: number | null
          rock_type?: string | null
          route_count?: number | null
          slug?: string | null
          sub_area?: string | null
          synced_at?: string | null
          tide_dependency?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crags_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crags_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_accounts: {
        Row: {
          delete_route_uploads: boolean
          deleted_at: string
          email: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          delete_route_uploads?: boolean
          deleted_at?: string
          email: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          delete_route_uploads?: boolean
          deleted_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      deletion_requests: {
        Row: {
          cancelled_at: string | null
          created_at: string
          delete_route_uploads: boolean
          deleted_at: string | null
          id: string
          primary_reason: string | null
          scheduled_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          delete_route_uploads?: boolean
          deleted_at?: string | null
          id?: string
          primary_reason?: string | null
          scheduled_at: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          delete_route_uploads?: boolean
          deleted_at?: string | null
          id?: string
          primary_reason?: string | null
          scheduled_at?: string
          user_id?: string
        }
        Relationships: []
      }
      grade_mappings: {
        Row: {
          british_equivalent: string | null
          difficulty_group: string | null
          font_scale: string | null
          french_equivalent: string | null
          grade_index: number
          v_scale: string | null
          yds_equivalent: string | null
        }
        Insert: {
          british_equivalent?: string | null
          difficulty_group?: string | null
          font_scale?: string | null
          french_equivalent?: string | null
          grade_index: number
          v_scale?: string | null
          yds_equivalent?: string | null
        }
        Update: {
          british_equivalent?: string | null
          difficulty_group?: string | null
          font_scale?: string | null
          french_equivalent?: string | null
          grade_index?: number
          v_scale?: string | null
          yds_equivalent?: string | null
        }
        Relationships: []
      }
      grade_votes: {
        Row: {
          climb_id: string
          created_at: string | null
          grade: string
          id: string
          user_id: string
        }
        Insert: {
          climb_id: string
          created_at?: string | null
          grade: string
          id?: string
          user_id: string
        }
        Update: {
          climb_id?: string
          created_at?: string | null
          grade?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_votes_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          grade: string
          points: number
        }
        Insert: {
          grade: string
          points: number
        }
        Update: {
          grade?: string
          points?: number
        }
        Relationships: []
      }
      gym_floor_plans: {
        Row: {
          created_at: string
          gym_place_id: string
          id: string
          image_height: number
          image_url: string
          image_width: number
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gym_place_id: string
          id?: string
          image_height: number
          image_url: string
          image_width: number
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gym_place_id?: string
          id?: string
          image_height?: number
          image_url?: string
          image_width?: number
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_floor_plans_gym_place_id_fkey"
            columns: ["gym_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_memberships: {
        Row: {
          created_at: string
          gym_place_id: string
          id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_place_id: string
          id?: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_place_id?: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_memberships_gym_place_id_fkey"
            columns: ["gym_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_owner_applications: {
        Row: {
          additional_comments: string | null
          address: string
          city: string
          contact_email: string
          contact_phone: string
          country: string
          created_at: string
          facilities: string[]
          gym_name: string
          id: string
          postcode_or_zip: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          additional_comments?: string | null
          address: string
          city: string
          contact_email: string
          contact_phone: string
          country: string
          created_at?: string
          facilities: string[]
          gym_name: string
          id?: string
          postcode_or_zip: string
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          additional_comments?: string | null
          address?: string
          city?: string
          contact_email?: string
          contact_phone?: string
          country?: string
          created_at?: string
          facilities?: string[]
          gym_name?: string
          id?: string
          postcode_or_zip?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gym_route_markers: {
        Row: {
          created_at: string
          route_id: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        Insert: {
          created_at?: string
          route_id: string
          updated_at?: string
          x_norm: number
          y_norm: number
        }
        Update: {
          created_at?: string
          route_id?: string
          updated_at?: string
          x_norm?: number
          y_norm?: number
        }
        Relationships: [
          {
            foreignKeyName: "gym_route_markers_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: true
            referencedRelation: "gym_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_routes: {
        Row: {
          color: string | null
          created_at: string
          discipline: string
          floor_plan_id: string
          grade: string
          gym_place_id: string
          id: string
          name: string | null
          setter_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          discipline: string
          floor_plan_id: string
          grade: string
          gym_place_id: string
          id?: string
          name?: string | null
          setter_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          discipline?: string
          floor_plan_id?: string
          grade?: string
          gym_place_id?: string
          id?: string
          name?: string | null
          setter_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_routes_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "gym_floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_routes_gym_place_id_fkey"
            columns: ["gym_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          admin_region_name: string | null
          asset_version: number
          capture_date: string | null
          checksum_sha256: string | null
          continent_name: string | null
          contribution_credit_handle: string | null
          contribution_credit_platform: string | null
          country_code: string | null
          country_id: string | null
          country_name: string | null
          crag_id: string | null
          created_at: string | null
          created_by: string | null
          face_direction: string | null
          face_directions: string[] | null
          face_order: number | null
          has_humans: boolean | null
          height: number | null
          id: string
          is_anonymous_submission: boolean
          is_primary: boolean
          is_verified: boolean | null
          last_edited_by: string | null
          latitude: number | null
          location_mode: string | null
          longitude: number | null
          moderated_at: string | null
          moderation_error: string | null
          moderation_labels: Json | null
          moderation_provider: string | null
          moderation_status: string | null
          natural_height: number | null
          natural_width: number | null
          original_bucket: string | null
          original_bytes: number | null
          original_height: number | null
          original_key: string | null
          original_mime_type: string | null
          original_width: number | null
          parent_image_id: string | null
          place_id: string | null
          processed_at: string | null
          processing_status: string
          status: string
          storage_bucket: string | null
          storage_path: string | null
          storage_provider: string
          submission_id: string | null
          un_region_name: string | null
          url: string
          variants: Json
          verification_count: number | null
          visibility: string
          width: number | null
        }
        Insert: {
          admin_region_name?: string | null
          asset_version?: number
          capture_date?: string | null
          checksum_sha256?: string | null
          continent_name?: string | null
          contribution_credit_handle?: string | null
          contribution_credit_platform?: string | null
          country_code?: string | null
          country_id?: string | null
          country_name?: string | null
          crag_id?: string | null
          created_at?: string | null
          created_by?: string | null
          face_direction?: string | null
          face_directions?: string[] | null
          face_order?: number | null
          has_humans?: boolean | null
          height?: number | null
          id?: string
          is_anonymous_submission?: boolean
          is_primary?: boolean
          is_verified?: boolean | null
          last_edited_by?: string | null
          latitude?: number | null
          location_mode?: string | null
          longitude?: number | null
          moderated_at?: string | null
          moderation_error?: string | null
          moderation_labels?: Json | null
          moderation_provider?: string | null
          moderation_status?: string | null
          natural_height?: number | null
          natural_width?: number | null
          original_bucket?: string | null
          original_bytes?: number | null
          original_height?: number | null
          original_key?: string | null
          original_mime_type?: string | null
          original_width?: number | null
          parent_image_id?: string | null
          place_id?: string | null
          processed_at?: string | null
          processing_status?: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          storage_provider?: string
          submission_id?: string | null
          un_region_name?: string | null
          url: string
          variants?: Json
          verification_count?: number | null
          visibility?: string
          width?: number | null
        }
        Update: {
          admin_region_name?: string | null
          asset_version?: number
          capture_date?: string | null
          checksum_sha256?: string | null
          continent_name?: string | null
          contribution_credit_handle?: string | null
          contribution_credit_platform?: string | null
          country_code?: string | null
          country_id?: string | null
          country_name?: string | null
          crag_id?: string | null
          created_at?: string | null
          created_by?: string | null
          face_direction?: string | null
          face_directions?: string[] | null
          face_order?: number | null
          has_humans?: boolean | null
          height?: number | null
          id?: string
          is_anonymous_submission?: boolean
          is_primary?: boolean
          is_verified?: boolean | null
          last_edited_by?: string | null
          latitude?: number | null
          location_mode?: string | null
          longitude?: number | null
          moderated_at?: string | null
          moderation_error?: string | null
          moderation_labels?: Json | null
          moderation_provider?: string | null
          moderation_status?: string | null
          natural_height?: number | null
          natural_width?: number | null
          original_bucket?: string | null
          original_bytes?: number | null
          original_height?: number | null
          original_key?: string | null
          original_mime_type?: string | null
          original_width?: number | null
          parent_image_id?: string | null
          place_id?: string | null
          processed_at?: string | null
          processing_status?: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          storage_provider?: string
          submission_id?: string | null
          un_region_name?: string | null
          url?: string
          variants?: Json
          verification_count?: number | null
          visibility?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_parent_image_id_fkey"
            columns: ["parent_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      location_tags: {
        Row: {
          country_code: string | null
          created_at: string
          id: string
          kind: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          id?: string
          kind: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          climb_id: string
          created_at: string | null
          date_climbed: string | null
          id: string
          notes: string | null
          status: string
          style: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          climb_id: string
          created_at?: string | null
          date_climbed?: string | null
          id?: string
          notes?: string | null
          status?: string
          style?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          climb_id?: string
          created_at?: string | null
          date_climbed?: string | null
          id?: string
          notes?: string | null
          status?: string
          style?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
      media_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          image_id: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          image_id: string
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          image_id?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_jobs_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          access_notes: string | null
          country: string | null
          country_code: string | null
          country_id: string | null
          created_at: string
          description: string | null
          disciplines: string[]
          id: string
          is_flagged: boolean
          latitude: number | null
          longitude: number | null
          name: string
          primary_discipline: string | null
          region_id: string | null
          region_name: string | null
          report_count: number
          rock_type: string | null
          slug: string | null
          synced_at: string | null
          tide_dependency: string | null
          type: string
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          country?: string | null
          country_code?: string | null
          country_id?: string | null
          created_at?: string
          description?: string | null
          disciplines?: string[]
          id?: string
          is_flagged?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          primary_discipline?: string | null
          region_id?: string | null
          region_name?: string | null
          report_count?: number
          rock_type?: string | null
          slug?: string | null
          synced_at?: string | null
          tide_dependency?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          country?: string | null
          country_code?: string | null
          country_id?: string | null
          created_at?: string
          description?: string | null
          disciplines?: string[]
          id?: string
          is_flagged?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          primary_discipline?: string | null
          region_id?: string | null
          region_name?: string | null
          report_count?: number
          rock_type?: string | null
          slug?: string | null
          synced_at?: string | null
          tide_dependency?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      product_clicks: {
        Row: {
          click_count: number | null
          product_id: string
          updated_at: string | null
        }
        Insert: {
          click_count?: number | null
          product_id: string
          updated_at?: string | null
        }
        Update: {
          click_count?: number | null
          product_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          boulder_system: string | null
          contribution_credit_handle: string | null
          contribution_credit_platform: string | null
          country: string | null
          country_code: string | null
          default_location: string | null
          default_location_lat: number | null
          default_location_lng: number | null
          default_location_name: string | null
          default_location_zoom: number | null
          display_name: string | null
          email: string | null
          first_name: string | null
          gender: string | null
          grade_system: string | null
          height_cm: number | null
          highest_grade: string | null
          id: string
          is_admin: boolean | null
          is_public: boolean | null
          last_name: string | null
          name: string | null
          name_updated_at: string | null
          preferred_grade_system: string | null
          preferred_style: string | null
          reach_cm: number | null
          route_system: string | null
          theme_preference: string | null
          tos_accepted_at: string | null
          total_climbs: number | null
          total_points: number | null
          trad_system: string | null
          units: string | null
          updated_at: string | null
          username: string | null
          website: string | null
          welcome_email_sent_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          boulder_system?: string | null
          contribution_credit_handle?: string | null
          contribution_credit_platform?: string | null
          country?: string | null
          country_code?: string | null
          default_location?: string | null
          default_location_lat?: number | null
          default_location_lng?: number | null
          default_location_name?: string | null
          default_location_zoom?: number | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          grade_system?: string | null
          height_cm?: number | null
          highest_grade?: string | null
          id: string
          is_admin?: boolean | null
          is_public?: boolean | null
          last_name?: string | null
          name?: string | null
          name_updated_at?: string | null
          preferred_grade_system?: string | null
          preferred_style?: string | null
          reach_cm?: number | null
          route_system?: string | null
          theme_preference?: string | null
          tos_accepted_at?: string | null
          total_climbs?: number | null
          total_points?: number | null
          trad_system?: string | null
          units?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
          welcome_email_sent_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          boulder_system?: string | null
          contribution_credit_handle?: string | null
          contribution_credit_platform?: string | null
          country?: string | null
          country_code?: string | null
          default_location?: string | null
          default_location_lat?: number | null
          default_location_lng?: number | null
          default_location_name?: string | null
          default_location_zoom?: number | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          grade_system?: string | null
          height_cm?: number | null
          highest_grade?: string | null
          id?: string
          is_admin?: boolean | null
          is_public?: boolean | null
          last_name?: string | null
          name?: string | null
          name_updated_at?: string | null
          preferred_grade_system?: string | null
          preferred_style?: string | null
          reach_cm?: number | null
          route_system?: string | null
          theme_preference?: string | null
          tos_accepted_at?: string | null
          total_climbs?: number | null
          total_points?: number | null
          trad_system?: string | null
          units?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
          welcome_email_sent_at?: string | null
        }
        Relationships: []
      }
      regions: {
        Row: {
          boundary: unknown
          center_lat: number | null
          center_lon: number | null
          country_code: string | null
          created_at: string
          id: string
          name: string
          un_region_name: string
        }
        Insert: {
          boundary?: unknown
          center_lat?: number | null
          center_lon?: number | null
          country_code?: string | null
          created_at?: string
          id?: string
          name: string
          un_region_name: string
        }
        Update: {
          boundary?: unknown
          center_lat?: number | null
          center_lon?: number | null
          country_code?: string | null
          created_at?: string
          id?: string
          name?: string
          un_region_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_un_region_name_fkey"
            columns: ["un_region_name"]
            isOneToOne: false
            referencedRelation: "un_regions"
            referencedColumns: ["name"]
          },
        ]
      }
      route_grades: {
        Row: {
          climb_id: string
          created_at: string | null
          grade: string
          id: string
          user_id: string
        }
        Insert: {
          climb_id: string
          created_at?: string | null
          grade: string
          id?: string
          user_id: string
        }
        Update: {
          climb_id?: string
          created_at?: string | null
          grade?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_grades_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
      route_lines: {
        Row: {
          climb_id: string
          color: string | null
          created_at: string | null
          id: string
          image_height: number | null
          image_id: string
          image_width: number | null
          points: Json
          sequence_order: number | null
        }
        Insert: {
          climb_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          image_height?: number | null
          image_id: string
          image_width?: number | null
          points: Json
          sequence_order?: number | null
        }
        Update: {
          climb_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          image_height?: number | null
          image_id?: string
          image_width?: number | null
          points?: Json
          sequence_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "route_lines_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_lines_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          crag_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          crag_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          crag_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      submission_collaborator_invites: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          image_id: string
          max_uses: number | null
          token: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_id: string
          max_uses?: number | null
          token?: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_id?: string
          max_uses?: number | null
          token?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "submission_collaborator_invites_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_collaborators: {
        Row: {
          created_at: string
          created_by: string | null
          image_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          image_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          image_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_collaborators_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_draft_collaborator_invites: {
        Row: {
          created_at: string
          created_by: string | null
          draft_id: string
          expires_at: string | null
          id: string
          max_uses: number | null
          token: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft_id: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          token?: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft_id?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          token?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "submission_draft_collaborator_invites_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "submission_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_draft_collaborators: {
        Row: {
          created_at: string
          created_by: string | null
          draft_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_draft_collaborators_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "submission_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_draft_images: {
        Row: {
          capture_date: string | null
          checksum_sha256: string | null
          created_at: string
          display_order: number
          draft_id: string
          height: number | null
          id: string
          latitude: number | null
          linked_crag_image_id: string | null
          linked_image_id: string | null
          longitude: number | null
          original_bucket: string | null
          original_bytes: number | null
          original_key: string | null
          original_mime_type: string | null
          preview_variants: Json
          processed_at: string | null
          processing_status: string
          route_data: Json
          storage_bucket: string
          storage_path: string
          storage_provider: string
          submitted_at: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          capture_date?: string | null
          checksum_sha256?: string | null
          created_at?: string
          display_order: number
          draft_id: string
          height?: number | null
          id?: string
          latitude?: number | null
          linked_crag_image_id?: string | null
          linked_image_id?: string | null
          longitude?: number | null
          original_bucket?: string | null
          original_bytes?: number | null
          original_key?: string | null
          original_mime_type?: string | null
          preview_variants?: Json
          processed_at?: string | null
          processing_status?: string
          route_data?: Json
          storage_bucket: string
          storage_path: string
          storage_provider?: string
          submitted_at?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          capture_date?: string | null
          checksum_sha256?: string | null
          created_at?: string
          display_order?: number
          draft_id?: string
          height?: number | null
          id?: string
          latitude?: number | null
          linked_crag_image_id?: string | null
          linked_image_id?: string | null
          longitude?: number | null
          original_bucket?: string | null
          original_bytes?: number | null
          original_key?: string | null
          original_mime_type?: string | null
          preview_variants?: Json
          processed_at?: string | null
          processing_status?: string
          route_data?: Json
          storage_bucket?: string
          storage_path?: string
          storage_provider?: string
          submitted_at?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_draft_images_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "submission_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_draft_images_linked_crag_image_id_fkey"
            columns: ["linked_crag_image_id"]
            isOneToOne: false
            referencedRelation: "crag_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_draft_images_linked_image_id_fkey"
            columns: ["linked_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_draft_routes: {
        Row: {
          climb_type: string
          created_at: string
          created_by: string | null
          description: string | null
          draft_id: string
          draft_image_id: string
          grade: string
          id: string
          image_height: number | null
          image_width: number | null
          name: string
          points: Json
          sequence_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          climb_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          draft_id: string
          draft_image_id: string
          grade?: string
          id?: string
          image_height?: number | null
          image_width?: number | null
          name?: string
          points?: Json
          sequence_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          climb_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          draft_id?: string
          draft_image_id?: string
          grade?: string
          id?: string
          image_height?: number | null
          image_width?: number | null
          name?: string
          points?: Json
          sequence_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_draft_routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_draft_routes_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "submission_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_draft_routes_draft_image_id_fkey"
            columns: ["draft_image_id"]
            isOneToOne: false
            referencedRelation: "submission_draft_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_draft_routes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_drafts: {
        Row: {
          crag_id: string | null
          created_at: string
          id: string
          last_edited_by: string | null
          metadata: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          crag_id?: string | null
          created_at?: string
          id?: string
          last_edited_by?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          crag_id?: string | null
          created_at?: string
          id?: string
          last_edited_by?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_drafts_crag_id_fkey"
            columns: ["crag_id"]
            isOneToOne: false
            referencedRelation: "crags"
            referencedColumns: ["id"]
          },
        ]
      }
      un_regions: {
        Row: {
          continent_name: string
          name: string
        }
        Insert: {
          continent_name: string
          name: string
        }
        Update: {
          continent_name?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "un_regions_continent_name_fkey"
            columns: ["continent_name"]
            isOneToOne: false
            referencedRelation: "continents"
            referencedColumns: ["name"]
          },
        ]
      }
      user_climbs: {
        Row: {
          climb_id: string
          created_at: string | null
          date_climbed: string | null
          grade_opinion: string | null
          grade_vote_baseline: string | null
          id: string
          notes: string | null
          star_rating: number | null
          style: string
          user_id: string
        }
        Insert: {
          climb_id: string
          created_at?: string | null
          date_climbed?: string | null
          grade_opinion?: string | null
          grade_vote_baseline?: string | null
          id?: string
          notes?: string | null
          star_rating?: number | null
          style: string
          user_id: string
        }
        Update: {
          climb_id?: string
          created_at?: string | null
          date_climbed?: string | null
          grade_opinion?: string | null
          grade_vote_baseline?: string | null
          id?: string
          notes?: string | null
          star_rating?: number | null
          style?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_climbs_climb_id_fkey"
            columns: ["climb_id"]
            isOneToOne: false
            referencedRelation: "climbs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      add_correction_type_value: {
        Args: { p_type: string; p_value: string }
        Returns: undefined
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      append_submission_draft_images_atomic: {
        Args: {
          p_draft_id: string
          p_expected_updated_at: string
          p_images: Json
        }
        Returns: Json
      }
      claim_media_job: {
        Args: { worker_name: string }
        Returns: {
          attempts: number
          created_at: string
          id: string
          image_id: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_at: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "media_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_submission_collaborator_invite: {
        Args: { p_token: string }
        Returns: Json
      }
      claim_submission_draft_collaborator_invite: {
        Args: { p_token: string }
        Returns: Json
      }
      cleanup_orphan_route_uploads: {
        Args: { max_age?: string; max_delete?: number }
        Returns: number
      }
      create_submission_routes_atomic: {
        Args: {
          p_crag_id: string
          p_image_id: string
          p_route_type: string
          p_routes: Json
        }
        Returns: {
          climb_id: string
          grade: string
          name: string
        }[]
      }
      create_unified_submission_atomic: {
        Args: {
          p_crag_id: string
          p_primary_image: Json
          p_route_type: string
          p_routes: Json
          p_supplementary_images: Json[]
        }
        Returns: Json
      }
      delete_account_atomic: {
        Args: {
          p_delete_route_uploads: boolean
          p_email: string
          p_user_id: string
        }
        Returns: {
          deleted_climbs: number
          deleted_images: number
          deleted_logs: number
          deleted_profile: boolean
          deleted_route_upload_images: number
          deleted_user_climbs: number
          nullified_climbs: number
          nullified_images: number
        }[]
      }
      delete_empty_crag: {
        Args: { grace_period?: string; target_crag_id: string }
        Returns: boolean
      }
      delete_empty_crags: { Args: { grace_period?: string }; Returns: number }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      find_region_by_location: {
        Args: { search_lat: number; search_lng: number }
        Returns: {
          center_lat: number
          center_lon: number
          country_code: string
          distance_meters: number
          id: string
          name: string
        }[]
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_active_climbers_count: { Args: never; Returns: number }
      get_boulders_with_gps_count: { Args: never; Returns: number }
      get_climb_full_context: { Args: { p_climb_id: string }; Returns: Json }
      get_community_contributors_count: { Args: never; Returns: number }
      get_community_photos_count: { Args: never; Returns: number }
      get_consensus_grade: { Args: { climb_id: string }; Returns: string }
      get_crag_faces_complete_summary: {
        Args: { p_image_id: string }
        Returns: Json
      }
      get_crag_pins:
        | {
            Args: never
            Returns: {
              id: string
              image_count: number
              latitude: number
              longitude: number
              name: string
            }[]
          }
        | {
            Args: { include_pending?: boolean }
            Returns: {
              id: string
              image_count: number
              latitude: number
              longitude: number
              name: string
            }[]
          }
      get_crag_route_intelligence: {
        Args: { p_crag_id: string }
        Returns: {
          directions: string[]
          grade: string
          has_topo: boolean
          id: string
          name: string
          rating_avg: number
          rating_count: number
          recent_send_count_60d: number
          route_type: string
          send_count: number
          slug: string
          topo_image_count: number
          weighted_rating: number
        }[]
      }
      get_crags_mapped_count: { Args: never; Returns: number }
      get_effective_climb_id: { Args: { p_climb_id: string }; Returns: string }
      get_grade_vote_distribution: {
        Args: { climb_id: string }
        Returns: {
          grade: string
          vote_count: number
        }[]
      }
      get_image_faces_summary: {
        Args: { p_image_id: string }
        Returns: {
          total_faces: number
          total_routes_combined: number
        }[]
      }
      get_place_rankings_leaderboard: {
        Args: {
          p_limit?: number
          p_page?: number
          p_place_id: string
          p_sort?: string
          p_window_start?: string
        }
        Returns: {
          avatar_url: string
          avg_grade: string
          climb_count: number
          rank: number
          total_users: number
          user_id: string
          username: string
        }[]
      }
      get_rankings_leaderboard: {
        Args: {
          p_gender?: string
          p_limit?: number
          p_page?: number
          p_region_id?: string
          p_sort?: string
          p_window_start?: string
        }
        Returns: {
          avatar_url: string
          avg_grade: string
          climb_count: number
          rank: number
          total_users: number
          user_id: string
          username: string
        }[]
      }
      get_star_rating_summary: {
        Args: { p_climb_id: string }
        Returns: {
          avg_rating: number
          rating_count: number
        }[]
      }
      get_total_climbs_count: { Args: never; Returns: number }
      get_total_logs_count: { Args: never; Returns: number }
      get_total_sends_count: { Args: never; Returns: number }
      get_upload_context: {
        Args: { search_lat: number; search_lng: number }
        Returns: Json
      }
      get_user_count: { Args: never; Returns: number }
      get_verification_count: { Args: { climb_id: string }; Returns: number }
      get_verified_routes_count: { Args: never; Returns: number }
      gettransactionid: { Args: never; Returns: unknown }
      increment_crag_report_count: {
        Args: { target_crag_id: string }
        Returns: undefined
      }
      increment_gear_click: {
        Args: { product_id_input: string }
        Returns: undefined
      }
      insert_grade_vote: {
        Args: { p_climb_id: string; vote_grade: string }
        Returns: undefined
      }
      insert_pin_images_atomic: {
        Args: { p_crag_id: string; p_urls: string[] }
        Returns: {
          crag_id: string
          created_at: string
          face_directions: string[] | null
          height: number | null
          id: string
          latitude: number | null
          linked_image_id: string | null
          longitude: number | null
          sector_id: string | null
          source_image_id: string | null
          url: string
          width: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "crag_images"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_climb_verified: { Args: { climb_id: string }; Returns: boolean }
      is_profile_public: { Args: { user_id: string }; Returns: boolean }
      is_submission_collaborator: {
        Args: { p_image_id: string; p_user_id: string }
        Returns: boolean
      }
      is_submission_draft_collaborator: {
        Args: { p_draft_id: string; p_user_id: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      normalize_climb_route_type: {
        Args: { raw_type: string }
        Returns: string
      }
      patch_submission_draft_images_atomic:
        | { Args: { p_draft_id: string; p_images: Json }; Returns: Json }
        | {
            Args: {
              p_draft_id: string
              p_expected_updated_at: string
              p_images: Json
            }
            Returns: Json
          }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      promote_draft_to_submission: {
        Args: { p_draft_id: string }
        Returns: Json
      }
      rankings_grade_from_points: {
        Args: { p_points: number }
        Returns: string
      }
      recompute_crag_counts: { Args: never; Returns: undefined }
      recompute_crag_location: {
        Args: { target_crag_id: string }
        Returns: undefined
      }
      refresh_crag_type_from_climbs: {
        Args: { target_crag_id: string }
        Returns: undefined
      }
      slugify: { Args: { input: string }; Returns: string }
      soft_delete_comment: { Args: { p_comment_id: string }; Returns: boolean }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      sync_climb_grade_from_votes: {
        Args: { p_climb_id: string }
        Returns: undefined
      }
      sync_submission_draft_routes: {
        Args: { p_draft_id: string; p_draft_image_id: string; p_routes: Json }
        Returns: Json
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_own_profile_submission_credit: {
        Args: { p_handle: string; p_platform: string }
        Returns: Json
      }
      update_own_submission_anonymity: {
        Args: { p_image_id: string; p_is_anonymous: boolean }
        Returns: Json
      }
      update_own_submission_credit: {
        Args: { p_handle: string; p_image_id: string; p_platform: string }
        Returns: Json
      }
      update_own_submitted_routes: {
        Args: { p_image_id: string; p_routes: Json }
        Returns: number
      }
      update_submission_crag_metadata: {
        Args: {
          p_crag_name: string
          p_image_id: string
          p_region_tag: string
          p_sub_area?: string
        }
        Returns: Json
      }
      update_submission_image_metadata:
        | {
            Args: {
              p_face_directions: string[]
              p_image_id: string
              p_latitude: number
              p_longitude: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_face_directions: string[]
              p_image_id: string
              p_latitude: number
              p_location_mode?: string
              p_longitude: number
            }
            Returns: Json
          }
      update_submission_image_order: {
        Args: { p_image_ids: Json; p_submission_id: string }
        Returns: number
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      user_can_edit_submission_draft: {
        Args: { p_draft_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
