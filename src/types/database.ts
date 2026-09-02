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
      acquisition_cost_lines: {
        Row: {
          actual_minor: number | null
          client_record_id: string
          cost_category: Database["public"]["Enums"]["acquisition_cost_category"]
          created_at: string
          estimated_minor: number | null
          id: string
          ledger_entry_id: string | null
          note: string | null
          planned_vehicle_id: string
        }
        Insert: {
          actual_minor?: number | null
          client_record_id?: string
          cost_category: Database["public"]["Enums"]["acquisition_cost_category"]
          created_at?: string
          estimated_minor?: number | null
          id?: string
          ledger_entry_id?: string | null
          note?: string | null
          planned_vehicle_id: string
        }
        Update: {
          actual_minor?: number | null
          client_record_id?: string
          cost_category?: Database["public"]["Enums"]["acquisition_cost_category"]
          created_at?: string
          estimated_minor?: number | null
          id?: string
          ledger_entry_id?: string | null
          note?: string | null
          planned_vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_cost_lines_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acquisition_cost_lines_planned_vehicle_id_fkey"
            columns: ["planned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "planned_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      acquisition_payments: {
        Row: {
          amount_minor: number
          client_record_id: string
          entered_at: string
          entered_by: string
          exchange_rate: number | null
          id: string
          ledger_entry_id: string | null
          method: string | null
          next_due_on: string | null
          original_amount_minor: number | null
          original_currency: string | null
          paid_on: string
          paid_to: string | null
          payment_type: Database["public"]["Enums"]["acquisition_payment_type"]
          planned_vehicle_id: string
          receipt_document_id: string | null
        }
        Insert: {
          amount_minor: number
          client_record_id?: string
          entered_at?: string
          entered_by: string
          exchange_rate?: number | null
          id?: string
          ledger_entry_id?: string | null
          method?: string | null
          next_due_on?: string | null
          original_amount_minor?: number | null
          original_currency?: string | null
          paid_on?: string
          paid_to?: string | null
          payment_type: Database["public"]["Enums"]["acquisition_payment_type"]
          planned_vehicle_id: string
          receipt_document_id?: string | null
        }
        Update: {
          amount_minor?: number
          client_record_id?: string
          entered_at?: string
          entered_by?: string
          exchange_rate?: number | null
          id?: string
          ledger_entry_id?: string | null
          method?: string | null
          next_due_on?: string | null
          original_amount_minor?: number | null
          original_currency?: string | null
          paid_on?: string
          paid_to?: string | null
          payment_type?: Database["public"]["Enums"]["acquisition_payment_type"]
          planned_vehicle_id?: string
          receipt_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_payments_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acquisition_payments_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acquisition_payments_planned_vehicle_id_fkey"
            columns: ["planned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "planned_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acquisition_payments_receipt_document_fk"
            columns: ["receipt_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_records: {
        Row: {
          amount_minor: number | null
          applies_to_date: string | null
          client_record_id: string
          direction: Database["public"]["Enums"]["ledger_direction"] | null
          driver_id: string | null
          entered_at: string
          entered_by: string
          id: string
          record_type: string
          summary_text: string
          target_id: string
          target_type: Database["public"]["Enums"]["entity_type"]
          vehicle_id: string | null
        }
        Insert: {
          amount_minor?: number | null
          applies_to_date?: string | null
          client_record_id?: string
          direction?: Database["public"]["Enums"]["ledger_direction"] | null
          driver_id?: string | null
          entered_at?: string
          entered_by: string
          id?: string
          record_type: string
          summary_text: string
          target_id: string
          target_type: Database["public"]["Enums"]["entity_type"]
          vehicle_id?: string | null
        }
        Update: {
          amount_minor?: number | null
          applies_to_date?: string | null
          client_record_id?: string
          direction?: Database["public"]["Enums"]["ledger_direction"] | null
          driver_id?: string | null
          entered_at?: string
          entered_by?: string
          id?: string
          record_type?: string
          summary_text?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["entity_type"]
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_records_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_records_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          client_record_id: string
          created_at: string
          driver_id: string | null
          due_on: string | null
          escalates_on: string | null
          id: string
          resolved_at: string | null
          resolved_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["entity_type"]
          type: Database["public"]["Enums"]["alert_type"]
          vehicle_id: string | null
          visible_to_roles: Database["public"]["Enums"]["user_role"][]
        }
        Insert: {
          client_record_id?: string
          created_at?: string
          driver_id?: string | null
          due_on?: string | null
          escalates_on?: string | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["entity_type"]
          type: Database["public"]["Enums"]["alert_type"]
          vehicle_id?: string | null
          visible_to_roles: Database["public"]["Enums"]["user_role"][]
        }
        Update: {
          client_record_id?: string
          created_at?: string
          driver_id?: string | null
          due_on?: string | null
          escalates_on?: string | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["entity_type"]
          type?: Database["public"]["Enums"]["alert_type"]
          vehicle_id?: string | null
          visible_to_roles?: Database["public"]["Enums"]["user_role"][]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_json: Json | null
          at: string
          before_json: Json | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: number
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_json?: Json | null
          at?: string
          before_json?: Json | null
          entity_id?: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: never
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_json?: Json | null
          at?: string
          before_json?: Json | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_settlements: {
        Row: {
          amount_minor: number
          balance_id: string
          client_record_id: string
          entered_at: string
          entered_by: string
          id: string
          ledger_entry_id: string | null
          settled_on: string
        }
        Insert: {
          amount_minor: number
          balance_id: string
          client_record_id?: string
          entered_at?: string
          entered_by: string
          id?: string
          ledger_entry_id?: string | null
          settled_on?: string
        }
        Update: {
          amount_minor?: number
          balance_id?: string
          client_record_id?: string
          entered_at?: string
          entered_by?: string
          id?: string
          ledger_entry_id?: string | null
          settled_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_settlements_balance_id_fkey"
            columns: ["balance_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_settlements_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_settlements_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      bundled_payments: {
        Row: {
          client_record_id: string
          covers_from_date: string
          covers_to_date: string | null
          days_covered: number
          driver_id: string | null
          entered_at: string
          entered_by: string
          id: string
          note: string | null
          received_at: string
          total_amount_minor: number
          vehicle_id: string
        }
        Insert: {
          client_record_id?: string
          covers_from_date: string
          covers_to_date?: string | null
          days_covered: number
          driver_id?: string | null
          entered_at?: string
          entered_by: string
          id?: string
          note?: string | null
          received_at?: string
          total_amount_minor: number
          vehicle_id: string
        }
        Update: {
          client_record_id?: string
          covers_from_date?: string
          covers_to_date?: string | null
          days_covered?: number
          driver_id?: string | null
          entered_at?: string
          entered_by?: string
          id?: string
          note?: string | null
          received_at?: string
          total_amount_minor?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundled_payments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundled_payments_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundled_payments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reservations: {
        Row: {
          amount_minor: number
          client_record_id: string
          goal_id: string
          id: string
          note: string | null
          released_at: string | null
          released_by: string | null
          reserved_at: string
          reserved_by: string
        }
        Insert: {
          amount_minor: number
          client_record_id?: string
          goal_id: string
          id?: string
          note?: string | null
          released_at?: string | null
          released_by?: string | null
          reserved_at?: string
          reserved_by: string
        }
        Update: {
          amount_minor?: number
          client_record_id?: string
          goal_id?: string
          id?: string
          note?: string | null
          released_at?: string | null
          released_by?: string | null
          reserved_at?: string
          reserved_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_reservations_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "purchase_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reservations_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reservations_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections: {
        Row: {
          after_json: Json | null
          applied_at: string | null
          approved_by: string | null
          before_json: Json | null
          client_record_id: string
          id: string
          reason: string
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["correction_status"]
          target_id: string
          target_table: Database["public"]["Enums"]["entity_type"]
        }
        Insert: {
          after_json?: Json | null
          applied_at?: string | null
          approved_by?: string | null
          before_json?: Json | null
          client_record_id?: string
          id?: string
          reason: string
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["correction_status"]
          target_id: string
          target_table: Database["public"]["Enums"]["entity_type"]
        }
        Update: {
          after_json?: Json | null
          applied_at?: string | null
          approved_by?: string | null
          before_json?: Json | null
          client_record_id?: string
          id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["correction_status"]
          target_id?: string
          target_table?: Database["public"]["Enums"]["entity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "corrections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_payment_records: {
        Row: {
          bundled_payment_id: string | null
          client_record_id: string
          day_outcome: Database["public"]["Enums"]["day_outcome"]
          driver_id: string | null
          entered_at: string
          entered_by: string
          expected_amount_minor: number
          id: string
          ledger_entry_id: string | null
          overpayment_reason:
            | Database["public"]["Enums"]["overpayment_reason"]
            | null
          received_amount_minor: number
          service_date: string
          shortfall_amount_minor: number | null
          shortfall_cause: Database["public"]["Enums"]["shortfall_cause"] | null
          shortfall_note: string | null
          shortfall_treatment:
            | Database["public"]["Enums"]["shortfall_treatment"]
            | null
          shortfall_treatment_override:
            | Database["public"]["Enums"]["shortfall_treatment"]
            | null
          shortfall_treatment_override_at: string | null
          shortfall_treatment_override_by: string | null
          shortfall_treatment_override_reason: string | null
          under_active_agreement: boolean
          vehicle_id: string
        }
        Insert: {
          bundled_payment_id?: string | null
          client_record_id?: string
          day_outcome: Database["public"]["Enums"]["day_outcome"]
          driver_id?: string | null
          entered_at?: string
          entered_by: string
          expected_amount_minor: number
          id?: string
          ledger_entry_id?: string | null
          overpayment_reason?:
            | Database["public"]["Enums"]["overpayment_reason"]
            | null
          received_amount_minor?: number
          service_date?: string
          shortfall_amount_minor?: number | null
          shortfall_cause?:
            | Database["public"]["Enums"]["shortfall_cause"]
            | null
          shortfall_note?: string | null
          shortfall_treatment?:
            | Database["public"]["Enums"]["shortfall_treatment"]
            | null
          shortfall_treatment_override?:
            | Database["public"]["Enums"]["shortfall_treatment"]
            | null
          shortfall_treatment_override_at?: string | null
          shortfall_treatment_override_by?: string | null
          shortfall_treatment_override_reason?: string | null
          under_active_agreement?: boolean
          vehicle_id: string
        }
        Update: {
          bundled_payment_id?: string | null
          client_record_id?: string
          day_outcome?: Database["public"]["Enums"]["day_outcome"]
          driver_id?: string | null
          entered_at?: string
          entered_by?: string
          expected_amount_minor?: number
          id?: string
          ledger_entry_id?: string | null
          overpayment_reason?:
            | Database["public"]["Enums"]["overpayment_reason"]
            | null
          received_amount_minor?: number
          service_date?: string
          shortfall_amount_minor?: number | null
          shortfall_cause?:
            | Database["public"]["Enums"]["shortfall_cause"]
            | null
          shortfall_note?: string | null
          shortfall_treatment?:
            | Database["public"]["Enums"]["shortfall_treatment"]
            | null
          shortfall_treatment_override?:
            | Database["public"]["Enums"]["shortfall_treatment"]
            | null
          shortfall_treatment_override_at?: string | null
          shortfall_treatment_override_by?: string | null
          shortfall_treatment_override_reason?: string | null
          under_active_agreement?: boolean
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_payment_records_bundled_payment_id_fkey"
            columns: ["bundled_payment_id"]
            isOneToOne: false
            referencedRelation: "bundled_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_payment_records_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_payment_records_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_payment_records_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_payment_records_shortfall_treatment_override_by_fkey"
            columns: ["shortfall_treatment_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_payment_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_record_id: string
          doc_type: Database["public"]["Enums"]["document_type"]
          filename: string
          id: string
          mime_type: string
          owner_id: string
          owner_type: Database["public"]["Enums"]["entity_type"]
          size_bytes: number
          storage_key: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          client_record_id?: string
          doc_type: Database["public"]["Enums"]["document_type"]
          filename: string
          id?: string
          mime_type: string
          owner_id: string
          owner_type: Database["public"]["Enums"]["entity_type"]
          size_bytes: number
          storage_key: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          client_record_id?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          filename?: string
          id?: string
          mime_type?: string
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["entity_type"]
          size_bytes?: number
          storage_key?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_assignments: {
        Row: {
          client_record_id: string
          created_at: string
          driver_id: string
          ended_on: string | null
          id: string
          route_id: string | null
          started_on: string
          vehicle_id: string
        }
        Insert: {
          client_record_id?: string
          created_at?: string
          driver_id: string
          ended_on?: string | null
          id?: string
          route_id?: string | null
          started_on?: string
          vehicle_id: string
        }
        Update: {
          client_record_id?: string
          created_at?: string
          driver_id?: string
          ended_on?: string | null
          id?: string
          route_id?: string | null
          started_on?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_credits: {
        Row: {
          amount_minor: number
          client_record_id: string
          consumed_on: string | null
          created_at: string
          created_from_payment_id: string | null
          driver_id: string
          id: string
          remaining_minor: number
        }
        Insert: {
          amount_minor: number
          client_record_id?: string
          consumed_on?: string | null
          created_at?: string
          created_from_payment_id?: string | null
          driver_id: string
          id?: string
          remaining_minor: number
        }
        Update: {
          amount_minor?: number
          client_record_id?: string
          consumed_on?: string | null
          created_at?: string
          created_from_payment_id?: string | null
          driver_id?: string
          id?: string
          remaining_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_credits_created_from_payment_id_fkey"
            columns: ["created_from_payment_id"]
            isOneToOne: false
            referencedRelation: "daily_payment_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_credits_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_purchase_agreements: {
        Row: {
          agreement_amount_minor: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_record_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          driver_id: string
          expected_completion_on: string | null
          id: string
          ownership_transfer_status: Database["public"]["Enums"]["ownership_transfer_status"]
          payment_frequency: Database["public"]["Enums"]["payment_frequency"]
          regular_payment_minor: number
          started_on: string
          vehicle_id: string
        }
        Insert: {
          agreement_amount_minor: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_record_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          driver_id: string
          expected_completion_on?: string | null
          id?: string
          ownership_transfer_status?: Database["public"]["Enums"]["ownership_transfer_status"]
          payment_frequency: Database["public"]["Enums"]["payment_frequency"]
          regular_payment_minor: number
          started_on: string
          vehicle_id: string
        }
        Update: {
          agreement_amount_minor?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_record_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          driver_id?: string
          expected_completion_on?: string | null
          id?: string
          ownership_transfer_status?: Database["public"]["Enums"]["ownership_transfer_status"]
          payment_frequency?: Database["public"]["Enums"]["payment_frequency"]
          regular_payment_minor?: number
          started_on?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_purchase_agreements_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_purchase_agreements_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_purchase_agreements_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_purchase_agreements_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          address: string | null
          client_record_id: string
          created_at: string
          full_name: string
          id: string
          id_document_number: string | null
          id_document_type: string | null
          id_image_key: string | null
          known_as: string | null
          leave_reason: string | null
          left_on: string | null
          licence_expiry: string | null
          licence_image_key: string | null
          licence_number: string | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          notes: string | null
          phone: string | null
          phone_alt: string | null
          photo_key: string | null
          started_on: string | null
          status: Database["public"]["Enums"]["driver_status"]
        }
        Insert: {
          address?: string | null
          client_record_id?: string
          created_at?: string
          full_name: string
          id?: string
          id_document_number?: string | null
          id_document_type?: string | null
          id_image_key?: string | null
          known_as?: string | null
          leave_reason?: string | null
          left_on?: string | null
          licence_expiry?: string | null
          licence_image_key?: string | null
          licence_number?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          notes?: string | null
          phone?: string | null
          phone_alt?: string | null
          photo_key?: string | null
          started_on?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
        }
        Update: {
          address?: string | null
          client_record_id?: string
          created_at?: string
          full_name?: string
          id?: string
          id_document_number?: string | null
          id_document_type?: string | null
          id_image_key?: string | null
          known_as?: string | null
          leave_reason?: string | null
          left_on?: string | null
          licence_expiry?: string | null
          licence_image_key?: string | null
          licence_number?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          notes?: string | null
          phone?: string | null
          phone_alt?: string | null
          photo_key?: string | null
          started_on?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
        }
        Relationships: []
      }
      flagged_duplicate_payments: {
        Row: {
          client_record_id: string
          id: string
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          service_date: string
          submitted_at: string
          submitted_by: string
          vehicle_id: string
        }
        Insert: {
          client_record_id?: string
          id?: string
          payload: Json
          resolved_at?: string | null
          resolved_by?: string | null
          service_date: string
          submitted_at?: string
          submitted_by: string
          vehicle_id: string
        }
        Update: {
          client_record_id?: string
          id?: string
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          service_date?: string
          submitted_at?: string
          submitted_by?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flagged_duplicate_payments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flagged_duplicate_payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flagged_duplicate_payments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_minor: number
          applies_to_date: string
          approval_status: Database["public"]["Enums"]["approval_status"]
          category: Database["public"]["Enums"]["ledger_category"]
          client_record_id: string
          currency: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          driver_id: string | null
          entered_at: string
          entered_by_user_id: string
          id: string
          note: string | null
          received_at: string
          reconciled_at: string | null
          reconciled_by: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["entity_type"] | null
          subcategory: string | null
          superseded_by_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          amount_minor: number
          applies_to_date?: string
          approval_status?: Database["public"]["Enums"]["approval_status"]
          category: Database["public"]["Enums"]["ledger_category"]
          client_record_id?: string
          currency?: string
          direction: Database["public"]["Enums"]["ledger_direction"]
          driver_id?: string | null
          entered_at?: string
          entered_by_user_id: string
          id?: string
          note?: string | null
          received_at?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["entity_type"] | null
          subcategory?: string | null
          superseded_by_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          amount_minor?: number
          applies_to_date?: string
          approval_status?: Database["public"]["Enums"]["approval_status"]
          category?: Database["public"]["Enums"]["ledger_category"]
          client_record_id?: string
          currency?: string
          direction?: Database["public"]["Enums"]["ledger_direction"]
          driver_id?: string | null
          entered_at?: string
          entered_by_user_id?: string
          id?: string
          note?: string | null
          received_at?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["entity_type"] | null
          subcategory?: string | null
          superseded_by_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_entered_by_user_id_fkey"
            columns: ["entered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_notes: {
        Row: {
          body_text: string
          client_record_id: string
          entered_at: string
          entered_by: string
          id: string
          order_id: string
        }
        Insert: {
          body_text: string
          client_record_id?: string
          entered_at?: string
          entered_by: string
          id?: string
          order_id: string
        }
        Update: {
          body_text?: string
          client_record_id?: string
          entered_at?: string
          entered_by?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_notes_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_orders: {
        Row: {
          client_record_id: string
          closed_at: string | null
          estimated_grounded_days: number | null
          expected_completion_on: string | null
          expected_inspection_on: string | null
          handled_by:
            | Database["public"]["Enums"]["maintenance_handled_by"]
            | null
          id: string
          identified_on: string
          is_grounded: boolean
          notes: string | null
          old_parts_returned: boolean | null
          opened_at: string
          opened_by: string
          problem_descriptor:
            | Database["public"]["Enums"]["problem_descriptor"]
            | null
          record_type: Database["public"]["Enums"]["maintenance_record_type"]
          reminder_date: string | null
          safety_status: Database["public"]["Enums"]["roadworthiness"]
          service_area: string
          status: Database["public"]["Enums"]["maintenance_status"]
          vehicle_id: string
          verified_by: string | null
          work_action: string | null
        }
        Insert: {
          client_record_id?: string
          closed_at?: string | null
          estimated_grounded_days?: number | null
          expected_completion_on?: string | null
          expected_inspection_on?: string | null
          handled_by?:
            | Database["public"]["Enums"]["maintenance_handled_by"]
            | null
          id?: string
          identified_on?: string
          is_grounded?: boolean
          notes?: string | null
          old_parts_returned?: boolean | null
          opened_at?: string
          opened_by: string
          problem_descriptor?:
            | Database["public"]["Enums"]["problem_descriptor"]
            | null
          record_type: Database["public"]["Enums"]["maintenance_record_type"]
          reminder_date?: string | null
          safety_status?: Database["public"]["Enums"]["roadworthiness"]
          service_area: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          vehicle_id: string
          verified_by?: string | null
          work_action?: string | null
        }
        Update: {
          client_record_id?: string
          closed_at?: string | null
          estimated_grounded_days?: number | null
          expected_completion_on?: string | null
          expected_inspection_on?: string | null
          handled_by?:
            | Database["public"]["Enums"]["maintenance_handled_by"]
            | null
          id?: string
          identified_on?: string
          is_grounded?: boolean
          notes?: string | null
          old_parts_returned?: boolean | null
          opened_at?: string
          opened_by?: string
          problem_descriptor?:
            | Database["public"]["Enums"]["problem_descriptor"]
            | null
          record_type?: Database["public"]["Enums"]["maintenance_record_type"]
          reminder_date?: string | null
          safety_status?: Database["public"]["Enums"]["roadworthiness"]
          service_area?: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          vehicle_id?: string
          verified_by?: string | null
          work_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_orders_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_parts: {
        Row: {
          client_record_id: string
          entered_at: string
          entered_by: string
          filter_action: Database["public"]["Enums"]["filter_action"] | null
          id: string
          ledger_entry_id: string | null
          order_id: string
          part_name: string
          part_source: Database["public"]["Enums"]["part_source"]
          quantity: number
          unit_cost_minor: number
        }
        Insert: {
          client_record_id?: string
          entered_at?: string
          entered_by: string
          filter_action?: Database["public"]["Enums"]["filter_action"] | null
          id?: string
          ledger_entry_id?: string | null
          order_id: string
          part_name: string
          part_source?: Database["public"]["Enums"]["part_source"]
          quantity?: number
          unit_cost_minor?: number
        }
        Update: {
          client_record_id?: string
          entered_at?: string
          entered_by?: string
          filter_action?: Database["public"]["Enums"]["filter_action"] | null
          id?: string
          ledger_entry_id?: string | null
          order_id?: string
          part_name?: string
          part_source?: Database["public"]["Enums"]["part_source"]
          quantity?: number
          unit_cost_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_parts_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_status_events: {
        Row: {
          changed_at: string
          changed_by: string
          client_record_id: string
          from_status: Database["public"]["Enums"]["maintenance_status"] | null
          id: string
          note: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["maintenance_status"]
        }
        Insert: {
          changed_at?: string
          changed_by: string
          client_record_id?: string
          from_status?: Database["public"]["Enums"]["maintenance_status"] | null
          id?: string
          note?: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["maintenance_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string
          client_record_id?: string
          from_status?: Database["public"]["Enums"]["maintenance_status"] | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["maintenance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_status_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      outstanding_balances: {
        Row: {
          client_record_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          driver_id: string
          id: string
          origin_daily_payment_id: string | null
          original_amount_minor: number
          promised_date: string | null
          remaining_amount_minor: number
          reminder_date: string | null
          status: Database["public"]["Enums"]["balance_status"]
          vehicle_id: string | null
          write_off_reason: string | null
        }
        Insert: {
          client_record_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          driver_id: string
          id?: string
          origin_daily_payment_id?: string | null
          original_amount_minor: number
          promised_date?: string | null
          remaining_amount_minor: number
          reminder_date?: string | null
          status?: Database["public"]["Enums"]["balance_status"]
          vehicle_id?: string | null
          write_off_reason?: string | null
        }
        Update: {
          client_record_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          origin_daily_payment_id?: string | null
          original_amount_minor?: number
          promised_date?: string | null
          remaining_amount_minor?: number
          reminder_date?: string | null
          status?: Database["public"]["Enums"]["balance_status"]
          vehicle_id?: string | null
          write_off_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outstanding_balances_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outstanding_balances_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outstanding_balances_origin_daily_payment_id_fkey"
            columns: ["origin_daily_payment_id"]
            isOneToOne: false
            referencedRelation: "daily_payment_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outstanding_balances_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_vehicles: {
        Row: {
          client_record_id: string
          created_at: string
          goal_id: string
          id: string
          onboarded_vehicle_id: string | null
          purchased_at: string | null
          sequence: number
          stage: Database["public"]["Enums"]["purchase_stage"]
          target_date: string | null
        }
        Insert: {
          client_record_id?: string
          created_at?: string
          goal_id: string
          id?: string
          onboarded_vehicle_id?: string | null
          purchased_at?: string | null
          sequence: number
          stage?: Database["public"]["Enums"]["purchase_stage"]
          target_date?: string | null
        }
        Update: {
          client_record_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          onboarded_vehicle_id?: string | null
          purchased_at?: string | null
          sequence?: number
          stage?: Database["public"]["Enums"]["purchase_stage"]
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_vehicles_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "purchase_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_vehicles_onboarded_vehicle_id_fkey"
            columns: ["onboarded_vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_goals: {
        Row: {
          client_record_id: string
          color: string | null
          condition: Database["public"]["Enums"]["vehicle_condition"] | null
          created_at: string
          created_by: string
          custom_type: string | null
          expected_arrival_date: string | null
          fuel_type: Database["public"]["Enums"]["fuel_type"] | null
          id: string
          intended_route: string | null
          make: string | null
          market_country: string | null
          model: string | null
          model_year: number | null
          name: string
          notes: string | null
          priority: Database["public"]["Enums"]["purchase_priority"]
          seller: string | null
          status: Database["public"]["Enums"]["purchase_goal_status"]
          target_purchase_date: string | null
          transmission: Database["public"]["Enums"]["transmission_type"] | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          vehicles_required: number
        }
        Insert: {
          client_record_id?: string
          color?: string | null
          condition?: Database["public"]["Enums"]["vehicle_condition"] | null
          created_at?: string
          created_by: string
          custom_type?: string | null
          expected_arrival_date?: string | null
          fuel_type?: Database["public"]["Enums"]["fuel_type"] | null
          id?: string
          intended_route?: string | null
          make?: string | null
          market_country?: string | null
          model?: string | null
          model_year?: number | null
          name: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["purchase_priority"]
          seller?: string | null
          status?: Database["public"]["Enums"]["purchase_goal_status"]
          target_purchase_date?: string | null
          transmission?: Database["public"]["Enums"]["transmission_type"] | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          vehicles_required?: number
        }
        Update: {
          client_record_id?: string
          color?: string | null
          condition?: Database["public"]["Enums"]["vehicle_condition"] | null
          created_at?: string
          created_by?: string
          custom_type?: string | null
          expected_arrival_date?: string | null
          fuel_type?: Database["public"]["Enums"]["fuel_type"] | null
          id?: string
          intended_route?: string | null
          make?: string | null
          market_country?: string | null
          model?: string | null
          model_year?: number | null
          name?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["purchase_priority"]
          seller?: string | null
          status?: Database["public"]["Enums"]["purchase_goal_status"]
          target_purchase_date?: string | null
          transmission?: Database["public"]["Enums"]["transmission_type"] | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          vehicles_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_goals_intended_route_fkey"
            columns: ["intended_route"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          active: boolean
          client_record_id: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          client_record_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          client_record_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      savings_targets: {
        Row: {
          client_record_id: string
          created_at: string
          goal_id: string
          id: string
          min_emergency_reserve_minor: number
          min_operating_cash_minor: number
          monthly_target_minor: number | null
          profit_reserve_pct: number | null
          target_date: string | null
          total_budget_minor: number
          weekly_target_minor: number | null
        }
        Insert: {
          client_record_id?: string
          created_at?: string
          goal_id: string
          id?: string
          min_emergency_reserve_minor?: number
          min_operating_cash_minor?: number
          monthly_target_minor?: number | null
          profit_reserve_pct?: number | null
          target_date?: string | null
          total_budget_minor: number
          weekly_target_minor?: number | null
        }
        Update: {
          client_record_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          min_emergency_reserve_minor?: number
          min_operating_cash_minor?: number
          monthly_target_minor?: number | null
          profit_reserve_pct?: number | null
          target_date?: string | null
          total_budget_minor?: number
          weekly_target_minor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_targets_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: true
            referencedRelation: "purchase_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          expires_at: string
          id: string
          issued_at: string
          last_seen_at: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          expires_at: string
          id?: string
          issued_at?: string
          last_seen_at?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          expires_at?: string
          id?: string
          issued_at?: string
          last_seen_at?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transit_records: {
        Row: {
          actual_arrival: string | null
          bill_of_lading: string | null
          clearing_agent: string | null
          client_record_id: string
          condition: string | null
          created_at: string
          current_location: string | null
          destination_port: string | null
          engine_number: string | null
          expected_arrival: string | null
          export_country: string | null
          export_port: string | null
          id: string
          mileage: number | null
          planned_vehicle_id: string
          purchase_location: string | null
          shipped_on: string | null
          shipping_company: string | null
          vessel_name: string | null
          vin: string | null
        }
        Insert: {
          actual_arrival?: string | null
          bill_of_lading?: string | null
          clearing_agent?: string | null
          client_record_id?: string
          condition?: string | null
          created_at?: string
          current_location?: string | null
          destination_port?: string | null
          engine_number?: string | null
          expected_arrival?: string | null
          export_country?: string | null
          export_port?: string | null
          id?: string
          mileage?: number | null
          planned_vehicle_id: string
          purchase_location?: string | null
          shipped_on?: string | null
          shipping_company?: string | null
          vessel_name?: string | null
          vin?: string | null
        }
        Update: {
          actual_arrival?: string | null
          bill_of_lading?: string | null
          clearing_agent?: string | null
          client_record_id?: string
          condition?: string | null
          created_at?: string
          current_location?: string | null
          destination_port?: string | null
          engine_number?: string | null
          expected_arrival?: string | null
          export_country?: string | null
          export_port?: string | null
          id?: string
          mileage?: number | null
          planned_vehicle_id?: string
          purchase_location?: string | null
          shipped_on?: string | null
          shipping_company?: string | null
          vessel_name?: string | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transit_records_planned_vehicle_id_fkey"
            columns: ["planned_vehicle_id"]
            isOneToOne: true
            referencedRelation: "planned_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          client_record_id: string
          created_at: string
          departed_on: string | null
          destination_location: string | null
          driver_id: string | null
          duration_days: number | null
          entered_by: string
          helper_name: string | null
          id: string
          load_quantity: number | null
          load_weight: number | null
          load_weight_unit: Database["public"]["Enums"]["weight_unit"] | null
          notes: string | null
          pickup_location: string | null
          returned_on: string | null
          status: Database["public"]["Enums"]["trip_status"]
          vehicle_id: string
        }
        Insert: {
          client_record_id?: string
          created_at?: string
          departed_on?: string | null
          destination_location?: string | null
          driver_id?: string | null
          duration_days?: number | null
          entered_by: string
          helper_name?: string | null
          id?: string
          load_quantity?: number | null
          load_weight?: number | null
          load_weight_unit?: Database["public"]["Enums"]["weight_unit"] | null
          notes?: string | null
          pickup_location?: string | null
          returned_on?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          vehicle_id: string
        }
        Update: {
          client_record_id?: string
          created_at?: string
          departed_on?: string | null
          destination_location?: string | null
          driver_id?: string | null
          duration_days?: number | null
          entered_by?: string
          helper_name?: string | null
          id?: string
          load_quantity?: number | null
          load_weight?: number | null
          load_weight_unit?: Database["public"]["Enums"]["weight_unit"] | null
          notes?: string | null
          pickup_location?: string | null
          returned_on?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          client_record_id: string
          created_at: string
          created_by: string | null
          display_name: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          auth_user_id?: string | null
          client_record_id?: string
          created_at?: string
          created_by?: string | null
          display_name: string
          email?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          auth_user_id?: string | null
          client_record_id?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: [
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_status_events: {
        Row: {
          changed_at: string
          changed_by: string
          client_record_id: string
          from_status: Database["public"]["Enums"]["vehicle_status"] | null
          id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["vehicle_status"]
          vehicle_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          client_record_id?: string
          from_status?: Database["public"]["Enums"]["vehicle_status"] | null
          id?: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["vehicle_status"]
          vehicle_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          client_record_id?: string
          from_status?: Database["public"]["Enums"]["vehicle_status"] | null
          id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["vehicle_status"]
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_status_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_status_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          archived_at: string | null
          client_record_id: string
          color: string | null
          created_at: string
          cubic_capacity_cc: number | null
          current_driver_id: string | null
          custom_description: string | null
          custom_type: string | null
          distinguishing_marks: string | null
          engine_number: string | null
          entered_service_on: string | null
          expected_daily_amount_minor: number
          expected_retirement_on: string | null
          fleet_id: string
          id: string
          photo_key: string | null
          plate: string | null
          purchase_price_minor: number | null
          purchased_on: string | null
          registration_category: string | null
          route_id: string | null
          seat_count: number | null
          status: Database["public"]["Enums"]["vehicle_status"]
          type: Database["public"]["Enums"]["vehicle_type"]
          vin: string | null
          yearly_target_minor: number
        }
        Insert: {
          archived_at?: string | null
          client_record_id?: string
          color?: string | null
          created_at?: string
          cubic_capacity_cc?: number | null
          current_driver_id?: string | null
          custom_description?: string | null
          custom_type?: string | null
          distinguishing_marks?: string | null
          engine_number?: string | null
          entered_service_on?: string | null
          expected_daily_amount_minor?: number
          expected_retirement_on?: string | null
          fleet_id: string
          id?: string
          photo_key?: string | null
          plate?: string | null
          purchase_price_minor?: number | null
          purchased_on?: string | null
          registration_category?: string | null
          route_id?: string | null
          seat_count?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          type: Database["public"]["Enums"]["vehicle_type"]
          vin?: string | null
          yearly_target_minor?: number
        }
        Update: {
          archived_at?: string | null
          client_record_id?: string
          color?: string | null
          created_at?: string
          cubic_capacity_cc?: number | null
          current_driver_id?: string | null
          custom_description?: string | null
          custom_type?: string | null
          distinguishing_marks?: string | null
          engine_number?: string | null
          entered_service_on?: string | null
          expected_daily_amount_minor?: number
          expected_retirement_on?: string | null
          fleet_id?: string
          id?: string
          photo_key?: string | null
          plate?: string | null
          purchase_price_minor?: number | null
          purchased_on?: string | null
          registration_category?: string | null
          route_id?: string | null
          seat_count?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          type?: Database["public"]["Enums"]["vehicle_type"]
          vin?: string | null
          yearly_target_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_current_driver_fk"
            columns: ["current_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_reset_pin: {
        Args: { p_new_pin: string; p_user_id: string }
        Returns: boolean
      }
      apply_correction: {
        Args: { p_correction_id: string }
        Returns: undefined
      }
      approve_flagged_expense: {
        Args: { p_ledger_entry_id: string }
        Returns: undefined
      }
      assign_driver_to_vehicle: {
        Args: {
          p_client_record_id: string
          p_driver_id: string
          p_route_id: string
          p_vehicle_id: string
        }
        Returns: string
      }
      cancel_driver_purchase_agreement: {
        Args: { p_agreement_id: string; p_reason: string }
        Returns: undefined
      }
      complete_driver_purchase_agreement: {
        Args: { p_agreement_id: string }
        Returns: undefined
      }
      delete_driver: { Args: { p_driver_id: string }; Returns: undefined }
      driver_delete_preview: {
        Args: { p_driver_id: string }
        Returns: {
          agreement_count: number
          assignment_count: number
        }[]
      }
      driver_identity_images: {
        Args: { p_driver_id: string }
        Returns: {
          id_image_key: string
          licence_image_key: string
        }[]
      }
      flag_duplicate_payment: {
        Args: {
          p_client_record_id: string
          p_payload: Json
          p_service_date: string
          p_vehicle_id: string
        }
        Returns: string
      }
      flag_ledger_entry: {
        Args: {
          p_ledger_entry_id: string
          p_status: Database["public"]["Enums"]["approval_status"]
        }
        Returns: undefined
      }
      forgive_driver_debt: {
        Args: { p_balance_id: string; p_reason: string }
        Returns: undefined
      }
      freetown_today: { Args: never; Returns: string }
      mobile_role_roster: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: {
          display_name: string
          id: string
        }[]
      }
      onboard_vehicle: {
        Args: {
          p_client_record_id: string
          p_current_driver_id: string
          p_entered_service_on: string
          p_expected_daily_amount_minor: number
          p_fleet_id: string
          p_planned_vehicle_id: string
          p_plate: string
          p_route_id: string
          p_status: Database["public"]["Enums"]["vehicle_status"]
          p_yearly_target_minor: number
        }
        Returns: string
      }
      override_shortfall_treatment: {
        Args: { p_daily_payment_id: string; p_reason: string }
        Returns: undefined
      }
      record_acquisition_payment: {
        Args: {
          p_amount_minor: number
          p_client_record_id: string
          p_exchange_rate: number
          p_method: string
          p_next_due_on: string
          p_original_amount_minor: number
          p_original_currency: string
          p_paid_on: string
          p_paid_to: string
          p_payment_type: Database["public"]["Enums"]["acquisition_payment_type"]
          p_planned_vehicle_id: string
        }
        Returns: string
      }
      record_bundled_payment: {
        Args: {
          p_client_record_id: string
          p_covers_from_date: string
          p_days_covered: number
          p_note?: string
          p_received_at?: string
          p_total_amount_minor: number
          p_vehicle_id: string
        }
        Returns: string
      }
      record_daily_payment: {
        Args: {
          p_client_record_id: string
          p_day_outcome: Database["public"]["Enums"]["day_outcome"]
          p_overpayment_reason?: Database["public"]["Enums"]["overpayment_reason"]
          p_received_amount_minor: number
          p_service_date: string
          p_shortfall_cause?: Database["public"]["Enums"]["shortfall_cause"]
          p_shortfall_note?: string
          p_vehicle_id: string
        }
        Returns: string
      }
      record_maintenance_part: {
        Args: {
          p_client_record_id: string
          p_filter_action: Database["public"]["Enums"]["filter_action"]
          p_order_id: string
          p_part_name: string
          p_part_source: Database["public"]["Enums"]["part_source"]
          p_quantity: number
          p_unit_cost_minor: number
        }
        Returns: string
      }
      record_trip: {
        Args: {
          p_client_record_id: string
          p_departed_on: string
          p_destination_location: string
          p_driver_id: string
          p_expenses?: Json
          p_helper_name: string
          p_load_quantity: number
          p_load_weight: number
          p_load_weight_unit: Database["public"]["Enums"]["weight_unit"]
          p_notes: string
          p_pickup_location: string
          p_returned_on: string
          p_revenue_minor: number
          p_vehicle_id: string
        }
        Returns: string
      }
      reject_correction: {
        Args: { p_correction_id: string }
        Returns: undefined
      }
      set_up_driver_purchase_agreement: {
        Args: {
          p_agreement_amount_minor: number
          p_client_record_id: string
          p_driver_id: string
          p_expected_completion_on: string
          p_payment_frequency: Database["public"]["Enums"]["payment_frequency"]
          p_regular_payment_minor: number
          p_started_on: string
          p_vehicle_id: string
        }
        Returns: string
      }
      touch_session: { Args: { p_session_id: string }; Returns: boolean }
      vehicle_has_active_purchase_agreement: {
        Args: { p_vehicle_id: string }
        Returns: boolean
      }
      verify_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: Database["public"]["CompositeTypes"]["pin_check_result"]
        SetofOptions: {
          from: "*"
          to: "pin_check_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_role_pin: {
        Args: {
          p_pin: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: Database["public"]["CompositeTypes"]["role_pin_check_result"]
        SetofOptions: {
          from: "*"
          to: "role_pin_check_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      acquisition_cost_category:
        | "VEHICLE_PRICE"
        | "PRE_PURCHASE_INSPECTION"
        | "AUCTION_FEES"
        | "SELLER_OR_AGENT_FEES"
        | "INLAND_TRANSPORT_TO_PORT"
        | "EXPORT_DOCUMENTATION"
        | "SHIPPING"
        | "MARINE_INSURANCE"
        | "PORT_AND_TERMINAL_CHARGES"
        | "CUSTOMS_DUTIES"
        | "CLEARING_AGENT_FEES"
        | "STORAGE_OR_DEMURRAGE"
        | "TRANSPORT_FROM_PORT"
        | "REGISTRATION"
        | "PLATES"
        | "ROADWORTHINESS_INSPECTION"
        | "INSURANCE"
        | "INITIAL_REPAIRS"
        | "SPARE_PARTS"
        | "TYRES"
        | "BATTERY"
        | "OIL_AND_FLUIDS"
        | "BRANDING_OR_PAINTING"
        | "GPS_EQUIPMENT"
        | "OTHER"
        | "CONTINGENCY"
      acquisition_payment_type: "DEPOSIT" | "INSTALLMENT" | "FINAL"
      alert_severity: "NORMAL" | "OVERDUE"
      alert_type:
        | "MAINTENANCE_DUE"
        | "MAINTENANCE_OVERDUE"
        | "VEHICLE_GROUNDED"
        | "BALANCE_OUTSTANDING"
        | "MISSED_PAYMENT"
        | "UNUSUAL_EXPENSE"
        | "DISPUTED_EXPENSE"
        | "RECONCILIATION_DIFFERENCE"
        | "VEHICLE_BELOW_TARGET"
        | "SAVINGS_BEHIND"
        | "PURCHASE_DATE_WITHOUT_FUNDS"
        | "DEPOSIT_OR_INSTALLMENT_DUE"
        | "SHIPPING_DEPARTURE"
        | "EXPECTED_PORT_ARRIVAL"
        | "ARRIVAL_DELAY"
        | "CUSTOMS_DEADLINE"
        | "DEMURRAGE_RISK"
        | "REGISTRATION_DUE"
        | "INSURANCE_DUE"
        | "MISSING_DOCUMENTS"
        | "VEHICLE_READY_FOR_ONBOARDING"
        | "CORRECTION_REQUESTED"
      approval_status: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "DISPUTED"
      balance_status: "OPEN" | "PARTIAL" | "CLEARED" | "WRITTEN_OFF"
      correction_status: "REQUESTED" | "APPROVED" | "REJECTED" | "APPLIED"
      day_outcome:
        | "FULL_DAY"
        | "HALF_DAY"
        | "DRIVERS_DAY"
        | "BREAKDOWN"
        | "DID_NOT_WORK"
      document_type:
        | "VEHICLE_PHOTO"
        | "DRIVER_PHOTO"
        | "DRIVER_ID"
        | "DRIVER_LICENCE"
        | "PURCHASE_AGREEMENT"
        | "BILL_OF_LADING"
        | "RECEIPT"
        | "REGISTRATION"
        | "INSURANCE"
        | "ROADWORTHINESS_CERTIFICATE"
        | "EXPORT_DOCUMENT"
        | "CUSTOMS_DOCUMENT"
        | "OTHER"
      driver_status: "ACTIVE" | "SUSPENDED" | "FORMER"
      entity_type:
        | "USER"
        | "VEHICLE"
        | "DRIVER"
        | "DRIVER_ASSIGNMENT"
        | "DRIVER_PURCHASE_AGREEMENT"
        | "LEDGER_ENTRY"
        | "DAILY_PAYMENT_RECORD"
        | "BUNDLED_PAYMENT"
        | "OUTSTANDING_BALANCE"
        | "BALANCE_SETTLEMENT"
        | "DRIVER_CREDIT"
        | "TRIP"
        | "MAINTENANCE_ORDER"
        | "MAINTENANCE_PART"
        | "PURCHASE_GOAL"
        | "PLANNED_VEHICLE"
        | "ACQUISITION_PAYMENT"
        | "ACQUISITION_COST_LINE"
        | "TRANSIT_RECORD"
        | "DOCUMENT"
      filter_action: "NEW_FILTER" | "REUSED" | "NOT_CHANGED"
      fuel_type: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | "OTHER"
      ledger_category:
        | "PARTS"
        | "LABOUR"
        | "MAINTENANCE"
        | "FUEL"
        | "ROAD_CHECKPOINT"
        | "DRIVER_OR_HELPER_PAYMENT"
        | "VEHICLE_PURCHASE"
        | "LICENSING_INSURANCE"
        | "OTHER_EXPENSE"
        | "DAILY_VEHICLE_PAYMENT"
        | "TRIP_REVENUE"
        | "BALANCE_SETTLEMENT"
        | "DRIVER_PURCHASE_INSTALLMENT"
        | "OTHER_INCOME"
      ledger_direction: "INCOME" | "EXPENSE"
      maintenance_handled_by:
        | "FAMILY_WORKSHOP"
        | "APPROVED_MECHANIC"
        | "PARK_MECHANIC"
        | "OTHER"
      maintenance_record_type: "PROBLEM_REPORTED" | "REGULAR_SERVICE" | "REPAIR"
      maintenance_status:
        | "PROBLEM_REPORTED"
        | "INSPECTION_PENDING"
        | "REPAIR_AUTHORIZED"
        | "REPAIR_IN_PROGRESS"
        | "STILL_GROUNDED"
        | "RETURNED_TO_SERVICE"
        | "ADDITIONAL_PROBLEM_FOUND"
        | "COMPLETED_AND_VERIFIED"
      overpayment_reason: "SETTLING_BALANCE" | "ADVANCE" | "OTHER"
      ownership_transfer_status:
        | "NOT_STARTED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
      part_source: "NONE" | "NEW" | "USED" | "EXISTING_REPAIRED"
      payment_frequency: "DAILY" | "WEEKLY" | "MONTHLY"
      problem_descriptor:
        | "NOT_WORKING"
        | "WORN"
        | "DAMAGED"
        | "MAKING_NOISE"
        | "LEAKING"
        | "WEAK_PERFORMANCE"
        | "NEEDS_INSPECTION"
        | "NEEDS_REPLACEMENT"
        | "INTERMITTENT_PROBLEM"
        | "OTHER"
      purchase_goal_status: "ACTIVE" | "ON_HOLD" | "ACHIEVED" | "CANCELLED"
      purchase_priority: "LOW" | "MEDIUM" | "HIGH"
      purchase_stage:
        | "IDEA_CONSIDERING"
        | "RESEARCHING"
        | "SAVING"
        | "READY_TO_PURCHASE"
        | "SELLER_SELECTED"
        | "DEPOSIT_PAID"
        | "FULLY_PURCHASED"
        | "AWAITING_SHIPMENT"
        | "IN_TRANSIT"
        | "ARRIVED_AT_PORT"
        | "CUSTOMS_CLEARING"
        | "TRANSPORTING_FROM_PORT"
        | "INSPECTION_AND_REGISTRATION"
        | "READY_FOR_ONBOARDING"
        | "ACTIVE_IN_SERVICE"
        | "CANCELLED"
      roadworthiness:
        | "ROADWORTHY"
        | "LIMITED_USE"
        | "NOT_ROADWORTHY"
        | "UNKNOWN"
      shortfall_cause: "BREAKDOWN" | "ACCIDENT" | "POLICE_CHECKPOINT" | "OTHER"
      shortfall_treatment: "DRIVER_DEBT" | "ACCEPTED_LOSS"
      transmission_type: "MANUAL" | "AUTOMATIC" | "OTHER"
      trip_status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
      user_role:
        | "OWNER_ADMIN"
        | "FLEET_MANAGER"
        | "COLLECTIONS_FINANCE"
        | "MAINTENANCE_REPAIRS"
      user_status: "ACTIVE" | "SUSPENDED" | "DISABLED"
      vehicle_condition: "NEW" | "USED"
      vehicle_status: "ACTIVE" | "GROUNDED" | "IN_MAINTENANCE" | "ARCHIVED"
      vehicle_type:
        | "LONG_SPRINTER"
        | "SHORT_SPRINTER"
        | "BOX_TRUCK"
        | "BUS"
        | "GARBAGE_TRUCK"
        | "TRICYCLE"
        | "OTHER"
      weight_unit: "LB" | "KG"
    }
    CompositeTypes: {
      pin_check_result: {
        ok: boolean | null
        auth_user_id: string | null
        locked_until: string | null
        reason: string | null
      }
      role_pin_check_result: {
        ok: boolean | null
        user_id: string | null
        auth_user_id: string | null
        locked_until: string | null
        reason: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      acquisition_cost_category: [
        "VEHICLE_PRICE",
        "PRE_PURCHASE_INSPECTION",
        "AUCTION_FEES",
        "SELLER_OR_AGENT_FEES",
        "INLAND_TRANSPORT_TO_PORT",
        "EXPORT_DOCUMENTATION",
        "SHIPPING",
        "MARINE_INSURANCE",
        "PORT_AND_TERMINAL_CHARGES",
        "CUSTOMS_DUTIES",
        "CLEARING_AGENT_FEES",
        "STORAGE_OR_DEMURRAGE",
        "TRANSPORT_FROM_PORT",
        "REGISTRATION",
        "PLATES",
        "ROADWORTHINESS_INSPECTION",
        "INSURANCE",
        "INITIAL_REPAIRS",
        "SPARE_PARTS",
        "TYRES",
        "BATTERY",
        "OIL_AND_FLUIDS",
        "BRANDING_OR_PAINTING",
        "GPS_EQUIPMENT",
        "OTHER",
        "CONTINGENCY",
      ],
      acquisition_payment_type: ["DEPOSIT", "INSTALLMENT", "FINAL"],
      alert_severity: ["NORMAL", "OVERDUE"],
      alert_type: [
        "MAINTENANCE_DUE",
        "MAINTENANCE_OVERDUE",
        "VEHICLE_GROUNDED",
        "BALANCE_OUTSTANDING",
        "MISSED_PAYMENT",
        "UNUSUAL_EXPENSE",
        "DISPUTED_EXPENSE",
        "RECONCILIATION_DIFFERENCE",
        "VEHICLE_BELOW_TARGET",
        "SAVINGS_BEHIND",
        "PURCHASE_DATE_WITHOUT_FUNDS",
        "DEPOSIT_OR_INSTALLMENT_DUE",
        "SHIPPING_DEPARTURE",
        "EXPECTED_PORT_ARRIVAL",
        "ARRIVAL_DELAY",
        "CUSTOMS_DEADLINE",
        "DEMURRAGE_RISK",
        "REGISTRATION_DUE",
        "INSURANCE_DUE",
        "MISSING_DOCUMENTS",
        "VEHICLE_READY_FOR_ONBOARDING",
        "CORRECTION_REQUESTED",
      ],
      approval_status: ["NOT_REQUIRED", "PENDING", "APPROVED", "DISPUTED"],
      balance_status: ["OPEN", "PARTIAL", "CLEARED", "WRITTEN_OFF"],
      correction_status: ["REQUESTED", "APPROVED", "REJECTED", "APPLIED"],
      day_outcome: [
        "FULL_DAY",
        "HALF_DAY",
        "DRIVERS_DAY",
        "BREAKDOWN",
        "DID_NOT_WORK",
      ],
      document_type: [
        "VEHICLE_PHOTO",
        "DRIVER_PHOTO",
        "DRIVER_ID",
        "DRIVER_LICENCE",
        "PURCHASE_AGREEMENT",
        "BILL_OF_LADING",
        "RECEIPT",
        "REGISTRATION",
        "INSURANCE",
        "ROADWORTHINESS_CERTIFICATE",
        "EXPORT_DOCUMENT",
        "CUSTOMS_DOCUMENT",
        "OTHER",
      ],
      driver_status: ["ACTIVE", "SUSPENDED", "FORMER"],
      entity_type: [
        "USER",
        "VEHICLE",
        "DRIVER",
        "DRIVER_ASSIGNMENT",
        "DRIVER_PURCHASE_AGREEMENT",
        "LEDGER_ENTRY",
        "DAILY_PAYMENT_RECORD",
        "BUNDLED_PAYMENT",
        "OUTSTANDING_BALANCE",
        "BALANCE_SETTLEMENT",
        "DRIVER_CREDIT",
        "TRIP",
        "MAINTENANCE_ORDER",
        "MAINTENANCE_PART",
        "PURCHASE_GOAL",
        "PLANNED_VEHICLE",
        "ACQUISITION_PAYMENT",
        "ACQUISITION_COST_LINE",
        "TRANSIT_RECORD",
        "DOCUMENT",
      ],
      filter_action: ["NEW_FILTER", "REUSED", "NOT_CHANGED"],
      fuel_type: ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "OTHER"],
      ledger_category: [
        "PARTS",
        "LABOUR",
        "MAINTENANCE",
        "FUEL",
        "ROAD_CHECKPOINT",
        "DRIVER_OR_HELPER_PAYMENT",
        "VEHICLE_PURCHASE",
        "LICENSING_INSURANCE",
        "OTHER_EXPENSE",
        "DAILY_VEHICLE_PAYMENT",
        "TRIP_REVENUE",
        "BALANCE_SETTLEMENT",
        "DRIVER_PURCHASE_INSTALLMENT",
        "OTHER_INCOME",
      ],
      ledger_direction: ["INCOME", "EXPENSE"],
      maintenance_handled_by: [
        "FAMILY_WORKSHOP",
        "APPROVED_MECHANIC",
        "PARK_MECHANIC",
        "OTHER",
      ],
      maintenance_record_type: [
        "PROBLEM_REPORTED",
        "REGULAR_SERVICE",
        "REPAIR",
      ],
      maintenance_status: [
        "PROBLEM_REPORTED",
        "INSPECTION_PENDING",
        "REPAIR_AUTHORIZED",
        "REPAIR_IN_PROGRESS",
        "STILL_GROUNDED",
        "RETURNED_TO_SERVICE",
        "ADDITIONAL_PROBLEM_FOUND",
        "COMPLETED_AND_VERIFIED",
      ],
      overpayment_reason: ["SETTLING_BALANCE", "ADVANCE", "OTHER"],
      ownership_transfer_status: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      part_source: ["NONE", "NEW", "USED", "EXISTING_REPAIRED"],
      payment_frequency: ["DAILY", "WEEKLY", "MONTHLY"],
      problem_descriptor: [
        "NOT_WORKING",
        "WORN",
        "DAMAGED",
        "MAKING_NOISE",
        "LEAKING",
        "WEAK_PERFORMANCE",
        "NEEDS_INSPECTION",
        "NEEDS_REPLACEMENT",
        "INTERMITTENT_PROBLEM",
        "OTHER",
      ],
      purchase_goal_status: ["ACTIVE", "ON_HOLD", "ACHIEVED", "CANCELLED"],
      purchase_priority: ["LOW", "MEDIUM", "HIGH"],
      purchase_stage: [
        "IDEA_CONSIDERING",
        "RESEARCHING",
        "SAVING",
        "READY_TO_PURCHASE",
        "SELLER_SELECTED",
        "DEPOSIT_PAID",
        "FULLY_PURCHASED",
        "AWAITING_SHIPMENT",
        "IN_TRANSIT",
        "ARRIVED_AT_PORT",
        "CUSTOMS_CLEARING",
        "TRANSPORTING_FROM_PORT",
        "INSPECTION_AND_REGISTRATION",
        "READY_FOR_ONBOARDING",
        "ACTIVE_IN_SERVICE",
        "CANCELLED",
      ],
      roadworthiness: [
        "ROADWORTHY",
        "LIMITED_USE",
        "NOT_ROADWORTHY",
        "UNKNOWN",
      ],
      shortfall_cause: ["BREAKDOWN", "ACCIDENT", "POLICE_CHECKPOINT", "OTHER"],
      shortfall_treatment: ["DRIVER_DEBT", "ACCEPTED_LOSS"],
      transmission_type: ["MANUAL", "AUTOMATIC", "OTHER"],
      trip_status: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      user_role: [
        "OWNER_ADMIN",
        "FLEET_MANAGER",
        "COLLECTIONS_FINANCE",
        "MAINTENANCE_REPAIRS",
      ],
      user_status: ["ACTIVE", "SUSPENDED", "DISABLED"],
      vehicle_condition: ["NEW", "USED"],
      vehicle_status: ["ACTIVE", "GROUNDED", "IN_MAINTENANCE", "ARCHIVED"],
      vehicle_type: [
        "LONG_SPRINTER",
        "SHORT_SPRINTER",
        "BOX_TRUCK",
        "BUS",
        "GARBAGE_TRUCK",
        "TRICYCLE",
        "OTHER",
      ],
      weight_unit: ["LB", "KG"],
    },
  },
} as const
