
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "action_items": {
                  Row: {
                    "approval_id": string | null,"assignee_id": string | null,"completed_at": string | null,"created_at": string,"customer_id": string,"due_date": string | null,"form_key": string | null,"id": string,"priority": Database["public"]['Enums']["priority"],"project_id": string | null,"request_id": string | null,"status": Database["public"]['Enums']["action_status"],"task_id": string | null,"title": string,"type": Database["public"]['Enums']["action_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_id"?: string | null,"assignee_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"customer_id": string,"due_date"?: string | null,"form_key"?: string | null,"id"?: string,"priority"?: Database["public"]['Enums']["priority"],"project_id"?: string | null,"request_id"?: string | null,"status"?: Database["public"]['Enums']["action_status"],"task_id"?: string | null,"title": string,"type": Database["public"]['Enums']["action_type"]
                  }
                  Update: {
                    "approval_id"?: string | null,"assignee_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"customer_id"?: string,"due_date"?: string | null,"form_key"?: string | null,"id"?: string,"priority"?: Database["public"]['Enums']["priority"],"project_id"?: string | null,"request_id"?: string | null,"status"?: Database["public"]['Enums']["action_status"],"task_id"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["action_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "action_items_approval_id_fkey"
      columns: ["approval_id"]
isOneToOne: false
      referencedRelation: "approvals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "action_items_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "action_items_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "action_items_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "action_items_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "action_items_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "action_items_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "action_items_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "action_items_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"activity": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"customer_id": string,"entity_id": string | null,"entity_type": string | null,"id": number,"project_id": string | null,"summary": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"customer_id": string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: never,"project_id"?: string | null,"summary": string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"customer_id"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: never,"project_id"?: string | null,"summary"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_chats": {
                  Row: {
                    "created_at": string,"id": string,"messages": NonNullable<Json>,"notes": NonNullable<Json>,"profile_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"messages"?: NonNullable<Json>,"notes"?: NonNullable<Json>,"profile_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"messages"?: NonNullable<Json>,"notes"?: NonNullable<Json>,"profile_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_chats_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_chats_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_proposals": {
                  Row: {
                    "chat_id": string,"created_at": string,"decided_at": string | null,"error": string | null,"id": string,"input": NonNullable<Json>,"profile_id": string,"result": Json | null,"status": string,"summary": string,"tool": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chat_id": string,"created_at"?: string,"decided_at"?: string | null,"error"?: string | null,"id"?: string,"input": NonNullable<Json>,"profile_id"?: string,"result"?: Json | null,"status"?: string,"summary"?: string,"tool": string
                  }
                  Update: {
                    "chat_id"?: string,"created_at"?: string,"decided_at"?: string | null,"error"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"profile_id"?: string,"result"?: Json | null,"status"?: string,"summary"?: string,"tool"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_proposals_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "ai_chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_proposals_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_proposals_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_events": {
                  Row: {
                    "action": Database["public"]['Enums']["approval_action"],"actor_id": string | null,"approval_id": string,"comment": string | null,"created_at": string,"customer_id": string,"id": number,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["approval_action"],"actor_id"?: string | null,"approval_id": string,"comment"?: string | null,"created_at"?: string,"customer_id": string,"id"?: never,"version": number
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["approval_action"],"actor_id"?: string | null,"approval_id"?: string,"comment"?: string | null,"created_at"?: string,"customer_id"?: string,"id"?: never,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_events_approval_id_fkey"
      columns: ["approval_id"]
isOneToOne: false
      referencedRelation: "approvals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_events_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_events_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"approvals": {
                  Row: {
                    "approver_id": string,"created_at": string,"customer_id": string,"due_date": string | null,"effort": number | null,"effort_unit": string,"id": string,"kind": string,"page_id": string | null,"project_id": string | null,"request_id": string | null,"requested_by": string | null,"status": Database["public"]['Enums']["approval_status"],"summary": string,"target_date": string | null,"task_id": string | null,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approver_id": string,"created_at"?: string,"customer_id": string,"due_date"?: string | null,"effort"?: number | null,"effort_unit"?: string,"id"?: string,"kind"?: string,"page_id"?: string | null,"project_id"?: string | null,"request_id"?: string | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["approval_status"],"summary"?: string,"target_date"?: string | null,"task_id"?: string | null,"title": string,"version"?: number
                  }
                  Update: {
                    "approver_id"?: string,"created_at"?: string,"customer_id"?: string,"due_date"?: string | null,"effort"?: number | null,"effort_unit"?: string,"id"?: string,"kind"?: string,"page_id"?: string | null,"project_id"?: string | null,"request_id"?: string | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["approval_status"],"summary"?: string,"target_date"?: string | null,"task_id"?: string | null,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "approvals_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_page_id_fkey"
      columns: ["page_id"]
isOneToOne: false
      referencedRelation: "pages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_rules": {
                  Row: {
                    "enabled": boolean,"key": string,"org_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"key": string,"org_id": string,"updated_at"?: string
                  }
                  Update: {
                    "enabled"?: boolean,"key"?: string,"org_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_rules_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"billing_statements": {
                  Row: {
                    "approved_for_customer": boolean,"created_at": string,"created_by": string | null,"customer_id": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"exchange_rate": number | null,"from_tasks": boolean,"id": string,"invoice_error": string | null,"invoiced_at": string | null,"note": string,"period_end": string,"period_start": string,"project_id": string,"rate_card_id": string,"salesorder_at": string | null,"status": Database["public"]['Enums']["statement_status"],"submitted_at": string | null,"submitted_by": string | null,"zoho_claimed_at": string | null,"zoho_invoice_id": string | null,"zoho_invoice_number": string | null,"zoho_salesorder_id": string | null,"zoho_salesorder_number": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_for_customer"?: boolean,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"exchange_rate"?: number | null,"from_tasks"?: boolean,"id"?: string,"invoice_error"?: string | null,"invoiced_at"?: string | null,"note"?: string,"period_end": string,"period_start": string,"project_id": string,"rate_card_id": string,"salesorder_at"?: string | null,"status"?: Database["public"]['Enums']["statement_status"],"submitted_at"?: string | null,"submitted_by"?: string | null,"zoho_claimed_at"?: string | null,"zoho_invoice_id"?: string | null,"zoho_invoice_number"?: string | null,"zoho_salesorder_id"?: string | null,"zoho_salesorder_number"?: string | null
                  }
                  Update: {
                    "approved_for_customer"?: boolean,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"exchange_rate"?: number | null,"from_tasks"?: boolean,"id"?: string,"invoice_error"?: string | null,"invoiced_at"?: string | null,"note"?: string,"period_end"?: string,"period_start"?: string,"project_id"?: string,"rate_card_id"?: string,"salesorder_at"?: string | null,"status"?: Database["public"]['Enums']["statement_status"],"submitted_at"?: string | null,"submitted_by"?: string | null,"zoho_claimed_at"?: string | null,"zoho_invoice_id"?: string | null,"zoho_invoice_number"?: string | null,"zoho_salesorder_id"?: string | null,"zoho_salesorder_number"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "billing_statements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_rate_card_id_fkey"
      columns: ["rate_card_id"]
isOneToOne: false
      referencedRelation: "rate_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_statements_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"customer_id": string,"entity_id": string,"entity_type": string,"id": string,"mentions": (string)[],"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"customer_id": string,"entity_id": string,"entity_type": string,"id"?: string,"mentions"?: (string)[],"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"customer_id"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"mentions"?: (string)[],"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"cost_rates": {
                  Row: {
                    "currency": string,"hourly_cost": number,"profile_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "currency"?: string,"hourly_cost": number,"profile_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "currency"?: string,"hourly_cost"?: number,"profile_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_rates_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_rates_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_rates_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_rates_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_alerts": {
                  Row: {
                    "customer_id": string,"level": number,"period_start": string,"sent_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"level": number,"period_start": string,"sent_at"?: string
                  }
                  Update: {
                    "customer_id"?: string,"level"?: number,"period_start"?: string,"sent_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_alerts_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_alerts_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_plans": {
                  Row: {
                    "customer_id": string,"kind": string,"monthly_hours": number | null,"rollover_cap": number | null,"starts_on": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"kind": string,"monthly_hours"?: number | null,"rollover_cap"?: number | null,"starts_on"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "customer_id"?: string,"kind"?: string,"monthly_hours"?: number | null,"rollover_cap"?: number | null,"starts_on"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_plans_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_plans_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_plans_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_plans_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_topups": {
                  Row: {
                    "added_by": string | null,"added_on": string,"created_at": string,"customer_id": string,"hours": number,"id": string,"note": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"added_on"?: string,"created_at"?: string,"customer_id": string,"hours": number,"id"?: string,"note"?: string
                  }
                  Update: {
                    "added_by"?: string | null,"added_on"?: string,"created_at"?: string,"customer_id"?: string,"hours"?: number,"id"?: string,"note"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_topups_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_topups_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_topups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_topups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"csat_surveys": {
                  Row: {
                    "answered_at": string | null,"comment": string,"customer_id": string,"expires_at": string,"id": string,"kind": Database["public"]['Enums']["csat_kind"],"period": string | null,"project_id": string | null,"recipient_id": string,"request_id": string | null,"score": number | null,"sent_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string | null,"comment"?: string,"customer_id": string,"expires_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["csat_kind"],"period"?: string | null,"project_id"?: string | null,"recipient_id": string,"request_id"?: string | null,"score"?: number | null,"sent_at"?: string
                  }
                  Update: {
                    "answered_at"?: string | null,"comment"?: string,"customer_id"?: string,"expires_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["csat_kind"],"period"?: string | null,"project_id"?: string | null,"recipient_id"?: string,"request_id"?: string | null,"score"?: number | null,"sent_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "csat_surveys_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "csat_surveys_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "csat_surveys_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "csat_surveys_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "csat_surveys_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "csat_surveys_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "csat_surveys_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_billing": {
                  Row: {
                    "customer_id": string,"tax_label": string,"updated_at": string,"updated_by": string | null,"zoho_tax_exemption_id": string | null,"zoho_tax_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"tax_label"?: string,"updated_at"?: string,"updated_by"?: string | null,"zoho_tax_exemption_id"?: string | null,"zoho_tax_id"?: string | null
                  }
                  Update: {
                    "customer_id"?: string,"tax_label"?: string,"updated_at"?: string,"updated_by"?: string | null,"zoho_tax_exemption_id"?: string | null,"zoho_tax_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_billing_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_billing_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_billing_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_billing_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_contacts": {
                  Row: {
                    "created_at": string,"customer_id": string,"email": string,"external_id": string | null,"full_name": string,"id": string,"invited_at": string | null,"job_title": string | null,"phone": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"customer_id": string,"email": string,"external_id"?: string | null,"full_name": string,"id"?: string,"invited_at"?: string | null,"job_title"?: string | null,"phone"?: string | null,"source"?: string
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"email"?: string,"external_id"?: string | null,"full_name"?: string,"id"?: string,"invited_at"?: string | null,"job_title"?: string | null,"phone"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_contacts_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_contacts_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_team": {
                  Row: {
                    "added_at": string,"added_by": string | null,"customer_id": string,"profile_id": string,"role_label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"customer_id": string,"profile_id": string,"role_label"?: string
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"customer_id"?: string,"profile_id"?: string,"role_label"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_team_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_team_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_team_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_team_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_team_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_team_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "account_owner_id": string | null,"created_at": string,"hubspot_company_id": string | null,"id": string,"name": string,"org_id": string,"zoho_customer_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_owner_id"?: string | null,"created_at"?: string,"hubspot_company_id"?: string | null,"id"?: string,"name": string,"org_id": string,"zoho_customer_id"?: string | null
                  }
                  Update: {
                    "account_owner_id"?: string | null,"created_at"?: string,"hubspot_company_id"?: string | null,"id"?: string,"name"?: string,"org_id"?: string,"zoho_customer_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_account_owner_id_fkey"
      columns: ["account_owner_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_account_owner_id_fkey"
      columns: ["account_owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"decisions": {
                  Row: {
                    "created_at": string,"customer_id": string,"decided_by": string,"decided_on": string,"decision": string,"id": string,"meeting_id": string | null,"number": string,"project_id": string | null,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"customer_id": string,"decided_by"?: string,"decided_on"?: string,"decision": string,"id"?: string,"meeting_id"?: string | null,"number"?: string,"project_id"?: string | null,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"decided_by"?: string,"decided_on"?: string,"decision"?: string,"id"?: string,"meeting_id"?: string | null,"number"?: string,"project_id"?: string | null,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "decisions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_meeting_id_fkey"
      columns: ["meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"document_versions": {
                  Row: {
                    "created_at": string,"customer_id": string,"document_id": string,"id": string,"name": string,"note": string,"scan_status": string,"storage_path": string,"uploaded_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at": string,"customer_id": string,"document_id": string,"id"?: string,"name": string,"note"?: string,"scan_status"?: string,"storage_path": string,"uploaded_by"?: string | null,"version": number
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"document_id"?: string,"id"?: string,"name"?: string,"note"?: string,"scan_status"?: string,"storage_path"?: string,"uploaded_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_versions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_versions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_versions_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_versions_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_versions_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"customer_id": string,"folder": string,"id": string,"mime_type": string | null,"name": string,"note": string,"project_id": string | null,"request_id": string | null,"scan_status": string,"scanned_at": string | null,"size_bytes": number | null,"storage_path": string | null,"uploaded_by": string | null,"version": number,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"customer_id": string,"folder"?: string,"id"?: string,"mime_type"?: string | null,"name": string,"note"?: string,"project_id"?: string | null,"request_id"?: string | null,"scan_status"?: string,"scanned_at"?: string | null,"size_bytes"?: number | null,"storage_path"?: string | null,"uploaded_by"?: string | null,"version"?: number,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"customer_id"?: string,"folder"?: string,"id"?: string,"mime_type"?: string | null,"name"?: string,"note"?: string,"project_id"?: string | null,"request_id"?: string | null,"scan_status"?: string,"scanned_at"?: string | null,"size_bytes"?: number | null,"storage_path"?: string | null,"uploaded_by"?: string | null,"version"?: number,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"email_outbox": {
                  Row: {
                    "attempts": number,"created_at": string,"id": string,"last_error": string | null,"notification_id": string | null,"provider_id": string | null,"sent_at": string | null,"status": string,"to_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"last_error"?: string | null,"notification_id"?: string | null,"provider_id"?: string | null,"sent_at"?: string | null,"status"?: string,"to_email": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"last_error"?: string | null,"notification_id"?: string | null,"provider_id"?: string | null,"sent_at"?: string | null,"status"?: string,"to_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_outbox_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    }
                  ]
                },"engagement_setups": {
                  Row: {
                    "company_name": string,"created_at": string,"deal_name": string,"hubspot_company_id": string | null,"hubspot_deal_id": string,"id": string,"org_id": string,"owner_email": string | null,"project_id": string | null,"service": string | null,"status": Database["public"]['Enums']["setup_status"],"suggested_template": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_name": string,"created_at"?: string,"deal_name": string,"hubspot_company_id"?: string | null,"hubspot_deal_id": string,"id"?: string,"org_id": string,"owner_email"?: string | null,"project_id"?: string | null,"service"?: string | null,"status"?: Database["public"]['Enums']["setup_status"],"suggested_template"?: string
                  }
                  Update: {
                    "company_name"?: string,"created_at"?: string,"deal_name"?: string,"hubspot_company_id"?: string | null,"hubspot_deal_id"?: string,"id"?: string,"org_id"?: string,"owner_email"?: string | null,"project_id"?: string | null,"service"?: string | null,"status"?: Database["public"]['Enums']["setup_status"],"suggested_template"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "engagement_setups_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "engagement_setups_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "engagement_setups_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback": {
                  Row: {
                    "body": string,"created_at": string,"csat_id": string | null,"customer_id": string,"id": string,"kind": Database["public"]['Enums']["feedback_kind"],"number": string,"owner_id": string | null,"project_id": string | null,"source": string,"status": Database["public"]['Enums']["feedback_status"],"submitted_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"csat_id"?: string | null,"customer_id": string,"id"?: string,"kind"?: Database["public"]['Enums']["feedback_kind"],"number"?: string,"owner_id"?: string | null,"project_id"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["feedback_status"],"submitted_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"csat_id"?: string | null,"customer_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["feedback_kind"],"number"?: string,"owner_id"?: string | null,"project_id"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["feedback_status"],"submitted_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_csat_id_fkey"
      columns: ["csat_id"]
isOneToOne: false
      referencedRelation: "csat_surveys"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"form_submissions": {
                  Row: {
                    "action_item_id": string | null,"answers": NonNullable<Json>,"created_at": string,"customer_id": string,"form_key": string,"id": string,"project_id": string | null,"submitted_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_item_id"?: string | null,"answers"?: NonNullable<Json>,"created_at"?: string,"customer_id": string,"form_key": string,"id"?: string,"project_id"?: string | null,"submitted_by": string
                  }
                  Update: {
                    "action_item_id"?: string | null,"answers"?: NonNullable<Json>,"created_at"?: string,"customer_id"?: string,"form_key"?: string,"id"?: string,"project_id"?: string | null,"submitted_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "form_submissions_action_item_id_fkey"
      columns: ["action_item_id"]
isOneToOne: false
      referencedRelation: "action_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_submissions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_submissions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_submissions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_submissions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_submissions_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_submissions_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"holidays": {
                  Row: {
                    "created_at": string,"created_by": string | null,"day": string,"id": string,"name": string,"optional": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"day": string,"id"?: string,"name": string,"optional"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"day"?: string,"id"?: string,"name"?: string,"optional"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "holidays_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "holidays_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_events": {
                  Row: {
                    "created_at": string,"error": string | null,"external_id": string,"id": number,"payload": NonNullable<Json>,"processed_at": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"external_id": string,"id"?: never,"payload": NonNullable<Json>,"processed_at"?: string | null,"source": string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"external_id"?: string,"id"?: never,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invoices": {
                  Row: {
                    "balance": number | null,"currency": string,"customer_id": string,"due_on": string | null,"id": string,"issued_on": string,"number": string,"project_id": string | null,"status": string,"synced_at": string,"total": number | null,"zoho_invoice_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "balance"?: number | null,"currency"?: string,"customer_id": string,"due_on"?: string | null,"id"?: string,"issued_on": string,"number": string,"project_id"?: string | null,"status": string,"synced_at"?: string,"total"?: number | null,"zoho_invoice_id"?: string | null
                  }
                  Update: {
                    "balance"?: number | null,"currency"?: string,"customer_id"?: string,"due_on"?: string | null,"id"?: string,"issued_on"?: string,"number"?: string,"project_id"?: string | null,"status"?: string,"synced_at"?: string,"total"?: number | null,"zoho_invoice_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "job": string,"last_error": string | null,"last_finished_at": string | null,"last_ok_at": string | null,"last_result": NonNullable<Json>,"last_started_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "job": string,"last_error"?: string | null,"last_finished_at"?: string | null,"last_ok_at"?: string | null,"last_result"?: NonNullable<Json>,"last_started_at"?: string | null
                  }
                  Update: {
                    "job"?: string,"last_error"?: string | null,"last_finished_at"?: string | null,"last_ok_at"?: string | null,"last_result"?: NonNullable<Json>,"last_started_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"leave_allowances": {
                  Row: {
                    "days": number,"leave_type_id": string,"profile_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "days": number,"leave_type_id": string,"profile_id": string,"year": number
                  }
                  Update: {
                    "days"?: number,"leave_type_id"?: string,"profile_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_allowances_leave_type_id_fkey"
      columns: ["leave_type_id"]
isOneToOne: false
      referencedRelation: "leave_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_allowances_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_allowances_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_days": {
                  Row: {
                    "created_at": string,"day": string,"kind": string,"note": string | null,"portion": number,"profile_id": string,"request_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"day": string,"kind"?: string,"note"?: string | null,"portion"?: number,"profile_id": string,"request_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"day"?: string,"kind"?: string,"note"?: string | null,"portion"?: number,"profile_id"?: string,"request_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_days_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_days_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_days_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "leave_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_requests": {
                  Row: {
                    "approver_id": string | null,"created_at": string,"days": number,"decided_at": string | null,"decided_by": string | null,"decision_note": string,"end_date": string,"half_day": boolean,"id": string,"leave_type_id": string,"profile_id": string,"reason": string,"start_date": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approver_id"?: string | null,"created_at"?: string,"days": number,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string,"end_date": string,"half_day"?: boolean,"id"?: string,"leave_type_id": string,"profile_id": string,"reason"?: string,"start_date": string,"status"?: string
                  }
                  Update: {
                    "approver_id"?: string | null,"created_at"?: string,"days"?: number,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string,"end_date"?: string,"half_day"?: boolean,"id"?: string,"leave_type_id"?: string,"profile_id"?: string,"reason"?: string,"start_date"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_leave_type_id_fkey"
      columns: ["leave_type_id"]
isOneToOne: false
      referencedRelation: "leave_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_types": {
                  Row: {
                    "active": boolean,"id": string,"key": string,"name": string,"optional_holidays_only": boolean,"paid": boolean,"position": number,"yearly_allowance": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"id"?: string,"key": string,"name": string,"optional_holidays_only"?: boolean,"paid"?: boolean,"position"?: number,"yearly_allowance"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"id"?: string,"key"?: string,"name"?: string,"optional_holidays_only"?: boolean,"paid"?: boolean,"position"?: number,"yearly_allowance"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"meeting_actions": {
                  Row: {
                    "assignee_id": string | null,"created_at": string,"customer_id": string,"due_date": string | null,"id": string,"meeting_id": string,"owner_side": Database["public"]['Enums']["owner_side"],"position": number,"task_id": string | null,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id"?: string | null,"created_at"?: string,"customer_id": string,"due_date"?: string | null,"id"?: string,"meeting_id": string,"owner_side"?: Database["public"]['Enums']["owner_side"],"position"?: number,"task_id"?: string | null,"text": string
                  }
                  Update: {
                    "assignee_id"?: string | null,"created_at"?: string,"customer_id"?: string,"due_date"?: string | null,"id"?: string,"meeting_id"?: string,"owner_side"?: Database["public"]['Enums']["owner_side"],"position"?: number,"task_id"?: string | null,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_actions_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_actions_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_actions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_actions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_actions_meeting_id_fkey"
      columns: ["meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_actions_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"meetings": {
                  Row: {
                    "attendees": string,"created_at": string,"customer_id": string,"held_on": string,"id": string,"project_id": string | null,"summary": string,"title": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attendees"?: string,"created_at"?: string,"customer_id": string,"held_on": string,"id"?: string,"project_id"?: string | null,"summary"?: string,"title": string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "attendees"?: string,"created_at"?: string,"customer_id"?: string,"held_on"?: string,"id"?: string,"project_id"?: string | null,"summary"?: string,"title"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "meetings_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"kind": string,"link": string | null,"needs_action": boolean,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"id"?: string,"kind": string,"link"?: string | null,"needs_action"?: boolean,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"link"?: string | null,"needs_action"?: boolean,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orgs": {
                  Row: {
                    "consultants_see_own_customers": boolean,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultants_see_own_customers"?: boolean,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "consultants_see_own_customers"?: boolean,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"page_versions": {
                  Row: {
                    "content": NonNullable<Json>,"customer_id": string,"discussions": NonNullable<Json>,"id": number,"note": string | null,"page_id": string,"saved_at": string,"saved_by": string | null,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"customer_id": string,"discussions"?: NonNullable<Json>,"id"?: never,"note"?: string | null,"page_id": string,"saved_at"?: string,"saved_by"?: string | null,"title": string,"version": number
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"customer_id"?: string,"discussions"?: NonNullable<Json>,"id"?: never,"note"?: string | null,"page_id"?: string,"saved_at"?: string,"saved_by"?: string | null,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_versions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "page_versions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "page_versions_page_id_fkey"
      columns: ["page_id"]
isOneToOne: false
      referencedRelation: "pages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "page_versions_saved_by_fkey"
      columns: ["saved_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "page_versions_saved_by_fkey"
      columns: ["saved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pages": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"created_by": string | null,"customer_id": string,"discussions": NonNullable<Json>,"editing_by": string | null,"editing_until": string | null,"id": string,"kind": Database["public"]['Enums']["page_kind"],"meeting_id": string | null,"project_id": string,"signed_at": string | null,"signed_by": string | null,"signed_version": number | null,"status": Database["public"]['Enums']["page_status"],"title": string,"updated_at": string,"updated_by": string | null,"version": number,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"discussions"?: NonNullable<Json>,"editing_by"?: string | null,"editing_until"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["page_kind"],"meeting_id"?: string | null,"project_id": string,"signed_at"?: string | null,"signed_by"?: string | null,"signed_version"?: number | null,"status"?: Database["public"]['Enums']["page_status"],"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"discussions"?: NonNullable<Json>,"editing_by"?: string | null,"editing_until"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["page_kind"],"meeting_id"?: string | null,"project_id"?: string,"signed_at"?: string | null,"signed_by"?: string | null,"signed_version"?: number | null,"status"?: Database["public"]['Enums']["page_status"],"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "pages_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_editing_by_fkey"
      columns: ["editing_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_editing_by_fkey"
      columns: ["editing_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_meeting_id_fkey"
      columns: ["meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_signed_by_fkey"
      columns: ["signed_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_signed_by_fkey"
      columns: ["signed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number | null,"currency": string,"customer_id": string,"id": string,"invoice_id": string | null,"mode": string | null,"number": string | null,"paid_on": string,"reference": string | null,"synced_at": string,"zoho_payment_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"currency"?: string,"customer_id": string,"id"?: string,"invoice_id"?: string | null,"mode"?: string | null,"number"?: string | null,"paid_on": string,"reference"?: string | null,"synced_at"?: string,"zoho_payment_id"?: string | null
                  }
                  Update: {
                    "amount"?: number | null,"currency"?: string,"customer_id"?: string,"id"?: string,"invoice_id"?: string | null,"mode"?: string | null,"number"?: string | null,"paid_on"?: string,"reference"?: string | null,"synced_at"?: string,"zoho_payment_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"phases": {
                  Row: {
                    "customer_id": string,"end_date": string | null,"id": string,"name": string,"position": number,"project_id": string,"rate_line_id": string | null,"start_date": string | null,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"end_date"?: string | null,"id"?: string,"name": string,"position"?: number,"project_id": string,"rate_line_id"?: string | null,"start_date"?: string | null,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "customer_id"?: string,"end_date"?: string | null,"id"?: string,"name"?: string,"position"?: number,"project_id"?: string,"rate_line_id"?: string | null,"start_date"?: string | null,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "phases_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "phases_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "phases_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "phases_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "phases_rate_line_id_fkey"
      columns: ["rate_line_id"]
isOneToOne: false
      referencedRelation: "rate_card_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "access_revoked_at": string | null,"avatar_color": string | null,"avatar_path": string | null,"bio": string | null,"can_view_invoices": boolean,"created_at": string,"customer_id": string | null,"customer_role": Database["public"]['Enums']["customer_role"] | null,"email": string,"full_name": string,"id": string,"internal_role": Database["public"]['Enums']["internal_role"] | null,"job_title": string | null,"kind": Database["public"]['Enums']["user_kind"],"location": string | null,"org_id": string | null,"phone": string | null,"timezone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "access_revoked_at"?: string | null,"avatar_color"?: string | null,"avatar_path"?: string | null,"bio"?: string | null,"can_view_invoices"?: boolean,"created_at"?: string,"customer_id"?: string | null,"customer_role"?: Database["public"]['Enums']["customer_role"] | null,"email": string,"full_name"?: string,"id": string,"internal_role"?: Database["public"]['Enums']["internal_role"] | null,"job_title"?: string | null,"kind": Database["public"]['Enums']["user_kind"],"location"?: string | null,"org_id"?: string | null,"phone"?: string | null,"timezone"?: string | null
                  }
                  Update: {
                    "access_revoked_at"?: string | null,"avatar_color"?: string | null,"avatar_path"?: string | null,"bio"?: string | null,"can_view_invoices"?: boolean,"created_at"?: string,"customer_id"?: string | null,"customer_role"?: Database["public"]['Enums']["customer_role"] | null,"email"?: string,"full_name"?: string,"id"?: string,"internal_role"?: Database["public"]['Enums']["internal_role"] | null,"job_title"?: string | null,"kind"?: Database["public"]['Enums']["user_kind"],"location"?: string | null,"org_id"?: string | null,"phone"?: string | null,"timezone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"project_commercials": {
                  Row: {
                    "billing_model": string | null,"contract_value": number | null,"currency": string,"customer_id": string,"notes": string | null,"po_number": string | null,"project_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_model"?: string | null,"contract_value"?: number | null,"currency"?: string,"customer_id": string,"notes"?: string | null,"po_number"?: string | null,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "billing_model"?: string | null,"contract_value"?: number | null,"currency"?: string,"customer_id"?: string,"notes"?: string | null,"po_number"?: string | null,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_commercials_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_commercials_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_commercials_project_id_fkey"
      columns: ["project_id"]
isOneToOne: true
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_commercials_project_id_fkey"
      columns: ["project_id"]
isOneToOne: true
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"project_deals": {
                  Row: {
                    "closed_on": string | null,"customer_id": string,"deal_name": string,"hubspot_deal_id": string,"id": string,"imported_at": string,"invoice_number": string | null,"project_id": string,"stage_label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_on"?: string | null,"customer_id": string,"deal_name": string,"hubspot_deal_id": string,"id"?: string,"imported_at"?: string,"invoice_number"?: string | null,"project_id": string,"stage_label"?: string
                  }
                  Update: {
                    "closed_on"?: string | null,"customer_id"?: string,"deal_name"?: string,"hubspot_deal_id"?: string,"id"?: string,"imported_at"?: string,"invoice_number"?: string | null,"project_id"?: string,"stage_label"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_deals_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_deals_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_deals_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_deals_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "billing_model": Database["public"]['Enums']["billing_model"] | null,"created_at": string,"customer_id": string,"customer_lead_id": string | null,"end_date": string | null,"health": Database["public"]['Enums']["health"],"hubspot_deal_id": string | null,"id": string,"name": string,"pm_id": string | null,"rate_unit": string,"start_date": string | null,"status": Database["public"]['Enums']["project_status"],"template_key": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_model"?: Database["public"]['Enums']["billing_model"] | null,"created_at"?: string,"customer_id": string,"customer_lead_id"?: string | null,"end_date"?: string | null,"health"?: Database["public"]['Enums']["health"],"hubspot_deal_id"?: string | null,"id"?: string,"name": string,"pm_id"?: string | null,"rate_unit"?: string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"template_key"?: string | null
                  }
                  Update: {
                    "billing_model"?: Database["public"]['Enums']["billing_model"] | null,"created_at"?: string,"customer_id"?: string,"customer_lead_id"?: string | null,"end_date"?: string | null,"health"?: Database["public"]['Enums']["health"],"hubspot_deal_id"?: string | null,"id"?: string,"name"?: string,"pm_id"?: string | null,"rate_unit"?: string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"template_key"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_customer_lead_id_fkey"
      columns: ["customer_lead_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_customer_lead_id_fkey"
      columns: ["customer_lead_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_pm_id_fkey"
      columns: ["pm_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_pm_id_fkey"
      columns: ["pm_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_card_lines": {
                  Row: {
                    "bill_on": string | null,"customer_id": string,"description": string,"id": string,"kind": Database["public"]['Enums']["billing_kind"],"label": string,"planned_quantity": number | null,"position": number,"rate": number,"rate_card_id": string,"unit": string,"zoho_item_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_on"?: string | null,"customer_id": string,"description"?: string,"id"?: string,"kind": Database["public"]['Enums']["billing_kind"],"label": string,"planned_quantity"?: number | null,"position"?: number,"rate": number,"rate_card_id": string,"unit"?: string,"zoho_item_id"?: string | null
                  }
                  Update: {
                    "bill_on"?: string | null,"customer_id"?: string,"description"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["billing_kind"],"label"?: string,"planned_quantity"?: number | null,"position"?: number,"rate"?: number,"rate_card_id"?: string,"unit"?: string,"zoho_item_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rate_card_lines_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_card_lines_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_card_lines_rate_card_id_fkey"
      columns: ["rate_card_id"]
isOneToOne: false
      referencedRelation: "rate_cards"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_cards": {
                  Row: {
                    "approved_for_customer": boolean,"contract_value": number | null,"created_at": string,"created_by": string | null,"currency": string,"customer_id": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"id": string,"monthly_cap": number | null,"notes": string,"po_number": string | null,"project_id": string,"status": Database["public"]['Enums']["rate_card_status"],"submitted_at": string | null,"submitted_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_for_customer"?: boolean,"contract_value"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_id": string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"monthly_cap"?: number | null,"notes"?: string,"po_number"?: string | null,"project_id": string,"status"?: Database["public"]['Enums']["rate_card_status"],"submitted_at"?: string | null,"submitted_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "approved_for_customer"?: boolean,"contract_value"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_id"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"monthly_cap"?: number | null,"notes"?: string,"po_number"?: string | null,"project_id"?: string,"status"?: Database["public"]['Enums']["rate_card_status"],"submitted_at"?: string | null,"submitted_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "rate_cards_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_cards_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_line_people": {
                  Row: {
                    "customer_id": string,"profile_id": string,"rate_card_line_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"profile_id": string,"rate_card_line_id": string
                  }
                  Update: {
                    "customer_id"?: string,"profile_id"?: string,"rate_card_line_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rate_line_people_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_line_people_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_line_people_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_line_people_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_line_people_rate_card_line_id_fkey"
      columns: ["rate_card_line_id"]
isOneToOne: false
      referencedRelation: "rate_card_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"reporting_managers": {
                  Row: {
                    "manager_id": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "manager_id": string,"profile_id": string
                  }
                  Update: {
                    "manager_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reporting_managers_manager_id_fkey"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reporting_managers_manager_id_fkey"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reporting_managers_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reporting_managers_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"request_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"customer_id": string,"id": number,"note": string | null,"request_id": string,"status": Database["public"]['Enums']["request_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"customer_id": string,"id"?: never,"note"?: string | null,"request_id": string,"status": Database["public"]['Enums']["request_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"customer_id"?: string,"id"?: never,"note"?: string | null,"request_id"?: string,"status"?: Database["public"]['Enums']["request_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_events_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_events_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_events_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    }
                  ]
                },"requests": {
                  Row: {
                    "created_at": string,"customer_id": string,"desired_date": string | null,"id": string,"number": string,"owner_id": string | null,"priority": Database["public"]['Enums']["priority"],"project_id": string | null,"raised_by": string | null,"requested_by": string | null,"status": Database["public"]['Enums']["request_status"],"title": string,"type": Database["public"]['Enums']["request_type"],"updated_at": string,"what": string,"why": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"customer_id": string,"desired_date"?: string | null,"id"?: string,"number"?: string,"owner_id"?: string | null,"priority"?: Database["public"]['Enums']["priority"],"project_id"?: string | null,"raised_by"?: string | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"title": string,"type"?: Database["public"]['Enums']["request_type"],"updated_at"?: string,"what"?: string,"why"?: string
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"desired_date"?: string | null,"id"?: string,"number"?: string,"owner_id"?: string | null,"priority"?: Database["public"]['Enums']["priority"],"project_id"?: string | null,"raised_by"?: string | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"title"?: string,"type"?: Database["public"]['Enums']["request_type"],"updated_at"?: string,"what"?: string,"why"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "requests_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_raised_by_fkey"
      columns: ["raised_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_raised_by_fkey"
      columns: ["raised_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"statement_entries": {
                  Row: {
                    "customer_id": string,"entry_id": string,"statement_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"entry_id": string,"statement_id": string
                  }
                  Update: {
                    "customer_id"?: string,"entry_id"?: string,"statement_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "statement_entries_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_entries_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_entries_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "time_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_entries_statement_id_fkey"
      columns: ["statement_id"]
isOneToOne: false
      referencedRelation: "billing_statements"
      referencedColumns: ["id"]
    }
                  ]
                },"statement_lines": {
                  Row: {
                    "amount": number | null,"customer_id": string,"id": string,"kind": Database["public"]['Enums']["billing_kind"],"label": string,"note": string,"position": number,"quantity": number,"rate": number,"rate_card_line_id": string,"statement_id": string,"unit": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: never,"customer_id": string,"id"?: string,"kind": Database["public"]['Enums']["billing_kind"],"label": string,"note"?: string,"position"?: number,"quantity"?: number,"rate": number,"rate_card_line_id": string,"statement_id": string,"unit": string
                  }
                  Update: {
                    "amount"?: never,"customer_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["billing_kind"],"label"?: string,"note"?: string,"position"?: number,"quantity"?: number,"rate"?: number,"rate_card_line_id"?: string,"statement_id"?: string,"unit"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "statement_lines_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_lines_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_lines_rate_card_line_id_fkey"
      columns: ["rate_card_line_id"]
isOneToOne: false
      referencedRelation: "rate_card_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_lines_statement_id_fkey"
      columns: ["statement_id"]
isOneToOne: false
      referencedRelation: "billing_statements"
      referencedColumns: ["id"]
    }
                  ]
                },"statement_tasks": {
                  Row: {
                    "customer_id": string,"statement_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"statement_id": string,"task_id": string
                  }
                  Update: {
                    "customer_id"?: string,"statement_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "statement_tasks_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_tasks_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_tasks_statement_id_fkey"
      columns: ["statement_id"]
isOneToOne: false
      referencedRelation: "billing_statements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_tasks_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"system_log": {
                  Row: {
                    "at": string,"detail": NonNullable<Json>,"id": number,"level": string,"message": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"level"?: string,"message": string,"source": string
                  }
                  Update: {
                    "at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"level"?: string,"message"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"task_estimates": {
                  Row: {
                    "customer_id": string,"estimate": number,"task_id": string,"unit": string
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"estimate": number,"task_id": string,"unit"?: string
                  }
                  Update: {
                    "customer_id"?: string,"estimate"?: number,"task_id"?: string,"unit"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_estimates_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_estimates_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_estimates_task_id_fkey"
      columns: ["task_id"]
isOneToOne: true
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assignee_id": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"customer_id": string,"description": string,"due_date": string | null,"id": string,"owner_side": Database["public"]['Enums']["owner_side"],"parent_id": string | null,"phase_id": string | null,"position": number,"project_id": string,"rate_line_id": string | null,"request_id": string | null,"spotlight": boolean,"start_date": string | null,"statement_id": string | null,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"description"?: string,"due_date"?: string | null,"id"?: string,"owner_side"?: Database["public"]['Enums']["owner_side"],"parent_id"?: string | null,"phase_id"?: string | null,"position"?: number,"project_id": string,"rate_line_id"?: string | null,"request_id"?: string | null,"spotlight"?: boolean,"start_date"?: string | null,"statement_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "assignee_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"description"?: string,"due_date"?: string | null,"id"?: string,"owner_side"?: Database["public"]['Enums']["owner_side"],"parent_id"?: string | null,"phase_id"?: string | null,"position"?: number,"project_id"?: string,"rate_line_id"?: string | null,"request_id"?: string | null,"spotlight"?: boolean,"start_date"?: string | null,"statement_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_phase_id_fkey"
      columns: ["phase_id"]
isOneToOne: false
      referencedRelation: "phases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_rate_line_id_fkey"
      columns: ["rate_line_id"]
isOneToOne: false
      referencedRelation: "rate_card_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_statement_id_fkey"
      columns: ["statement_id"]
isOneToOne: false
      referencedRelation: "billing_statements"
      referencedColumns: ["id"]
    }
                  ]
                },"time_entries": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"billable": boolean,"created_at": string,"customer_id": string,"days": number | null,"hours": number,"id": string,"note": string | null,"returned_at": string | null,"returned_note": string | null,"statement_id": string | null,"task_id": string,"user_id": string,"worked_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"billable"?: boolean,"created_at"?: string,"customer_id": string,"days"?: never,"hours": number,"id"?: string,"note"?: string | null,"returned_at"?: string | null,"returned_note"?: string | null,"statement_id"?: string | null,"task_id": string,"user_id": string,"worked_on"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"billable"?: boolean,"created_at"?: string,"customer_id"?: string,"days"?: never,"hours"?: number,"id"?: string,"note"?: string | null,"returned_at"?: string | null,"returned_note"?: string | null,"statement_id"?: string | null,"task_id"?: string,"user_id"?: string,"worked_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entries_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_statement_id_fkey"
      columns: ["statement_id"]
isOneToOne: false
      referencedRelation: "billing_statements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"updates": {
                  Row: {
                    "author_id": string | null,"completed": string,"created_at": string,"customer_id": string,"health": Database["public"]['Enums']["health"],"id": string,"in_progress": string,"next_week": string,"project_id": string,"published_at": string | null,"status": Database["public"]['Enums']["update_status"],"waiting_on_customer": string,"week_of": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"completed"?: string,"created_at"?: string,"customer_id": string,"health": Database["public"]['Enums']["health"],"id"?: string,"in_progress"?: string,"next_week"?: string,"project_id": string,"published_at"?: string | null,"status"?: Database["public"]['Enums']["update_status"],"waiting_on_customer"?: string,"week_of": string
                  }
                  Update: {
                    "author_id"?: string | null,"completed"?: string,"created_at"?: string,"customer_id"?: string,"health"?: Database["public"]['Enums']["health"],"id"?: string,"in_progress"?: string,"next_week"?: string,"project_id"?: string,"published_at"?: string | null,"status"?: Database["public"]['Enums']["update_status"],"waiting_on_customer"?: string,"week_of"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "updates_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "updates_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "updates_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "updates_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "updates_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "updates_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "customers_internal": {
                  Row: {
                    "account_owner_id": string | null,"created_at": string,"hubspot_company_id": string | null,"id": string,"name": string,"org_id": string,"zoho_customer_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "account_owner_id"?: string | null,"created_at"?: string | null,"hubspot_company_id"?: string | null,"id"?: string | null,"name"?: string | null,"org_id"?: string | null,"zoho_customer_id"?: string | null
                         }
                        Update: {
                           "account_owner_id"?: string | null,"created_at"?: string | null,"hubspot_company_id"?: string | null,"id"?: string | null,"name"?: string | null,"org_id"?: string | null,"zoho_customer_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "customers_account_owner_id_fkey"
      columns: ["account_owner_id"]
isOneToOne: false
      referencedRelation: "directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_account_owner_id_fkey"
      columns: ["account_owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"directory": {
                  Row: {
                    "access_revoked_at": string | null,"avatar_color": string | null,"avatar_path": string | null,"bio": string | null,"can_view_invoices": boolean,"created_at": string,"customer_id": string | null,"customer_role": Database["public"]['Enums']["customer_role"] | null,"email": string,"full_name": string,"id": string,"internal_role": Database["public"]['Enums']["internal_role"] | null,"job_title": string | null,"kind": Database["public"]['Enums']["user_kind"],"location": string | null,"org_id": string | null,"phone": string | null,"timezone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "access_revoked_at"?: string | null,"avatar_color"?: string | null,"avatar_path"?: string | null,"bio"?: string | null,"can_view_invoices"?: boolean | null,"created_at"?: string | null,"customer_id"?: string | null,"customer_role"?: Database["public"]['Enums']["customer_role"] | null,"email"?: string | null,"full_name"?: string | null,"id"?: string | null,"internal_role"?: Database["public"]['Enums']["internal_role"] | null,"job_title"?: string | null,"kind"?: Database["public"]['Enums']["user_kind"] | null,"location"?: string | null,"org_id"?: string | null,"phone"?: string | null,"timezone"?: string | null
                         }
                        Update: {
                           "access_revoked_at"?: string | null,"avatar_color"?: string | null,"avatar_path"?: string | null,"bio"?: string | null,"can_view_invoices"?: boolean | null,"created_at"?: string | null,"customer_id"?: string | null,"customer_role"?: Database["public"]['Enums']["customer_role"] | null,"email"?: string | null,"full_name"?: string | null,"id"?: string | null,"internal_role"?: Database["public"]['Enums']["internal_role"] | null,"job_title"?: string | null,"kind"?: Database["public"]['Enums']["user_kind"] | null,"location"?: string | null,"org_id"?: string | null,"phone"?: string | null,"timezone"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "profiles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"project_progress": {
                  Row: {
                    "done": number | null,"project_id": string,"total": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects_internal"
      referencedColumns: ["id"]
    }
                  ]
                },"projects_internal": {
                  Row: {
                    "customer_id": string,"hubspot_deal_id": string | null,"id": string,"template_key": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "customer_id"?: string | null,"hubspot_deal_id"?: string | null,"id"?: string | null,"template_key"?: string | null
                         }
                        Update: {
                           "customer_id"?: string | null,"hubspot_deal_id"?: string | null,"id"?: string | null,"template_key"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "projects_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers_internal"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_document_version":
{ Args: { "p_document": string,"p_name": string,"p_note"?: string,"p_path": string }; Returns: number
                           },
"add_rate_card_line":
{ Args: { "p_card": string,"p_description"?: string,"p_kind": Database["public"]['Enums']["billing_kind"],"p_label": string,"p_planned"?: number,"p_rate": number,"p_unit": string,"p_zoho_item"?: string }; Returns: string
                           },
"add_to_customer_team":
{ Args: { "p_customer": string,"p_person": string,"p_role"?: string }; Returns: undefined
                           },
"answer_csat":
{ Args: { "p_comment"?: string,"p_score": number,"p_survey": string }; Returns: undefined
                           },
"apply_leave":
{ Args: { "p_end": string,"p_half_day"?: boolean,"p_reason"?: string,"p_start": string,"p_type": string }; Returns: string
                           },
"approve_for_customer":
{ Args: { "p_approval": string,"p_note"?: string }; Returns: undefined
                           },
"approve_rate_card_for_customer":
{ Args: { "p_card": string,"p_note"?: string }; Returns: undefined
                           },
"approve_statement_for_customer":
{ Args: { "p_note"?: string,"p_statement": string }; Returns: undefined
                           },
"approve_time":
{ Args: { "p_entries": (string)[] }; Returns: number
                           },
"archive_document":
{ Args: { "p_archive": boolean,"p_document": string }; Returns: undefined
                           },
"bill_milestone":
{ Args: { "p_line": string }; Returns: string
                           },
"billing_lines":
{ Args: { "p_project": string }; Returns: {
              "current": boolean,"id": string,"kind": Database["public"]['Enums']["billing_kind"],"label": string,"unit": string
            }[]
                           },
"billing_preview":
{ Args: { "p_end": string,"p_start": string }; Returns: {
              "amount": number,"basis": string,"cap": number,"currency": string,"customer_name": string,"kind": Database["public"]['Enums']["billing_kind"],"label": string,"line_id": string,"milestone": boolean,"model": Database["public"]['Enums']["billing_model"],"project_id": string,"project_name": string,"quantity": number,"rate": number,"statement_id": string,"unit": string
            }[]
                           },
"cancel_leave":
{ Args: { "p_request": string }; Returns: undefined
                           },
"claim_page":
{ Args: { "p_page": string,"p_release"?: boolean }; Returns: string
                           },
"complete_action_item":
{ Args: { "p_action": string }; Returns: undefined
                           },
"create_statement":
{ Args: { "p_end": string,"p_project": string,"p_start": string }; Returns: string
                           },
"create_statement_from_tasks":
{ Args: { "p_project": string,"p_tasks": (string)[] }; Returns: string
                           },
"create_task_from_meeting_action":
{ Args: { "p_action": string,"p_phase"?: string }; Returns: string
                           },
"credit_balance":
{ Args: { "p_customer": string }; Returns: {
              "allowance": number,"available": number,"carried": number,"kind": string,"period_end": string,"period_start": string,"remaining": number,"topups": number,"used": number,"used_pct": number
            }[]
                           },
"credit_usage":
{ Args: { "p_customer": string,"p_from": string,"p_to": string }; Returns: {
              "hours": number,"person": string,"project": string,"work": string,"worked_on": string
            }[]
                           },
"customer_team_leave":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "end_date": string,"full_name": string,"half_day": boolean,"start_date": string
            }[]
                           },
"decide_approval":
{ Args: { "p_approval": string,"p_comment"?: string,"p_decision": Database["public"]['Enums']["approval_action"] }; Returns: undefined
                           },
"decide_leave":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_request": string }; Returns: undefined
                           },
"decide_rate_card":
{ Args: { "p_approve": boolean,"p_card": string,"p_note"?: string }; Returns: undefined
                           },
"decide_statement":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_statement": string }; Returns: undefined
                           },
"delete_comment":
{ Args: { "p_comment": string }; Returns: undefined
                           },
"delete_decision":
{ Args: { "p_decision": string }; Returns: undefined
                           },
"delete_document":
{ Args: { "p_document": string }; Returns: undefined
                           },
"delete_meeting":
{ Args: { "p_meeting": string }; Returns: undefined
                           },
"delete_phase":
{ Args: { "p_phase": string }; Returns: number
                           },
"delete_project":
{ Args: { "p_confirm": string,"p_project": string }; Returns: (string)[]
                           },
"delete_request":
{ Args: { "p_request": string }; Returns: undefined
                           },
"delete_task":
{ Args: { "p_task": string }; Returns: undefined
                           },
"delete_update":
{ Args: { "p_update": string }; Returns: undefined
                           },
"effort_units":
{ Args: { "p_project": string }; Returns: (string)[]
                           },
"get_my_profile":
{ Args: Record<PropertyKey, never>; Returns: {
              "access_revoked_at": string | null,
"avatar_color": string | null,
"avatar_path": string | null,
"bio": string | null,
"can_view_invoices": boolean,
"created_at": string,
"customer_id": string | null,
"customer_role": Database["public"]['Enums']["customer_role"] | null,
"email": string,
"full_name": string,
"id": string,
"internal_role": Database["public"]['Enums']["internal_role"] | null,
"job_title": string | null,
"kind": Database["public"]['Enums']["user_kind"],
"location": string | null,
"org_id": string | null,
"phone": string | null,
"timezone": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"leave_balances":
{ Args: { "p_profile": string,"p_year": number }; Returns: {
              "allowance": number,"key": string,"leave_type_id": string,"name": string,"paid": boolean,"pending": number,"remaining": number,"used": number
            }[]
                           },
"outbox_health":
{ Args: Record<PropertyKey, never>; Returns: {
              "failed_7d": number,"oldest_queued": string,"queued": number,"sent_24h": number
            }[]
                           },
"publish_update":
{ Args: { "p_update": string }; Returns: undefined
                           },
"refill_statement":
{ Args: { "p_statement": string }; Returns: undefined
                           },
"remove_from_customer_team":
{ Args: { "p_customer": string,"p_person": string }; Returns: undefined
                           },
"request_page_signoff":
{ Args: { "p_approver": string,"p_due"?: string,"p_note"?: string,"p_page": string }; Returns: string
                           },
"request_to_task":
{ Args: { "p_assignee"?: string,"p_due"?: string,"p_estimate"?: number,"p_phase"?: string,"p_project"?: string,"p_request": string,"p_shared"?: boolean,"p_unit"?: string }; Returns: string
                           },
"restore_page_version":
{ Args: { "p_page": string,"p_version": number }; Returns: number
                           },
"resubmit_approval":
{ Args: { "p_approval": string,"p_comment"?: string,"p_effort": number,"p_summary": string,"p_target"?: string,"p_unit"?: string }; Returns: undefined
                           },
"return_time":
{ Args: { "p_entries": (string)[],"p_note": string }; Returns: number
                           },
"save_page":
{ Args: { "p_base": number,"p_content": Json,"p_discussions": Json,"p_page": string,"p_title"?: string }; Returns: number
                           },
"send_csat_pulses":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"set_access":
{ Args: { "p_revoked": boolean,"p_user": string }; Returns: undefined
                           },
"set_billed_as":
{ Args: { "p_line": string,"p_phase": string,"p_task": string }; Returns: undefined
                           },
"set_consultants_see_own_customers":
{ Args: { "p_on": boolean }; Returns: undefined
                           },
"set_contract_value":
{ Args: { "p_project": string,"p_value": number }; Returns: undefined
                           },
"set_line_people":
{ Args: { "p_line": string,"p_people": (string)[] }; Returns: undefined
                           },
"set_page_sharing":
{ Args: { "p_page": string,"p_shared": boolean }; Returns: undefined
                           },
"set_request_status":
{ Args: { "p_note"?: string,"p_request": string,"p_status": Database["public"]['Enums']["request_status"] }; Returns: undefined
                           },
"setup_billing":
{ Args: { "p_cap"?: number,"p_currency": string,"p_milestones"?: Json,"p_model": Database["public"]['Enums']["billing_model"],"p_notes"?: string,"p_people"?: Json,"p_po"?: string,"p_project": string,"p_retainer"?: Json,"p_unit": string }; Returns: string
                           },
"start_rate_card":
{ Args: { "p_project": string }; Returns: string
                           },
"submit_rate_card":
{ Args: { "p_card": string }; Returns: undefined
                           },
"submit_statement":
{ Args: { "p_statement": string }; Returns: undefined
                           },
"team_leave":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "end_date": string,"full_name": string,"half_day": boolean,"profile_id": string,"start_date": string,"status": string,"type_name": string
            }[]
                           },
"unapprove_time":
{ Args: { "p_entries": (string)[] }; Returns: number
                           },
"unbilled_time":
{ Args: { "p_project"?: string }; Returns: {
              "amount": number,"currency": string,"customer_name": string,"days": number,"full_name": string,"hours": number,"line_label": string,"oldest": string,"project_id": string,"project_name": string,"rate": number,"unit": string,"user_id": string
            }[]
                           }
          }
          Enums: {
            "action_status": "open"|"completed"|"cancelled","action_type": "approval"|"form"|"task"|"clarification"|"uat"|"upload"|"decision"|"invoice"|"meeting_action","approval_action": "requested"|"approved"|"changes_requested"|"resubmitted"|"cancelled","approval_status": "pending"|"approved"|"changes_requested"|"cancelled","billing_kind": "day_rate"|"delivery"|"unit"|"retainer"|"resource"|"overage","billing_model": "time_materials"|"fixed_price"|"retainer"|"dedicated","csat_kind": "request"|"pulse"|"closure","customer_role": "customer_exec"|"customer_member","feedback_kind": "praise"|"suggestion"|"issue"|"other","feedback_status": "new"|"acknowledged"|"actioned"|"closed","health": "on_track"|"needs_attention"|"at_risk","internal_role": "admin"|"ceo"|"pm"|"consultant"|"finance","owner_side": "seven_billion"|"customer","page_kind": "scope"|"requirements"|"meeting_notes"|"blank","page_status": "draft"|"in_review"|"signed_off","priority": "low"|"normal"|"high"|"critical","project_status": "active"|"on_hold"|"completed","rate_card_status": "draft"|"pending"|"approved"|"changes_requested"|"superseded","request_status": "submitted"|"under_review"|"clarification"|"estimated"|"approved"|"scheduled"|"in_development"|"uat"|"delivered"|"cancelled","request_type": "requirement"|"enhancement"|"change_request"|"bug"|"new_report"|"data_request"|"access_request"|"support"|"other","setup_status": "pending"|"created"|"dismissed","statement_status": "draft"|"pending"|"approved"|"changes_requested"|"invoiced","task_status": "todo"|"in_progress"|"in_review"|"waiting_customer"|"blocked"|"done","update_status": "draft"|"published","user_kind": "internal"|"customer","visibility": "internal"|"shared"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "action_status": ["open", "completed", "cancelled"],"action_type": ["approval", "form", "task", "clarification", "uat", "upload", "decision", "invoice", "meeting_action"],"approval_action": ["requested", "approved", "changes_requested", "resubmitted", "cancelled"],"approval_status": ["pending", "approved", "changes_requested", "cancelled"],"billing_kind": ["day_rate", "delivery", "unit", "retainer", "resource", "overage"],"billing_model": ["time_materials", "fixed_price", "retainer", "dedicated"],"csat_kind": ["request", "pulse", "closure"],"customer_role": ["customer_exec", "customer_member"],"feedback_kind": ["praise", "suggestion", "issue", "other"],"feedback_status": ["new", "acknowledged", "actioned", "closed"],"health": ["on_track", "needs_attention", "at_risk"],"internal_role": ["admin", "ceo", "pm", "consultant", "finance"],"owner_side": ["seven_billion", "customer"],"page_kind": ["scope", "requirements", "meeting_notes", "blank"],"page_status": ["draft", "in_review", "signed_off"],"priority": ["low", "normal", "high", "critical"],"project_status": ["active", "on_hold", "completed"],"rate_card_status": ["draft", "pending", "approved", "changes_requested", "superseded"],"request_status": ["submitted", "under_review", "clarification", "estimated", "approved", "scheduled", "in_development", "uat", "delivered", "cancelled"],"request_type": ["requirement", "enhancement", "change_request", "bug", "new_report", "data_request", "access_request", "support", "other"],"setup_status": ["pending", "created", "dismissed"],"statement_status": ["draft", "pending", "approved", "changes_requested", "invoiced"],"task_status": ["todo", "in_progress", "in_review", "waiting_customer", "blocked", "done"],"update_status": ["draft", "published"],"user_kind": ["internal", "customer"],"visibility": ["internal", "shared"]
          }
        }
} as const
