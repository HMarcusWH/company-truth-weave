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
      agent_definitions: {
        Row: {
          agent_id: string
          budgets_json: Json | null
          created_at: string
          fallback_model_family: string | null
          max_tokens: number | null
          model_family_code: string
          name: string
          params_json: Json | null
          preferred_model_family: string | null
          reasoning_effort: string | null
          role_kind_code: string
          tools_allowed: string[] | null
        }
        Insert: {
          agent_id?: string
          budgets_json?: Json | null
          created_at?: string
          fallback_model_family?: string | null
          max_tokens?: number | null
          model_family_code: string
          name: string
          params_json?: Json | null
          preferred_model_family?: string | null
          reasoning_effort?: string | null
          role_kind_code: string
          tools_allowed?: string[] | null
        }
        Update: {
          agent_id?: string
          budgets_json?: Json | null
          created_at?: string
          fallback_model_family?: string | null
          max_tokens?: number | null
          model_family_code?: string
          name?: string
          params_json?: Json | null
          preferred_model_family?: string | null
          reasoning_effort?: string | null
          role_kind_code?: string
          tools_allowed?: string[] | null
        }
        Relationships: []
      }
      approval_policies: {
        Row: {
          created_at: string
          min_approvers: number
          policy_id: string
          required_roles: string[] | null
          scope: string
        }
        Insert: {
          created_at?: string
          min_approvers?: number
          policy_id?: string
          required_roles?: string[] | null
          scope: string
        }
        Update: {
          created_at?: string
          min_approvers?: number
          policy_id?: string
          required_roles?: string[] | null
          scope?: string
        }
        Relationships: []
      }
      change_requests: {
        Row: {
          applied_at: string | null
          approver_id: string | null
          cr_id: string
          created_at: string
          diff_summary: string | null
          kind: string
          proposed_by: string | null
          risk_level: string | null
          state: string
          target_id: string
        }
        Insert: {
          applied_at?: string | null
          approver_id?: string | null
          cr_id?: string
          created_at?: string
          diff_summary?: string | null
          kind: string
          proposed_by?: string | null
          risk_level?: string | null
          state?: string
          target_id: string
        }
        Update: {
          applied_at?: string | null
          approver_id?: string | null
          cr_id?: string
          created_at?: string
          diff_summary?: string | null
          kind?: string
          proposed_by?: string | null
          risk_level?: string | null
          state?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      code_sets: {
        Row: {
          code_set_id: string
          created_at: string | null
          description: string | null
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code_set_id?: string
          created_at?: string | null
          description?: string | null
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code_set_id?: string
          created_at?: string | null
          description?: string | null
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      code_systems: {
        Row: {
          code_system_id: string
          created_at: string
          kind: string
          name: string
          publisher: string | null
          url: string | null
          version: string
        }
        Insert: {
          code_system_id?: string
          created_at?: string
          kind: string
          name: string
          publisher?: string | null
          url?: string | null
          version: string
        }
        Update: {
          code_system_id?: string
          created_at?: string
          kind?: string
          name?: string
          publisher?: string | null
          url?: string | null
          version?: string
        }
        Relationships: []
      }
      code_values: {
        Row: {
          code: string
          code_set_id: string
          code_value_id: string
          created_at: string | null
          is_active: boolean | null
          label: string
          metadata: Json | null
          sort_order: number | null
        }
        Insert: {
          code: string
          code_set_id: string
          code_value_id?: string
          created_at?: string | null
          is_active?: boolean | null
          label: string
          metadata?: Json | null
          sort_order?: number | null
        }
        Update: {
          code?: string
          code_set_id?: string
          code_value_id?: string
          created_at?: string | null
          is_active?: boolean | null
          label?: string
          metadata?: Json | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "code_values_code_set_id_fkey"
            columns: ["code_set_id"]
            isOneToOne: false
            referencedRelation: "code_sets"
            referencedColumns: ["code_set_id"]
          },
        ]
      }
      company_details: {
        Row: {
          country_code: string | null
          created_at: string
          employees: number | null
          entity_id: string
          founded_year: number | null
          legal_form: string | null
          primary_isic_code: string | null
          size_band: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          employees?: number | null
          entity_id: string
          founded_year?: number | null
          legal_form?: string | null
          primary_isic_code?: string | null
          size_band?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          employees?: number | null
          entity_id?: string
          founded_year?: number | null
          legal_form?: string | null
          primary_isic_code?: string | null
          size_band?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_details_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "iso_countries"
            referencedColumns: ["alpha2"]
          },
          {
            foreignKeyName: "company_details_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      company_industries: {
        Row: {
          as_of: string | null
          code: string
          code_system_id: string
          confidence: number | null
          created_at: string
          entity_id: string
          evidence_doc_id: string | null
          role: string | null
          share_pct: number | null
        }
        Insert: {
          as_of?: string | null
          code: string
          code_system_id: string
          confidence?: number | null
          created_at?: string
          entity_id: string
          evidence_doc_id?: string | null
          role?: string | null
          share_pct?: number | null
        }
        Update: {
          as_of?: string | null
          code?: string
          code_system_id?: string
          confidence?: number | null
          created_at?: string
          entity_id?: string
          evidence_doc_id?: string | null
          role?: string | null
          share_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_industries_code_system_id_fkey"
            columns: ["code_system_id"]
            isOneToOne: false
            referencedRelation: "code_systems"
            referencedColumns: ["code_system_id"]
          },
          {
            foreignKeyName: "company_industries_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_industries_evidence_doc_id_fkey"
            columns: ["evidence_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_records: {
        Row: {
          consequences: string | null
          context: string | null
          created_at: string
          decision: string | null
          decision_record_id: string
          links: string[] | null
          options: Json | null
          subject_ref: string | null
        }
        Insert: {
          consequences?: string | null
          context?: string | null
          created_at?: string
          decision?: string | null
          decision_record_id?: string
          links?: string[] | null
          options?: Json | null
          subject_ref?: string | null
        }
        Update: {
          consequences?: string | null
          context?: string | null
          created_at?: string
          decision?: string | null
          decision_record_id?: string
          links?: string[] | null
          options?: Json | null
          subject_ref?: string | null
        }
        Relationships: []
      }
      document_chunk_embeddings: {
        Row: {
          chunk_id: string
          created_at: string
          embedding: string
        }
        Insert: {
          chunk_id: string
          created_at?: string
          embedding: string
        }
        Update: {
          chunk_id?: string
          created_at?: string
          embedding?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunk_embeddings_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: true
            referencedRelation: "document_chunks"
            referencedColumns: ["chunk_id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_id: string
          chunk_text: string
          created_at: string
          document_id: string
          seq: number
          word_count: number | null
        }
        Insert: {
          chunk_id?: string
          chunk_text: string
          created_at?: string
          document_id: string
          seq: number
          word_count?: number | null
        }
        Update: {
          chunk_id?: string
          chunk_text?: string
          created_at?: string
          document_id?: string
          seq?: number
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          confidence: number | null
          content_hash: string | null
          content_preview: string | null
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          embedding: string | null
          entity_id: string | null
          entity_name: string | null
          full_text: string | null
          id: string
          language: string | null
          metadata: Json | null
          published_date: string | null
          source_type: string | null
          source_url: string | null
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          content_hash?: string | null
          content_preview?: string | null
          created_at?: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          embedding?: string | null
          entity_id?: string | null
          entity_name?: string | null
          full_text?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          published_date?: string | null
          source_type?: string | null
          source_url?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          content_hash?: string | null
          content_preview?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          embedding?: string | null
          entity_id?: string | null
          entity_name?: string | null
          full_text?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          published_date?: string | null
          source_type?: string | null
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
          {
            foreignKeyName: "fk_documents_entity"
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
          country_code: string | null
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
          country_code?: string | null
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
          country_code?: string | null
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
      entity_addresses: {
        Row: {
          address_id: string
          address_line1: string | null
          address_line2: string | null
          country_code: string | null
          created_at: string
          entity_id: string
          is_hq: boolean | null
          lat: number | null
          locality: string | null
          lon: number | null
          postal_code: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          address_id?: string
          address_line1?: string | null
          address_line2?: string | null
          country_code?: string | null
          created_at?: string
          entity_id: string
          is_hq?: boolean | null
          lat?: number | null
          locality?: string | null
          lon?: number | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          address_id?: string
          address_line1?: string | null
          address_line2?: string | null
          country_code?: string | null
          created_at?: string
          entity_id?: string
          is_hq?: boolean | null
          lat?: number | null
          locality?: string | null
          lon?: number | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_addresses_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "iso_countries"
            referencedColumns: ["alpha2"]
          },
          {
            foreignKeyName: "entity_addresses_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_identifiers: {
        Row: {
          created_at: string
          entity_id: string
          is_primary: boolean | null
          namespace: string
          value: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          is_primary?: boolean | null
          namespace: string
          value: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          is_primary?: boolean | null
          namespace?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_identifiers_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_identifiers_namespace_fkey"
            columns: ["namespace"]
            isOneToOne: false
            referencedRelation: "identifier_namespaces"
            referencedColumns: ["namespace"]
          },
        ]
      }
      facts: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          evidence_doc_id: string | null
          evidence_span_end: number | null
          evidence_span_start: number | null
          evidence_text: string | null
          evidence_url: string | null
          id: string
          object: string
          predicate: string
          status: Database["public"]["Enums"]["fact_status"]
          subject: string
          updated_at: string
          value_code: string | null
          value_country: string | null
          value_date: string | null
          value_entity_id: string | null
          value_money_amount: number | null
          value_money_ccy: string | null
          value_number: number | null
          value_pct: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence_doc_id?: string | null
          evidence_span_end?: number | null
          evidence_span_start?: number | null
          evidence_text?: string | null
          evidence_url?: string | null
          id?: string
          object: string
          predicate: string
          status?: Database["public"]["Enums"]["fact_status"]
          subject: string
          updated_at?: string
          value_code?: string | null
          value_country?: string | null
          value_date?: string | null
          value_entity_id?: string | null
          value_money_amount?: number | null
          value_money_ccy?: string | null
          value_number?: number | null
          value_pct?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence_doc_id?: string | null
          evidence_span_end?: number | null
          evidence_span_start?: number | null
          evidence_text?: string | null
          evidence_url?: string | null
          id?: string
          object?: string
          predicate?: string
          status?: Database["public"]["Enums"]["fact_status"]
          subject?: string
          updated_at?: string
          value_code?: string | null
          value_country?: string | null
          value_date?: string | null
          value_entity_id?: string | null
          value_money_amount?: number | null
          value_money_ccy?: string | null
          value_number?: number | null
          value_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "facts_value_country_fkey"
            columns: ["value_country"]
            isOneToOne: false
            referencedRelation: "iso_countries"
            referencedColumns: ["alpha2"]
          },
          {
            foreignKeyName: "facts_value_entity_id_fkey"
            columns: ["value_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_value_money_ccy_fkey"
            columns: ["value_money_ccy"]
            isOneToOne: false
            referencedRelation: "iso_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fk_facts_evidence_doc"
            columns: ["evidence_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      guardrail_results: {
        Row: {
          created_at: string
          details_json: Json | null
          node_run_id: string | null
          result_id: string
          status_code: string
          suite: string
        }
        Insert: {
          created_at?: string
          details_json?: Json | null
          node_run_id?: string | null
          result_id?: string
          status_code: string
          suite: string
        }
        Update: {
          created_at?: string
          details_json?: Json | null
          node_run_id?: string | null
          result_id?: string
          status_code?: string
          suite?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardrail_results_node_run_id_fkey"
            columns: ["node_run_id"]
            isOneToOne: false
            referencedRelation: "node_runs"
            referencedColumns: ["node_run_id"]
          },
        ]
      }
      identifier_namespaces: {
        Row: {
          created_at: string
          issuer: string | null
          label: string
          namespace: string
          pattern: string | null
          scope: string | null
          url_template: string | null
        }
        Insert: {
          created_at?: string
          issuer?: string | null
          label: string
          namespace: string
          pattern?: string | null
          scope?: string | null
          url_template?: string | null
        }
        Update: {
          created_at?: string
          issuer?: string | null
          label?: string
          namespace?: string
          pattern?: string | null
          scope?: string | null
          url_template?: string | null
        }
        Relationships: []
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
      iso_countries: {
        Row: {
          alpha2: string
          alpha3: string
          created_at: string
          name_en: string
          numeric_code: string | null
          official_name_en: string | null
        }
        Insert: {
          alpha2: string
          alpha3: string
          created_at?: string
          name_en: string
          numeric_code?: string | null
          official_name_en?: string | null
        }
        Update: {
          alpha2?: string
          alpha3?: string
          created_at?: string
          name_en?: string
          numeric_code?: string | null
          official_name_en?: string | null
        }
        Relationships: []
      }
      iso_currencies: {
        Row: {
          code: string
          created_at: string
          minor_unit: number | null
          name_en: string
          numeric_code: string | null
        }
        Insert: {
          code: string
          created_at?: string
          minor_unit?: number | null
          name_en: string
          numeric_code?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          minor_unit?: number | null
          name_en?: string
          numeric_code?: string | null
        }
        Relationships: []
      }
      message_logs: {
        Row: {
          content_text: string | null
          created_at: string
          message_id: string
          node_run_id: string
          role_code: string
          tool_args_json: Json | null
          tool_name: string | null
        }
        Insert: {
          content_text?: string | null
          created_at?: string
          message_id?: string
          node_run_id: string
          role_code: string
          tool_args_json?: Json | null
          tool_name?: string | null
        }
        Update: {
          content_text?: string | null
          created_at?: string
          message_id?: string
          node_run_id?: string
          role_code?: string
          tool_args_json?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_node_run_id_fkey"
            columns: ["node_run_id"]
            isOneToOne: false
            referencedRelation: "node_runs"
            referencedColumns: ["node_run_id"]
          },
        ]
      }
      model_configurations: {
        Row: {
          api_endpoint: string
          api_version: string
          config_id: string
          created_at: string | null
          max_output_tokens_param: string | null
          model_family_code: string
          reasoning_effort_levels: string[] | null
          supports_seed: boolean | null
          supports_temperature: boolean | null
          temperature_default: number | null
        }
        Insert: {
          api_endpoint: string
          api_version?: string
          config_id?: string
          created_at?: string | null
          max_output_tokens_param?: string | null
          model_family_code: string
          reasoning_effort_levels?: string[] | null
          supports_seed?: boolean | null
          supports_temperature?: boolean | null
          temperature_default?: number | null
        }
        Update: {
          api_endpoint?: string
          api_version?: string
          config_id?: string
          created_at?: string | null
          max_output_tokens_param?: string | null
          model_family_code?: string
          reasoning_effort_levels?: string[] | null
          supports_seed?: boolean | null
          supports_temperature?: boolean | null
          temperature_default?: number | null
        }
        Relationships: []
      }
      node_runs: {
        Row: {
          agent_id: string | null
          created_at: string
          error_message: string | null
          input_vars_json: Json | null
          latency_ms: number | null
          model_family_code: string | null
          model_params_json: Json | null
          node_id: string
          node_run_id: string
          outputs_json: Json | null
          prompt_version_id: string | null
          rendered_prompt_text: string | null
          run_id: string
          status_code: string
          tokens_input: number | null
          tokens_output: number | null
          tool_calls_json: Json | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          error_message?: string | null
          input_vars_json?: Json | null
          latency_ms?: number | null
          model_family_code?: string | null
          model_params_json?: Json | null
          node_id: string
          node_run_id?: string
          outputs_json?: Json | null
          prompt_version_id?: string | null
          rendered_prompt_text?: string | null
          run_id: string
          status_code?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tool_calls_json?: Json | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          error_message?: string | null
          input_vars_json?: Json | null
          latency_ms?: number | null
          model_family_code?: string | null
          model_params_json?: Json | null
          node_id?: string
          node_run_id?: string
          outputs_json?: Json | null
          prompt_version_id?: string | null
          rendered_prompt_text?: string | null
          run_id?: string
          status_code?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tool_calls_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "node_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_definitions"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "node_runs_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["prompt_version_id"]
          },
          {
            foreignKeyName: "node_runs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      picklist_company_status: {
        Row: {
          code: string
          created_at: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          label?: string
        }
        Relationships: []
      }
      picklist_legal_form: {
        Row: {
          code: string
          country_code: string | null
          created_at: string
          label: string
        }
        Insert: {
          code: string
          country_code?: string | null
          created_at?: string
          label: string
        }
        Update: {
          code?: string
          country_code?: string | null
          created_at?: string
          label?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_bindings: {
        Row: {
          agent_id: string
          binding_id: string
          constraints_json: Json | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          env_code: string
          prompt_version_id: string
          rollout_id: string | null
          traffic_weight: number
        }
        Insert: {
          agent_id: string
          binding_id?: string
          constraints_json?: Json | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          env_code: string
          prompt_version_id: string
          rollout_id?: string | null
          traffic_weight?: number
        }
        Update: {
          agent_id?: string
          binding_id?: string
          constraints_json?: Json | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          env_code?: string
          prompt_version_id?: string
          rollout_id?: string | null
          traffic_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_bindings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_definitions"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "prompt_bindings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_bindings_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["prompt_version_id"]
          },
          {
            foreignKeyName: "prompt_bindings_rollout_id_fkey"
            columns: ["rollout_id"]
            isOneToOne: false
            referencedRelation: "rollouts"
            referencedColumns: ["rollout_id"]
          },
        ]
      }
      prompt_metrics_daily: {
        Row: {
          calls: number
          contradiction_rate: number | null
          date: string
          error_rate: number | null
          latency_p95: number | null
          pass_rate: number | null
          prompt_version_id: string
          rollback_count: number
        }
        Insert: {
          calls?: number
          contradiction_rate?: number | null
          date: string
          error_rate?: number | null
          latency_p95?: number | null
          pass_rate?: number | null
          prompt_version_id: string
          rollback_count?: number
        }
        Update: {
          calls?: number
          contradiction_rate?: number | null
          date?: string
          error_rate?: number | null
          latency_p95?: number | null
          pass_rate?: number | null
          prompt_version_id?: string
          rollback_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_metrics_daily_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["prompt_version_id"]
          },
        ]
      }
      prompt_partials: {
        Row: {
          content_sha256: string | null
          content_text: string
          created_at: string
          lang: string | null
          name: string
          partial_id: string
          tags: string[] | null
          version: string
        }
        Insert: {
          content_sha256?: string | null
          content_text: string
          created_at?: string
          lang?: string | null
          name: string
          partial_id?: string
          tags?: string[] | null
          version?: string
        }
        Update: {
          content_sha256?: string | null
          content_text?: string
          created_at?: string
          lang?: string | null
          name?: string
          partial_id?: string
          tags?: string[] | null
          version?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          created_at: string
          default_lang: string | null
          modality_code: string
          name: string
          owner_user_id: string | null
          prompt_template_id: string
          purpose: string | null
          role_type_code: string
          task_domain: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_lang?: string | null
          modality_code: string
          name: string
          owner_user_id?: string | null
          prompt_template_id?: string
          purpose?: string | null
          role_type_code: string
          task_domain?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_lang?: string | null
          modality_code?: string
          name?: string
          owner_user_id?: string | null
          prompt_template_id?: string
          purpose?: string | null
          role_type_code?: string
          task_domain?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          blocks_json: Json | null
          canary_pct: number
          change_summary: string | null
          content_embedding: string | null
          content_sha256: string | null
          content_text: string
          created_at: string
          created_by: string | null
          is_default: boolean
          output_schema_json: Json | null
          prompt_template_id: string
          prompt_version_id: string
          safety_policies: string[] | null
          semver: string
          state_code: string
          variables_json: Json | null
        }
        Insert: {
          blocks_json?: Json | null
          canary_pct?: number
          change_summary?: string | null
          content_embedding?: string | null
          content_sha256?: string | null
          content_text: string
          created_at?: string
          created_by?: string | null
          is_default?: boolean
          output_schema_json?: Json | null
          prompt_template_id: string
          prompt_version_id?: string
          safety_policies?: string[] | null
          semver: string
          state_code?: string
          variables_json?: Json | null
        }
        Update: {
          blocks_json?: Json | null
          canary_pct?: number
          change_summary?: string | null
          content_embedding?: string | null
          content_sha256?: string | null
          content_text?: string
          created_at?: string
          created_by?: string | null
          is_default?: boolean
          output_schema_json?: Json | null
          prompt_template_id?: string
          prompt_version_id?: string
          safety_policies?: string[] | null
          semver?: string
          state_code?: string
          variables_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_versions_prompt_template_id_fkey"
            columns: ["prompt_template_id"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["prompt_template_id"]
          },
        ]
      }
      rollouts: {
        Row: {
          created_at: string
          env_code: string
          name: string
          rollout_id: string
          status: string
        }
        Insert: {
          created_at?: string
          env_code: string
          name: string
          rollout_id?: string
          status?: string
        }
        Update: {
          created_at?: string
          env_code?: string
          name?: string
          rollout_id?: string
          status?: string
        }
        Relationships: []
      }
      runs: {
        Row: {
          created_at: string
          created_by: string | null
          decision_record_id: string | null
          ended_at: string | null
          env_code: string
          metrics_json: Json | null
          run_id: string
          started_at: string
          status_code: string
          workflow_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decision_record_id?: string | null
          ended_at?: string | null
          env_code: string
          metrics_json?: Json | null
          run_id?: string
          started_at?: string
          status_code?: string
          workflow_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decision_record_id?: string | null
          ended_at?: string | null
          env_code?: string
          metrics_json?: Json | null
          run_id?: string
          started_at?: string
          status_code?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["workflow_id"]
          },
        ]
      }
      taxonomy_crosswalks: {
        Row: {
          confidence: number | null
          created_at: string
          crosswalk_id: string
          evidence_doc_id: string | null
          from_code: string
          from_system_id: string
          relation: Database["public"]["Enums"]["xwalk_relation"]
          to_code: string
          to_system_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          crosswalk_id?: string
          evidence_doc_id?: string | null
          from_code: string
          from_system_id: string
          relation: Database["public"]["Enums"]["xwalk_relation"]
          to_code: string
          to_system_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          crosswalk_id?: string
          evidence_doc_id?: string | null
          from_code?: string
          from_system_id?: string
          relation?: Database["public"]["Enums"]["xwalk_relation"]
          to_code?: string
          to_system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_crosswalks_evidence_doc_id_fkey"
            columns: ["evidence_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxonomy_crosswalks_from_system_id_fkey"
            columns: ["from_system_id"]
            isOneToOne: false
            referencedRelation: "code_systems"
            referencedColumns: ["code_system_id"]
          },
          {
            foreignKeyName: "taxonomy_crosswalks_to_system_id_fkey"
            columns: ["to_system_id"]
            isOneToOne: false
            referencedRelation: "code_systems"
            referencedColumns: ["code_system_id"]
          },
        ]
      }
      taxonomy_node_embeddings: {
        Row: {
          created_at: string
          embedding: string
          node_id: string
        }
        Insert: {
          created_at?: string
          embedding: string
          node_id: string
        }
        Update: {
          created_at?: string
          embedding?: string
          node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_node_embeddings_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: true
            referencedRelation: "taxonomy_nodes"
            referencedColumns: ["node_id"]
          },
        ]
      }
      taxonomy_nodes: {
        Row: {
          code: string
          code_system_id: string
          created_at: string
          description: string | null
          label: string
          level: number | null
          metadata: Json | null
          node_id: string
          parent_code: string | null
          path: unknown
          synonyms: Json | null
        }
        Insert: {
          code: string
          code_system_id: string
          created_at?: string
          description?: string | null
          label: string
          level?: number | null
          metadata?: Json | null
          node_id?: string
          parent_code?: string | null
          path?: unknown
          synonyms?: Json | null
        }
        Update: {
          code?: string
          code_system_id?: string
          created_at?: string
          description?: string | null
          label?: string
          level?: number | null
          metadata?: Json | null
          node_id?: string
          parent_code?: string | null
          path?: unknown
          synonyms?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_nodes_code_system_id_fkey"
            columns: ["code_system_id"]
            isOneToOne: false
            referencedRelation: "code_systems"
            referencedColumns: ["code_system_id"]
          },
        ]
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
      workflow_templates: {
        Row: {
          created_at: string
          description: string | null
          graph_json: Json
          name: string
          owner_user_id: string | null
          version: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          graph_json: Json
          name: string
          owner_user_id?: string | null
          version: string
          workflow_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          graph_json?: Json
          name?: string
          owner_user_id?: string | null
          version?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advisory_unlock: { Args: { key: number }; Returns: boolean }
      fk_code_value_ok: {
        Args: { p_code: string; p_set: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      text2ltree: { Args: { "": string }; Returns: unknown }
      try_advisory_lock: { Args: { key: number }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      doc_type:
        | "filing"
        | "article"
        | "press_release"
        | "financial_report"
        | "other"
        | "annual_report"
        | "interim_report"
        | "prospectus"
        | "sustainability_report"
        | "remuneration_report"
        | "sec_10k"
        | "sec_10q"
        | "sec_8k"
        | "sec_20f"
        | "esg_report"
        | "offering_circular"
      entity_type: "company" | "person" | "location" | "product" | "event"
      fact_status: "pending" | "verified" | "disputed" | "superseded"
      ingestion_status: "pending" | "running" | "completed" | "failed"
      xwalk_relation: "exact" | "broader" | "narrower" | "related"
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
        "annual_report",
        "interim_report",
        "prospectus",
        "sustainability_report",
        "remuneration_report",
        "sec_10k",
        "sec_10q",
        "sec_8k",
        "sec_20f",
        "esg_report",
        "offering_circular",
      ],
      entity_type: ["company", "person", "location", "product", "event"],
      fact_status: ["pending", "verified", "disputed", "superseded"],
      ingestion_status: ["pending", "running", "completed", "failed"],
      xwalk_relation: ["exact", "broader", "narrower", "related"],
    },
  },
} as const
