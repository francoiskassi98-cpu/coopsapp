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
          campaign_id: string | null
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          cooperative: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          campaign_id?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          cooperative?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          campaign_id?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          cooperative?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          active: boolean
          archived: boolean
          created_at: string
          date_debut: string
          date_fin: string
          id: string
          nom: string
          utilise_pour_chargement: boolean
        }
        Insert: {
          active?: boolean
          archived?: boolean
          created_at?: string
          date_debut: string
          date_fin: string
          id?: string
          nom: string
          utilise_pour_chargement?: boolean
        }
        Update: {
          active?: boolean
          archived?: boolean
          created_at?: string
          date_debut?: string
          date_fin?: string
          id?: string
          nom?: string
          utilise_pour_chargement?: boolean
        }
        Relationships: []
      }
      cooperatives: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          created_at: string
          delivery_date: string
          id: string
          net_weight: number
          num_bags: number
          producer_id: string
          receipt_number: string
          shipment_id: string
        }
        Insert: {
          created_at?: string
          delivery_date: string
          id?: string
          net_weight: number
          num_bags: number
          producer_id: string
          receipt_number: string
          shipment_id: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          id?: string
          net_weight?: number
          num_bags?: number
          producer_id?: string
          receipt_number?: string
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
          campaign_id: string | null
          cooperative: string
          disabled_at: string
          id: string
          section_name: string
        }
        Insert: {
          campaign_id?: string | null
          cooperative: string
          disabled_at?: string
          id?: string
          section_name: string
        }
        Update: {
          campaign_id?: string | null
          cooperative?: string
          disabled_at?: string
          id?: string
          section_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "disabled_sections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      producer_registry: {
        Row: {
          actif: boolean
          campaign_id: string
          cni: string | null
          code_plantation: string
          code_producteur: string | null
          cooperative: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          nom_complet: string
          numero_producteur: string | null
          potentiel_livraison: number
          potentiel_restant: number
          section: string
          sexe: string | null
          surface_cacao_totale: number | null
        }
        Insert: {
          actif?: boolean
          campaign_id: string
          cni?: string | null
          code_plantation: string
          code_producteur?: string | null
          cooperative: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom_complet: string
          numero_producteur?: string | null
          potentiel_livraison?: number
          potentiel_restant?: number
          section: string
          sexe?: string | null
          surface_cacao_totale?: number | null
        }
        Update: {
          actif?: boolean
          campaign_id?: string
          cni?: string | null
          code_plantation?: string
          code_producteur?: string | null
          cooperative?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom_complet?: string
          numero_producteur?: string | null
          potentiel_livraison?: number
          potentiel_restant?: number
          section?: string
          sexe?: string | null
          surface_cacao_totale?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "producer_registry_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      producers: {
        Row: {
          cooperative: string
          created_at: string
          delivery_potential: number
          full_name: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          national_id: string | null
          num_plots: number | null
          plantation_area: number | null
          plantation_code: string
          producer_code: string | null
          producer_number: string | null
          remaining_potential: number
          section: string
          sexe: string | null
          total_cocoa_area: number | null
          updated_at: string
        }
        Insert: {
          cooperative: string
          created_at?: string
          delivery_potential?: number
          full_name: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          national_id?: string | null
          num_plots?: number | null
          plantation_area?: number | null
          plantation_code: string
          producer_code?: string | null
          producer_number?: string | null
          remaining_potential?: number
          section: string
          sexe?: string | null
          total_cocoa_area?: number | null
          updated_at?: string
        }
        Update: {
          cooperative?: string
          created_at?: string
          delivery_potential?: number
          full_name?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          national_id?: string | null
          num_plots?: number | null
          plantation_area?: number | null
          plantation_code?: string
          producer_code?: string | null
          producer_number?: string | null
          remaining_potential?: number
          section?: string
          sexe?: string | null
          total_cocoa_area?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
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
      reports_ppt_history: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          cooperatives: string[]
          created_at: string
          file_name: string
          id: string
          params: Json
          type_rapport: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          campaign_name?: string | null
          cooperatives?: string[]
          created_at?: string
          file_name: string
          id?: string
          params?: Json
          type_rapport: string
          user_id?: string
        }
        Update: {
          campaign_id?: string | null
          campaign_name?: string | null
          cooperatives?: string[]
          created_at?: string
          file_name?: string
          id?: string
          params?: Json
          type_rapport?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_ppt_history_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          avg_bag_weight: number
          campaign: string
          campaign_id: string | null
          connaissement: string | null
          cooperative_id: string | null
          created_at: string
          delivery_end: string
          delivery_start: string
          destination: string
          id: string
          is_cancelled: boolean
          partner_id: string | null
          project: string
          status: string
          total_bags: number
          total_weight: number
          zone: string | null
        }
        Insert: {
          avg_bag_weight: number
          campaign: string
          campaign_id?: string | null
          connaissement?: string | null
          cooperative_id?: string | null
          created_at?: string
          delivery_end: string
          delivery_start: string
          destination: string
          id?: string
          is_cancelled?: boolean
          partner_id?: string | null
          project: string
          status?: string
          total_bags: number
          total_weight: number
          zone?: string | null
        }
        Update: {
          avg_bag_weight?: number
          campaign?: string
          campaign_id?: string | null
          connaissement?: string | null
          cooperative_id?: string | null
          created_at?: string
          delivery_end?: string
          delivery_start?: string
          destination?: string
          id?: string
          is_cancelled?: boolean
          partner_id?: string | null
          project?: string
          status?: string
          total_bags?: number
          total_weight?: number
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cooperatives: {
        Row: {
          cooperative: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          cooperative: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          cooperative?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
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
          cooperative: string
          delivery_potential: number
          full_name: string
          id: string
          is_active: boolean
          plantation_code: string
          remaining_potential: number
          section: string
          sexe: string
        }[]
      }
      get_active_campaign: {
        Args: never
        Returns: {
          active: boolean
          archived: boolean
          created_at: string
          date_debut: string
          date_fin: string
          id: string
          nom: string
          utilise_pour_chargement: boolean
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_dashboard_stats_by_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          nb_chargements: number
          nb_producteurs: number
          poids_livre: number
          potentiel_restant: number
          potentiel_total: number
        }[]
      }
      get_max_receipt_number: {
        Args: { p_cooperative_id: string }
        Returns: string
      }
      get_remaining_potential_by_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          cooperative: string
          livre: number
          potentiel_total: number
          restant: number
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
      my_cooperative_ids: { Args: never; Returns: string[] }
      my_cooperative_names: { Args: never; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "agent"
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
      app_role: ["admin", "agent"],
    },
  },
} as const
