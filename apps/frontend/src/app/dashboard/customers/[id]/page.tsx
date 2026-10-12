'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  Receipt,
  Clock,
  BookOpen,
  Edit,
  Trash2,
  PowerOff,
  Power,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-provider';
import { formatDate } from '@/lib/utils';
import { copyTextToClipboard } from '@/lib/clipboard';
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

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const customerId = params?.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Permissions
  const userRole = user?.role || 'staff';
  const customPermissions = (user as any)?.permissions || [];
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

  // Form state for editing
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    email: '',
    company_name: '',
    gst_tax_id: '',
    notes: '',
    status: 'active' as 'active' | 'inactive',
    billing_address: { street: '', city: '', state: '', postal_code: '', country: '' },
    shipping_address: { street: '', city: '', state: '', postal_code: '', country: '' },
    sameAddress: false,
  });

  const fetchCustomer = useCallback(async () => {
    if (!customerId) return;
    try {
      setIsLoading(true);
      const res = await api.get<{ data: Customer }>(`/customers/${customerId}`);
      if (res && res.data) {
        setCustomer(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load customer profile:', err);
      toast.error(err.message || 'Failed to load customer profile');
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  const handleOpenEdit = () => {
    if (!customer) return;
    const b = customer.billing_address || {};
    const s = customer.shipping_address || {};
    const isSame =
      b.street === s.street &&
      b.city === s.city &&
      b.state === s.state &&
      b.postal_code === s.postal_code &&
      b.country === s.country;

    setEditForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      company_name: customer.company_name || '',
      gst_tax_id: customer.gst_tax_id || '',
      notes: customer.notes || '',
      status: customer.status || 'active',
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
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!editForm.phone.trim()) {
      toast.error('Valid phone number is required');
      return;
    }
    if (!editForm.email.trim()) {
      toast.error('Valid email is required');
      return;
    }

    try {
      setIsSaving(true);
      const shipping = editForm.sameAddress ? editForm.billing_address : editForm.shipping_address;

      await api.patch(`/customers/${customerId}`, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim().toLowerCase(),
        company_name: editForm.company_name.trim() || null,
        gst_tax_id: editForm.gst_tax_id.trim() || null,
        notes: editForm.notes.trim() || null,
        status: editForm.status,
        billing_address: editForm.billing_address,
        shipping_address: shipping,
      });

      toast.success('Customer profile updated');
      setIsEditModalOpen(false);
      fetchCustomer();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update customer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!customer) return;
    try {
      await api.post(`/customers/${customer.id}/toggle-status`, {});
      toast.success(`Customer marked as ${customer.status === 'active' ? 'inactive' : 'active'}`);
      fetchCustomer();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle status');
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    if (!confirm(`Are you sure you want to deactivate customer "${customer.name}"? Historical records will remain intact.`)) {
      return;
    }

    try {
      await api.delete(`/customers/${customer.id}`);
      toast.success('Customer deactivated successfully');
      router.push('/dashboard/customers');
    } catch (err: any) {
      toast.error(err.message || 'Failed to deactivate customer');
    }
  };

  const formatAddress = (addr?: CustomerAddress | null) => {
    if (!addr) return null;
    const parts = [addr.street, addr.city, addr.state, addr.postal_code, addr.country].filter(
      Boolean
    );
    return parts.length > 0 ? parts.join(', ') : null;
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center space-y-3 max-w-7xl mx-auto">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <p className="text-sm text-secondary-500">Loading customer profile...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.push('/dashboard/customers')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Customers
        </Button>
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
              Customer Not Found
            </h3>
            <p className="text-sm text-secondary-500">
              The customer you requested may have been removed or belongs to another business.
            </p>
            <Button onClick={() => router.push('/dashboard/customers')}>
              Return to Customer Directory
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const billingFormatted = formatAddress(customer.billing_address);
  const shippingFormatted = formatAddress(customer.shipping_address);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard/customers')}
          className="text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Customers
        </Button>
      </div>

      {/* Customer Header Banner */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-full bg-primary-100 dark:bg-primary-950/60 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-xl border border-primary-200 dark:border-primary-800 shrink-0">
                {customer.name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-secondary-900 dark:text-white">
                    {customer.name}
                  </h1>
                  <Badge
                    variant={customer.status === 'active' ? 'default' : 'secondary'}
                    className={`capitalize text-xs ${
                      customer.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-400'
                    }`}
                  >
                    {customer.status}
                  </Badge>
                </div>
                {customer.company_name ? (
                  <div className="flex items-center gap-1.5 text-sm text-secondary-600 dark:text-secondary-400">
                    <Building2 className="h-4 w-4 text-secondary-400" />
                    <span>{customer.company_name}</span>
                  </div>
                ) : (
                  <p className="text-sm text-secondary-500 dark:text-secondary-400">
                    Individual Account
                  </p>
                )}
                <p className="text-xs text-secondary-400">
                  Customer since {formatDate(customer.created_at)}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleStatus}
                  className="gap-1.5"
                >
                  {customer.status === 'active' ? (
                    <>
                      <PowerOff className="h-4 w-4 text-amber-600" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <Power className="h-4 w-4 text-emerald-600" />
                      Activate
                    </>
                  )}
                </Button>
              )}
              {canEdit && (
                <Button size="sm" onClick={handleOpenEdit} className="gap-1.5">
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-900 gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  Deactivate Customer
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Sections & Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full bg-secondary-100/70 dark:bg-secondary-800/60 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding / Due</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Contact Details Card */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Contact & Tax Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <label className="text-xs text-secondary-500 uppercase font-medium">Email</label>
                  <div className="flex items-center justify-between mt-1">
                    <a
                      href={`mailto:${customer.email}`}
                      className="font-medium text-primary-600 dark:text-primary-400 hover:underline truncate"
                    >
                      {customer.email}
                    </a>
                    <button
                      onClick={() => {
                        copyTextToClipboard(customer.email);
                        toast.success('Email copied to clipboard');
                      }}
                      className="text-secondary-400 hover:text-secondary-600 ml-2"
                      title="Copy email"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-secondary-500 uppercase font-medium">Phone</label>
                  <div className="flex items-center justify-between mt-1">
                    <a
                      href={`tel:${customer.phone}`}
                      className="font-medium text-secondary-900 dark:text-white hover:underline"
                    >
                      {customer.phone}
                    </a>
                    <button
                      onClick={() => {
                        copyTextToClipboard(customer.phone);
                        toast.success('Phone copied to clipboard');
                      }}
                      className="text-secondary-400 hover:text-secondary-600 ml-2"
                      title="Copy phone"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-secondary-500 uppercase font-medium">
                    GST / Tax Identifier
                  </label>
                  <p className="font-mono text-sm font-medium text-secondary-900 dark:text-white mt-1">
                    {customer.gst_tax_id || 'Not registered / None'}
                  </p>
                </div>

                <div>
                  <label className="text-xs text-secondary-500 uppercase font-medium">
                    Account Notes
                  </label>
                  <p className="text-sm text-secondary-600 dark:text-secondary-300 mt-1 whitespace-pre-wrap bg-secondary-50 dark:bg-secondary-900 p-3 rounded-md border border-secondary-200 dark:border-secondary-800">
                    {customer.notes || 'No customer notes recorded.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Addresses Grid */}
            <div className="md:col-span-2 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Billing Address Card */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base font-semibold">Billing Address</CardTitle>
                    <Receipt className="h-4 w-4 text-secondary-400" />
                  </CardHeader>
                  <CardContent className="pt-2 text-sm text-secondary-600 dark:text-secondary-300 space-y-1">
                    {billingFormatted ? (
                      <>
                        <p className="font-medium text-secondary-900 dark:text-white">
                          {customer.billing_address?.street || ''}
                        </p>
                        <p>
                          {[customer.billing_address?.city, customer.billing_address?.state]
                            .filter(Boolean)
                            .join(', ')}{' '}
                          {customer.billing_address?.postal_code || ''}
                        </p>
                        <p>{customer.billing_address?.country || ''}</p>
                      </>
                    ) : (
                      <p className="text-secondary-400 italic">No billing address saved.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Shipping Address Card */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base font-semibold">Shipping Address</CardTitle>
                    <MapPin className="h-4 w-4 text-secondary-400" />
                  </CardHeader>
                  <CardContent className="pt-2 text-sm text-secondary-600 dark:text-secondary-300 space-y-1">
                    {shippingFormatted ? (
                      <>
                        <p className="font-medium text-secondary-900 dark:text-white">
                          {customer.shipping_address?.street || ''}
                        </p>
                        <p>
                          {[customer.shipping_address?.city, customer.shipping_address?.state]
                            .filter(Boolean)
                            .join(', ')}{' '}
                          {customer.shipping_address?.postal_code || ''}
                        </p>
                        <p>{customer.shipping_address?.country || ''}</p>
                      </>
                    ) : (
                      <p className="text-secondary-400 italic">No shipping address saved.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Account Quick Summary Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Activity & Audit Timestamps
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-secondary-50 dark:bg-secondary-900/60 rounded-lg border border-secondary-200 dark:border-secondary-800">
                    <span className="text-xs text-secondary-500 uppercase font-medium">
                      Date Created
                    </span>
                    <p className="font-medium text-secondary-900 dark:text-white mt-0.5">
                      {formatDate(customer.created_at)}
                    </p>
                  </div>
                  <div className="p-3 bg-secondary-50 dark:bg-secondary-900/60 rounded-lg border border-secondary-200 dark:border-secondary-800">
                    <span className="text-xs text-secondary-500 uppercase font-medium">
                      Last Updated
                    </span>
                    <p className="font-medium text-secondary-900 dark:text-white mt-0.5">
                      {formatDate(customer.updated_at)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ORDERS PLACEHOLDER TAB */}
        <TabsContent value="orders">
          <Card className="border-dashed">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-secondary-100 dark:bg-secondary-800 flex items-center justify-center text-secondary-500 mb-2">
                <FileText className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg font-semibold text-secondary-900 dark:text-white">
                Orders Module (Future Step)
              </CardTitle>
              <CardDescription className="max-w-md mx-auto text-sm text-secondary-500">
                Order creation, sales orders, item tracking, and delivery fulfillment for{' '}
                {customer.name} will appear here when Step 5 is activated.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-6">
              <Badge variant="outline" className="text-xs font-mono uppercase">
                Status: Pending Step 5 Integration
              </Badge>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS PLACEHOLDER TAB */}
        <TabsContent value="payments">
          <Card className="border-dashed">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-secondary-100 dark:bg-secondary-800 flex items-center justify-center text-secondary-500 mb-2">
                <CreditCard className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg font-semibold text-secondary-900 dark:text-white">
                Payments Module (Future Step)
              </CardTitle>
              <CardDescription className="max-w-md mx-auto text-sm text-secondary-500">
                Payment history, recorded transactions, gateway receipts, and refunds for{' '}
                {customer.name} will appear here once the Payments module is enabled.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-6">
              <Badge variant="outline" className="text-xs font-mono uppercase">
                Status: Pending Payments Integration
              </Badge>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OUTSTANDING/DUE PLACEHOLDER TAB */}
        <TabsContent value="outstanding">
          <Card className="border-dashed">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-secondary-100 dark:bg-secondary-800 flex items-center justify-center text-secondary-500 mb-2">
                <Clock className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg font-semibold text-secondary-900 dark:text-white">
                Outstanding & Due Balance (Future Step)
              </CardTitle>
              <CardDescription className="max-w-md mx-auto text-sm text-secondary-500">
                Receivables tracking, overdue balances, credit limits, and automated payment reminders
                will be managed in this section.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-6">
              <Badge variant="outline" className="text-xs font-mono uppercase">
                Current Due: ₹0.00 · Zero Pending Dues
              </Badge>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEDGER PLACEHOLDER TAB */}
        <TabsContent value="ledger">
          <Card className="border-dashed">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-secondary-100 dark:bg-secondary-800 flex items-center justify-center text-secondary-500 mb-2">
                <BookOpen className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg font-semibold text-secondary-900 dark:text-white">
                Customer Ledger Statement (Future Step)
              </CardTitle>
              <CardDescription className="max-w-md mx-auto text-sm text-secondary-500">
                Complete double-entry accounting statement of accounts, chronologically listing debit
                invoices and credit payments for this customer.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-6">
              <Badge variant="outline" className="text-xs font-mono uppercase">
                Statement Status: Clean · 0 Ledger Entries
              </Badge>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer Profile</DialogTitle>
            <DialogDescription>
              Update contact info, tax registration, and separate billing/shipping addresses.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-6 pt-2">
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
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    Company Name
                  </label>
                  <Input
                    value={editForm.company_name}
                    onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
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
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    Phone Number *
                  </label>
                  <Input
                    required
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    GST / Tax ID
                  </label>
                  <Input
                    value={editForm.gst_tax_id}
                    onChange={(e) => setEditForm({ ...editForm, gst_tax_id: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        status: e.target.value as 'active' | 'inactive',
                      })
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
                  value={editForm.billing_address.street}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      billing_address: { ...editForm.billing_address, street: e.target.value },
                    })
                  }
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Input
                    placeholder="City"
                    value={editForm.billing_address.city}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        billing_address: { ...editForm.billing_address, city: e.target.value },
                      })
                    }
                  />
                  <Input
                    placeholder="State"
                    value={editForm.billing_address.state}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        billing_address: { ...editForm.billing_address, state: e.target.value },
                      })
                    }
                  />
                  <Input
                    placeholder="Postal Code"
                    value={editForm.billing_address.postal_code}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        billing_address: {
                          ...editForm.billing_address,
                          postal_code: e.target.value,
                        },
                      })
                    }
                  />
                  <Input
                    placeholder="Country"
                    value={editForm.billing_address.country}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        billing_address: { ...editForm.billing_address, country: e.target.value },
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
                    checked={editForm.sameAddress}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        sameAddress: e.target.checked,
                        shipping_address: e.target.checked
                          ? { ...editForm.billing_address }
                          : { ...editForm.shipping_address },
                      })
                    }
                    className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  />
                  Same as Billing Address
                </label>
              </div>

              {!editForm.sameAddress && (
                <div className="space-y-3">
                  <Input
                    placeholder="Shipping Street Address / Suite"
                    value={editForm.shipping_address.street}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        shipping_address: {
                          ...editForm.shipping_address,
                          street: e.target.value,
                        },
                      })
                    }
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Input
                      placeholder="City"
                      value={editForm.shipping_address.city}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          shipping_address: {
                            ...editForm.shipping_address,
                            city: e.target.value,
                          },
                        })
                      }
                    />
                    <Input
                      placeholder="State"
                      value={editForm.shipping_address.state}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          shipping_address: {
                            ...editForm.shipping_address,
                            state: e.target.value,
                          },
                        })
                      }
                    />
                    <Input
                      placeholder="Postal Code"
                      value={editForm.shipping_address.postal_code}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          shipping_address: {
                            ...editForm.shipping_address,
                            postal_code: e.target.value,
                          },
                        })
                      }
                    />
                    <Input
                      placeholder="Country"
                      value={editForm.shipping_address.country}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          shipping_address: {
                            ...editForm.shipping_address,
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
                placeholder="Account notes..."
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full rounded-md border border-secondary-300 dark:border-secondary-700 bg-white dark:bg-secondary-900 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
