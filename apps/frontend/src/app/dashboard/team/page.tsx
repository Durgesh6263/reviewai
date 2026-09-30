'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, MoreVertical, Edit, Trash2, Loader2, Mail, Shield, User, UserCheck, UserX, Send, ChevronLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface TeamMember {
  id: string;
  user_id: string;
  business_id: string;
  business_name: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'staff';
  status: 'active' | 'invited' | 'suspended';
  invited_at: string;
  joined_at: string | null;
  last_active_at: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner', description: 'Full access including billing and deletion' },
  { value: 'admin', label: 'Admin', description: 'Manage businesses, QR codes, and team members' },
  { value: 'staff', label: 'Staff', description: 'View analytics and manage QR codes only' },
];

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'admin' | 'staff'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'invited' | 'suspended'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'staff', business_id: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);

  // Edit role modal
  const [editOpen, setEditOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState<'owner' | 'admin' | 'staff'>('staff');
  const [editLoading, setEditLoading] = useState(false);

  const fetchMembers = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await api.get<PaginatedResponse<TeamMember>>(`/team?${params.toString()}`);
      setMembers(response.data);
      setTotalPages(response.meta.total_pages);
      setTotalCount(response.meta.total);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load team members');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBusinesses = async () => {
    try {
      const response = await api.get<any>('/businesses?limit=100');
      const list = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.businesses)
        ? response.data.businesses
        : Array.isArray(response?.businesses)
        ? response.businesses
        : [];
      setBusinesses(list);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchBusinesses();
  }, [currentPage, searchQuery, roleFilter, statusFilter]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.role || !inviteForm.business_id) {
      toast.error('Please fill in all fields');
      return;
    }

    setInviteLoading(true);
    try {
      await api.post('/team/invite', inviteForm);
      toast.success('Invitation sent successfully!');
      setInviteOpen(false);
      setInviteForm({ email: '', role: 'staff', business_id: '' });
      fetchMembers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!editingMember) return;

    setEditLoading(true);
    try {
      await api.patch(`/team/${editingMember.id}`, { role: editRole });
      toast.success('Role updated successfully!');
      setEditOpen(false);
      fetchMembers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update role');
    } finally {
      setEditLoading(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from the team?`)) {
      return;
    }

    try {
      await api.delete(`/team/${id}`);
      toast.success('Team member removed');
      fetchMembers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to remove team member');
    }
  };

  const handleResendInvite = async (id: string) => {
    try {
      await api.post(`/team/${id}/resend-invite`);
      toast.success('Invitation resent!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to resend invitation');
    }
  };

  const getRoleBadge = (role: string) => (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      role === 'owner' && 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400',
      role === 'admin' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
      role === 'staff' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
    )}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );

  const getStatusBadge = (status: string) => (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      status === 'active' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
      status === 'invited' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
      status === 'suspended' && 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
    )}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Team Members</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage team access and permissions</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>Send an invitation to join your team</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label htmlFor="invite-email" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Email Address
                </label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Business
                </label>
                <Select value={inviteForm.business_id} onValueChange={(v: string) => setInviteForm(prev => ({ ...prev, business_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select business" />
                  </SelectTrigger>
                  <SelectContent>
                    {businesses.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Role
                </label>
                <Select value={inviteForm.role} onValueChange={(v: 'owner' | 'admin' | 'staff') => setInviteForm(prev => ({ ...prev, role: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div>
                          <p className="font-medium">{role.label}</p>
                          <p className="text-xs text-secondary-500">{role.description}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={inviteLoading}>
                  {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Invitation'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
              <Input
                placeholder="Search team members..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={roleFilter} onValueChange={(v: 'all' | 'owner' | 'admin' | 'staff') => { setRoleFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v: 'all' | 'active' | 'invited' | 'suspended') => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Table */}
      <Card>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="p-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse border-b border-border last:border-0">
                  <div className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 bg-secondary-200 dark:bg-secondary-700 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
                      <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No team members found</h3>
              <p className="text-secondary-500 dark:text-secondary-400 mb-4">
                {searchQuery || roleFilter !== 'all' || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Invite your first team member to collaborate'}
              </p>
              {!searchQuery && roleFilter === 'all' && statusFilter === 'all' && (
                <Button onClick={() => setInviteOpen(true)}>Invite Member</Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Member</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden sm:table-cell">Joined</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden lg:table-cell">Last Active</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={''} alt={member.name} />
                              <AvatarFallback className="text-sm">
                                {member.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-secondary-900 dark:text-white">{member.name}</p>
                              <p className="text-sm text-secondary-500 dark:text-secondary-400">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <Link href={`/dashboard/businesses/${member.business_id}`} className="text-secondary-600 dark:text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400">
                            {member.business_name}
                          </Link>
                        </td>
                        <td className="px-4 py-4">
                          {getRoleBadge(member.role)}
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(member.status)}
                        </td>
                        <td className="px-4 py-4 text-sm text-secondary-500 dark:text-secondary-400 hidden sm:table-cell">
                          {member.joined_at ? formatDate(member.joined_at) : '—'}
                        </td>
                        <td className="px-4 py-4 text-sm text-secondary-500 dark:text-secondary-400 hidden lg:table-cell">
                          {member.last_active_at ? formatDate(member.last_active_at) : '—'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {member.status === 'invited' && (
                                <DropdownMenuItem onClick={() => handleResendInvite(member.id)} className="flex items-center gap-2">
                                  <Send className="h-4 w-4" /> Resend Invitation
                                </DropdownMenuItem>
                              )}
                              {member.status === 'active' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => { setEditingMember(member); setEditRole(member.role); setEditOpen(true); }}
                                    className="flex items-center gap-2"
                                  >
                                    <Shield className="h-4 w-4" /> Change Role
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleRemove(member.id, member.name)}
                                    className="text-error-600 dark:text-error-400 flex items-center gap-2"
                                  >
                                    <UserX className="h-4 w-4" /> Remove
                                  </DropdownMenuItem>
                                </>
                              )}
                              {member.status === 'suspended' && (
                                <DropdownMenuItem
                                  onClick={() => handleRemove(member.id, member.name)}
                                  className="text-error-600 dark:text-error-400 flex items-center gap-2"
                                >
                                  <Trash2 className="h-4 w-4" /> Remove Permanently
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-secondary-600 dark:text-secondary-400">
                      Showing {(currentPage - 1) * 10 + 1} to {Math.min(currentPage * 10, totalCount)} of {totalCount} members
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Role Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>Update role for {editingMember?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={editRole} onValueChange={(v: 'owner' | 'admin' | 'staff') => setEditRole(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div>
                      <p className="font-medium">{role.label}</p>
                      <p className="text-xs text-secondary-500">{role.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" onClick={handleRoleChange} disabled={editLoading}>
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}