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
          cooperative: string
          disabled_at: string
          id: string
          section_name: string
        }
        Insert: {
          cooperative: string
          disabled_at?: string
          id?: string
          section_name: string
        }
        Update: {
          cooperative?: string
          disabled_at?: string
          id?: string
          section_name?: string
        }
        Relationships: []
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
      shipments: {
        Row: {
          avg_bag_weight: number
          campaign: string
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
      get_max_receipt_number: {
        Args: { p_cooperative_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
