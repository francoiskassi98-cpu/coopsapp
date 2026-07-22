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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          campaign_label: string | null
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          registre: string | null
          table_name: string
        }
        Insert: {
          action: string
          campaign_label?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          registre?: string | null
          table_name: string
        }
        Update: {
          action?: string
          campaign_label?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          registre?: string | null
          table_name?: string
        }
        Relationships: []
      }
      cooperatives: {
        Row: {
          acronym: string | null
          address: string | null
          certification_type:
            | Database["public"]["Enums"]["certification_type"]
            | null
          city: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          estimated_producers: number | null
          id: string
          logo_path: string | null
          manager_name: string | null
          name: string
          official_email: string | null
          phone: string | null
          president_name: string | null
          rccm: string | null
          region: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          acronym?: string | null
          address?: string | null
          certification_type?:
            | Database["public"]["Enums"]["certification_type"]
            | null
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          estimated_producers?: number | null
          id?: string
          logo_path?: string | null
          manager_name?: string | null
          name: string
          official_email?: string | null
          phone?: string | null
          president_name?: string | null
          rccm?: string | null
          region?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          acronym?: string | null
          address?: string | null
          certification_type?:
            | Database["public"]["Enums"]["certification_type"]
            | null
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          estimated_producers?: number | null
          id?: string
          logo_path?: string | null
          manager_name?: string | null
          name?: string
          official_email?: string | null
          phone?: string | null
          president_name?: string | null
          rccm?: string | null
          region?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          campaign_label: string
          created_at: string
          delivery_date: string
          id: string
          net_weight: number
          num_bags: number
          producer_id: string
          receipt_number: string
          registre_id: string
          shipment_id: string
        }
        Insert: {
          campaign_label: string
          created_at?: string
          delivery_date: string
          id?: string
          net_weight: number
          num_bags: number
          producer_id: string
          receipt_number: string
          registre_id: string
          shipment_id: string
        }
        Update: {
          campaign_label?: string
          created_at?: string
          delivery_date?: string
          id?: string
          net_weight?: number
          num_bags?: number
          producer_id?: string
          receipt_number?: string
          registre_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      disabled_sections: {
        Row: {
          campaign_label: string
          disabled_at: string
          id: string
          registre_id: string
          section_name: string
        }
        Insert: {
          campaign_label: string
          disabled_at?: string
          id?: string
          registre_id: string
          section_name: string
        }
        Update: {
          campaign_label?: string
          disabled_at?: string
          id?: string
          registre_id?: string
          section_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "disabled_sections_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          email: string | null
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          contact: string | null
          created_at: string
          deleted_at: string | null
          id: string
          logo_path: string | null
          name: string
          registre_id: string
          status: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          logo_path?: string | null
          name: string
          registre_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          registre_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_bonus_results: {
        Row: {
          calculated_bonus: number
          campaign_label: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          producer_id: string
          rate: number
          registre_id: string
          setting_id: string | null
          volume_delivered: number
        }
        Insert: {
          calculated_bonus?: number
          campaign_label: string
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          producer_id: string
          rate?: number
          registre_id: string
          setting_id?: string | null
          volume_delivered?: number
        }
        Update: {
          calculated_bonus?: number
          campaign_label?: string
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          producer_id?: string
          rate?: number
          registre_id?: string
          setting_id?: string | null
          volume_delivered?: number
        }
        Relationships: [
          {
            foreignKeyName: "producer_bonus_results_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_bonus_results_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_bonus_results_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "producer_bonus_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_bonus_settings: {
        Row: {
          amount: number
          bonus_type: string
          campaign_label: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          label: string | null
          registre_id: string
          section: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          bonus_type: string
          campaign_label: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          label?: string | null
          registre_id: string
          section?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bonus_type?: string
          campaign_label?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          label?: string | null
          registre_id?: string
          section?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_bonus_settings_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_registry: {
        Row: {
          actif: boolean
          campaign_label: string
          cni: string | null
          code_plantation: string
          code_producteur: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          nom_complet: string
          num_men: number | null
          num_women: number | null
          numero_producteur: string | null
          potentiel_livraison: number
          potentiel_restant: number
          registre_id: string
          section: string
          sexe: string | null
          surface_cacao_totale: number | null
        }
        Insert: {
          actif?: boolean
          campaign_label: string
          cni?: string | null
          code_plantation: string
          code_producteur?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom_complet: string
          num_men?: number | null
          num_women?: number | null
          numero_producteur?: string | null
          potentiel_livraison?: number
          potentiel_restant?: number
          registre_id: string
          section: string
          sexe?: string | null
          surface_cacao_totale?: number | null
        }
        Update: {
          actif?: boolean
          campaign_label?: string
          cni?: string | null
          code_plantation?: string
          code_producteur?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom_complet?: string
          num_men?: number | null
          num_women?: number | null
          numero_producteur?: string | null
          potentiel_livraison?: number
          potentiel_restant?: number
          registre_id?: string
          section?: string
          sexe?: string | null
          surface_cacao_totale?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "producer_registry_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
        ]
      }
      producers: {
        Row: {
          campaign_label: string
          created_at: string
          deleted_at: string | null
          delivery_potential: number
          full_name: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          national_id: string | null
          num_men: number | null
          num_plots: number | null
          num_women: number | null
          plantation_area: number | null
          plantation_code: string
          producer_code: string | null
          producer_number: string | null
          registre_id: string
          remaining_potential: number
          section: string
          sexe: string | null
          total_cocoa_area: number | null
          updated_at: string
        }
        Insert: {
          campaign_label: string
          created_at?: string
          deleted_at?: string | null
          delivery_potential?: number
          full_name: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          national_id?: string | null
          num_men?: number | null
          num_plots?: number | null
          num_women?: number | null
          plantation_area?: number | null
          plantation_code: string
          producer_code?: string | null
          producer_number?: string | null
          registre_id: string
          remaining_potential?: number
          section: string
          sexe?: string | null
          total_cocoa_area?: number | null
          updated_at?: string
        }
        Update: {
          campaign_label?: string
          created_at?: string
          deleted_at?: string | null
          delivery_potential?: number
          full_name?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          national_id?: string | null
          num_men?: number | null
          num_plots?: number | null
          num_women?: number | null
          plantation_area?: number | null
          plantation_code?: string
          producer_code?: string | null
          producer_number?: string | null
          registre_id?: string
          remaining_potential?: number
          section?: string
          sexe?: string | null
          total_cocoa_area?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producers_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          registre_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          registre_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          registre_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
        ]
      }
      rapports_envoyes: {
        Row: {
          date_envoi: string
          destinataires: string[]
          donnees_rapport: Json | null
          id: string
          message_erreur: string | null
          statut: string
        }
        Insert: {
          date_envoi?: string
          destinataires: string[]
          donnees_rapport?: Json | null
          id?: string
          message_erreur?: string | null
          statut?: string
        }
        Update: {
          date_envoi?: string
          destinataires?: string[]
          donnees_rapport?: Json | null
          id?: string
          message_erreur?: string | null
          statut?: string
        }
        Relationships: []
      }
      registres: {
        Row: {
          address: string | null
          code: string | null
          cooperative_id: string
          created_at: string
          id: string
          name: string
          phone: string | null
          responsable: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          cooperative_id: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          responsable?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          cooperative_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          responsable?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registres_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      reports_ppt_history: {
        Row: {
          campaign_label: string | null
          campaign_name: string | null
          created_at: string
          file_name: string
          id: string
          params: Json
          registres: string[] | null
          type_rapport: string
          user_id: string
        }
        Insert: {
          campaign_label?: string | null
          campaign_name?: string | null
          created_at?: string
          file_name: string
          id?: string
          params?: Json
          registres?: string[] | null
          type_rapport: string
          user_id?: string
        }
        Update: {
          campaign_label?: string | null
          campaign_name?: string | null
          created_at?: string
          file_name?: string
          id?: string
          params?: Json
          registres?: string[] | null
          type_rapport?: string
          user_id?: string
        }
        Relationships: []
      }
      shipment_excel_templates: {
        Row: {
          coop_logo_path: string | null
          created_at: string
          created_by: string | null
          custom_footer: string | null
          custom_header: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          logo_position: string
          partner_id: string | null
          partner_logo_path: string | null
          registre_id: string
          show_bill_of_lading: boolean
          show_departure_date: boolean
          show_destination: boolean
          show_driver: boolean
          show_num_bags: boolean
          show_num_producers: boolean
          show_partner: boolean
          show_partner_logo: boolean
          show_project: boolean
          show_total_weight: boolean
          show_trailer: boolean
          show_truck: boolean
          slogan: string | null
          subtitle: string | null
          template_name: string
          title: string | null
          updated_at: string
        }
        Insert: {
          coop_logo_path?: string | null
          created_at?: string
          created_by?: string | null
          custom_footer?: string | null
          custom_header?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          logo_position?: string
          partner_id?: string | null
          partner_logo_path?: string | null
          registre_id: string
          show_bill_of_lading?: boolean
          show_departure_date?: boolean
          show_destination?: boolean
          show_driver?: boolean
          show_num_bags?: boolean
          show_num_producers?: boolean
          show_partner?: boolean
          show_partner_logo?: boolean
          show_project?: boolean
          show_total_weight?: boolean
          show_trailer?: boolean
          show_truck?: boolean
          slogan?: string | null
          subtitle?: string | null
          template_name?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          coop_logo_path?: string | null
          created_at?: string
          created_by?: string | null
          custom_footer?: string | null
          custom_header?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          logo_position?: string
          partner_id?: string | null
          partner_logo_path?: string | null
          registre_id?: string
          show_bill_of_lading?: boolean
          show_departure_date?: boolean
          show_destination?: boolean
          show_driver?: boolean
          show_num_bags?: boolean
          show_num_producers?: boolean
          show_partner?: boolean
          show_partner_logo?: boolean
          show_project?: boolean
          show_total_weight?: boolean
          show_trailer?: boolean
          show_truck?: boolean
          slogan?: string | null
          subtitle?: string | null
          template_name?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_excel_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_excel_templates_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          avg_bag_weight: number
          campaign_label: string | null
          connaissement: string | null
          created_at: string
          deleted_at: string | null
          delivery_end: string
          delivery_start: string
          departure_date: string | null
          destination: string
          driver_name: string | null
          id: string
          is_cancelled: boolean
          lot_number: string | null
          partner_id: string | null
          project: string
          project_id: string | null
          registre_id: string
          status: string
          template_id: string | null
          total_bags: number
          total_weight: number
          trailer_number: string | null
          truck_number: string | null
          zone: string | null
        }
        Insert: {
          avg_bag_weight: number
          campaign_label?: string | null
          connaissement?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_end: string
          delivery_start: string
          departure_date?: string | null
          destination: string
          driver_name?: string | null
          id?: string
          is_cancelled?: boolean
          lot_number?: string | null
          partner_id?: string | null
          project: string
          project_id?: string | null
          registre_id: string
          status?: string
          template_id?: string | null
          total_bags: number
          total_weight: number
          trailer_number?: string | null
          truck_number?: string | null
          zone?: string | null
        }
        Update: {
          avg_bag_weight?: number
          campaign_label?: string | null
          connaissement?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_end?: string
          delivery_start?: string
          departure_date?: string | null
          destination?: string
          driver_name?: string | null
          id?: string
          is_cancelled?: boolean
          lot_number?: string | null
          partner_id?: string | null
          project?: string
          project_id?: string | null
          registre_id?: string
          status?: string
          template_id?: string | null
          total_bags?: number
          total_weight?: number
          trailer_number?: string | null
          truck_number?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shipment_excel_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number | null
          cooperative_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          payment_date: string | null
          plan_name: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          amount?: number | null
          cooperative_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          payment_date?: string | null
          plan_name: string
          start_date: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          amount?: number | null
          cooperative_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          payment_date?: string | null
          plan_name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cooperatives: {
        Row: {
          cooperative_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          cooperative_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          cooperative_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cooperatives_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      user_registres: {
        Row: {
          created_at: string
          id: string
          registre_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          registre_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          registre_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_registres_registre_id_fkey"
            columns: ["registre_id"]
            isOneToOne: false
            referencedRelation: "registres"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_registre: { Args: { _registre_id: string }; Returns: boolean }
      compute_campaign_label: { Args: { d: string }; Returns: string }
      create_cooperative_with_admin:
        | {
            Args: {
              p_coop: Json
              p_full_name: string
              p_phone: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_coop: Json
              p_full_name: string
              p_phone: string
              p_plan?: string
              p_sub_end?: string
              p_sub_start?: string
              p_user_id: string
            }
            Returns: string
          }
      export_all_deliveries: {
        Args: never
        Returns: {
          created_at: string
          delivery_date: string
          id: string
          net_weight: number
          num_bags: number
          producer_id: string
          receipt_number: string
          shipment_id: string
        }[]
      }
      export_all_producers: {
        Args: never
        Returns: {
          delivery_potential: number
          full_name: string
          id: string
          is_active: boolean
          plantation_code: string
          registre_id: string
          remaining_potential: number
          section: string
          sexe: string
        }[]
      }
      get_dashboard_stats_by_registre: {
        Args: { p_campaign_label?: string; p_registre_id: string }
        Returns: {
          nb_chargements: number
          nb_producteurs: number
          poids_livre: number
          potentiel_restant: number
          potentiel_total: number
        }[]
      }
      get_max_receipt_number: {
        Args: { p_registre_id: string }
        Returns: string
      }
      get_subscription_status: { Args: { _coop_id: string }; Returns: string }
      get_super_admin_stats: {
        Args: never
        Returns: {
          active_coops: number
          expired_coops: number
          suspended_coops: number
          total_coops: number
          total_producers: number
          total_registres: number
          total_users: number
          trial_coops: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_coop_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      log_login_event: { Args: { p_user_agent?: string }; Returns: undefined }
      my_cooperative_ids: { Args: never; Returns: string[] }
      my_cooperative_names: { Args: never; Returns: string[] }
      my_registre_ids: { Args: never; Returns: string[] }
      next_lot_number: {
        Args: { p_campaign_label: string; p_registre: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "coop_admin" | "agent"
      certification_type: "fairtrade" | "rainforest" | "eudr" | "ordinaire"
      subscription_status: "trial" | "active" | "suspended" | "expired"
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
      app_role: ["super_admin", "coop_admin", "agent"],
      certification_type: ["fairtrade", "rainforest", "eudr", "ordinaire"],
      subscription_status: ["trial", "active", "suspended", "expired"],
    },
  },
} as const
