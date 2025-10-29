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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      documents: {
        Row: {
          confidence: number | null
          content_preview: string | null
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          embedding: string | null
          entity_id: string | null
          entity_name: string | null
          full_text: string | null
          id: string
          metadata: Json | null
          published_date: string | null
          source_url: string | null
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          content_preview?: string | null
          created_at?: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          embedding?: string | null
          entity_id?: string | null
          entity_name?: string | null
          full_text?: string | null
          id?: string
          metadata?: Json | null
          published_date?: string | null
          source_url?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          content_preview?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          embedding?: string | null
          entity_id?: string | null
          entity_name?: string | null
          full_text?: string | null
          id?: string
          metadata?: Json | null
          published_date?: string | null
          source_url?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          addresses: Json | null
          created_at: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          identifiers: Json | null
          legal_name: string
          metadata: Json | null
          relationships: Json | null
          trading_names: Json | null
          updated_at: string
          website: string | null
        }
        Insert: {
          addresses?: Json | null
          created_at?: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          identifiers?: Json | null
          legal_name: string
          metadata?: Json | null
          relationships?: Json | null
          trading_names?: Json | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          addresses?: Json | null
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          identifiers?: Json | null
          legal_name?: string
          metadata?: Json | null
          relationships?: Json | null
          trading_names?: Json | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      facts: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          evidence_doc_id: string | null
          evidence_text: string | null
          evidence_url: string | null
          id: string
          object: string
          predicate: string
          status: Database["public"]["Enums"]["fact_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence_doc_id?: string | null
          evidence_text?: string | null
          evidence_url?: string | null
          id?: string
          object: string
          predicate: string
          status?: Database["public"]["Enums"]["fact_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence_doc_id?: string | null
          evidence_text?: string | null
          evidence_url?: string | null
          id?: string
          object?: string
          predicate?: string
          status?: Database["public"]["Enums"]["fact_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facts_evidence_doc_id_fkey"
            columns: ["evidence_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          completed_at: string | null
          documents_processed: number | null
          errors: Json | null
          facts_extracted: number | null
          id: string
          metadata: Json | null
          source_name: string
          started_at: string
          status: Database["public"]["Enums"]["ingestion_status"]
        }
        Insert: {
          completed_at?: string | null
          documents_processed?: number | null
          errors?: Json | null
          facts_extracted?: number | null
          id?: string
          metadata?: Json | null
          source_name: string
          started_at?: string
          status?: Database["public"]["Enums"]["ingestion_status"]
        }
        Update: {
          completed_at?: string | null
          documents_processed?: number | null
          errors?: Json | null
          facts_extracted?: number | null
          id?: string
          metadata?: Json | null
          source_name?: string
          started_at?: string
          status?: Database["public"]["Enums"]["ingestion_status"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      validation_results: {
        Row: {
          fact_id: string
          id: string
          is_valid: boolean
          issues: Json | null
          validated_at: string
          validation_score: number | null
          validator_type: string
        }
        Insert: {
          fact_id: string
          id?: string
          is_valid: boolean
          issues?: Json | null
          validated_at?: string
          validation_score?: number | null
          validator_type: string
        }
        Update: {
          fact_id?: string
          id?: string
          is_valid?: boolean
          issues?: Json | null
          validated_at?: string
          validation_score?: number | null
          validator_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_results_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "facts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      doc_type:
        | "filing"
        | "article"
        | "press_release"
        | "financial_report"
        | "other"
      entity_type: "company" | "person" | "location" | "product" | "event"
      fact_status: "pending" | "verified" | "disputed" | "superseded"
      ingestion_status: "pending" | "running" | "completed" | "failed"
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
      app_role: ["admin", "moderator", "user"],
      doc_type: [
        "filing",
        "article",
        "press_release",
        "financial_report",
        "other",
      ],
      entity_type: ["company", "person", "location", "product", "event"],
      fact_status: ["pending", "verified", "disputed", "superseded"],
      ingestion_status: ["pending", "running", "completed", "failed"],
    },
  },
} as const
