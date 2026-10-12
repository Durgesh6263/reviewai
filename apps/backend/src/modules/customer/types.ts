/**
 * Customer Module Types & Validation Schemas
 * ReviewAI SaaS Platform
 */

import { z } from 'zod';

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export type CustomerStatus = 'active' | 'inactive';

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  email: string;
  company_name: string | null;
  gst_tax_id: string | null;
  billing_address: CustomerAddress | null;
  shipping_address: CustomerAddress | null;
  notes: string | null;
  status: CustomerStatus;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export const AddressSchema = z.object({
  street: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  postal_code: z.string().optional().default(''),
  country: z.string().optional().default(''),
}).nullable().optional();

// Phone validation regex accepting standard international / domestic formats
const phoneRegex = /^[\d\s\-\+\(\)\.]{7,25}$/;

export const CreateCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  phone: z.string().trim().refine((val) => phoneRegex.test(val), {
    message: 'Please enter a valid phone number (at least 7 digits)',
  }),
  email: z.string().trim().email('Please enter a valid email address'),
  company_name: z.string().trim().optional().nullable(),
  gst_tax_id: z.string().trim().optional().nullable(),
  billing_address: AddressSchema,
  shipping_address: AddressSchema,
  notes: z.string().trim().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
  business_id: z.string().uuid().optional(),
});

export type CreateCustomerDTO = z.infer<typeof CreateCustomerSchema>;

export const UpdateCustomerSchema = CreateCustomerSchema.partial();
export type UpdateCustomerDTO = z.infer<typeof UpdateCustomerSchema>;

export interface CustomerListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  business_id?: string;
}

export interface CustomerListResponse {
  data: Customer[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}
