'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, MoreVertical, Edit, Shield, Ban, Trash2, Loader2, Mail, UserCheck, UserX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: 'admin' | 'business_owner' | 'staff';
  status: 'active' | 'suspended' | 'pending_verification';
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  businesses_count: number;
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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'business_owner' | 'staff'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'pending_verification'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await api.get<PaginatedResponse<User>>(`/admin/users?${params.toString()}`);
      setUsers(response.data);
      setTotalPages(response.meta.total_pages);
      setTotalCount(response.meta.total);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentPage, searchQuery, roleFilter, statusFilter]);

  const handleStatusChange = async (id: string, currentStatus: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await api.patch(`/admin/users/${id}`, { status: newStatus });
      toast.success(`User ${newStatus === 'active' ? 'activated' : 'suspended'} successfully`);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update user');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRoleChange = async (id: string, newRole: string) => {
    setUpdatingId(id);
    try {
      await api.patch(`/admin/users/${id}`, { role: newRole });
      toast.success('Role updated successfully');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update role');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      return;
    }

    setUpdatingId(id);
    try {
      await api.delete(`/admin/users/${id}`);
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete user');
    } finally {
      setUpdatingId(null);
    }
  };

  const getRoleBadge = (role: string) => (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      role === 'admin' && 'bg-error-100 dark:bg-error-900/30 text-error-800 dark:text-error-400',
      role === 'business_owner' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
      role === 'staff' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
    )}>
      {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
    </span>
  );

  const getStatusBadge = (status: string) => (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      status === 'active' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
      status === 'suspended' && 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
      status === 'pending_verification' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
    )}>
      {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
    </span>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">User Management</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage system users and their permissions</p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={roleFilter} onValueChange={(v: 'all' | 'admin' | 'business_owner' | 'staff') => { setRoleFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="business_owner">Business Owner</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v: 'all' | 'active' | 'suspended' | 'pending_verification') => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending_verification">Pending Verification</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
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
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No users found</h3>
              <p className="text-secondary-500 dark:text-secondary-400 mb-4">
                {searchQuery || roleFilter !== 'all' || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'No users in the system yet'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden sm:table-cell">Email Verified</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Businesses</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Joined</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={user.avatar_url || ''} alt={user.name} />
                              <AvatarFallback className="text-sm">
                                {user.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-secondary-900 dark:text-white">{user.name}</p>
                              <p className="text-sm text-secondary-500 dark:text-secondary-400">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          {getRoleBadge(user.role)}
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(user.status)}
                        </td>
                        <td className="px-4 py-4 hidden sm:table-cell">
                          {user.email_verified ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <UserCheck className="h-3 w-3" /> Verified
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                              <Mail className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <span className="text-secondary-600 dark:text-secondary-400">{user.businesses_count}</span>
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell text-sm text-secondary-500 dark:text-secondary-400">
                          {user.last_login_at ? formatDate(user.last_login_at) : 'Never'}
                        </td>
                        <td className="px-4 py-4 text-sm text-secondary-500 dark:text-secondary-400">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={updatingId === user.id}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'admin')} disabled={updatingId === user.id || user.role === 'admin'} className="flex items-center gap-2">
                                <Shield className="h-4 w-4" /> Make Admin
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'business_owner')} disabled={updatingId === user.id || user.role === 'business_owner'} className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" /> Make Business Owner
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'staff')} disabled={updatingId === user.id || user.role === 'staff'} className="flex items-center gap-2">
                                <User className="h-4 w-4" /> Make Staff
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {user.status !== 'active' && (
                                <DropdownMenuItem onClick={() => handleStatusChange(user.id, user.status, 'active')} disabled={updatingId === user.id} className="flex items-center gap-2">
                                  <UserCheck className="h-4 w-4" /> Activate
                                </DropdownMenuItem>
                              )}
                              {user.status === 'active' && (
                                <DropdownMenuItem onClick={() => handleStatusChange(user.id, user.status, 'suspended')} disabled={updatingId === user.id} className="flex items-center gap-2">
                                  <Ban className="h-4 w-4" /> Suspend
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDelete(user.id, user.name)} disabled={updatingId === user.id} className="text-error-600 dark:text-error-400 flex items-center gap-2">
                                {updatingId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                              </DropdownMenuItem>
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
                      Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, totalCount)} of {totalCount} users
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
    </div>
  );
}

import { Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';