import { api } from './api';

// Secret Manager. Always talks to the real server (there is no mock for secrets).
export type VaultLevel = 'VIEW' | 'EDIT' | 'MANAGE';
export type SecretType = 'LOGIN' | 'API_KEY' | 'NOTE';

export interface VaultFolder { id: string; name: string; description: string | null; secretCount: number; myLevel: VaultLevel | null; myAccessExpiresAt: string | null }
export interface VaultSecret { id: string; name: string; type: SecretType; description: string | null; currentVersion: number; expiresAt: string | null; updatedAt: string }
export interface VaultGrant { id: string; userId: string; level: VaultLevel; expiresAt: string | null; expired: boolean; user: { fullName: string; email: string; role: string } | null }
export interface VaultVersion { version: number; reason: string | null; createdAt: string; by: string | null }
export interface Revealed { username?: string; url?: string; value: string; version: number }

const d = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const vaultApi = {
  status: () => d<{ enabled: boolean; canCreateFolder: boolean; stepUp: 'code' | 'password' | 'none' }>(api.get('/v1/vault/status')),
  folders: () => d<VaultFolder[]>(api.get('/v1/vault/folders')),
  createFolder: (b: { name: string; description?: string }) => api.post('/v1/vault/folders', b),
  deleteFolder: (id: string) => api.delete(`/v1/vault/folders/${id}`),
  secrets: (folderId: string) => d<{ folder: { id: string; name: string; description: string | null }; myLevel: VaultLevel | null; secrets: VaultSecret[] }>(api.get(`/v1/vault/folders/${folderId}/secrets`)),
  createSecret: (folderId: string, b: Record<string, unknown>) => api.post(`/v1/vault/folders/${folderId}/secrets`, b),
  updateSecret: (id: string, b: Record<string, unknown>) => api.patch(`/v1/vault/secrets/${id}`, b),
  deleteSecret: (id: string) => api.delete(`/v1/vault/secrets/${id}`),
  versions: (id: string) => d<VaultVersion[]>(api.get(`/v1/vault/secrets/${id}/versions`)),
  reveal: (id: string, b: { password?: string; code?: string }) => d<Revealed>(api.post(`/v1/vault/secrets/${id}/reveal`, b)),
  grants: (folderId: string) => d<VaultGrant[]>(api.get(`/v1/vault/folders/${folderId}/grants`)),
  grant: (folderId: string, b: { userId: string; level: VaultLevel; expiresAt?: string | null }) => api.put(`/v1/vault/folders/${folderId}/grants`, b),
  revoke: (folderId: string, userId: string) => api.delete(`/v1/vault/folders/${folderId}/grants/${userId}`),
};
