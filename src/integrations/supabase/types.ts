export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          user_id: string | null
          user_name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          user_id?: string | null
          user_name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      ai_requests: {
        Row: {
          action: string
          created_at: string
          id: string
          model: string | null
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          model?: string | null
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          model?: string | null
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      contents: {
        Row: {
          confirmation_token: string | null
          created_at: string
          end_time: string | null
          id: string
          image_url: string
          metadata: Json | null
          screen_id: string | null
          sender_email: string | null
          source: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          confirmation_token?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          image_url: string
          metadata?: Json | null
          screen_id?: string | null
          sender_email?: string | null
          source?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          confirmation_token?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          image_url?: string
          metadata?: Json | null
          screen_id?: string | null
          sender_email?: string | null
          source?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contents_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
        ]
      }
      email_actions: {
        Row: {
          action_type: string
          actor_email: string | null
          content_id: string | null
          created_at: string
          details: string | null
          id: string
        }
        Insert: {
          action_type: string
          actor_email?: string | null
          content_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
        }
        Update: {
          action_type?: string
          actor_email?: string | null
          content_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_actions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_settings: {
        Row: {
          establishment_id: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          establishment_id: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          establishment_id?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishment_settings_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          max_screens: number
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_screens?: number
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_screens?: number
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inbox_emails: {
        Row: {
          attachment_count: number | null
          attachment_urls: string[] | null
          body_preview: string | null
          content_id: string | null
          created_at: string
          from_email: string
          from_name: string | null
          has_attachments: boolean | null
          id: string
          is_processed: boolean | null
          message_id: string | null
          raw_date: string | null
          subject: string | null
        }
        Insert: {
          attachment_count?: number | null
          attachment_urls?: string[] | null
          body_preview?: string | null
          content_id?: string | null
          created_at?: string
          from_email: string
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          is_processed?: boolean | null
          message_id?: string | null
          raw_date?: string | null
          subject?: string | null
        }
        Update: {
          attachment_count?: number | null
          attachment_urls?: string[] | null
          body_preview?: string | null
          content_id?: string | null
          created_at?: string
          from_email?: string
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          is_processed?: boolean | null
          message_id?: string | null
          raw_date?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_emails_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_regions: {
        Row: {
          created_at: string
          height: number
          id: string
          layout_id: string
          media_id: string | null
          name: string
          widget_config: Json | null
          widget_type: string | null
          width: number
          x: number
          y: number
          z_index: number
        }
        Insert: {
          created_at?: string
          height?: number
          id?: string
          layout_id: string
          media_id?: string | null
          name?: string
          widget_config?: Json | null
          widget_type?: string | null
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          layout_id?: string
          media_id?: string | null
          name?: string
          widget_config?: Json | null
          widget_type?: string | null
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "layout_regions_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_regions_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      layouts: {
        Row: {
          background_color: string
          bg_image_fit: string
          bg_image_url: string | null
          bg_overlay_blur: number
          bg_overlay_darken: number
          bg_type: string
          created_at: string
          establishment_id: string | null
          height: number
          id: string
          name: string
          updated_at: string
          user_id: string | null
          wall_id: string | null
          wall_mode: string
          width: number
        }
        Insert: {
          background_color?: string
          bg_image_fit?: string
          bg_image_url?: string | null
          bg_overlay_blur?: number
          bg_overlay_darken?: number
          bg_type?: string
          created_at?: string
          establishment_id?: string | null
          height?: number
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
          wall_id?: string | null
          wall_mode?: string
          width?: number
        }
        Update: {
          background_color?: string
          bg_image_fit?: string
          bg_image_url?: string | null
          bg_overlay_blur?: number
          bg_overlay_darken?: number
          bg_type?: string
          created_at?: string
          establishment_id?: string | null
          height?: number
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
          wall_id?: string | null
          wall_mode?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "layouts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layouts_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "video_walls"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          establishment_id: string | null
          id: string
          is_active: boolean
          license_key: string
          screen_id: string | null
          source: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          establishment_id?: string | null
          id?: string
          is_active?: boolean
          license_key: string
          screen_id?: string | null
          source?: string
          valid_from?: string
          valid_until: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          establishment_id?: string | null
          id?: string
          is_active?: boolean
          license_key?: string
          screen_id?: string | null
          source?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          created_at: string
          duration: number
          establishment_id: string | null
          id: string
          name: string
          type: string
          url: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration?: number
          establishment_id?: string | null
          id?: string
          name: string
          type: string
          url: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration?: number
          establishment_id?: string | null
          id?: string
          name?: string
          type?: string
          url?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          is_read: boolean
          message: string | null
          screen_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          is_read?: boolean
          message?: string | null
          screen_id?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          is_read?: boolean
          message?: string | null
          screen_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_requests: {
        Row: {
          created_at: string
          email: string
          handled_at: string | null
          handled_by: string | null
          id: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      playlist_items: {
        Row: {
          created_at: string
          duration: number | null
          id: string
          media_id: string
          playlist_id: string | null
          position: number
          screen_id: string | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          id?: string
          media_id: string
          playlist_id?: string | null
          position?: number
          screen_id?: string | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          id?: string
          media_id?: string
          playlist_id?: string | null
          position?: number
          screen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playlist_items_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          establishment_id: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          establishment_id?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          establishment_id?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playlists_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          created_at: string
          establishment_id: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          establishment_id?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          establishment_id?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_requests: {
        Row: {
          address: string | null
          code_categorie: string | null
          code_tva: string | null
          created_at: string
          display_name: string
          email: string
          establishment_name: string
          id: string
          matricule_fiscal: string | null
          message: string | null
          num_screens: number
          phone: string | null
          registre_commerce: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          secteur_activite: string | null
          status: string
        }
        Insert: {
          address?: string | null
          code_categorie?: string | null
          code_tva?: string | null
          created_at?: string
          display_name: string
          email: string
          establishment_name: string
          id?: string
          matricule_fiscal?: string | null
          message?: string | null
          num_screens?: number
          phone?: string | null
          registre_commerce?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          secteur_activite?: string | null
          status?: string
        }
        Update: {
          address?: string | null
          code_categorie?: string | null
          code_tva?: string | null
          created_at?: string
          display_name?: string
          email?: string
          establishment_name?: string
          id?: string
          matricule_fiscal?: string | null
          message?: string | null
          num_screens?: number
          phone?: string | null
          registre_commerce?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          secteur_activite?: string | null
          status?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          active: boolean
          created_at: string
          days_of_week: number[]
          end_date: string | null
          end_time: string
          id: string
          media_id: string | null
          playlist_id: string | null
          program_id: string | null
          screen_id: string | null
          start_date: string | null
          start_time: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days_of_week?: number[]
          end_date?: string | null
          end_time?: string
          id?: string
          media_id?: string | null
          playlist_id?: string | null
          program_id?: string | null
          screen_id?: string | null
          start_date?: string | null
          start_time?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days_of_week?: number[]
          end_date?: string | null
          end_time?: string
          id?: string
          media_id?: string | null
          playlist_id?: string | null
          program_id?: string | null
          screen_id?: string | null
          start_date?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
        ]
      }
      screens: {
        Row: {
          created_at: string
          current_media_id: string | null
          debug_mode: number
          establishment_id: string | null
          fallback_notified: boolean
          fallback_since: string | null
          id: string
          layout_id: string | null
          name: string
          orientation: string
          player_heartbeat_at: string | null
          player_ip: string | null
          player_lan_ip: string | null
          player_session_id: string | null
          player_user_agent: string | null
          playlist_id: string | null
          program_id: string | null
          resolution: string
          slug: string | null
          status: string
          updated_at: string
          user_id: string | null
          wall_col: number | null
          wall_id: string | null
          wall_row: number | null
        }
        Insert: {
          created_at?: string
          current_media_id?: string | null
          debug_mode?: number
          establishment_id?: string | null
          fallback_notified?: boolean
          fallback_since?: string | null
          id?: string
          layout_id?: string | null
          name: string
          orientation?: string
          player_heartbeat_at?: string | null
          player_ip?: string | null
          player_lan_ip?: string | null
          player_session_id?: string | null
          player_user_agent?: string | null
          playlist_id?: string | null
          program_id?: string | null
          resolution?: string
          slug?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          wall_col?: number | null
          wall_id?: string | null
          wall_row?: number | null
        }
        Update: {
          created_at?: string
          current_media_id?: string | null
          debug_mode?: number
          establishment_id?: string | null
          fallback_notified?: boolean
          fallback_since?: string | null
          id?: string
          layout_id?: string | null
          name?: string
          orientation?: string
          player_heartbeat_at?: string | null
          player_ip?: string | null
          player_lan_ip?: string | null
          player_session_id?: string | null
          player_user_agent?: string | null
          playlist_id?: string | null
          program_id?: string | null
          resolution?: string
          slug?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          wall_col?: number | null
          wall_id?: string | null
          wall_row?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "screens_current_media_id_fkey"
            columns: ["current_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screens_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screens_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screens_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screens_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screens_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "video_walls"
            referencedColumns: ["id"]
          },
        ]
      }
      user_establishments: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_establishments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_walls: {
        Row: {
          cols: number
          created_at: string
          establishment_id: string | null
          id: string
          name: string
          rows: number
          updated_at: string
          user_id: string | null
          wall_layout_mode: string
        }
        Insert: {
          cols?: number
          created_at?: string
          establishment_id?: string | null
          id?: string
          name: string
          rows?: number
          updated_at?: string
          user_id?: string | null
          wall_layout_mode?: string
        }
        Update: {
          cols?: number
          created_at?: string
          establishment_id?: string | null
          id?: string
          name?: string
          rows?: number
          updated_at?: string
          user_id?: string | null
          wall_layout_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_walls_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_fallback_alerts: { Args: never; Returns: undefined }
      establishment_role: {
        Args: { _establishment_id: string; _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member_of: {
        Args: { _establishment_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "marketing"
      content_status: "pending" | "scheduled" | "active" | "rejected"
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
  public: {
    Enums: {
      app_role: ["admin", "user", "marketing"],
      content_status: ["pending", "scheduled", "active", "rejected"],
    },
  },
} as const
