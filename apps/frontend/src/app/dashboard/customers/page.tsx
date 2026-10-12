'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Loader2,
  Building2,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  UserCheck,
  PowerOff,
  Power,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-provider';
import { formatDate } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface Customer {
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
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface CustomerFormData {
  name: string;
  phone: string;
  email: string;
  company_name: string;
  gst_tax_id: string;
  notes: string;
  status: 'active' | 'inactive';
  billing_address: CustomerAddress;
  shipping_address: CustomerAddress;
  sameAddress: boolean;
}

const emptyFormData: CustomerFormData = {
  name: '',
  phone: '',
  email: '',
  company_name: '',
  gst_tax_id: '',
  notes: '',
  status: 'active',
  billing_address: {
    street: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  },
  shipping_address: {
    street: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  },
  sameAddress: true,
};

export default function CustomersPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(emptyFormData);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Permissions checking
  const userRole = user?.role || 'staff';
  const customPermissions = (user as any)?.permissions || [];
  const canCreate =
    userRole === 'admin' ||
    userRole === 'business_owner' ||
    customPermissions.includes('customers.create') ||
    customPermissions.includes('customers:*');
  const canEdit =
    userRole === 'admin' ||
    userRole === 'business_owner' ||
    customPermissions.includes('customers.edit') ||
    customPermissions.includes('customers:*');
  const canDelete =
    userRole === 'admin' ||
    userRole === 'business_owner' ||
    customPermissions.includes('customers.delete') ||
    customPermissions.includes('customers:*');

  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const res = await api.get<{ data: Customer[]; meta: any }>(`/customers?${params.toString()}`);
      if (res && res.data) {
        setCustomers(res.data);
        if (res.meta) {
          setTotalPages(res.meta.total_pages || 1);
          setTotalCount(res.meta.total || res.data.length);
        }
      }
    } catch (err: any) {
      console.error('Failed to load customers:', err);
      toast.error(err.message || 'Failed to fetch customers');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery, statusFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormData(emptyFormData);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    const b = c.billing_address || {};
    const s = c.shipping_address || {};
    const isSame =
      b.street === s.street &&
      b.city === s.city &&
      b.state === s.state &&
      b.postal_code === s.postal_code &&
      b.country === s.country;

    setFormData({
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      company_name: c.company_name || '',
      gst_tax_id: c.gst_tax_id || '',
      notes: c.notes || '',
      status: c.status || 'active',
      billing_address: {
        street: b.street || '',
        city: b.city || '',
        state: b.state || '',
        postal_code: b.postal_code || '',
        country: b.country || '',
      },
      shipping_address: {
        street: s.street || '',
        city: s.city || '',
        state: s.state || '',
        postal_code: s.postal_code || '',
        country: s.country || '',
      },
      sameAddress: isSame,
    });
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!formData.phone.trim()) {
      toast.error('Valid phone number is required');
      return;
    }
    if (!formData.email.trim()) {
      toast.error('Valid email is required');
      return;
    }

    try {
      setIsSaving(true);
      const shipping = formData.sameAddress ? formData.billing_address : formData.shipping_address;

      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim().toLowerCase(),
        company_name: formData.company_name.trim() || null,
        gst_tax_id: formData.gst_tax_id.trim() || null,
        notes: formData.notes.trim() || null,
        status: formData.status,
        billing_address: formData.billing_address,
        shipping_address: shipping,
      };

      if (editingCustomer) {
        await api.patch(`/customers/${editingCustomer.id}`, payload);
        toast.success('Customer updated successfully');
      } else {
        await api.post('/customers', payload);
        toast.success('Customer created successfully');
      }

      setIsModalOpen(false);
      fetchCustomers();
    } catch (err: any) {
      console.error('Error saving customer:', err);
      toast.error(err.message || 'Failed to save customer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (c: Customer) => {
    try {
      await api.post(`/customers/${c.id}/toggle-status`, {});
      toast.success(`Customer marked as ${c.status === 'active' ? 'inactive' : 'active'}`);
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const handleDelete = async (c: Customer) => {
    if (!confirm(`Are you sure you want to deactivate customer "${c.name}"? Historical records will be preserved.`)) {
      return;
    }

    try {
      setDeletingId(c.id);
      await api.delete(`/customers/${c.id}`);
      toast.success('Customer deactivated successfully');
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to deactivate customer');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-secondary-900 dark:text-white">
            Customer Management
          </h1>
          <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
            Manage your customer directory, addresses, tax profiles, and contact details.
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleOpenAdd} className="w-full sm:w-auto flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
              <Input
                placeholder="Search customers by name, company, email, or phone..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-secondary-500 uppercase tracking-wider">
                Status:
              </span>
              <div className="flex rounded-md shadow-sm border border-secondary-200 dark:border-secondary-800 p-0.5 bg-secondary-50 dark:bg-secondary-900">
                {(['all', 'active', 'inactive'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setStatusFilter(s);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                      statusFilter === s
                        ? 'bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white shadow-sm'
                        : 'text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              <p className="text-sm text-secondary-500">Loading customers...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <UserCheck className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto" />
              <h3 className="text-base font-semibold text-secondary-900 dark:text-white">
                No customers found
              </h3>
              <p className="text-sm text-secondary-500 dark:text-secondary-400 max-w-sm mx-auto">
                {searchQuery || statusFilter !== 'all'
                  ? 'No customers match your search criteria. Try clearing filters.'
                  : 'Start adding customers to organize contact information, billing, and future transactions.'}
              </p>
              {canCreate && !searchQuery && statusFilter === 'all' && (
                <Button onClick={handleOpenAdd} size="sm" className="mt-2">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add First Customer
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-secondary-200 dark:border-secondary-800 bg-secondary-50/50 dark:bg-secondary-900/50 text-secondary-500 dark:text-secondary-400 font-medium">
                    <th className="py-3.5 px-4 sm:px-6">Customer</th>
                    <th className="py-3.5 px-4 hidden md:table-cell">Contact</th>
                    <th className="py-3.5 px-4 hidden lg:table-cell">Tax ID / GST</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 hidden sm:table-cell">Created</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-secondary-50/70 dark:hover:bg-secondary-900/40 transition-colors"
                    >
                      <td className="py-4 px-4 sm:px-6">
                        <Link
                          href={`/dashboard/customers/${c.id}`}
                          className="font-medium text-secondary-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors block"
                        >
                          {c.name}
                        </Link>
                        {c.company_name ? (
                          <div className="flex items-center gap-1.5 text-xs text-secondary-500 mt-0.5">
                            <Building2 className="h-3 w-3 text-secondary-400" />
                            <span>{c.company_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-secondary-400">Individual Customer</span>
                        )}
                      </td>
                      <td className="py-4 px-4 hidden md:table-cell">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs text-secondary-600 dark:text-secondary-300">
                            <Mail className="h-3 w-3 text-secondary-400" />
                            <a href={`mailto:${c.email}`} className="hover:underline">
                              {c.email}
                            </a>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-secondary-600 dark:text-secondary-300">
                            <Phone className="h-3 w-3 text-secondary-400" />
                            <a href={`tel:${c.phone}`} className="hover:underline">
                              {c.phone}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 hidden lg:table-cell">
                        {c.gst_tax_id ? (
                          <span className="font-mono text-xs text-secondary-700 dark:text-secondary-300 bg-secondary-100 dark:bg-secondary-800 px-2 py-0.5 rounded">
                            {c.gst_tax_id}
                          </span>
                        ) : (
                          <span className="text-xs text-secondary-400">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <Badge
                          variant={c.status === 'active' ? 'default' : 'secondary'}
                          className={`capitalize text-xs ${
                            c.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-400'
                          }`}
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 hidden sm:table-cell text-xs text-secondary-500">
                        {formatDate(c.created_at)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                            title="View Customer Profile"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Profile
                              </DropdownMenuItem>
                              {canEdit && (
                                <DropdownMenuItem onClick={() => handleOpenEdit(c)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Customer
                                </DropdownMenuItem>
                              )}
                              {canEdit && (
                                <DropdownMenuItem onClick={() => handleToggleStatus(c)}>
                                  {c.status === 'active' ? (
                                    <>
                                      <PowerOff className="h-4 w-4 mr-2 text-amber-600" />
                                      Mark Inactive
                                    </>
                                  ) : (
                                    <>
                                      <Power className="h-4 w-4 mr-2 text-emerald-600" />
                                      Mark Active
                                    </>
                                  )}
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(c)}
                                    className="text-red-600 dark:text-red-400 focus:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Deactivate
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-secondary-200 dark:border-secondary-800 flex items-center justify-between text-xs text-secondary-500">
              <div>
                Showing page {currentPage} of {totalPages} ({totalCount} total)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2.5"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-2.5"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer Add / Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </DialogTitle>
            <DialogDescription>
              Enter customer contact information, tax identification, and addresses.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCustomer} className="space-y-6 pt-2">
            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-secondary-900 dark:text-white uppercase tracking-wider border-b border-secondary-200 dark:border-secondary-800 pb-1">
                Basic Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    Customer Name *
                  </label>
                  <Input
                    required
                    placeholder="e.g. John Doe / Jane Smith"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    Company Name
                  </label>
                  <Input
                    placeholder="e.g. Acme Corp (Optional)"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    Email Address *
                  </label>
                  <Input
                    required
                    type="email"
                    placeholder="customer@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    Phone Number *
                  </label>
                  <Input
                    required
                    placeholder="+1 (555) 000-0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    GST / Tax ID
                  </label>
                  <Input
                    placeholder="e.g. GSTIN / VAT ID (Optional)"
                    value={formData.gst_tax_id}
                    onChange={(e) => setFormData({ ...formData, gst_tax_id: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })
                    }
                    className="mt-1 block w-full rounded-md border border-secondary-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Billing Address */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-secondary-900 dark:text-white uppercase tracking-wider border-b border-secondary-200 dark:border-secondary-800 pb-1">
                Billing Address
              </h4>
              <div className="space-y-3">
                <Input
                  placeholder="Street Address / Suite"
                  value={formData.billing_address.street}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      billing_address: { ...formData.billing_address, street: e.target.value },
                    })
                  }
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Input
                    placeholder="City"
                    value={formData.billing_address.city}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        billing_address: { ...formData.billing_address, city: e.target.value },
                      })
                    }
                  />
                  <Input
                    placeholder="State / Region"
                    value={formData.billing_address.state}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        billing_address: { ...formData.billing_address, state: e.target.value },
                      })
                    }
                  />
                  <Input
                    placeholder="Postal Code"
                    value={formData.billing_address.postal_code}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        billing_address: {
                          ...formData.billing_address,
                          postal_code: e.target.value,
                        },
                      })
                    }
                  />
                  <Input
                    placeholder="Country"
                    value={formData.billing_address.country}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        billing_address: { ...formData.billing_address, country: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-secondary-200 dark:border-secondary-800 pb-1">
                <h4 className="text-xs font-semibold text-secondary-900 dark:text-white uppercase tracking-wider">
                  Shipping Address
                </h4>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-secondary-600 dark:text-secondary-300">
                  <input
                    type="checkbox"
                    checked={formData.sameAddress}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sameAddress: e.target.checked,
                        shipping_address: e.target.checked
                          ? { ...formData.billing_address }
                          : { ...formData.shipping_address },
                      })
                    }
                    className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  />
                  Same as Billing Address
                </label>
              </div>

              {!formData.sameAddress && (
                <div className="space-y-3">
                  <Input
                    placeholder="Shipping Street Address / Suite"
                    value={formData.shipping_address.street}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        shipping_address: {
                          ...formData.shipping_address,
                          street: e.target.value,
                        },
                      })
                    }
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Input
                      placeholder="City"
                      value={formData.shipping_address.city}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shipping_address: {
                            ...formData.shipping_address,
                            city: e.target.value,
                          },
                        })
                      }
                    />
                    <Input
                      placeholder="State / Region"
                      value={formData.shipping_address.state}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shipping_address: {
                            ...formData.shipping_address,
                            state: e.target.value,
                          },
                        })
                      }
                    />
                    <Input
                      placeholder="Postal Code"
                      value={formData.shipping_address.postal_code}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shipping_address: {
                            ...formData.shipping_address,
                            postal_code: e.target.value,
                          },
                        })
                      }
                    />
                    <Input
                      placeholder="Country"
                      value={formData.shipping_address.country}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shipping_address: {
                            ...formData.shipping_address,
                            country: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                Customer Notes
              </label>
              <textarea
                rows={3}
                placeholder="Special delivery instructions, client preferences, or account notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full rounded-md border border-secondary-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingCustomer ? 'Save Changes' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
